import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { GameSimulation } from '../src/simulation.js';
import { harborWorldToLocal } from '../src/harbor-transit.js';
import { HARBOR_VEHICLE_SPECS } from '../src/harbor-vehicle-models.js';
import { intersectionSignal } from '../src/traffic.js';

let contextSwitches = 0;
const scene = new THREE.Scene(), city = createCityExploration(THREE, scene, { streaming: false, onContextChange: () => contextSwitches++ });
const fixture = ({ save = null, hour = 8 } = {}) => {
  const sim = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt, save });
  city.bind(sim, { save, hour }); return sim;
};
const near = (a, b, tolerance = .02) => assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
const advance = seconds => { for (let n = 0; n < Math.ceil(seconds / .05); n++) city.step(.05, {}); };

/** Test setup uses the same public transition as atlas travel to a stop. All
 * later player motion and boarding go through normal city input and E. */
function boardAtStop(kind) {
  const sim = fixture(), transport = city.sample.transit, stop = transport.stops.find(s => s.kind === kind);
  city.applyTransition({ position: stop.board, groundY: stop.board.y });
  assert.equal(city.getPrompt().kind, 'harbor-transit');
  assert.equal(city.interact().handled, true); assert.equal(transport.riding, true);
  return { sim, transport, stop };
}
function walkInCabin(sim, target) {
  const service = city.sample.transit, radius = service.layout(service.vehicle().kind).passengerRadius;
  const heights = [];
  for (let n = 0; n < 1800; n++) {
    const p = service.passenger, dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    if (d < .014) break;
    const dt = .02, forward = Math.min(1, d / (2.25 * dt));
    city.step(dt, { forward, cameraYaw: service.vehicle().pose.yaw + Math.atan2(dx, dz) });
    heights.push(sim.player.groundY);
    assert.ok(Number.isFinite(sim.player.x) && Number.isFinite(sim.player.z) && Number.isFinite(sim.player.groundY));
    const local = harborWorldToLocal({ x: sim.player.x, z: sim.player.z, y: sim.player.groundY }, service.vehicle().pose);
    near(local.x, service.passenger.x, 1e-6); near(local.z, service.passenger.z, 1e-6); near(local.y, service.passenger.y, 1e-6);
    assert.equal(service.collisionContext().radius, radius);
  }
  near(service.passenger.x, target.x); near(service.passenger.z, target.z); return heights;
}

for (const kind of ['bus', 'tram', 'ferry']) {
  test(`normal city play boards ${kind}, walks both decks, travels and alights at another physical stop`, () => {
    const { sim, transport, stop } = boardAtStop(kind), vehicle = transport.vehicle(), layout = transport.layout(kind), stair = layout.stairs[0], door = layout.doors[0];
    const revision = sim.teleportRevision, switches = contextSwitches, initialFleetTime = transport.time;
    const traffic = city.vehicles.filter(v => v.traffic), initialTraffic = new Map(traffic.map(v => [v.id, { x: v.x, z: v.z }]));
    walkInCabin(sim, { x: 0, z: door.z }); walkInCabin(sim, { x: 0, z: stair.bottom.z }); walkInCabin(sim, stair.bottom);
    const heights = walkInCabin(sim, stair.top); walkInCabin(sim, { x: 0, z: stair.top.z });
    near(sim.player.groundY, vehicle.pose.y + layout.deckLevels[1]);
    assert.ok(heights.some(y => y > layout.deckLevels[0] + .25 && y < layout.deckLevels[1] - .25));
    assert.equal(transport.snapshot().passengerDeck, 'upper'); assert.equal(city.interact().transition, undefined, 'E upstairs cannot skip the stairs to exit');
    const local = { ...transport.passenger }; advance(2);
    near(transport.passenger.x, local.x, 1e-6); near(transport.passenger.z, local.z, 1e-6); near(transport.passenger.y, local.y, 1e-6);
    assert.ok(transport.time > initialFleetTime + 2); assert.equal(sim.teleportRevision, revision);
    assert.equal(contextSwitches, switches, 'moving cabin does not rebuild collision indexes every fixed tick');
    assert.ok(traffic.some(v => Math.hypot(v.x - initialTraffic.get(v.id).x, v.z - initialTraffic.get(v.id).z) > .1), 'street traffic keeps running while aboard');
    for (const car of city.vehicles) near(car.y, city.groundHeightAt(car.x, car.z, car.y), .04);
    walkInCabin(sim, stair.top); walkInCabin(sim, stair.bottom); near(sim.player.groundY, layout.deckLevels[0]);
    walkInCabin(sim, { x: 0, z: door.z }); walkInCabin(sim, door.inside);
    for (let n = 0; n < 10000 && (!vehicle.pose.stopId || vehicle.pose.stopId === stop.id || !transport.availableExit()); n++) city.step(.05, {});
    assert.ok(vehicle.pose.stopId && vehicle.pose.stopId !== stop.id, 'the service reaches a different stop during ordinary simulation');
    const destination = transport.stop(vehicle.pose.stopId); assert.ok(transport.availableExit());
    assert.ok(city.interact().transition); assert.equal(transport.riding, false); assert.equal(city.riding, null);
    near(sim.player.x, destination.board.x); near(sim.player.z, destination.board.z); near(sim.player.groundY, destination.board.y);
    assert.equal(sim.colliders, city.colliders); assert.ok(sim.cars.length > 20);
  });
}

