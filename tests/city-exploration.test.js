import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { GameSimulation, loadProgress } from '../src/simulation.js';
import { ChaseCamera, resolveCameraPoint } from '../src/camera.js';

function fixture() {
  let switches = 0;
  const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false, onContextChange: () => switches++ });
  const sim = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt });
  city.bind(sim);
  return { city, sim, switches: () => switches };
}
const advance = (city, seconds, input = {}) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) city.step(1 / 60, input); };

test('integrated building travel, continuous elevator and forced departure restore outdoor collision and cars', async () => {
  const { city, sim } = fixture(), building = city.buildings.find(b => b.id === 'apex-tower');
  assert.equal(sim.cars.length, 33);
  await city.travelTo(building);
  assert.equal(city.getPrompt().kind, 'enter');
  assert.equal(city.interact().handled, true);
  assert.equal(sim.cars.length, 0);
  const cabin = city.interiors.snapshot().cabin;
  for (let i = 0; i < 1500 && Math.abs(sim.player.z - cabin.z) > 0.5; i++) city.step(1 / 60, { forward: 1, cameraYaw: Math.PI });
  assert.ok(Math.abs(sim.player.z - cabin.z) < 0.5, 'the real collision route reaches the elevator');
  assert.ok(city.interact().elevator);
  assert.equal(city.selectFloor('observation'), true);
  advance(city, 3);
  assert.ok(sim.player.groundY > 0 && sim.player.groundY < building.floors[2].y);
  const save = city.safeSave();
  assert.equal(save.player.z, building.entrance.z, 'in-flight saves restore at this building entrance');
  const loaded = loadProgress(save, { bounds: city.bounds });
  assert.equal(loaded.player.z, building.entrance.z, 'north-shore saves are not clamped to the old island');
  await city.travelTo(city.buildings[0]);
  assert.equal(city.interiors.state.buildingId, null);
  assert.equal(city.interiors.root.visible, false);
  assert.equal(sim.cars.length, 33);
  assert.equal(sim.colliders, city.colliders);
  assert.equal(sim.player.groundY, 0);
});

test('underground platform remains below street and transit motion does not trigger teleports or reindex every tick', async () => {
  const { city, sim, switches } = fixture();
  await city.travelTo(city.transit.stops.find(s => s.id === 'metro-old'));
  assert.equal(city.interact().handled, true);
  advance(city, 1.5, { forward: 1, cameraYaw: Math.PI });
  assert.equal(sim.player.groundY, -14);
  assert.equal(sim.colliders, city.transit.collisionContext().colliders);
  assert.equal(sim.cars.length, 0);
  assert.equal(city.interact().handled, true);
  assert.equal(city.transit.riding, true);
  const revision = sim.teleportRevision, switchCount = switches();
  advance(city, 12);
  assert.equal(sim.teleportRevision, revision, 'a moving train is not a succession of scene teleports');
  assert.equal(switches(), switchCount, 'the riding collision context is stable');
  assert.ok(sim.player.z < 200, 'the train actually leaves the starting station');
  assert.ok(sim.player.groundY < -13 && sim.player.groundY > -15, 'the carriage remains in the underground tunnel');
  const save = city.safeSave();
  assert.equal(save.player.x, 16);
  assert.equal(save.player.z, 250);
});

test('a saved journey from the north ferry restores at its own pier, including after departure', async () => {
  const { city, sim } = fixture(), stop = city.transit.stops.find(s => s.id === 'ferry-north');
  await city.travelTo(stop); city.interact(); city.interact();
  assert.equal(city.transit.riding, true);
  advance(city, 11);
  assert.equal(city.transit.snapshot().phase, 'moving');
  const save = city.safeSave();
  assert.equal(save.player.x, stop.entrance.x);
  assert.equal(save.player.z, stop.entrance.z);
  const vehicle = city.transit.passengerPose;
  assert.ok(Math.abs(sim.player.x - vehicle.x) < 1e-8 && Math.abs(sim.player.z - vehicle.z) < 1e-8);
});

test('camera supports below-sea-level clearance and seated passenger views without roof-crossing chase booms', () => {
  const box = { x: 0, z: 0, hx: 1, hz: 1, minY: -14, maxY: -10 };
  const resolved = resolveCameraPoint({ x: 0.95, y: -12.4, z: 0 }, [box], 0.45, -13.55);
  assert.ok(resolved.x > 1.45 && resolved.y < -10);
  const camera = new ChaseCamera();
  const snapshot = camera.update({ x: 20, y: -14, z: 100, yaw: Math.PI }, { yaw: Math.PI, pitch: 0.15, firstPerson: true }, 1 / 60);
  assert.equal(snapshot.boomLength, 0);
  assert.ok(Math.abs(snapshot.position.y + 12.38) < 1e-9);
  assert.ok(snapshot.target.z < snapshot.position.z);
});
