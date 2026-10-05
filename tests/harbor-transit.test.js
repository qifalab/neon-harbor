import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import { HarborTransitService, harborLocalToWorld, harborWorldToLocal, harborRoutePose } from '../src/harbor-transit.js';
import { createHarborTransitSystem } from '../src/harbor-transit-renderer.js';
import { HARBOR_VEHICLE_SPECS } from '../src/harbor-vehicle-models.js';
import { SpatialIndex, circleContacts, moveCircle, overlapOBB } from '../src/collision.js';
import { createWorld } from '../src/world.js';
import { createMetropolisWorld } from '../src/metropolis-world.js';
import { createTransitSystem } from '../src/metropolis-transit.js';
import { createMetropolisInfrastructure } from '../src/metropolis-infrastructure.js';
import { intersectionSignal } from '../src/traffic.js';

const near = (a, b, epsilon = .012) => assert.ok(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);
const walkTo = (service, target, step = .035) => {
  const heights = [];
  for (let n = 0; n < 1600; n++) {
    const p = service.passenger, d = Math.hypot(target.x - p.x, target.z - p.z); if (d < .008) break;
    const length = Math.min(step, d); service.movePassenger((target.x - p.x) / d * length, (target.z - p.z) / d * length);
    heights.push(service.passenger.y);
  }
  near(service.passenger.x, target.x); near(service.passenger.z, target.z); return heights;
};
const boardKind = kind => {
  const service = new HarborTransitService(), stop = service.stops.find(s => s.kind === kind);
  assert.equal(service.interact(stop.board).handled, true); assert.equal(service.riding, true);
  return { service, stop, stair: service.layout(kind).stairs[0] };
};

test('every original service fits its existing street or water corridor for a whole circuit', () => {
  const scene = new THREE.Scene(), south = createWorld(THREE, scene, { streaming: false, openNorth: true }), north = createMetropolisWorld(THREE, scene, { streaming: false });
  const legacy = createTransitSystem(THREE, scene), infrastructure = createMetropolisInfrastructure(THREE, scene), service = new HarborTransitService();
  const solids = [...south.colliders, ...north.colliders, ...legacy.colliders, ...infrastructure.colliders];
  assert.equal(service.route('harbor-bus').stops.length, 6); assert.equal(service.route('harbor-tram').stops.length, 3);
  assert.equal(service.route('harbor-ferry').stops.length, 2);
  for (const route of service.routes) {
    const spec = HARBOR_VEHICLE_SPECS[route.kind];
    for (let t = 0; t < route.duration; t += .35) {
      const p = harborRoutePose(route, t);
      if (route.kind === 'tram') assert.equal(p.y, 0, 'street tram must remain at road height');
      if (route.kind === 'ferry') assert.ok(p.z < -300 && p.z > -385, 'ferry stays in the channel');
      const contacts = solids.filter(c => c.physics !== false && c.maxY > p.y + .03 && c.minY < p.y + spec.height && overlapOBB({ ...p, hx: spec.halfWidth, hz: spec.halfLength }, c));
      assert.deepEqual(contacts.map(c => c.id), [], `${route.id} intersects existing world at ${t}`);
    }
  }
});

