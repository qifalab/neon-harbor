import test from 'node:test';
import assert from 'node:assert/strict';
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
