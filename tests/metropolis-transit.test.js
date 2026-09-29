import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld } from '../src/world.js';
import { createMetropolisWorld } from '../src/metropolis-world.js';
import { PLAYER_DIMENSIONS } from '../src/world-config.js';
import { ChaseCamera } from '../src/camera.js';
import * as THREE from '../vendor/three/three.module.js';
import { TransitService, createTransitSystem, TRANSIT_STOPS } from '../src/metropolis-transit.js';

const near = (actual, expected, epsilon = 1e-6) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);

for (const routeId of ['metro', 'light-rail', 'high-speed', 'ferry']) {
  test(`${routeId}: enter, wait, board, travel and disembark at the next station`, () => {
    const transit = new TransitService();
    const first = transit.stops.find(stop => stop.routeId === routeId);
    const entry = transit.interact(first.entrance);
    assert.equal(entry.handled, true);
    assert.equal(transit.boardingState, 'platform');
    assert.equal(entry.transition.groundY, first.platform.y);
    near(entry.transition.groundHeightAt(first.platform.x, first.platform.z), first.platform.y);
    assert.ok(entry.transition.colliders.length >= 4);
    const boarding = transit.interact(first.board);
    assert.equal(transit.riding, true);
    assert.equal(boarding.transition.position.y, transit.passengerPose.y);
    const sameColliders = transit.collisionContext().colliders;
    assert.strictEqual(transit.collisionContext().colliders, sameColliders);
    const vehicle = transit.vehicles.find(v => v.id === transit.ridingVehicleId);
    transit.update(vehicle.pose.remaining + 0.1);
    assert.equal(vehicle.pose.doorsOpen, false);
    assert.equal(transit.snapshot().phase, 'moving');
    const poseBefore = transit.passengerPose;
    assert.deepEqual(transit.update(0.3), {}, 'moving does not teleport or reset the camera every frame');
    assert.ok(Math.hypot(transit.passengerPose.x - poseBefore.x, transit.passengerPose.z - poseBefore.z) > 0);
    const denied = transit.interact(transit.passengerPose);
    assert.equal(denied.handled, true);
    assert.equal(denied.transition, undefined);
    assert.equal(transit.riding, true, 'mid-route disembarking is blocked');
    let elapsed = 0;
    while (!vehicle.pose.doorsOpen && elapsed < 90) { transit.update(0.05); elapsed += 0.05; }
    assert.ok(vehicle.pose.doorsOpen, 'next scheduled stop must be reached');
    assert.notEqual(vehicle.pose.stopId, first.id);
    const destination = transit.stop(vehicle.pose.stopId);
    const disembarking = transit.interact(transit.passengerPose);
    assert.equal(transit.riding, false);
    assert.equal(transit.activeStopId, destination.id);
    assert.deepEqual(disembarking.transition.position, { ...destination.board, yaw: Math.PI });
    assert.equal(disembarking.transition.groundY, destination.platform.y);
    const exit = transit.interact(destination.exit);
    assert.equal(transit.collisionContext(), null);
    assert.equal(exit.transition.id, 'street');
    assert.equal(exit.transition.groundHeightAt, null);
    assert.equal(exit.transition.position.x, destination.entrance.x);
  });
}

test('all ten stations have an initial visible service and maximum waiting time under 25 seconds', () => {
  const transit = new TransitService();
  assert.equal(transit.stops.length, 10);
  for (const stop of transit.stops) assert.equal(transit.nextArrival(stop.id), 0, stop.id);
  for (let step = 0; step < 1200; step++) {
    transit.update(0.25);
    for (const stop of transit.stops) {
      const wait = transit.nextArrival(stop.id);
      assert.ok(wait >= 0 && wait < 25, `${stop.id} wait ${wait}`);
    }
  }
  assert.ok(transit.routes.every(route => route.offsets.length > 1));
});

test('underground platforms preserve their own floor height and cannot activate from the street', () => {
  const transit = new TransitService(), stop = transit.stop('metro-old');
  transit.interact(stop.entrance);
  const context = transit.collisionContext();
  near(context.groundHeightAt(stop.platform.x, stop.platform.z), -14);
  near(context.groundHeightAt(stop.platform.x + 2, stop.platform.z + 20), -14);
  assert.ok(context.colliders.filter(c => c.physics).every(c => c.minY === -14));
  const other = new TransitService();
  assert.equal(other.interact({ ...stop.entrance, y: -14 }).handled, false);
});

test('leave and reset return a platform or moving passenger to a safe street entrance', () => {
  for (const riding of [false, true]) {
    const transit = new TransitService(), stop = transit.stop('ferry-south');
    transit.interact(stop.entrance);
    if (riding) { transit.interact(stop.board); transit.update(12); }
    const result = transit.reset();
    assert.equal(result.handled, true);
    assert.equal(result.transition.id, 'street');
    assert.equal(result.transition.position.x, stop.entrance.x);
    assert.equal(result.transition.groundY, 0);
    assert.equal(transit.riding, false);
    assert.equal(transit.activeStopId, null);
    assert.equal(transit.passengerPose, null);
    assert.equal(transit.leave().handled, false);
  }
});