for (const kind of ['bus', 'tram', 'ferry']) {
  test(`${kind}: walk through the boarding door, upstairs, along the upper aisle and back downstairs`, () => {
    const { service, stair } = boardKind(kind), layout = service.layout(kind), door = layout.doors[0];
    walkTo(service, { x: 0, z: door.inside.z }); walkTo(service, { x: 0, z: stair.bottom.z }); walkTo(service, stair.bottom);
    const up = walkTo(service, stair.top); near(service.passenger.y, layout.deckLevels[1]);
    assert.ok(up.some(y => y > layout.deckLevels[0] + .3 && y < layout.deckLevels[1] - .3));
    for (let i = 1; i < up.length; i++) assert.ok(Math.abs(up[i] - up[i - 1]) < .09, 'stair movement cannot teleport to the upper floor');
    walkTo(service, { x: 0, z: stair.top.z });
    const upperAisle = layout.aislePaths.find(a => a.deckId === 'upper'), a = upperAisle.waypoints[0], b = upperAisle.waypoints.at(-1);
    walkTo(service, { x: 0, z: a.z }); walkTo(service, { x: 0, z: b.z }); near(service.passenger.y, layout.deckLevels[1]);
    assert.equal(service.snapshot().passengerDeck, 'upper'); assert.equal(service.interact(service.passengerPose).transition, undefined, 'E upstairs cannot alight');
    const local = { ...service.passenger }; service.update(18); assert.equal(service.riding, true);
    near(service.passenger.x, local.x); near(service.passenger.z, local.z); near(service.passenger.y, local.y);
    const movingLocal = harborWorldToLocal(service.passengerPose, service.vehicle().pose);
    near(movingLocal.x, local.x); near(movingLocal.z, local.z); near(movingLocal.y, local.y);
    walkTo(service, { x: 0, z: stair.top.z }); walkTo(service, stair.top); walkTo(service, stair.bottom); near(service.passenger.y, layout.deckLevels[0]);
    walkTo(service, { x: 0, z: door.inside.z }); walkTo(service, door.inside);
    let exit = null;
    for (let n = 0; n < 7000 && !exit; n++) { service.update(.05); if (service.availableExit()) exit = service.interact(service.passengerPose); }
    assert.ok(exit?.transition, 'a later physical stop permits exit at its lower door');
    assert.equal(service.riding, false); assert.equal(service.collisionContext(), null);
    const stop = service.stop(service.snapshot().vehicles.find(v => v.id === `${service.boardedStop.routeId}-1`).stopId);
    near(exit.transition.position.x, stop.board.x); near(exit.transition.position.z, stop.board.z);
  });
}

test('passenger seats, closed doors and end walls reject movement rather than pinning the passenger', () => {
  const { service } = boardKind('tram'), layout = service.layout('tram');
  walkTo(service, { x: 0, z: -1.8 });
  const before = { ...service.passenger }; service.movePassenger(4, 0);
  assert.ok(service.passenger.x < layout.decks[0].maxX - layout.passengerRadius);
  assert.ok(service.passenger.x < .5, 'a seat must stop a crossing attempt');
  service.movePassenger(-service.passenger.x, 0); service.movePassenger(0, 30);
  assert.ok(service.passenger.z < layout.decks[0].maxZ);
  assert.ok(Math.abs(service.passenger.z - before.z) > 1, 'ordinary aisle movement must remain possible');
  const sim = { player: { ...service.passengerPose }, inCar: null };
  const start = { ...service.passenger }, pose = service.vehicle().pose;
  service.stepPlayer(sim, .1, { forward: -1, cameraYaw: pose.yaw, slow: true });
  assert.ok(service.passenger.z < start.z); near(start.z - service.passenger.z, .03, .002);
  const actual = harborLocalToWorld(service.passenger, pose); near(sim.player.x, actual.x); near(sim.player.z, actual.z);
});

test('ten minutes of independent timetables keep bus and tram bodies apart', () => {
  const service = new HarborTransitService(), visits = new Set(); let lastMinute;
  for (let n = 0; n < 6000; n++) {
    if (n === 5400) lastMinute = new Map(service.vehicles.map(v => [v.id, v.serviceTime]));
    service.update(.1);
    const bodies = service.trafficBodies;
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) assert.equal(overlapOBB(bodies[i], bodies[j]), null, `${bodies[i].id} intersects ${bodies[j].id}`);
    for (const v of service.vehicles) if (v.pose.stopId) visits.add(v.pose.stopId);
  }
  assert.equal(visits.size, service.stops.length); assert.ok(service.vehicles.some(v => v.delay > 0), 'shared street services must yield to one another');
  assert.ok(service.vehicles.every(v => v.serviceTime > lastMinute.get(v.id) + 1),
    'every actual service keeps progressing in the final minute instead of becoming permanently stranded');
});

test('external traffic stops the bus before contact and the delayed timetable resumes', () => {
  const service = new HarborTransitService(), bus = service.vehicle('harbor-bus-1');
  service.update(11.4);
  const blocker = { id: 'test-road-car', x: 152, z: 146, y: 0, yaw: 0, hx: 1.2, hz: 2.3, speed: 0, vx: 0, vz: 0, health: 100 };
  for (let n = 0; n < 220; n++) { service.update(.05, null, { traffic: [blocker] }); assert.equal(overlapOBB(service.trafficBodies.find(b => b.id === bus.id), blocker), null); }
  assert.equal(bus.held, 'following'); const heldClock = bus.serviceTime, delay = bus.delay;
  service.update(2); assert.ok(bus.serviceTime > heldClock); assert.ok(bus.delay >= delay);
  assert.ok(Number.isFinite(service.nextArrival('harbor-bus-market')));
});