test('interior visits preserve street traffic, sample service clocks and resident phases', () => {
  const sim = fixture(), building = city.buildings.find(b => b.id === 'harbor-market');
  city.applyTransition({ position: building.entrance, groundY: 0 }); assert.equal(city.interact().handled, true); assert.equal(city.isInside, true);
  const traffic = city.vehicles.filter(v => v.traffic), before = new Map(traffic.map(v => [v.id, { x: v.x, z: v.z }]));
  const phases = city.sample.life.agents.map(a => ({ phase: a.phase, x: a.x, z: a.z })), startTime = city.sample.transit.time, startTick = city.sample.life.ticks;
  assert.equal(sim.cars.length, 0); advance(5);
  assert.equal(sim.cars.length, 0); assert.ok(city.sample.transit.time >= startTime + 4.99); assert.ok(city.sample.life.ticks > startTick);
  assert.ok(traffic.some(v => Math.hypot(v.x - before.get(v.id).x, v.z - before.get(v.id).z) > 1));
  assert.ok(city.sample.life.agents.some((a, i) => a.phase !== phases[i].phase || Math.hypot(a.x - phases[i].x, a.z - phases[i].z) > .1));
  for (const car of city.vehicles) near(car.y, city.groundHeightAt(car.x, car.z, car.y), .04);
  const safe = city.safeSave(); near(safe.player.x, building.entrance.x); near(safe.player.z, building.entrance.z);
  const fresh = fixture(); assert.equal(city.isInside, false); assert.ok(fresh.cars.length > 20);
});

test('safeSave restores real commuting tickets, economic paths and delayed dwell before another tick', () => {
  const sim = fixture({ hour: 8 }), life = city.sample.life, transport = city.sample.transit;
  for (let n = 0; n < 6500 && !life.agents.some(a => a.phase === 'riding'); n++) city.step(.05, {});
  assert.ok(life.agents.some(a => a.phase === 'riding'), 'the normal city simulation produces a real commuter aboard a tram');
  const save = JSON.parse(JSON.stringify(city.safeSave())), ticketIds = [...transport.citizenPassengers.keys()];
  assert.ok(ticketIds.length > 0); const phases = new Map(life.agents.map(a => [a.id, a.phase]));
  const restoredSim = fixture({ save });
  assert.equal(transport.riding, false, 'saved player never loads into an unowned moving cabin');
  assert.deepEqual(transport.exportState(), save.harborTransit);
  assert.deepEqual(life.snapshot(), save.harborLife);
  for (const id of ticketIds) { assert.ok(transport.citizenPose(id)); assert.equal(life.agents.find(a => a.id === id).phase, phases.get(id)); }
  near(restoredSim.player.x, save.player.x); near(restoredSim.player.z, save.player.z);
  city.step(.05, {}); assert.ok(life.agents.every(a => Number.isFinite(a.x) && Number.isFinite(a.z)));
  assert.equal(life.totalMoney, life.initialMoney); assert.equal(life.totalGoods, life.initialGoods);
  assert.ok(Number.isFinite(sim.cash));
});

