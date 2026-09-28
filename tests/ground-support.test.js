import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { vehicleGroundSupport, transformVehiclePoint } from '../src/ground-support.js';
import { createWorld, createCar } from '../src/world.js';
import { VEHICLE_DIMENSIONS } from '../src/world-config.js';

const world = createWorld(THREE, new THREE.Scene(), { quality: 'balanced' });
const D = VEHICLE_DIMENSIONS;

test('flat streets produce zero body pitch/roll and keep wheels on the road', () => {
  const ground = vehicleGroundSupport({ x: 4, z: 160, yaw: Math.PI }, world.groundHeightAt);
  assert.equal(ground.y, 0);
  assert.equal(ground.pitch, 0);
  assert.equal(ground.roll, 0);
  assert.equal(ground.hx, D.halfWidth + 0.03);
  assert.equal(ground.hz, D.halfLength + 0.02);
});

test('a diagonal curb residual raises only the clearance missing from a fitted plane', () => {
  const height = (x, z) => x > 0 && z > 0 ? 0.18 : 0;
  const pose = { x: 0, z: 0, yaw: 0 };
  const support = vehicleGroundSupport(pose, height);
  assert.ok(support.y > 0.045, 'four-point average alone buries the high wheel');
  assert.ok(support.y < 0.2, 'support must not introduce an arbitrary levitation height');
  assert.ok(support.pitch < 0 && support.roll > 0);
  assert.ok(support.hx > D.halfWidth + 0.03, 'tilted upper body needs a wider collision envelope');
  assert.ok(support.hz > D.halfLength + 0.02);
  const point = transformVehiclePoint({ x: 0.94, y: 0, z: 1.4 }, { ...pose, ...support });
  assert.ok(point.y >= height(point.x, point.z) - 0.002);
});

test('actual rendered tire vertices stay above the real city ramp at known curb problem positions', () => {
  for (const position of [
    { x: 12, z: 92.5, yaw: 0 }, { x: 12, z: 93.5, yaw: 0 },
    { x: 11.6, z: 92.4, yaw: 0.5 }, { x: 13, z: 94, yaw: 0.9 },
  ]) {
    const support = vehicleGroundSupport(position, world.groundHeightAt);
    const car = createCar(THREE, 0x19e5e1, 'sport');
    car.position.set(position.x, support.y, position.z);
    car.rotation.order = 'YXZ'; car.rotation.set(support.pitch, position.yaw, support.roll);
    for (const wheel of car.userData.wheels) wheel.rotation.x = 0.371;
    car.updateMatrixWorld(true);
    let minimum = Infinity;
    for (const wheel of car.userData.wheels) wheel.traverse(part => {
      const positions = part.geometry?.getAttribute('position');
      if (!positions) return;
      for (let i = 0; i < positions.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld);
        minimum = Math.min(minimum, vertex.y - world.groundHeightAt(vertex.x, vertex.z));
      }
    });
    assert.ok(minimum >= -0.002, `tire penetrated ground ${minimum} at ${JSON.stringify(position)}`);
    assert.ok(minimum < 0.08, 'at least one tire must remain near its supporting terrain');
  }
});

test('slope collision envelope encloses every rendered car vertex including tilted mirrors', () => {
  const pose = { x: 12, z: 93.5, yaw: 0 };
  const support = vehicleGroundSupport(pose, world.groundHeightAt);
  const car = createCar(THREE, 0x19e5e1, 'police');
  car.rotation.order = 'YXZ'; car.rotation.set(support.pitch, 0, support.roll);
  car.position.y = support.y; car.updateMatrixWorld(true);
  car.traverse(part => {
    const positions = part.geometry?.getAttribute('position');
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(part.matrixWorld);
      assert.ok(Math.abs(p.x) <= support.hx + 1e-6, 'mirror or wheel outside horizontal body envelope');
      assert.ok(Math.abs(p.z) <= support.hz + 1e-6, 'bumper outside longitudinal body envelope');
      assert.ok(p.y >= support.minY - 1e-6 && p.y <= support.maxY + 1e-6, 'body outside height envelope');
    }
  });
});