test('saving restores stop dwell and delayed schedules without placing a load inside a vehicle', () => {
  const first = new HarborTransitService(); first.update(6); first.interact(first.stop('harbor-tram-lantern').board);
  assert.equal(first.riding, true); const save = first.exportState(), resumed = new HarborTransitService();
  assert.equal(resumed.restoreState(JSON.parse(JSON.stringify(save))), true); assert.equal(resumed.riding, false);
  assert.deepEqual(resumed.vehicles.map(v => v.pose), first.vehicles.map(v => v.pose));
  first.update(2); resumed.update(2); assert.deepEqual(resumed.vehicles.map(v => v.pose), first.vehicles.map(v => v.pose));
  const vehicle = resumed.vehicle('harbor-tram-1'), remaining = vehicle.pose.remaining;
  resumed.holdDoors(vehicle.id, remaining + 2); resumed.update(remaining + .5);
  assert.equal(vehicle.pose.stopId, 'harbor-tram-lantern'); assert.equal(vehicle.pose.doorsOpen, true); assert.equal(vehicle.held, 'boarding');
  resumed.update(4); assert.equal(vehicle.pose.stopId, null); assert.equal(vehicle.pose.doorsOpen, false);
  assert.equal(first.syncTime(100), false, 'clock alignment cannot reset an active passenger');
  assert.equal(resumed.syncTime(100), true); near(resumed.time, 100);
});

test('citizens board a real stop, travel in the moving cabin and alight at a different stop', () => {
  const service = new HarborTransitService(), start = 'harbor-tram-lantern', destination = 'harbor-tram-workshop';
  assert.equal(service.boardCitizen('citizen', 'harbor-tram-quay', start), null, 'boarding cannot target a vehicle at a different stop');
  const ticket = service.boardCitizen('citizen', start, destination, { slot: 2 }); assert.ok(ticket);
  const path = service.citizenBoardingPath(start, ticket.vehicleId, 2); assert.deepEqual(path[0], service.stop(start).board);
  service.confirmCitizen('citizen'); const initial = service.citizenPose('citizen'); service.update(15);
  assert.ok(Math.hypot(service.citizenPose('citizen').x - initial.x, service.citizenPose('citizen').z - initial.z) > 1);
  assert.equal(service.citizenArrival('citizen'), null);
  for (let n = 0; n < 2000 && !service.citizenArrival('citizen'); n++) service.update(.05);
  assert.deepEqual(service.citizenArrival('citizen'), service.stop(destination).board);
  service.releaseCitizen('citizen'); assert.equal(service.citizenPassengers.size, 0);
});

test('a saved boarding token, door hold and citizen cabin pose continue after load', () => {
  const service = new HarborTransitService();
  const ticket = service.boardCitizen('resident-1', 'harbor-tram-lantern', 'harbor-tram-quay', { slot: 3 });
  assert.ok(ticket); service.holdDoors(ticket.vehicleId, 18); service.update(10);
  const restored = new HarborTransitService(); assert.equal(restored.restoreState(JSON.parse(JSON.stringify(service.exportState()))), true);
  assert.deepEqual(restored.citizenPassengers.get('resident-1'), service.citizenPassengers.get('resident-1'));
  assert.equal(restored.citizenBoardings, service.citizenBoardings);
  for (let n = 0; n < 200; n++) {
    service.update(.05); restored.update(.05);
    assert.deepEqual(restored.citizenPose('resident-1'), service.citizenPose('resident-1'));
    assert.deepEqual(restored.citizenArrival('resident-1'), service.citizenArrival('resident-1'));
  }
});

