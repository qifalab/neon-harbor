import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { GameSimulation } from '../src/simulation.js';
import { FLYOVERS } from '../src/metropolis-infrastructure.js';

// Use the complete shipped collision world. Actors are a deterministic initial
// fixture so this suite tests road geometry rather than random traffic timing.
// After placement, only ordinary simulation inputs move the player and car.
const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
const dt = 1 / 60;
const pathFor = id => city.infrastructure.metadata.paths.find(path => path.id === id);
const heading = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function fixture(position, driving = false) {
  const sim = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt });
  city.bind(sim);
  const car = { ...sim.cars.find(car => car.id === 'starter'), ...position,
    y: 0, pitch: 0, roll: 0, speed: 0, vx: 0, vz: 0, health: 100, traffic: false, police: false };
  sim.cars = driving ? [car] : [];
  Object.assign(sim.player, position, { y: 0, groundY: 0, vy: 0 });
  if (driving) {
    // Start alongside the stationary fixture and use the normal boarding rule.
    sim.player.x += Math.cos(position.yaw) * 2.8;
    sim.player.z -= Math.sin(position.yaw) * 2.8;
    assert.equal(sim.interact(), true);
    assert.equal(sim.inCar, 'starter');
  }
  return sim;
}

function walk(sim, target, { seconds = 180, inspect = () => {} } = {}) {
  const start = sim.elapsed, revision = sim.teleportRevision;
  let maximum = sim.player.groundY, maximumStep = 0, previous = sim.player.groundY;
  while (distance(sim.player, target) > .12 && sim.elapsed - start < seconds) {
    city.step(dt, { forward: 1, cameraYaw: heading(sim.player, target) });
    maximum = Math.max(maximum, sim.player.groundY);
    maximumStep = Math.max(maximumStep, Math.abs(sim.player.groundY - previous));
    previous = sim.player.groundY; inspect(sim);
  }
  assert.ok(distance(sim.player, target) <= .12, `walk blocked before ${JSON.stringify(target)} at ${JSON.stringify(sim.player)}`);
  assert.equal(sim.teleportRevision, revision, 'walking must not be implemented as repeated teleports');
  return { maximum, maximumStep, seconds: sim.elapsed - start };
}

function drive(sim, target, { seconds = 120, inspect = () => {} } = {}) {
  const start = sim.elapsed, revision = sim.teleportRevision, car = sim.activeVehicle;
  let maximum = car.y, maximumStep = 0, previous = car.y;
  while (distance(car, target) > 1.5 && sim.elapsed - start < seconds) {
    const delta = heading(car, target) - car.yaw;
    const error = Math.atan2(Math.sin(delta), Math.cos(delta));
    // The route is straight; gentle heading feedback also exposes rail snags.
    const desired = distance(car, target) < 18 ? 8 : 24;
    city.step(dt, { forward: car.speed > desired + .2 ? -1 : car.speed < desired - .2 ? 1 : 0,
      turn: Math.max(-1, Math.min(1, error * 2.8)) });
    maximum = Math.max(maximum, car.y);
    maximumStep = Math.max(maximumStep, Math.abs(car.y - previous));
    previous = car.y; inspect(sim);
  }
  assert.ok(distance(car, target) <= 1.5, `car blocked before ${JSON.stringify(target)} at ${JSON.stringify(car)}`);
  assert.equal(sim.teleportRevision, revision, 'driving must remain one continuous journey');
  assert.equal(car.health, 100, 'road geometry must not damage a correctly driven car');
  return { maximum, maximumStep, seconds: sim.elapsed - start };
}

function assertSafeSave(sim, id) {
  const entrance = city.infrastructure.landmarks.find(item => item.id === id).entrance;
  const save = city.safeSave();
  assert.equal(save.player.x, entrance.x);
  assert.equal(save.player.z, entrance.z);
  const restored = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt, save });
  assert.equal(restored.player.x, entrance.x);
  assert.equal(restored.player.z, entrance.z);
  assert.equal(restored.player.groundY, 0, 'saved deck journeys must restore on reachable street ground');
  assert.ok(Number.isFinite(sim.position.x));
}

