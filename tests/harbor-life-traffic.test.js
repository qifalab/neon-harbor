import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { GameSimulation } from '../src/simulation.js';
import { createHarborLife } from '../src/harbor-life.js';
import { harborRoutePose } from '../src/harbor-transit.js';
import { circleOBB, moveVehicle, VEHICLE_SHAPE } from '../src/collision.js';
import { intersectionSignal } from '../src/traffic.js';

const STEP = 1 / 60;
const legacySave = JSON.parse(readFileSync(new URL('./fixtures/harbor-life-pre-crossing-repair.json', import.meta.url), 'utf8'));
function world(save = null) {
  // Scene creation uses geometry on the CPU; these tests create no WebGL renderer.
  const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
  const sim = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt, save });
  city.bind(sim, { save, hour: 16.5 });
  assert.equal(sim.cars.length, 33, 'all original street vehicles remain present');
  assert.equal(city.sample.life.agents.length, 20);
  return { city, sim, life: city.sample.life, fleet: city.sample.transit };
}
function assertStreetClear(life, bodies, tick) {
  for (const person of life.agents) {
    // Approach, waiting, and waiting-transit commuters ARE street bodies.
    // Only real cabin boarding/riding/alighting and actual rooms are excluded.
    if (person.insideBuildingId || ['boarding', 'riding', 'alighting'].includes(person.phase)) continue;
    for (const body of bodies) {
      if (body.health === 0 || Math.abs(person.y - (body.y ?? 0)) >= 1.5 || Math.hypot(person.x - body.x, person.z - body.z) > 12) continue;
      for (const radius of [.43, .6]) {
        const contact = circleOBB({ ...person, radius }, body);
        assert.equal(contact, null, `tick ${tick}: ${person.id} (${person.phase}/${person.transit?.phase || 'no-transit'}) overlaps ${body.id} at radius ${radius}`);
      }
    }
  }
}
function ledgerAudit(life) {
  const ids = new Map(), obligations = new Set();
  return () => {
    assert.equal(new Set(life.transactions.map(t => t.id)).size, life.transactions.length, 'live ledger transaction IDs are unique');
    for (const transaction of life.transactions) {
      const canonical = JSON.stringify(transaction);
      if (ids.has(transaction.id)) { assert.equal(canonical, ids.get(transaction.id), 'a settled transaction ID retains the same record'); continue; }
      ids.set(transaction.id, canonical);
      const key = transaction.type === 'wage' ? `wage/${transaction.agentId}/${transaction.slot}`
        : transaction.type === 'delivery' ? `delivery/${transaction.jobId}`
          : transaction.type === 'purchase' ? `purchase/${transaction.agentId}/${transaction.day}/${transaction.product}` : null;
      if (key) { assert.ok(!obligations.has(key), `${key} must settle once across save/load`); obligations.add(key); }
    }
  };
}
function runStreet({ city, sim, life, fleet }, seconds) {
  const bus = fleet.vehicle('harbor-bus-2'), audit = ledgerAudit(life);
  let marketTick = null;
  assertStreetClear(life, [...sim.cars, ...fleet.trafficBodies], 0); audit();
  for (let tick = 1; tick <= seconds * 60; tick++) {
    city.step(STEP, { cameraYaw: 0 });
    if (bus.pose.stopId === 'harbor-bus-market' && marketTick === null) marketTick = tick;
    assert.equal(life.totalMoney, 2972, `tick ${tick}: money is conserved`);
    assert.equal(life.totalGoods, 300, `tick ${tick}: goods are conserved`);
    assertStreetClear(life, [...sim.cars, ...fleet.trafficBodies], tick); audit();
  }
  assert.ok(marketTick !== null, `bus 2 must physically reach its actual market stop within ${seconds} seconds`);
  assert.equal(sim.cash, 1200, 'autonomous life does not change the main player wallet');
  return marketTick * STEP;
}

test('natural shared street traffic with twenty residents lets the bus reach the market without .43 body or .6 buffer contacts', () => {
  runStreet(world(), 200);
});