test('both ferry piers can be walked from real street height over the sea wall and match rendered support', () => {
  const scene = new THREE.Scene(), south = createWorld(THREE, scene, { streaming: false, openNorth: true }), north = createMetropolisWorld(THREE, scene, { streaming: false });
  const ground = (x, z) => north.groundHeightAt(x, z) ?? south.groundHeightAt(x, z), service = createHarborTransitSystem(THREE, scene, { groundHeightAt: ground });
  scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), index = new SpatialIndex([...south.colliders, ...north.colliders, ...service.colliders]);
  for (const stop of service.stops.filter(s => s.kind === 'ferry')) {
    const p = { ...stop.entrance, groundY: 0 }, direction = Math.sign(stop.board.z - p.z);
    const support = (x, z) => service.groundHeightAt(x, z) ?? ground(x, z);
    for (let n = 0; n < 1000 && Math.abs(p.z - stop.board.z) > .04; n++) {
      moveCircle(p, 0, direction * .035, .65, { index, groundHeightAt: support, bounds: 1800 }); p.groundY = support(p.x, p.z);
    }
    near(p.z, stop.board.z, .06); near(p.groundY, 1.3);
    assert.deepEqual(circleContacts(p, .65, { index, groundHeightAt: support, bounds: 1800 }), []);
    for (let z = Math.min(stop.entrance.z, stop.board.z) + 1; z < Math.max(stop.entrance.z, stop.board.z); z += 2) {
      const y = support(220, z); ray.set(new THREE.Vector3(220, y + .2, z), down); ray.far = .4;
      const hit = ray.intersectObjects([service.root], true).find(h => h.face?.normal.y > .5 &&
        h.object.userData.parts?.[h.instanceId]?.name.includes('-pier-support-'));
      assert.ok(hit, `${stop.id} lacks a rendered walking surface at ${z}`); near(hit.point.y, y, .014);
    }
  }
  assert.ok(service.fleet.get('harbor-tram-1').userData.layout.decks.length === 2);
  const rail = service.railMesh; assert.ok(rail.isInstancedMesh && rail.count > 50);
  service.dispose();
});

test('sixteen static batches retain all 101 original transforms, materials and shadow flags with independent bank bounds', () => {
  const service = createHarborTransitSystem(THREE, new THREE.Scene()), matrix = new THREE.Matrix4(), submitted = [];
  assert.equal(service.staticParts.size, 101); assert.equal(service.staticBatches.length, 16);
  const zones = new Map(), geometry = service.railMesh.geometry;
  for (const batch of service.staticBatches) {
    const { zone, material } = batch.userData.harborStaticBatch;
    zones.set(zone, (zones.get(zone) || 0) + 1);
    assert.equal(batch.geometry, geometry, 'every batch reuses the existing unit box geometry');
    assert.equal(batch.count, batch.userData.parts.length); assert.ok(batch.boundingBox && batch.boundingSphere);
    assert.ok(Number.isFinite(batch.boundingSphere.radius)); assert.ok(batch.frustumCulled);
    const expectedBounds = new THREE.Box3(), unitBox = new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5));
    for (const record of batch.userData.parts) {
      assert.equal(service.staticParts.get(record.name), record);
      assert.equal(record.batchName, batch.name); assert.equal(record.zone, zone); assert.equal(record.material, material);
      assert.equal(record.castShadow, batch.castShadow); assert.equal(record.receiveShadow, batch.receiveShadow);
      batch.getMatrixAt(record.instanceId, matrix); assert.deepEqual(matrix.toArray(), record.matrix);
      expectedBounds.union(unitBox.clone().applyMatrix4(matrix));
      submitted.push({ name: record.name, matrix: matrix.toArray(), color: batch.material.color.getHexString(), cast: batch.castShadow, receive: batch.receiveShadow });
    }
    assert.ok(expectedBounds.min.distanceTo(batch.boundingBox.min) < 1e-8); assert.ok(expectedBounds.max.distanceTo(batch.boundingBox.max) < 1e-8);
    if (zone === 'street') { assert.ok(batch.boundingBox.min.z > -205 && batch.boundingBox.max.z < 175); assert.ok(batch.boundingSphere.radius < 210); }
    else {
      assert.ok(batch.boundingBox.min.x > 216 && batch.boundingBox.max.x < 224); assert.ok(batch.boundingSphere.radius < 22);
      if (zone === 'south-pier') assert.ok(batch.boundingBox.min.z > -306 && batch.boundingBox.max.z < -279);
      else { assert.equal(zone, 'north-pier'); assert.ok(batch.boundingBox.min.z > -401 && batch.boundingBox.max.z < -379); }
    }
  }
  assert.deepEqual(Object.fromEntries(zones), { street: 6, 'south-pier': 5, 'north-pier': 5 });
  assert.equal(new Set(submitted.map(p => p.name)).size, 101);
  // Captured from the 101 pre-batch authored Mesh objects. The comparison
  // covers their submitted Float32 matrices, names, colour and shadow flags;
  // expected geometry is never regenerated from the current batching code.
  submitted.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  assert.equal(createHash('sha256').update(JSON.stringify(submitted)).digest('hex'), '22fd577eb3307d4af7419ef96e1dd405a13503b5cac567faa0c82da7ad4a1b30');
  const northRamp = service.staticParts.get('harbor-north-pier-support-0');
  assert.ok(Math.abs(northRamp.matrix[6]) > .03 && Math.abs(northRamp.matrix[9]) > 2, 'final ramp rotation must be captured after authoring');
  service.dispose();
});