test('large or invalid frame increments preserve deterministic finite vehicle poses', () => {
  const a = new TransitService(), b = new TransitService();
  a.update(172.5);
  for (let i = 0; i < 690; i++) b.update(0.25);
  for (let i = 0; i < a.vehicles.length; i++) {
    near(a.vehicles[i].pose.x, b.vehicles[i].pose.x);
    near(a.vehicles[i].pose.z, b.vehicles[i].pose.z);
  }
  const time = a.time;
  a.update(NaN); a.update(Infinity); a.update(-50);
  assert.equal(a.time, time);
  assert.ok(a.vehicles.every(v => [v.pose.x, v.pose.y, v.pose.z, v.pose.yaw].every(Number.isFinite)));
});

test('boarding requires reaching the marked platform area and an open stationary vehicle', () => {
  const transit = new TransitService(), stop = transit.stop('metro-old');
  transit.interact(stop.entrance);
  const result = transit.interact({ ...stop.platform, z: stop.platform.z + 12 });
  assert.equal(result.handled, true);
  assert.equal(transit.riding, false);
  transit.update(10);
  const waiting = transit.interact(stop.board);
  assert.equal(waiting.transition, undefined);
  assert.equal(transit.riding, false);
  assert.match(transit.getPrompt(stop.board), /下一班/);
});

test('station architecture and fleet share instanced resources and cull remote underground vehicles', () => {
  const transit = createTransitSystem(THREE, new THREE.Scene());
  assert.equal(transit.stops.length, TRANSIT_STOPS.length);
  assert.ok(transit.staticBatchCount <= 16);
  assert.ok(transit.root.children[0].children.some(child => child.isInstancedMesh && child.count > 100));
  assert.ok(transit.colliders.every(c => [c.x, c.z, c.hx, c.hz, c.minY, c.maxY].every(Number.isFinite)));
  for (const [id, mesh] of transit.fleet) {
    assert.ok(mesh.children.filter(child => child.isInstancedMesh).length > 4, id);
    assert.ok(mesh.children.length < 20, `${id} vehicle exceeds draw-call budget`);
    const geometry = new THREE.Box3().setFromObject(mesh);
    assert.ok(Number.isFinite(geometry.min.x) && geometry.max.y > geometry.min.y);
  }
  transit.update(0, { x: 16, y: 0, z: 250 });
  assert.ok([...transit.fleet.entries()].filter(([id]) => id.startsWith('metro')).every(([, mesh]) => !mesh.visible));
  const snapshot = transit.snapshot();
  assert.ok(snapshot.stops.every(stop => stop.entry && stop.platform && stop.board && stop.exit));
});


test('underground and elevated station roofs clip a steep camera boom without altering walking collision', () => {
  for (const id of ['metro-old', 'light-quay', 'hsr-north']) {
    const transit = new TransitService(), stop = transit.stop(id);
    transit.interact(stop.entrance);
    const context = transit.collisionContext();
    const roof = context.colliders.find(c => /roof|canopy/.test(c.id));
    assert.ok(roof, id);
    assert.equal(roof.physics, false);
    assert.equal(roof.camera, true);
    const view = new ChaseCamera().update({ ...stop.platform, speed: 0 }, { yaw: 0, pitch: 0.85, driving: false }, 1 / 60, context.colliders);
    assert.equal(view.obstructed, true, id);
    assert.ok(view.position.y < roof.minY - view.clearanceRadius, `${id} camera pierced station roof`);
    transit.interact(stop.board);
    assert.ok(transit.collisionContext().colliders.includes(roof), 'boarding preserves the station camera blockers');
  }
});


test('ferry entrance signage supports stay above an approaching pedestrian camera', () => {
  const transit = createTransitSystem(THREE, new THREE.Scene());
  for (const id of ['ferry-south', 'ferry-north']) {
    const posts = transit.colliders.filter(c => c.id.startsWith(`${id}-entrance-post-`));
    assert.equal(posts.length, 2);
    assert.ok(posts.every(c => c.maxY === 4.2 && c.minY === 0));
    // The 10 m sign has a 160 / 1024 aspect ratio. Its lower edge must
    // clear the ~1.98 m near-entrance camera by more than one metre.
    const lowerEdge = posts[0].maxY - 10 * 160 / 1024 / 2;
    assert.ok(lowerEdge > 3.4);
  }
});


