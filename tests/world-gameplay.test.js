import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';
import { GameSimulation, MISSION_DEFS } from '../src/simulation.js';

// Construct the shipped procedural city, including every building, tree and post.
// No browser/WebGL shim is needed: optional billboard textures skip in Node.
const world = createWorld(THREE, new THREE.Scene(), { quality: 'balanced' });
const dt = 1 / 60;
const delta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function begin(id) {
  const game = new GameSimulation({ colliders: world.colliders, bounds: world.bounds, groundHeightAt: world.groundHeightAt });
  // Walk from the public spawn to the starter. There are no position mutations.
  for (let n = 0; n < 180 && !game.nearestCar; n++) game.update(dt, { forward: 1, cameraYaw: Math.PI });
  assert.equal(game.interact(), true, 'starter must be reachable on foot');
  assert.equal(game.inCar, 'starter');
  assert.equal(game.startMission(id), true);
  return game;
}

function drive(game, route, { deadline = 150, stop = () => !game.mission } = {}) {
  let index = 0;
  const start = game.elapsed;
  let minimumHealth = game.activeVehicle.health;
  let maximumWanted = game.wanted, maximumPatrols = 0;
  while (game.elapsed - start < deadline && index < route.length && !stop()) {
    const car = game.activeVehicle;
    assert.ok(car, `driver lost the vehicle at ${game.elapsed.toFixed(1)}s`);
    const point = route[index];
    const gap = Math.hypot(point.x - car.x, point.z - car.z);
    if (gap < 3.5) { index++; continue; }
    const heading = Math.atan2(point.x - car.x, point.z - car.z);
    const error = delta(heading, car.yaw);
    // Decelerate before intersections and turn at realistic road-safe speeds.
    // Lane offsets avoid the oncoming NPC traffic on the centre line.
    const cornerSpeed = gap < 23 ? 6 : 27;
    const desiredSpeed = Math.min(cornerSpeed, Math.max(4, 27 * (1 - Math.abs(error) / 1.2)));
    const throttle = car.speed > desiredSpeed + 0.25 ? -1 : car.speed < desiredSpeed - 0.25 ? 1 : 0;
    game.update(dt, { forward: throttle, turn: clamp(error * 2.8, -1, 1) });
    minimumHealth = Math.min(minimumHealth, car.health);
    maximumWanted = Math.max(maximumWanted, game.wanted);
    maximumPatrols = Math.max(maximumPatrols, game.cars.filter(car => car.police).length);
  }
  return { seconds: game.elapsed - start, reached: index, minimumHealth, maximumWanted, maximumPatrols };
}

const courierRoute = [{ x: 84, z: 164 }, { x: 84, z: 84 }, { x: 164, z: 84 }];
const raceRoute = [{ x: 4, z: 90 }, { x: -152, z: 88 }, { x: -152, z: -76 }, { x: 84, z: -76 }, { x: 84, z: 164 }];

test('generated-city courier is completable with walking and real driving before its deadline', t => {
  const game = begin('harbor-run');
  const result = drive(game, courierRoute);
  assert.ok(game.completed.has('harbor-run'), JSON.stringify({ result, mission: game.mission, pos: game.position, messages: game.messages }));
  assert.equal(game.cash, 1200 + MISSION_DEFS[0].reward);
  assert.ok(result.seconds < MISSION_DEFS[0].duration);
  assert.ok(result.minimumHealth > 0);
  t.diagnostic(JSON.stringify(result));
});

test('generated-city timed circuit is completable through every checkpoint with real steering', t => {
  const game = begin('neon-circuit');
  const result = drive(game, raceRoute, { deadline: MISSION_DEFS[1].duration });
  assert.ok(game.completed.has('neon-circuit'), JSON.stringify({ result, mission: game.mission, pos: game.position, messages: game.messages }));
  assert.equal(game.cash, 1200 + MISSION_DEFS[1].reward);
  assert.ok(result.seconds < MISSION_DEFS[1].duration);
  assert.ok(result.minimumHealth > 0);
  t.diagnostic(JSON.stringify(result));
});

test('generated-city getaway can trigger pursuit, lose real patrols and return without teleporting', t => {
  const game = begin('ghost-signal');
  const result = drive(game, [
    { x: 4, z: -76 }, { x: 164, z: -76 }, { x: 164, z: -236 },
    { x: -236, z: -236 }, { x: -236, z: 164 }, { x: 164, z: 164 },
  ], { deadline: MISSION_DEFS[2].duration });
  assert.ok(game.completed.has('ghost-signal'), JSON.stringify({ result, wanted: game.wanted, mission: game.mission, pos: game.position, messages: game.messages }));
  assert.ok(result.maximumWanted >= 2, 'the getaway must actually trigger pursuit');
  assert.ok(result.maximumPatrols >= 3, 'the real pursuing cars must stay active');
  assert.equal(game.wanted, 0);
  assert.equal(game.cash, 1200 + MISSION_DEFS[2].reward);
  assert.ok(result.seconds < MISSION_DEFS[2].duration);
  assert.ok(result.minimumHealth > 0);
  t.diagnostic(JSON.stringify(result));
});