test('fresh binding and malformed saved sample fields leave finite clean street state', () => {
  const sim = fixture(), service = city.sample.transit;
  service.holdDoors('harbor-tram-1', 20); advance(13);
  assert.ok(service.vehicles.some(v => v.distanceTravelled > 0) || service.vehicles.some(v => v.doorHoldUntil > 0));
  city.bind(sim); sim.reset(); city.bind(sim);
  assert.equal(service.time, 0); assert.equal(service.citizenPassengers.size, 0); assert.equal(service.citizenBoardings, 0);
  assert.ok(service.vehicles.every(v => v.distanceTravelled === 0 && !v.doorHoldUntil && v.delay === 0));
  for (const harborTransit of [{ version: 1, time: Infinity }, { version: 1, time: 20, vehicles: {} }, { version: 1, time: 20, citizenPassengers: {} }, { version: 1, time: 20, vehicles: [null, { id: 'harbor-bus-1', serviceTime: NaN, delay: Infinity, distanceTravelled: Infinity }], citizenPassengers: [null] }]) {
    const save = { ...city.safeSave(), harborTransit };
    assert.doesNotThrow(() => fixture({ save })); city.step(.05, {});
    assert.ok(service.vehicles.every(v => Number.isFinite(v.serviceTime) && Number.isFinite(v.delay) && Number.isFinite(v.pose.x) && Number.isFinite(v.pose.z)));
    assert.ok(city.sample.life.agents.every(a => Number.isFinite(a.x) && Number.isFinite(a.z)));
  }
});

test('fixed simulation and render updates remain separate, with bounded collector-height tram wires', () => {
  fixture(); const service = city.sample.transit, mesh = service.fleet.get('harbor-ferry-1'), before = mesh.position.clone();
  advance(20); assert.ok(Math.hypot(service.vehicle('harbor-ferry-1').pose.x - before.x, service.vehicle('harbor-ferry-1').pose.z - before.z) > .1);
  assert.deepEqual(mesh.position.toArray(), before.toArray(), 'fixed service ticks do not perform production rendering');
  service.updateRender(null, 20); near(mesh.position.x, service.vehicle('harbor-ferry-1').pose.x, 1e-8); near(mesh.position.z, service.vehicle('harbor-ferry-1').pose.z, 1e-8);
  const wire = service.wireMesh; assert.ok(wire.isInstancedMesh && wire.count > 50 && wire.count < 300);
  assert.ok(wire.boundingBox && wire.boundingSphere && Number.isFinite(wire.boundingSphere.radius));
  near(wire.boundingBox.min.y, 4.668, 1e-5); near(wire.boundingBox.max.y, 4.692, 1e-5);
  assert.ok(wire.boundingBox.min.x > 230 && wire.boundingBox.max.x < 250 && wire.boundingBox.min.z > -226 && wire.boundingBox.max.z < 146);
  assert.equal(service.colliders.filter(c => c.kind === 'street-tram-pole').length, 5);
});

test('a restored south-shore signal clock controls real cars, rendered lights and crossing residents while north traffic keeps its original clock', () => {
  fixture({ hour: 8 });
  const service = city.sample.transit, life = city.sample.life;
  // A supported room-clock alignment can make transport and economic elapsed
  // time differ. Save that actual state rather than assuming every clock starts
  // at zero or happens to show the same signal phase after a reload.
  assert.equal(service.syncTime(10), true); city.step(.1, {});
  const save = JSON.parse(JSON.stringify(city.safeSave())), sim = fixture({ save, hour: 8 });
  near(service.time, 10.1, 1e-6); near(sim.elapsed, 0, 1e-6); near(life.time, .1, 1e-6);
  assert.equal(intersectionSignal(service.time, 160, 160, 'z'), 'green');
  assert.equal(intersectionSignal(sim.elapsed, 160, 160, 'z'), 'red', 'the regression must exercise different phases');

  // Put two existing fleet cars on legal straight portions of their actual
  // routes, twenty metres before their next signal. Their public simulation
  // update must choose the correct clock; no traffic controller is mocked.
  const southCar = city.vehicles.find(c => c.id === 'traffic-0'), northCar = city.vehicles.find(c => c.id === 'north-traffic-0-0');
  assert.ok(southCar && northCar);
  Object.assign(southCar, { x: 140, z: 156, yaw: Math.PI / 2, waypoint: 11, speed: 0, vx: 0, vz: 0, pause: 0 });
  Object.assign(northCar, { x: -500, z: -424, yaw: Math.PI / 2, waypoint: 11, speed: 0, vx: 0, vz: 0, pause: 0 });
  sim._groundCar(southCar); sim._groundCar(northCar);
  const crossing = life.navigation.crossings.find(c => c.axis === 'z' && c.x === 160 && c.z === 160 && c.lane === 174);
  assert.ok(crossing, 'resident crosses the actual legal east-side pavement crossing');
  const resident = life.agents[0];
  Object.assign(resident, { x: 174, y: .18, z: 146, phase: 'walking', insideBuildingId: null, floorId: null, roomId: null, transit: null, crossingId: null,
    goal: { kind: 'work', id: resident.work.employer, anchor: { ...resident.work.anchor } }, path: [{ x: 174, y: .18, z: 174, crossingId: crossing.id }], pathIndex: 0 });
  city.step(.1, {});
  near(sim.trafficClock(southCar), service.time, 1e-8); near(life.trafficTime, service.time, 1e-8);
  near(sim.trafficClock(northCar), sim.elapsed, 1e-8);
  assert.equal(southCar.trafficState, 'signal', 'eastbound south traffic sees red after restoring the shared clock');
  assert.equal(northCar.trafficState, 'cruise', 'north traffic still sees its original elapsed-clock green');
  assert.ok(northCar.x > -500, 'the existing north car actually moves through its green approach');
  assert.ok(resident.z > 146.1 && resident.crossingId === crossing.id, 'the resident physically enters the matching north-south green crossing');
  assert.equal(intersectionSignal(service.time, 160, 160, 'x'), 'red');
  assert.equal(intersectionSignal(service.time, 160, 160, 'z'), 'green');

  city.update(0, 8 / 24, { position: sim.player, velocity: { x: 0, z: 0 } });
  const lamps = city.south.root.getObjectByName('Traffic signals · live phases'); assert.ok(lamps?.isInstancedMesh);
  const matrix = new THREE.Matrix4(), translation = new THREE.Vector3(); let headIndex = -1;
  for (let i = 0; i < lamps.count; i += 3) {
    lamps.getMatrixAt(i, matrix); translation.setFromMatrixPosition(matrix);
    if (Math.abs(translation.x - 167.7) < .001 && Math.abs(translation.z - 178.2) < .001) { headIndex = i; break; }
  }
  assert.ok(headIndex >= 0, 'inspect the rendered head belonging to the same physical junction');
  const red = new THREE.Color(), green = new THREE.Color(); lamps.getColorAt(headIndex, red); lamps.getColorAt(headIndex + 2, green);
  assert.equal(green.getHexString(), '7bd8a7'); assert.equal(red.getHexString(), '152723');
});

