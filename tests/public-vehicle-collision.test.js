import test from 'node:test';
import assert from 'node:assert/strict';
import { circleContacts, vehicleContacts, SpatialIndex } from '../src/collision.js';

test('double-decker hull blocks feet above sedan height and preserves its actual span', () => {
  const bus = { id: 'bus', externalBody: true, health: 100, x: 0, z: 0, y: 0, yaw: 0,
    hx: 1.275, hz: 5.5, minY: 0, maxY: 4.4 };
  const options = { bounds: 1800, index: new SpatialIndex(), vehicles: [bus], groundHeightAt: () => 2.4,
    supportAt: () => ({ minY: 0, maxY: 1.5 }) };
  assert.equal(circleContacts({ x: 0, z: 4.5 }, .65, options)[0]?.obstacle.id, 'bus');
  assert.equal(circleContacts({ x: 0, z: 6.4 }, .65, options).length, 0);
  assert.equal(vehicleContacts({ id: 'car', x: 0, z: 7, yaw: 0 }, options)[0]?.obstacle.id, 'bus');
  assert.equal(circleContacts({ x: 0, z: 0 }, .65, { ...options, groundHeightAt: () => 5 }).length, 0);
});