test('every station returns the player to rendered street ground clear of all world obstacles', () => {
  const scene = new THREE.Scene();
  const south = createWorld(THREE, scene, { streaming: false, openNorth: true });
  const north = createMetropolisWorld(THREE, scene, { streaming: false });
  const transit = createTransitSystem(THREE, scene);
  const worldObstacles = [...south.colliders, ...north.colliders, ...transit.colliders];
  const groundAt = (x, z) => north.groundHeightAt(x, z) ?? south.groundHeightAt(x, z);
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const stop of transit.stops) {
    transit.interact(stop.entrance);
    const exit = transit.interact(stop.exit).transition;
    const p = exit.position, ground = groundAt(p.x, p.z);
    assert.equal(transit.collisionContext(), null, stop.id);
    assert.ok(Math.abs(exit.groundY - ground) <= 0.031, `${stop.id} exit did not restore street height`);
    const hits = worldObstacles.filter(c => {
      if (c.physics === false || c.minY >= ground + PLAYER_DIMENSIONS.height || c.maxY <= ground + 0.031) return false;
      const dx = Math.max(0, Math.abs(p.x - c.x) - c.hx), dz = Math.max(0, Math.abs(p.z - c.z) - c.hz);
      return Math.hypot(dx, dz) < PLAYER_DIMENSIONS.radius;
    });
    assert.deepEqual(hits.map(c => c.id), [], `${stop.id} exit intersects street obstacle`);
    // Raycast the shipped meshes as well as colliders: wooden pier decks
    // intentionally have context-owned physics, so collision checks alone
    // would miss a street exit embedded below a raised platform or gangway.
    ray.set(new THREE.Vector3(p.x, ground + 2, p.z), new THREE.Vector3(0, -1, 0));
    const surface = ray.intersectObjects([south.root, north.root, transit.root], true)[0];
    assert.ok(surface, `${stop.id} exit has no rendered ground`);
    assert.ok(Math.abs(surface.point.y - ground) <= 0.035, `${stop.id} landed underneath a raised deck at ${surface.point.y}`);
    // Atlas travel and saved sessions use the entrance itself, so it must
    // also be free of the raised pier/gangway rather than only the exit.
    const entranceGround = groundAt(stop.entrance.x, stop.entrance.z);
    ray.set(new THREE.Vector3(stop.entrance.x, entranceGround + 2, stop.entrance.z), new THREE.Vector3(0, -1, 0));
    const entrySurface = ray.intersectObjects([south.root, north.root, transit.root], true)[0];
    assert.ok(entrySurface && Math.abs(entrySurface.point.y - entranceGround) <= 0.035, `${stop.id} saved entrance is underneath a raised deck`);
    transit.interact(stop.entrance);
    assert.deepEqual(transit.leave().transition.position, p, `${stop.id} reset and public exit disagree`);
  }
  assert.equal(transit.stop('ferry-north').streetExit.z, -405.5);
  assert.equal(transit.stop('ferry-north').streetExit.yaw, Math.PI);
});


test('the ferry passenger stands on the forward deck clear of furniture with an unobstructed forward view', () => {
  const transit = createTransitSystem(THREE, new THREE.Scene()), stop = transit.stop('ferry-south');
  transit.interact(stop.entrance); transit.interact(stop.board); transit.update(0);
  transit.root.updateMatrixWorld(true);
  const passenger = transit.passengerPose, ferry = transit.fleet.get(transit.ridingVehicleId);
  const local = ferry.worldToLocal(new THREE.Vector3(passenger.x, passenger.y, passenger.z));
  near(local.z, 7.2);
  assert.ok(local.z + PLAYER_DIMENSIONS.radius < 8.8, 'passenger footprint extends beyond the bow deck');
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(passenger.x, passenger.y + 0.1, passenger.z), new THREE.Vector3(0, -1, 0));
  const deck = ray.intersectObject(ferry, true)[0];
  assert.ok(deck && Math.abs(passenger.y - deck.point.y) < 0.06, 'passenger feet are not supported by the deck');
  // Probe the standing capsule at feet, torso and eye height against the
  // actual rendered cabin/benches/railings, independent of the chosen offset.
  for (const height of [0.2, 0.9, 1.62]) for (let side = 0; side < 16; side++) {
    const angle = side * Math.PI / 8;
    ray.near = 0; ray.far = PLAYER_DIMENSIONS.radius;
    ray.set(new THREE.Vector3(passenger.x, passenger.y + height, passenger.z), new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)));
    assert.equal(ray.intersectObject(ferry, true).length, 0, 'passenger body overlaps ferry furniture');
  }
  // A 65-degree first-person camera must have a clear central view, rather
  // than the aft-cabin wall which previously filled the whole screenshot.
  for (const turn of [-0.45, 0, 0.45]) for (const pitch of [-0.2, 0, 0.2]) {
    ray.far = 30;
    ray.set(new THREE.Vector3(passenger.x, passenger.y + 1.62, passenger.z),
      new THREE.Vector3(Math.sin(passenger.yaw + turn), pitch, Math.cos(passenger.yaw + turn)).normalize());
    assert.equal(ray.intersectObject(ferry, true).length, 0, 'forward passenger view is blocked by ferry geometry');
  }
});
