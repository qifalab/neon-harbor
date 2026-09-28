import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHARACTER_RADIUS, VEHICLE_SHAPE, SpatialIndex, vehicleBounds,
  overlapOBB, circleOBB, vehicleContacts, circleContacts, moveVehicle, moveCircle,
} from '../src/collision.js';

const near = (actual, expected, tolerance = 1e-6) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
};
const optionsFor = (colliders = [], extra = {}) => ({ index: new SpatialIndex(colliders), bounds: 290, ...extra });
const carAt = (x = 0, z = 0, yaw = 0) => ({ x, z, yaw, y: 0, health: 100 });

test('vehicle bounds contain the full rotated footprint and swap width/length at a quarter turn', () => {
  const forward = vehicleBounds(carAt(3, -4));
  near(forward.hx, VEHICLE_SHAPE.hx);
  near(forward.hz, VEHICLE_SHAPE.hz);
  const sideways = vehicleBounds(carAt(3, -4, Math.PI / 2));
  near(sideways.hx, VEHICLE_SHAPE.hz);
  near(sideways.hz, VEHICLE_SHAPE.hx);
  const diagonal = vehicleBounds(carAt(3, -4, Math.PI / 4));
  near(diagonal.hx, (VEHICLE_SHAPE.hx + VEHICLE_SHAPE.hz) / Math.sqrt(2));
  near(diagonal.hz, diagonal.hx);
  assert.equal(diagonal.x, 3);
  assert.equal(diagonal.z, -4);
});

test('SAT catches a vehicle nose beyond the old centre radius and its rotated outer corner', () => {
  const noseObstacle = { x: 0, z: 2.2, hx: 0.1, hz: 0.1 };
  assert.ok(noseObstacle.z - noseObstacle.hz > 1.55, 'fixture must miss the former radius test');
  assert.ok(overlapOBB(carAt(), noseObstacle), 'the front bumper must collide');
  const cornerObstacle = { x: 2.38, z: 0.8, hx: 0.15, hz: 0.15 };
  assert.ok(overlapOBB(carAt(0, 0, Math.PI / 4), cornerObstacle), 'a turned corner must collide');
  assert.equal(overlapOBB(carAt(), cornerObstacle), null, 'the same obstacle clears an unturned car');
});

test('SAT reports a separation normal, permits touching and rejects separated rotated rectangles', () => {
  const left = { x: 0, z: 0, hx: 1, hz: 2 };
  const right = { x: 1.75, z: 0, hx: 1, hz: 2 };
  const hit = overlapOBB(left, right);
  near(hit.depth, 0.25);
  near(hit.normal.x, -1);
  near(hit.normal.z, 0);
  assert.equal(overlapOBB({ ...left, x: left.x + hit.normal.x * hit.depth }, right), null);
  assert.equal(overlapOBB(left, { ...right, x: 2 }), null);
  assert.equal(overlapOBB({ ...left, yaw: Math.PI / 4 }, { ...right, x: 10, yaw: -Math.PI / 4 }), null);
});

test('circle/OBB checks the whole foot radius without treating clear diagonal corners as walls', () => {
  const box = { x: 0, z: 0, hx: 1, hz: 1 };
  assert.equal(circleOBB({ x: 1.5, z: 1.5, radius: CHARACTER_RADIUS }, box), null);
  const cornerHit = circleOBB({ x: 1.4, z: 1.4, radius: CHARACTER_RADIUS }, box);
  assert.ok(cornerHit && cornerHit.depth > 0);
  near(Math.hypot(cornerHit.normal.x, cornerHit.normal.z), 1);
  const edgeHit = circleOBB({ x: 1.5, z: 0, radius: CHARACTER_RADIUS }, box);
  near(edgeHit.depth, CHARACTER_RADIUS - 0.5);
  near(edgeHit.normal.x, 1);
  const insideHit = circleOBB({ x: 0, z: 0, radius: CHARACTER_RADIUS }, box);
  assert.ok(insideHit.depth >= 1 + CHARACTER_RADIUS);
});

