import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createInteriorSystem } from '../src/metropolis-interiors.js';
import { createCityExploration } from '../src/city-exploration.js';
import { ChaseCamera } from '../src/camera.js';
import { SpatialIndex } from '../src/collision.js';

function boardLift(interiors) {
  interiors.enter('apex-tower');
  const { cabin } = interiors.snapshot();
  const player = { x: cabin.x, z: cabin.z, y: cabin.y, groundY: cabin.y, yaw: 0 };
  interiors.update(0, player);
  assert.ok(interiors.selectFloor('observation'));
  return player;
}
function advance(interiors, seconds) {
  for (let left = seconds; left > 1e-8; left -= 1 / 60) interiors.update(Math.min(left, 1 / 60));
}
function cabinCamera(interiors) {
  const { cabin } = interiors.snapshot();
  const camera = new THREE.PerspectiveCamera(65, 2, .15, 3200);
  camera.position.set(cabin.x, cabin.y + 1.62, cabin.z);
  return camera;
}

test('closed cabin actually blocks the former gap above the door leaves', () => {
  const scene = new THREE.Scene(), interiors = createInteriorSystem(THREE, scene);
  boardLift(interiors); advance(interiors, .8); scene.updateMatrixWorld(true);
  const { cabin } = interiors.snapshot();
  const ray = new THREE.Raycaster(new THREE.Vector3(cabin.x, cabin.y + 3.13, cabin.z), new THREE.Vector3(0, 0, 1));
  const hit = ray.intersectObject(interiors.root, true)[0];
  assert.ok(hit, 'the 3.10–3.16 m door gap must have a real rendered surface');
  assert.equal(hit.object.name, 'Elevator · opaque door lintel');
  assert.equal(hit.object.material.transparent, false);
  assert.ok(hit.distance < 2.31, 'header must enclose this cabin, not be a distant floor wall');
  interiors.dispose();
});

test('cabin occlusion follows actual camera bounds and restores city before doors open', () => {
  const scene = new THREE.Scene();
  const city = createCityExploration(THREE, scene, { streaming: false, quality: 'high' });
  const interiors = city.interiors;
  boardLift(interiors);
  assert.equal(city.updateRenderVisibility(cabinCamera(interiors)), false, 'closing doors still expose the city');
  advance(interiors, .8);
  const camera = cabinCamera(interiors), startY = interiors.state.elevator.y;
  const collision = interiors.collisionContext().colliders;
  assert.equal(city.updateRenderVisibility(camera), true);
  assert.equal(city.root.visible, false);
  assert.equal(city.transit.root.visible, false);
  assert.equal(interiors.root.visible, true, 'the actual cabin stays rendered');
  assert.equal(interiors.collisionContext().colliders, collision, 'visibility cannot replace physics');
  assert.equal(scene.children.filter(item => item.isPointLight && item.visible).length, 2,
    'the fixed interior light budget remains visible');
  assert.equal(city.harbor.snapshot().quality, 'high');

  // Outside follow cameras and near planes crossing a cabin wall cannot cull.
  for (const offset of [[2.3, 0, 0], [-2.3, 0, 0], [0, 0, 2.5], [0, 0, -2.5], [0, -1.7, 0], [0, 1.8, 0], [2.02, 0, 0]]) {
    const outside = cabinCamera(interiors); outside.position.add(new THREE.Vector3(...offset));
    assert.equal(city.updateRenderVisibility(outside), false, `unsafe camera ${offset}`);
    assert.equal(city.root.visible, true);
    assert.equal(city.transit.root.visible, true);
  }
  assert.equal(city.updateRenderVisibility(camera), true);
  advance(interiors, 1);
  assert.ok(interiors.state.elevator.y > startY, 'elevator simulation must progress while exterior geometry is hidden');
  let frames = 0;
  while (interiors.state.elevator.phase === 'moving' && frames++ < 2500) interiors.update(1 / 60);
  assert.equal(interiors.state.elevator.phase, 'opening');
  assert.equal(city.updateRenderVisibility(cabinCamera(interiors)), false);
  assert.equal(city.root.visible, true, 'restore the city on the first opening frame');
  assert.equal(city.transit.root.visible, true);
  advance(interiors, 1);
  assert.equal(interiors.state.floor.id, 'observation');
  const terraceCamera = cabinCamera(interiors); terraceCamera.position.z += 10;
  assert.equal(city.updateRenderVisibility(terraceCamera), false, 'the glazed 260 m observation floor must retain its real exterior view');
  interiors.exit({ force: true });
  assert.equal(city.updateRenderVisibility(terraceCamera), false, 'street/ferry/metro views never use the cabin optimization');

  interiors.dispose(); city.south.dispose?.(); city.north.dispose(); city.infrastructure.dispose?.(); city.harbor.dispose(); city.people.dispose();
});

