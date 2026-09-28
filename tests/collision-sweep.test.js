import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialIndex, VEHICLE_SHAPE, vehicleContacts, circleContacts, moveVehicle, moveCircle } from '../src/collision.js';

const options = boxes => ({ index: new SpatialIndex(boxes), bounds: 290 });

test('a normal 60 Hz steering arc cannot graze a building corner between two clear endpoints', () => {
  // This is a 20 m building, not an artificially submillimetre obstacle. Its
  // corner intersects the rotating nose for only a small part of one tick.
  const world = options([{ id: 'building', x: 11.207742295320596, z: 12.305650245109005,
    hx: 10, hz: 10, minY: 0, maxY: 20 }]);
  const start = { x: 0, z: 0, yaw: 0 };
  assert.equal(vehicleContacts(start, world).length, 0);
  assert.equal(vehicleContacts({ ...start, yaw: 0.024 }, world).length, 0);
  assert.ok(vehicleContacts({ ...start, yaw: 0.012 }, world).length > 0);
  const body = { ...start }, result = moveVehicle(body, 0, 0, 0.024, world);
  assert.equal(result.blockedRotation, true);
  assert.ok(body.yaw > 0 && body.yaw < 0.012);
  for (let i = 0; i <= 1000; i++) assert.equal(vehicleContacts({ ...start, yaw: body.yaw * i / 1000 }, world).length, 0);
});

test('a short diagonal translation cannot cut a building corner with clear endpoints', () => {
  const world = options([{ id: 'building', x: 10, z: 10, hx: 10, hz: 10 }]);
  const start = { x: -VEHICLE_SHAPE.hx - 0.03, z: -VEHICLE_SHAPE.hz + 0.06, yaw: 0 };
  assert.equal(vehicleContacts(start, world).length, 0);
  assert.equal(vehicleContacts({ ...start, x: start.x + 0.09, z: start.z - 0.09 }, world).length, 0);
  const body = { ...start }, result = moveVehicle(body, 0.09, -0.09, 0, world);
  assert.ok(result.contacts.some(hit => hit.kind === 'static'));
  for (let i = 0; i <= 1000; i++) assert.equal(vehicleContacts({ ...start,
    x: start.x + (body.x - start.x) * i / 1000, z: start.z + (body.z - start.z) * i / 1000 }, world).length, 0);
});

test('grazing the corner of another vehicle stays blocked between clear endpoints', () => {
  const parked = { id: 'parked', x: 0, z: 0, yaw: 0, health: 100 };
  const world = { ...options([]), vehicles: [parked] };
  const start = { id: 'driver', x: -2 * VEHICLE_SHAPE.hx - 0.03, z: -2 * VEHICLE_SHAPE.hz + 0.06, yaw: 0 };
  assert.equal(vehicleContacts(start, world).length, 0);
  assert.equal(vehicleContacts({ ...start, x: start.x + 0.09, z: start.z - 0.09 }, world).length, 0);
  const body = { ...start }, result = moveVehicle(body, 0.09, -0.09, 0, world);
  assert.ok(result.contacts.some(hit => hit.kind === 'vehicle'));
  assert.equal(vehicleContacts(body, world).length, 0);
  assert.deepEqual(parked, { id: 'parked', x: 0, z: 0, yaw: 0, health: 100 });
});

test('the circular pedestrian footprint cannot cross a shallow rounded corner between samples', () => {
  const world = options([{ id: 'corner', x: 10, z: 10, hx: 10, hz: 10 }]);
  const radius = 0.65, middle = -(radius - 0.0001) / Math.SQRT2;
  const start = { x: middle - 0.06, z: middle + 0.06, yaw: 0 };
  assert.equal(circleContacts(start, radius, world).length, 0);
  assert.equal(circleContacts({ ...start, x: start.x + 0.12, z: start.z - 0.12 }, radius, world).length, 0);
  assert.ok(circleContacts({ x: middle, z: middle }, radius, world).length > 0);
  const body = { ...start }, result = moveCircle(body, 0.12, -0.12, radius, world);
  assert.ok(result.contacts.length > 0);
  for (let i = 0; i <= 1000; i++) assert.equal(circleContacts({
    x: start.x + (body.x - start.x) * i / 1000, z: start.z + (body.z - start.z) * i / 1000 }, radius, world).length, 0);
});

test('the prospective supported vehicle envelope and height participate in collision', () => {
  const world = { ...options([{ id: 'awning', x: 0, z: 0, hx: 10, hz: 0.05, minY: 2.1, maxY: 3 }]),
    supportAt: () => ({ hx: 1.3, hz: 2.4, minY: 0.5, maxY: 2.3 }) };
  const body = { x: 0, z: -4, yaw: 0 };
  const result = moveVehicle(body, 0, 4, 0, world);
  assert.ok(result.contacts.some(hit => hit.obstacle.id === 'awning'));
  assert.ok(body.z + 2.4 <= -0.05 + 1e-6);
  assert.equal(vehicleContacts(body, world).length, 0);
});

test('stepping onto higher ground under an awning cannot eject an entity sideways', () => {
  const world = { ...options([{ id: 'awning', x: 0, z: 0, hx: 5, hz: 5, minY: 2, maxY: 3 }]),
    groundHeightAt: x => x > 0 ? 0.4 : 0 };
  const start = { x: -0.02, z: 0, yaw: 0 }, body = { ...start };
  const result = moveCircle(body, 0.06, 0, 0.65, world);
  assert.ok(result.contacts.length > 0);
  assert.ok(Math.hypot(body.x - start.x, body.z - start.z) <= 0.062);
  assert.equal(body.z, 0);
  assert.equal(circleContacts(body, 0.65, world).length, 0);
});