test('spatial queries find large colliders across cell edges, including negative coordinates, without duplicates', () => {
  const colliders = [
    { id: 'wide', x: 0, z: 0, hx: 70, hz: 2 },
    { id: 'negative', x: -33, z: -33, hx: 1, hz: 1 },
    { id: 'edge', x: 32, z: 32, hx: 0.1, hz: 0.1 },
    { id: 'distant', x: 400, z: 400, hx: 1, hz: 1 },
  ];
  const index = new SpatialIndex(colliders, 32);
  for (const query of [
    { x: -65, z: 0, hx: 2, hz: 2 },
    { x: -32, z: -32, hx: 1, hz: 1 },
    { x: 32, z: 32, hx: 1, hz: 1 },
    { x: 0, z: 0, hx: 100, hz: 100 },
    { x: 200, z: -100, hx: 10, hz: 10 },
  ]) {
    const expected = colliders.filter(box => Math.abs(query.x - box.x) <= query.hx + box.hx
      && Math.abs(query.z - box.z) <= query.hz + box.hz).map(box => box.id).sort();
    const actual = index.query(query);
    assert.equal(new Set(actual).size, actual.length);
    assert.deepEqual(actual.map(box => box.id).sort(), expected);
  }
});

test('a fast vehicle cannot tunnel through a thin wall, even across a long one-frame displacement', () => {
  const wall = { x: 0, z: 5, hx: 20, hz: 0.05 };
  const options = optionsFor([wall]);
  const car = carAt();
  const result = moveVehicle(car, 0, 30, 0, options);
  assert.ok(car.z + VEHICLE_SHAPE.hz <= wall.z - wall.hz + 1e-6);
  assert.ok(car.z > 2, 'car should advance to the wall');
  assert.ok(result.contacts.some(hit => hit.kind === 'static' && hit.normal.z < -0.9));
  near(result.movedZ, car.z);
  assert.deepEqual(vehicleContacts(car, options), []);
});

test('a rotation sweep cannot pass through a thin obstacle even when the final orientation would be clear', () => {
  const obstacle = { x: 1.8, z: 0, hx: 0.02, hz: 0.12 };
  const options = optionsFor([obstacle]);
  const car = carAt();
  assert.equal(overlapOBB(car, obstacle), null);
  assert.equal(overlapOBB({ ...car, yaw: Math.PI }, obstacle), null);
  const result = moveVehicle(car, 0, 0, Math.PI, options);
  assert.equal(result.blockedRotation, true);
  assert.ok(car.yaw > 0 && car.yaw < Math.PI / 2, `rotation crossed the obstruction: ${car.yaw}`);
  near(car.x, 0);
  near(car.z, 0);
  assert.deepEqual(vehicleContacts(car, options), []);
});

test('continuous diagonal pressure slides along a wall without bouncing or oscillating', () => {
  const wall = { x: 5, z: 0, hx: 0.1, hz: 100 };
  const options = optionsFor([wall]);
  const car = carAt(wall.x - wall.hx - VEHICLE_SHAPE.hx, 0);
  const samples = [];
  for (let frame = 0; frame < 180; frame++) {
    moveVehicle(car, 0.04, 0.03, 0, options);
    samples.push(car.x);
    assert.deepEqual(vehicleContacts(car, options), []);
  }
  near(car.z, 5.4);
  assert.ok(Math.max(...samples) - Math.min(...samples) < 1e-5, 'wall contact must not repeatedly push the car away');
  assert.ok(car.x >= wall.x - wall.hx - VEHICLE_SHAPE.hx - 0.002);
});

test('walking keeps the entire character circle outside a thin wall during a swept move', () => {
  const wall = { x: 0, z: 4, hx: 20, hz: 0.05 };
  const options = optionsFor([wall]);
  const person = { x: 0, z: 0, y: 0 };
  const result = moveCircle(person, 1, 20, CHARACTER_RADIUS, options);
  assert.ok(person.z + CHARACTER_RADIUS <= wall.z - wall.hz + 1e-6);
  assert.ok(person.z > 3);
  near(person.x, 1);
  assert.ok(result.contacts.some(hit => hit.kind === 'static'));
  assert.deepEqual(circleContacts(person, CHARACTER_RADIUS, options), []);
});

test('parked and moving vehicles both block a swept vehicle without moving the other car', () => {
  for (const speed of [0, 12]) {
    const target = { ...carAt(0, 7), id: 'other', speed };
    const original = { ...target };
    const car = { ...carAt(), id: 'controlled' };
    const options = optionsFor([], { vehicles: [car, target] });
    const result = moveVehicle(car, 0, 20, 0, options);
    assert.ok(car.z + 2 * VEHICLE_SHAPE.hz <= target.z + 1e-6);
    assert.ok(car.z > 2);
    assert.ok(result.contacts.some(hit => hit.kind === 'vehicle' && hit.obstacle === target));
    assert.deepEqual(target, original, 'collision resolution must not silently teleport the parked vehicle');
    assert.equal(overlapOBB(car, target), null);
  }
});