test('static instances stay shared while ferry gangways, eleven canvas signs and the live fleet remain independent', () => {
  const originalDocument = globalThis.document, ctx = { fillRect() {}, fillText() {} };
  globalThis.document = { createElement(type) { assert.equal(type, 'canvas'); return { width: 0, height: 0, getContext() { return ctx; } }; } };
  let service;
  try {
    const scene = new THREE.Scene(); service = createHarborTransitSystem(THREE, scene);
    const direct = service.root.children.filter(m => m.isMesh), signs = direct.filter(m => m.name.endsWith('real-stop-sign'));
    assert.equal(signs.length, 11); assert.equal(new Set(signs.map(m => m.material.map)).size, 11);
    assert.ok(signs.every(m => !m.isInstancedMesh && m.geometry.type === 'PlaneGeometry'));
    assert.equal(direct.length, 31, '16 static submissions, two existing track/wire meshes, two dynamic gangways and eleven textured signs');
    assert.equal(direct.filter(m => m.isInstancedMesh).length, 18); assert.equal(service.railMesh.count, 110); assert.equal(service.wireMesh.count, 55);
    assert.equal(service.fleet.size, 5); assert.ok([...service.fleet.values()].every(m => m.parent === service.root && m.userData.layout.decks.length === 2));
    const matrices = service.staticBatches.map(m => ({ mesh: m, array: m.instanceMatrix.array, values: Array.from(m.instanceMatrix.array), version: m.instanceMatrix.version }));
    const south = service.root.getObjectByName('harbor-ferry-south-open-gangway'), north = service.root.getObjectByName('harbor-ferry-north-open-gangway');
    assert.ok(south?.isMesh && north?.isMesh && !south.isInstancedMesh && !north.isInstancedMesh);
    assert.equal(south.visible, true); assert.equal(north.visible, false);
    assert.equal(service.staticParts.has(south.name), false); assert.equal(service.staticParts.has(north.name), false);
    service.update(17); assert.equal(south.visible, true, 'fixed ticks do not mutate the presentation');
    service.updateRender(null, 20); assert.equal(south.visible, false); assert.equal(north.visible, false);
    const ferry = service.vehicle('harbor-ferry-1');
    for (let n = 0; n < 1500 && ferry.pose.stopId !== 'harbor-ferry-north'; n++) service.update(.1);
    assert.equal(ferry.pose.stopId, 'harbor-ferry-north'); service.updateRender(null, 20);
    assert.equal(north.visible, true); assert.equal(south.visible, false);
    for (const { mesh, array, values, version } of matrices) {
      assert.equal(mesh.instanceMatrix.array, array); assert.equal(mesh.instanceMatrix.version, version); assert.deepEqual(Array.from(array), values);
    }
    // Shared geometry/material resources and each instance buffer must be
    // released exactly once, despite references from many render objects.
    const owned = new Set();
    for (const mesh of direct) { owned.add(mesh.geometry); owned.add(mesh.material); if (mesh.material.map) owned.add(mesh.material.map); if (mesh.isInstancedMesh) owned.add(mesh); }
    const disposals = new Map([...owned].map(r => [r, 0]));
    for (const resource of owned) resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
    service.dispose(); service.dispose();
    assert.ok([...disposals.values()].every(count => count === 1)); assert.equal(scene.children.length, 0);
  } finally {
    service?.dispose(); if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
  }
});

/** Retain each real service's initial stop while selecting a different saved
 * city-clock phase. Vehicles still depart, approach and wait by normal update. */
