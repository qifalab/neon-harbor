import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSimulation } from '../src/simulation.js';

test('traffic follows the same street route while the player uses an indoor collision context', () => {
  const streetGround = () => 0;
  const outside = new GameSimulation({ groundHeightAt: streetGround });
  const indoors = new GameSimulation({ groundHeightAt: streetGround });
  const stored = indoors.cars;
  indoors.cars = [];
  indoors.colliders = [{ id: 'indoor-wall', x: 160, z: 160, hx: 100, hz: 100, minY: 0, maxY: 100 }];
  indoors.groundHeightAt = () => 80;
  indoors.player.groundY = 80;
  const start = stored.filter(c => c.traffic).map(c => [c.x, c.z]);
  for (let i = 0; i < 1200; i++) {
    outside.update(1 / 60);
    indoors.update(1 / 60);
    indoors.updateStoredTraffic(1 / 60, { cars: stored, colliders: [], groundHeightAt: streetGround });
  }
  assert.deepEqual(stored.filter(c => c.traffic).map(c => [c.x, c.z, c.waypoint, c.speed]),
    outside.cars.filter(c => c.traffic).map(c => [c.x, c.z, c.waypoint, c.speed]));
  assert.ok(stored.filter(c => c.traffic).some((c, i) => Math.hypot(c.x - start[i][0], c.z - start[i][1]) > 20));
  assert.equal(indoors.cars.length, 0);
  assert.equal(indoors.groundHeightAt(0, 0), 80);
});

test('background traffic restores indoor data after an invalid road update throws', () => {
  const sim = new GameSimulation();
  const cars = sim.cars, colliders = sim.colliders, groundHeightAt = sim.groundHeightAt;
  assert.throws(() => sim.updateStoredTraffic(1 / 60, { cars: [{ id: 'bad-route', traffic: true, health: 100 }], colliders: [], groundHeightAt }));
  assert.equal(sim.cars, cars);
  assert.equal(sim.colliders, colliders);
  assert.equal(sim.groundHeightAt, groundHeightAt);
  assert.equal(sim._backgroundTraffic, false);
});