test('walking collides with parked cars and dynamic self references never block their own movement', () => {
  const parked = { ...carAt(0, 5), id: 'parked' };
  const person = { x: 0, z: 0, y: 0 };
  const options = optionsFor([], { vehicles: [parked] });
  const result = moveCircle(person, 0, 10, CHARACTER_RADIUS, options);
  assert.ok(person.z + CHARACTER_RADIUS <= parked.z - VEHICLE_SHAPE.hz + 1e-6);
  assert.ok(result.contacts.some(hit => hit.kind === 'vehicle'));
  const car = { ...carAt(), id: 'self' };
  const selfMove = moveVehicle(car, 3, 4, 0, optionsFor([], { vehicles: [car, { ...car }] }));
  near(car.x, 3);
  near(car.z, 4);
  assert.deepEqual(selfMove.contacts, []);
});

test('a car stops for a pedestrian using the pedestrian full circular footprint', () => {
  const pedestrian = { x: 0, z: 6, y: 0, groundY: 0, radius: CHARACTER_RADIUS };
  const car = carAt();
  const result = moveVehicle(car, 0, 12, 0, optionsFor([], { circles: [pedestrian] }));
  assert.ok(car.z + VEHICLE_SHAPE.hz + CHARACTER_RADIUS <= pedestrian.z + 1e-6);
  assert.ok(result.contacts.some(hit => hit.kind === 'character'));
  assert.equal(circleOBB(pedestrian, car), null);
});

test('height filtering blocks building sides while allowing rooftop travel and passage beneath elevated solids', () => {
  const building = { x: 0, z: 5, hx: 5, hz: 1, minY: 0, maxY: 8 };
  const streetCar = carAt();
  moveVehicle(streetCar, 0, 10, 0, optionsFor([building]));
  assert.ok(streetCar.z + VEHICLE_SHAPE.hz <= building.z - building.hz + 1e-6);
  const roofCar = carAt();
  const rooftopMove = moveVehicle(roofCar, 0, 10, 0, optionsFor([building], { groundHeightAt: () => 8 }));
  near(roofCar.z, 10);
  assert.deepEqual(rooftopMove.contacts, []);
  const overpass = { ...building, minY: 4, maxY: 5 };
  const underpassCar = carAt();
  moveVehicle(underpassCar, 0, 10, 0, optionsFor([overpass]));
  near(underpassCar.z, 10);
  const upperCar = { ...carAt(0, 5), y: 8 };
  const lowerCar = carAt();
  moveVehicle(lowerCar, 0, 10, 0, optionsFor([], { vehicles: [upperCar] }));
  near(lowerCar.z, 10);
});

test('world boundaries constrain the rotated vehicle footprint and full character radius', () => {
  const car = carAt(0, 0, Math.PI / 4);
  const result = moveVehicle(car, 30, 30, 0, optionsFor([], { bounds: 10 }));
  const aabb = vehicleBounds(car);
  assert.ok(Math.abs(car.x) + aabb.hx <= 10 + 1e-6);
  assert.ok(Math.abs(car.z) + aabb.hz <= 10 + 1e-6);
  assert.ok(car.x > 7 && car.z > 7);
  assert.ok(result.contacts.some(hit => hit.kind === 'bounds'));
  const person = { x: 0, z: 0 };
  moveCircle(person, -30, -30, CHARACTER_RADIUS, optionsFor([], { bounds: 10 }));
  assert.ok(Math.abs(person.x) + CHARACTER_RADIUS <= 10 + 1e-6);
  assert.ok(Math.abs(person.z) + CHARACTER_RADIUS <= 10 + 1e-6);
});

test('legacy overlapping poses are repaired once and remain stable while stationary', () => {
  const wall = { x: 5, z: 0, hx: 0.1, hz: 10 };
  const car = carAt(4, 0);
  const options = optionsFor([wall]);
  const recovered = moveVehicle(car, 0, 0, 0, options);
  assert.ok(recovered.contacts.length > 0);
  assert.equal(overlapOBB(car, wall), null);
  const repaired = { ...car };
  for (let n = 0; n < 120; n++) moveVehicle(car, 0, 0, 0, options);
  assert.deepEqual(car, repaired);
});

test('camera-only foliage never becomes a physical wall at overlapping character height', () => {
  const index = new SpatialIndex([{ id: 'leaves', x: 0, z: 0, hx: 3, hz: 3, minY: 1.75, maxY: 6, physics: false }]);
  const person = { x: -5, z: 0, y: 0 };
  const result = moveCircle(person, 10, 0, CHARACTER_RADIUS, { index, bounds: 290 });
  assert.equal(result.contacts.length, 0);
  assert.ok(Math.abs(person.x - 5) < 1e-6);
});