for (const road of FLYOVERS) {
  test(`${road.id}: a pedestrian walks up, across and down without height mutation`, t => {
    const path = pathFor(road.id), yaw = heading(path.from, path.to);
    const start = { x: path.from.x - Math.sin(yaw) * 5, z: path.from.z - Math.cos(yaw) * 5, yaw };
    const end = { x: path.to.x + Math.sin(yaw) * 5, z: path.to.z + Math.cos(yaw) * 5 };
    const sim = fixture(start);
    let saved = false;
    const result = walk(sim, end, { inspect: () => {
      if (!saved && sim.player.groundY > road.height - .01) { assertSafeSave(sim, road.id); saved = true; }
    } });
    assert.ok(saved, 'the route must actually reach the bridge deck');
    assert.ok(Math.abs(result.maximum - road.height) < .01);
    assert.ok(result.maximumStep < .05, 'the grade must rise continuously at walking speed');
    assert.equal(sim.player.groundY, 0);
    t.diagnostic(JSON.stringify(result));
  });

  test(`${road.id}: a car drives both ramps and saves on a safe ground entrance`, t => {
    const path = pathFor(road.id), yaw = heading(path.from, path.to);
    const start = { x: path.from.x - Math.sin(yaw) * 8, z: path.from.z - Math.cos(yaw) * 8, yaw };
    const end = { x: path.to.x + Math.sin(yaw) * 8, z: path.to.z + Math.cos(yaw) * 8 };
    const sim = fixture(start, true);
    let saved = false;
    const result = drive(sim, end, { inspect: () => {
      if (!saved && sim.activeVehicle.y > road.height - .01) { assertSafeSave(sim, road.id); saved = true; }
    } });
    assert.ok(saved);
    assert.ok(Math.abs(result.maximum - road.height) < .05);
    assert.ok(result.maximumStep < .12, 'wheel support must not jump between layers');
    assert.ok(Math.abs(sim.activeVehicle.y) < .01);
    t.diagnostic(JSON.stringify(result));
  });
}

test('a pedestrian reaches the public freight-port promenade and walks back over the sea wall', t => {
  const path = pathFor('victoria-freight');
  const start = { x: path.from.x, z: path.from.z - 3, yaw: 0 };
  const sim = fixture(start);
  const outbound = walk(sim, path.to, { seconds: 45 });
  assert.ok(Math.abs(sim.player.groundY - city.infrastructure.metadata.port.y) < .01);
  assertSafeSave(sim, path.id);
  const inbound = walk(sim, start, { seconds: 45 });
  assert.equal(sim.player.groundY, 0);
  assert.ok(outbound.maximumStep < .05 && inbound.maximumStep < .05);
  t.diagnostic(JSON.stringify({ outbound, inbound }));
});

test('cars cross below both flyovers without being lifted onto the deck', () => {
  for (const route of [
    { from: { x: -515, z: -840, yaw: Math.PI / 2 }, to: { x: -445, z: -840 } },
    { from: { x: 160, z: -1015, yaw: 0 }, to: { x: 160, z: -945 } },
  ]) {
    const sim = fixture(route.from, true);
    drive(sim, route.to, { seconds: 25, inspect: () => assert.ok(Math.abs(sim.activeVehicle.y) < .01, 'underpass car changed support layer') });
  }
});

test('added piers and street equipment leave existing north-shore traffic crossings open', () => {
  // These are the real northern-traffic horizontal roads. Test the places
  // where new infrastructure could otherwise narrow or obstruct their lanes.
  for (const z of [-420, -560, -700, -840, -980, -1120]) {
    const sim = fixture({ x: -520, z, yaw: Math.PI / 2 }, true);
    drive(sim, { x: -440, z }, { seconds: 25, inspect: () => assert.ok(Math.abs(sim.activeVehicle.y) < .01) });
  }
  for (const x of [0, 160, 320, 480]) {
    const sim = fixture({ x, z: -1020, yaw: 0 }, true);
    drive(sim, { x, z: -940 }, { seconds: 25, inspect: () => assert.ok(Math.abs(sim.activeVehicle.y) < .01) });
  }
});
