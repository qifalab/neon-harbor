import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createCar, createCharacter } from '../src/models.js';
import { VEHICLE_DIMENSIONS, PLAYER_DIMENSIONS } from '../src/world-config.js';

function triangles(object) {
  let total = 0;
  object.traverse(node => { if (node.isMesh) total += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3; });
  return total;
}
function select(object, distance) {
  const camera = new THREE.PerspectiveCamera(); camera.position.z = distance; camera.updateMatrixWorld(true);
  object.userData.updateLOD(camera);
  return object.userData.lod.levels.findIndex(level => level.object.visible);
}

test('distance LOD preserves the hero car and reduces distant geometry without changing its collision envelope', () => {
  const car = createCar(THREE), levels = car.userData.lod.levels;
  assert.equal(car.userData.lod.autoUpdate, false, 'shadow camera must not select a different tier');
  assert.equal(select(car, 12), 0);
  assert.equal(select(car, 65), 1);
  assert.equal(select(car, 150), 2);
  assert.equal(select(car, 12), 0);
  assert.ok(triangles(levels[0].object) > 60000, 'near geometry remains complete');
  assert.ok(triangles(levels[1].object) < 15000);
  assert.ok(triangles(levels[2].object) < 4000);
  assert.equal(levels.filter(level => level.object.visible).length, 1);
  assert.equal(car.userData.wheels.length, 4);
  assert.equal(car.userData.wheelsAll.length, 12);
  for (const level of levels) {
    const box = new THREE.Box3().setFromObject(level.object);
    assert.ok(box.min.x >= -VEHICLE_DIMENSIONS.halfWidth && box.max.x <= VEHICLE_DIMENSIONS.halfWidth);
    assert.ok(box.min.z >= -VEHICLE_DIMENSIONS.halfLength && box.max.z <= VEHICLE_DIMENSIONS.halfLength);
    assert.ok(box.max.y <= VEHICLE_DIMENSIONS.height);
    assert.ok(Math.abs(box.min.y) < 1e-6);
  }
});

test('distant pedestrians retain animated joints and original human dimensions', () => {
  const person = createCharacter(THREE);
  person.userData.leftLeg.rotation.x = .3; person.userData.leftKnee.rotation.x = .42;
  assert.equal(select(person, 75), 2);
  const distant = person.userData.lod.levels[2].object;
  assert.equal(distant.getObjectByName('leftLeg').rotation.x, .3);
  assert.equal(distant.getObjectByName('leftKnee').rotation.x, .42);
  assert.ok(triangles(distant) < 3000);
  assert.equal(select(person, 5), 0);
  for (const level of createCharacter(THREE).userData.lod.levels) {
    const box = new THREE.Box3().setFromObject(level.object);
    assert.ok(box.max.y <= PLAYER_DIMENSIONS.height);
    assert.ok(Math.abs(box.min.y - .005) < 1e-6);
  }
});

test('removing a car disposes owned paint and lights while preserving shared LOD geometry', () => {
  const first = createCar(THREE, '#123456', 'police'), second = createCar(THREE, '#abcdef', 'police');
  let geometryDisposals = 0, paintDisposals = 0, lightDisposals = 0;
  first.traverse(node => { if (node.isMesh) node.geometry.addEventListener('dispose', () => geometryDisposals++); });
  first.getObjectByName('coachwork').material.addEventListener('dispose', () => paintDisposals++);
  for (const light of first.userData.policeLights) light.addEventListener('dispose', () => lightDisposals++);
  first.userData.disposeInstance();
  assert.equal(geometryDisposals, 0); assert.equal(paintDisposals, 1); assert.equal(lightDisposals, 6);
  assert.equal(second.getObjectByName('coachwork').material.color.getHexString(), 'abcdef');
  for (let tier = 0; tier < 3; tier++) assert.equal(first.userData.lod.levels[tier].object.getObjectByName('coachwork').geometry,
    second.userData.lod.levels[tier].object.getObjectByName('coachwork').geometry);
});