test('an actual pre-repair public save resumes to the market without collision or duplicate settlement', () => {
  assert.equal(legacySave.provenance.lifeModuleSha256, '6122d6738f36ee281277c80c1c8e7f777a87498295571f568f18be30f10927f8');
  assert.equal(legacySave.provenance.stepCount, 9000);
  assert.equal('cars' in legacySave, false); assert.equal('elapsed' in legacySave, false);
  const captured = legacySave.harborLife.agents.find(a => a.id === 'harbor-resident-18');
  assert.equal(captured.crossingId, 'harbor-crossing-z:160:146');
  assert.equal(captured.path[captured.pathIndex].crossingId, 'harbor-crossing-x:160:146');
  const resumed = world(legacySave);
  const migrated = resumed.life.snapshot();
  assert.equal(migrated.version, 3, 'old public saves migrate explicitly');
  for (const key of ['supply', 'shops', 'player', 'jobs', 'transactions', 'statistics'])
    assert.deepEqual(migrated[key], legacySave.harborLife[key], `migration preserves ${key}`);
  for (let index = 0; index < 20; index++) if (index !== 6)
    assert.deepEqual(migrated.agents[index], legacySave.harborLife.agents[index], 'nineteen existing routines resume unchanged');
  assert.equal(migrated.agents[6].money, legacySave.harborLife.agents[6].money);
  assert.equal(migrated.residentLoop.totalWages, 0, 'the selected loop starts without retroactive salary');
  assert.equal(resumed.fleet.time, legacySave.harborTransit.time);
  runStreet(resumed, 90);
});

test('the real turning tram protects a crossing resident against its next full swept pose', () => {
  const { city, fleet } = world();
  const life = createHarborLife({ buildings: city.buildings, colliders: city.colliders, transport: fleet, hour: 16.5 });
  const home = life.agents.find(a => a.home.buildingId === 'south-093').home.anchor;
  const actualPath = life.navigation.route(home, fleet.stop('harbor-tram-lantern').board);
  assert.ok(actualPath.some((p, i) => p.x === 252 && p.z === 144 && actualPath[i - 1]?.x === 230 && actualPath[i - 1]?.z === 144));
  const tram = fleet.vehicle('harbor-tram-1');
  tram.serviceTime = 111.76; tram.pose = harborRoutePose(fleet.route(tram.routeId), tram.serviceTime); tram.motionSpeed = tram.pose.speed;
  for (const agent of life.agents) agent.crossingId = null;
  const person = life.agents[0];
  Object.assign(person, { x: 235.93460490463215, y: .18, z: 144, crossingId: 'harbor-crossing-x:240:146', pathIndex: 0,
    path: [{ x: 252, y: .18, z: 144, crossingId: 'harbor-crossing-x:240:146' }] });
  const hookBody = { id: tram.id, kind: 'tram', ...tram.pose, hx: 1.15, hz: 4.5 };
  const physical = { ...hookBody, hx: 1.23, hz: 4.58 }, next = harborRoutePose(fleet.route(tram.routeId), tram.serviceTime + .05);
  assert.equal(circleOBB({ ...person, radius: .6 }, physical), null);
  assert.ok(circleOBB({ ...person, radius: .6 }, { ...physical, ...next }));
  const sweep = moveVehicle({ ...physical }, next.x - physical.x, next.z - physical.z,
    next.yaw - physical.yaw, { bounds: 3000, circles: [{ x: person.x, z: person.z, groundY: .18, y: 0, radius: .6 }] });
  assert.ok(sweep.contacts.length > 0);
  const beforeLife = life.snapshot(), beforeFleet = fleet.exportState();
  assert.equal(life.trafficStopDistanceAt(hookBody), 0, 'actual future body contact takes priority over path-plane bounds');
  assert.deepEqual(life.snapshot(), beforeLife); assert.deepEqual(fleet.exportState(), beforeFleet);
});