test('ordinary city steps yield the long bus to a real resident already crossing, including after save/load', () => {
  fixture({ hour: 8 }); advance(13);
  const service = city.sample.transit, life = city.sample.life, bus = service.vehicle('harbor-bus-1');
  const crossing = life.navigation.crossings.find(c => c.axis === 'x' && c.x === 160 && c.z === 160 && c.lane === 146);
  assert.ok(crossing); assert.ok(bus.pose.z > 124 && bus.pose.z < 128);
  // This resident entered on the preceding pedestrian phase and must finish
  // the actual crossing even though the bus now has a northbound green.
  const resident = life.agents[0];
  Object.assign(resident, { x: 148, y: .18, z: 146, phase: 'walking', insideBuildingId: null, floorId: null, roomId: null, transit: null, crossingId: crossing.id,
    goal: { kind: 'work', id: resident.work.employer, anchor: { ...resident.work.anchor } }, path: [{ x: 174, y: .18, z: 146, crossingId: crossing.id }], pathIndex: 0 });
  const spec = HARBOR_VEHICLE_SPECS.bus;
  for (let n = 0; n < 80; n++) {
    city.step(.05, {});
    assert.equal(intersectionSignal(service.time, 160, 160, 'z'), 'green');
    const front = bus.pose.z + spec.halfLength * Math.abs(Math.cos(bus.pose.yaw)) + spec.halfWidth * Math.abs(Math.sin(bus.pose.yaw));
    assert.ok(front < resident.z - 1.7, 'the real resident hook protects the actual long vehicle front');
  }
  assert.equal(bus.trafficState, 'pedestrian'); assert.ok(bus.pose.speed < .05);
  assert.ok(resident.x > 153 && resident.x < 155 && resident.crossingId === crossing.id, 'the resident keeps physically crossing while the bus waits');
  const residentX = resident.x, save = JSON.parse(JSON.stringify(city.safeSave())); fixture({ save, hour: 8 });
  assert.deepEqual(service.exportState(), save.harborTransit); assert.deepEqual(life.snapshot(), save.harborLife);
  advance(1);
  assert.equal(bus.trafficState, 'pedestrian'); assert.ok(bus.pose.speed < .05);
  assert.ok(bus.pose.z < 138.9, 'the resumed bus still yields before the nearer pedestrian crossing, not merely at the signal line');
  assert.ok(life.agents[0].x > residentX && life.agents[0].crossingId === crossing.id);
});