const calendarFixture = time => {
  const service = new HarborTransitService(), saved = service.exportState(); saved.time = time;
  assert.equal(service.restoreState(saved), true); return service;
};
for (const [kind, calendar, crossingZ, direction, greenAt] of [['bus', 14, 160, 1, 35], ['tram', 7, 80, -1, 33]]) {
  test(`${kind} at its actual eight-metre curb lane brakes before red, restores its queue and resumes on green`, () => {
    const service = calendarFixture(calendar), vehicle = service.vehicle(`harbor-${kind}-1`), spec = HARBOR_VEHICLE_SPECS[kind];
    const crossingX = kind === 'bus' ? 160 : 240, line = crossingZ - direction * 15;
    let waiting = false, peak = 0, deceleration = false, previousSpeed = 0;
    while (service.time < greenAt - 1) {
      service.update(.05);
      const p = vehicle.pose, front = p.z + direction * (spec.halfLength * Math.abs(Math.cos(p.yaw)) + spec.halfWidth * Math.abs(Math.sin(p.yaw)));
      if (intersectionSignal(service.time, crossingX, crossingZ, 'z') !== 'green') assert.ok((line - front) * direction >= .079, `${kind} body crossed its red stop line`);
      peak = Math.max(peak, p.speed);
      if (previousSpeed > .6 && p.speed < previousSpeed - .02) deceleration = true;
      assert.ok(p.speed - previousSpeed <= .142, 'departure acceleration should remain bounded');
      assert.ok(previousSpeed - p.speed < .31, 'a known red approach should brake gradually');
      previousSpeed = p.speed; waiting ||= vehicle.held === 'signal';
    }
    assert.ok(waiting && deceleration && peak > .7); assert.equal(vehicle.held, 'signal'); assert.equal(vehicle.pose.doorsOpen, false);
    const stopped = { ...vehicle.pose }, clock = vehicle.serviceTime, restored = new HarborTransitService();
    assert.equal(restored.restoreState(JSON.parse(JSON.stringify(service.exportState()))), true);
    assert.deepEqual(restored.vehicle(vehicle.id).junction, vehicle.junction); assert.equal(restored.vehicle(vehicle.id).held, 'signal');
    for (let n = 0; n < 60; n++) {
      service.update(.05); restored.update(.05);
      assert.deepEqual(restored.exportState(), service.exportState(), 'a saved signal queue must continue identically');
    }
    assert.ok(vehicle.serviceTime > clock); assert.ok((vehicle.pose.z - stopped.z) * direction > 2, 'the physical body resumes after green');
    assert.equal(vehicle.held, null); assert.equal(vehicle.junction.committed, true);
  });
}

test('a vehicle already admitted through green clears a newly red junction after save/load', () => {
  const service = calendarFixture(14), bus = service.vehicle('harbor-bus-1');
  while (!(bus.junction?.committed && bus.pose.z > 149)) service.update(.05);
  assert.ok(bus.pose.z < 160); const saved = service.exportState();
  // The bus front crossed on green. Reload at the next red phase while its
  // actual route position still lies inside that same junction.
  saved.time = 49; assert.equal(intersectionSignal(saved.time, 160, 160, 'z'), 'red');
  const resumed = new HarborTransitService(); assert.equal(resumed.restoreState(saved), true);
  const moving = resumed.vehicle(bus.id), before = moving.serviceTime;
  for (let n = 0; n < 240 && moving.junction?.x === 160 && moving.junction?.z === 160; n++) {
    resumed.update(.05); assert.notEqual(moving.held, 'signal');
    assert.equal(intersectionSignal(resumed.time, 160, 160, 'z'), 'red');
  }
  assert.ok(moving.serviceTime > before + 3); assert.ok(moving.pose.x > 181.5, 'the rear must leave the full junction before admission resets');
  assert.ok(!moving.junction || moving.junction.x !== 160 || moving.junction.z !== 160);
});