test('walking verifies each new signal, waits outside an occupied full crossing and keeps claims through a null middle leg', () => {
  const { city, fleet } = world();
  const life = createHarborLife({ buildings: city.buildings, colliders: city.colliders, transport: fleet, hour: 16.5 });
  const original = structuredClone(life.agents[0]);
  const actor = (x, z, claim, path) => {
    for (const a of life.agents) a.crossingId = null;
    const a = life.agents[0]; Object.assign(a, structuredClone(original), { x, z, y: .18, phase: 'walking', insideBuildingId: null, pathIndex: 0, crossingId: claim, path }); return a;
  };
  const atGreen = id => {
    const c = life.navigation.crossings.find(c => c.id === id); let time = 0;
    while (intersectionSignal(time, c.x, c.z, c.axis) !== 'green') time++;
    return time;
  };
  const older = 'harbor-crossing-z:160:146', newer = 'harbor-crossing-x:160:174', crossing = life.navigation.crossings.find(c => c.id === newer);
  let red = atGreen(newer); while (intersectionSignal(red, crossing.x, crossing.z, crossing.axis) === 'green') red++;
  let a = actor(146, 172, older, [{ x: 172, y: .18, z: 172, crossingId: newer }]);
  life.trafficTime = red; life._walk(a, .1, []);
  assert.equal(a.x, 146); assert.equal(a.crossingId, null); assert.equal(a.activity, '在斑马线前等灯');
  life.trafficTime = atGreen(newer); life._walk(a, .1, []); assert.ok(a.x > 146); assert.equal(a.crossingId, newer);

  const publicBody = (kind, time) => {
    const vehicle = fleet.vehicle(`harbor-${kind}-1`); vehicle.serviceTime = time;
    vehicle.pose = harborRoutePose(fleet.route(vehicle.routeId), time); vehicle.motionSpeed = vehicle.pose.speed;
    return { id: vehicle.id, kind, ...vehicle.pose, hx: kind === 'bus' ? 1.355 : 1.23, hz: kind === 'bus' ? 5.58 : 4.58, health: 100 };
  };
  const source = 'harbor-crossing-x:160:146';
  const bodies = [{ x: 160, z: 144, y: 0, yaw: 0, hx: VEHICLE_SHAPE.hx, hz: VEHICLE_SHAPE.hz, health: 100 }, publicBody('bus', 13.2), publicBody('tram', 112.9)];
  for (const body of bodies) {
    const road = body.kind === 'tram' ? 240 : 160, id = body.kind === 'tram' ? 'harbor-crossing-x:240:146' : source;
    const start = road - 14, end = road + 12;
    a = actor(start, 144, null, [{ x: end, y: .18, z: 144, crossingId: id }]);
    life.trafficTime = atGreen(id); life._walk(a, .1, [body]);
    assert.equal(a.x, start, `${body.kind || 'sedan'} already occupying the full path clears before entry`);
    assert.equal(a.crossingId, null); assert.equal(a.activity, '在路缘等占线车辆清空');
    life._walk(a, .1, []); assert.ok(a.x > start); assert.equal(a.crossingId, id);
  }
  a = actor(146, 148, null, [{ x: 154, y: .18, z: 148, crossingId: source }, { x: 154, y: .18, z: 144, crossingId: null }, { x: 172, y: .18, z: 144, crossingId: source }]);
  life.trafficTime = atGreen(source); life._walk(a, .1, [{ x: 164, z: 144, y: 0, yaw: 0, hx: 1.18, hz: 2.32, health: 100 }]);
  assert.equal(a.x, 146); assert.equal(a.crossingId, null, 'later occupied zigzag segment is checked before a new claim');
  a = actor(154, 148, source, [{ x: 154, y: .18, z: 144, crossingId: null }, { x: 172, y: .18, z: 144, crossingId: source }]);
  life._walk(a, .1, []); assert.ok(a.z < 148); assert.equal(a.crossingId, source, 'a null flag inside the carriageway does not drop the physical claim');
  assert.equal(life.totalMoney, 2972); assert.equal(life.totalGoods, 300);
});