test('ordinary third-person camera retracts behind the safety door throughout the high lift ride', () => {
  const scene = new THREE.Scene(), interiors = createInteriorSystem(THREE, scene), rig = new ChaseCamera();
  interiors.enter('apex-tower');
  const cabin = interiors.snapshot().cabin;
  const player = { x: cabin.x, z: cabin.z, y: cabin.y, groundY: cabin.y, yaw: Math.PI };
  interiors.update(0, player);
  let index = new SpatialIndex(interiors.collisionContext().colliders.filter(c => c.camera !== false));
  const updateCamera = () => {
    const y = interiors.state.elevator.y;
    const result = rig.update({ x: player.x, y, z: player.z, yaw: Math.PI },
      { yaw: Math.PI, pitch: .38, indoor: true, floorY: y, platformY: interiors.state.moving ? y : undefined, aspect: 2, near: .15, firstPerson: false }, 1 / 60,
      interiors.cameraColliders || index.query({ x: player.x, z: player.z, hx: 20, hz: 20 }));
    return { position: result.position, near: .15, fov: result.fov, aspect: 2, result };
  };
  for (let i = 0; i < 30; i++) updateCamera();
  assert.ok(interiors.selectFloor('observation'));
  // Same forced context refresh used by city.selectFloor -> applyTransition.
  index = new SpatialIndex(interiors.collisionContext().colliders.filter(c => c.camera !== false));
  assert.ok(index.query({ x: cabin.x, z: cabin.z, hx: 8, hz: 8 }).some(c => c.id === 'elevator-safety-door'),
    'the door must be in the actual filtered camera index before travel');
  let movingSamples = 0;
  for (let frame = 0; frame < 2400 && interiors.state.moving; frame++) {
    const previousVersion = interiors.state.version;
    interiors.update(1 / 60);
    if (interiors.state.version !== previousVersion)
      index = new SpatialIndex(interiors.collisionContext().colliders.filter(c => c.camera !== false));
    const camera = updateCamera();
    if (interiors.state.elevator.phase === 'moving') {
      movingSamples++;
      assert.ok(camera.position.z < cabin.z + 2.3 - .45, 'follow camera crossed the closed front door');
      assert.equal(interiors.cameraInClosedCabin(camera), true,
        `the unmodified third-person rig must stay enclosed at y=${interiors.state.elevator.y}: ${JSON.stringify(camera.result)}`);
    } else assert.equal(interiors.cameraInClosedCabin(camera), false, 'closing/opening/idle preserve the exterior');
  }
  assert.ok(movingSamples > 1500, 'regression must cover the real 260 m journey');
  assert.equal(interiors.state.floor.id, 'observation');
  assert.equal(interiors.state.elevator.phase, 'idle');
  const door = interiors.collisionContext().colliders.find(c => c.id === 'elevator-safety-door');
  assert.equal(door.camera, false, 'an open stationary door must stop blocking the follow camera');
  assert.equal(door.physics, false);
  interiors.dispose();
});

for (const dt of [1 / 60, .25]) test(`moving lift carries the normal low-pitch camera at ${Math.round(1 / dt)} Hz without a floor-level view`, () => {
  const interiors = createInteriorSystem(THREE, new THREE.Scene()), rig = new ChaseCamera();
  const player = boardLift(interiors);
  let index = new SpatialIndex(interiors.collisionContext().colliders.filter(c => c.camera !== false));
  const updateCamera = () => {
    const y = interiors.state.elevator.y;
    return rig.update({ x: player.x, y, z: player.z, yaw: Math.PI },
      { yaw: Math.PI, pitch: .08, indoor: true, floorY: y, platformY: interiors.state.moving ? y : undefined,
        aspect: 2, near: .15, firstPerson: false }, dt,
      interiors.cameraColliders || index.query({ x: player.x, z: player.z, hx: 20, hz: 20 }));
  };
  updateCamera();
  let minEye = Infinity, maxEye = -Infinity, samples = 0;
  while (interiors.state.moving) {
    const version = interiors.state.version;
    interiors.update(dt);
    if (version !== interiors.state.version) index = new SpatialIndex(interiors.collisionContext().colliders.filter(c => c.camera !== false));
    const state = updateCamera(), height = state.position.y - interiors.state.elevator.y;
    if (interiors.state.elevator.phase === 'moving') {
      samples++; minEye = Math.min(minEye, height); maxEye = Math.max(maxEye, height);
      assert.ok(interiors.cameraColliders.every(c => c.kind.startsWith('interior-elevator-')));
      for (const kind of ['floor', 'ceiling', 'wall', 'door', 'door-lintel'])
        assert.ok(interiors.cameraColliders.some(c => c.kind === `interior-elevator-${kind}` && c.camera), `${kind} still constrains the camera`);
      assert.ok(interiors.collisionContext().colliders.some(c => c.kind === 'interior-ceiling'),
        'skipping invisible floors for the camera must not replace their physics context');
      assert.ok(height > 1.55 && height < 2.5, `ride camera collapsed to ${height} m above the floor at ${interiors.state.elevator.y}: ${JSON.stringify(state)}`);
      assert.ok(Math.abs(state.target.y - interiors.state.elevator.y - 1.35) < .025,
        'the look target must travel with the same platform as the camera');
      assert.ok(state.position.y > state.target.y, 'the normal follow view must not become a low upward view');
    } else {
      assert.equal(interiors.cameraInClosedCabin({ position: state.position, near: .15, fov: state.fov, aspect: 2 }), false);
      assert.equal(interiors.cameraColliders, null, 'closing/opening/idle must restore the full camera index');
    }
  }
  assert.ok(samples > 100);
  assert.ok(maxEye - minEye < .025, `accelerating platform introduced ${maxEye - minEye} m of vertical framing drift`);
  assert.equal(rig.platformY, null, 'opening/idle removes the platform input');
  const previous = rig.snapshot(), normal = new ChaseCamera(); Object.assign(normal, rig);
  const ordinarySubject = { x: player.x, y: 260, z: player.z + .1, yaw: Math.PI };
  const ordinaryControls = { yaw: Math.PI, pitch: .08, indoor: true, floorY: 260, aspect: 2, near: .15 };
  assert.deepEqual(rig.update(ordinarySubject, ordinaryControls, dt, []), normal.update(ordinarySubject, ordinaryControls, dt, []));
  assert.ok(previous.position.y > 261.5);
  rig.reset(); assert.equal(rig.platformY, null);
  const eye = rig.update({ x: 0, y: 40, z: 0 }, { yaw: 0, pitch: .15, firstPerson: true, platformY: 40 }, dt);
  assert.equal(eye.position.y, 41.62, 'first-person eye height remains direct');
  interiors.dispose();
});