test('a green approach waits for a saved admitted cabin to clear its full junction', () => {
  const service = calendarFixture(14), owner = service.vehicle('harbor-bus-1');
  for (let tick = 0; tick < 10000 && !(owner.junction?.committed && owner.junction.x === 240 && owner.junction.z === 160); tick++) service.update(.05);
  assert.ok(owner.junction?.committed && owner.junction.x === 240 && owner.junction.z === 160);
  const incoming = service.vehicle('harbor-tram-2'), route = service.route(incoming.routeId);
  let arrival = 0;
  while (arrival < route.duration) {
    const pose = harborRoutePose(route, arrival);
    if (Math.abs(pose.x - 232) < .1 && pose.z > 118 && pose.z < 119 && Math.abs(pose.yaw) < .03) break;
    arrival += .025;
  }
  assert.ok(arrival < route.duration, 'the incoming tram uses its actual northbound track');
  incoming.serviceTime = arrival; incoming.pose = harborRoutePose(route, arrival);
  incoming.junction = { x: 240, z: 160, axis: 'z', direction: 1, committed: false };
  while (intersectionSignal(service.time, 240, 160, 'z') !== 'green') service.time += .05;
  const waiting = service.streetControl(incoming);
  assert.equal(waiting.reason, 'junction'); assert.equal(waiting.red, true);
  assert.ok(waiting.distance >= 0 && waiting.distance < 40, 'green does not reserve space already occupied by a long cabin');
  const resumed = new HarborTransitService(); assert.equal(resumed.restoreState(service.exportState()), true);
  assert.equal(resumed.streetControl(resumed.vehicle(incoming.id)).reason, 'junction');
  const moving = resumed.vehicle(owner.id), ownerRoute = resumed.route(moving.routeId);
  const clearStop = ownerRoute.arrivals.find(stop => stop.stopId === 'harbor-bus-lantern');
  moving.serviceTime = clearStop.time; moving.pose = harborRoutePose(ownerRoute, clearStop.time);
  resumed.streetControl(moving);
  assert.ok(!moving.junction || moving.junction.x !== 240 || moving.junction.z !== 160,
    'the owner releases the previous junction after its full rear leaves');
  const allowed = resumed.streetControl(resumed.vehicle(incoming.id));
  assert.equal(allowed.red, false); assert.equal(allowed.distance, Infinity);
});

test('the shared pedestrian stop-distance hook protects the bus front, persists its wait and excludes the ferry', () => {
  const service = new HarborTransitService(), bus = service.vehicle('harbor-bus-1'), ferry = service.vehicle('harbor-ferry-1');
  const pedestrian = { x: 152, z: 146 }, kinds = new Set();
  const pedestrianDistanceAt = body => {
    kinds.add(body.kind);
    const forward = (pedestrian.x - body.x) * Math.sin(body.yaw) + (pedestrian.z - body.z) * Math.cos(body.yaw);
    const side = Math.abs((pedestrian.x - body.x) * Math.cos(body.yaw) - (pedestrian.z - body.z) * Math.sin(body.yaw));
    return forward > -3 && forward < 50 && side < 5 ? Math.max(0, forward - 4) : Infinity;
  };
  for (let n = 0; n < 370; n++) {
    service.update(.05, null, { pedestrianDistanceAt });
    assert.ok(bus.pose.z + HARBOR_VEHICLE_SPECS.bus.halfLength < pedestrian.z - 1.7, 'a long bus must use its own front clearance');
  }
  assert.equal(intersectionSignal(service.time, 160, 160, 'z'), 'green'); assert.equal(bus.held, 'pedestrian');
  assert.equal(kinds.has('ferry'), false); const pose = { ...bus.pose }, clock = bus.serviceTime;
  const restored = new HarborTransitService(); assert.equal(restored.restoreState(service.exportState()), true);
  for (let n = 0; n < 50; n++) {
    service.update(.05, null, { pedestrianDistanceAt }); restored.update(.05, null, { pedestrianDistanceAt });
    assert.deepEqual(restored.exportState(), service.exportState());
  }
  assert.equal(bus.serviceTime, clock); assert.equal(bus.pose.z, pose.z);
  assert.ok(ferry.serviceTime > 20 && Math.hypot(ferry.pose.x - 227.2, ferry.pose.z + 309.5) > 1, 'water travel remains independent of street pedestrians and lights');
  // Once the person has cleared, an intervening red still holds the bus.
  for (let n = 0; n < 40; n++) service.update(.05);
  assert.equal(bus.held, 'signal'); assert.equal(bus.pose.doorsOpen, false);
  while (service.time < 38) service.update(.05);
  assert.ok(bus.serviceTime > clock && bus.pose.z > pose.z + 5); assert.equal(bus.held, null);
});
