import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { HarborLife } from '../src/harbor-life.js';
import { HarborTransitService } from '../src/harbor-transit.js';
import { RESIDENT_LOOP } from '../src/harbor-resident-loop.js';
import { createHarborLifeRenderer } from '../src/harbor-life-renderer.js';
import { circleOBB } from '../src/collision.js';
import { readFileSync } from 'node:fs';

const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
function fixture({ save, fleet, residentLoop = true } = {}) {
  const transport = new HarborTransitService({ groundHeightAt: city.groundHeightAt });
  if (fleet) assert.equal(transport.restoreState(fleet), true);
  const life = new HarborLife({ buildings: city.buildings, colliders: city.colliders, transport, hour: 7, save, residentLoop });
  return { life, transport, loop: life.residentLoop };
}
function step(f, hour = 7, mutualTraffic = false) {
  f.transport.update(.1, null, mutualTraffic ? { pedestrianDistanceAt: body => f.life.trafficStopDistanceAt(body) } : {});
  f.life.update(.1, { hour, trafficTime: f.transport.time, vehicles: mutualTraffic ? f.transport.trafficBodies : [] });
}
function until(f, condition, maximum = 12000, mutualTraffic = false) {
  for (let tick = 0; tick < maximum; tick++) { if (condition()) return; step(f, 7, mutualTraffic); }
  assert.ok(condition(), `bounded progression stopped at ${f.loop.state.stage}: ${f.loop.state.waitingReason}`);
}
function balanced(life) { assert.equal(life.totalMoney, life.initialMoney); assert.equal(life.totalGoods, life.initialGoods); }
function resumed(f) { const copy = fixture({ save: f.life.snapshot(), fleet: f.transport.exportState() });
  assert.equal(copy.life.restored, true); assert.deepEqual(copy.life.snapshot(), f.life.snapshot()); return copy; }
function onJob() { const f = fixture(); until(f, () => f.loop.state.stage === 'working'); return f; }

test('one real resident walks home, shared tram doors, workshop, funded work, finite purchase and home', () => {
  const f = fixture(), ids = f.life.agents.map(agent => agent.id), money = f.loop.agent.money;
  const boards = new Set(); let maximumWalkingStep = 0;
  for (let tick = 0; tick < 14000 && !f.loop.state.completedCycles; tick++) {
    const before = { ...f.loop.agent };
    step(f, 7, true);
    const agent = f.loop.agent;
    if (['boarding', 'riding'].includes(agent.transit?.phase)) {
      assert.ok(f.transport.citizenPassengers.has(agent.id), 'the real fleet owns this ticket');
      const ticket = f.transport.citizenPassengers.get(agent.id);
      assert.equal(f.transport.vehicle(ticket.vehicleId).routeId, 'harbor-tram'); boards.add(ticket.vehicleId);
    }
    if (before.phase !== 'riding' && agent.phase !== 'riding') maximumWalkingStep = Math.max(maximumWalkingStep,
      Math.hypot(before.x - agent.x, before.y - agent.y, before.z - agent.z));
    balanced(f.life);
  }
  assert.equal(f.loop.state.completedCycles, 1);
  assert.deepEqual(f.life.agents.map(agent => agent.id), ids); assert.equal(ids.length, 20);
  assert.equal(f.loop.state.totalValidWorkTicks, 700); assert.equal(f.loop.state.totalWages, 6);
  assert.equal(f.loop.state.purchases, 1); assert.equal(f.loop.agent.money, money);
  assert.ok(boards.size >= 1); assert.equal(f.loop.agent.transit, null);
  assert.ok(maximumWalkingStep <= f.loop.agent.speed * .1 + 1e-8, 'door and room changes are walked, not teleported');
  assert.equal(f.loop.agent.insideBuildingId, 'south-083'); assert.equal(f.loop.agent.roomId, 'south-083-lobby-1');
  assert.deepEqual(f.loop.state.events.map(event => event.type), ['depart-home', 'tram-boarded', 'tram-alighted',
    'started-work', 'paid-work', 'paid-work', 'finished-work', 'tram-boarded', 'tram-alighted', 'purchased-food', 'returned-home']);
  assert.equal(f.loop.state.completedJobs[0].receipts.length, 2);
  assert.equal(f.loop.state.completedJobs[0].validTicks, 700);
  const food = f.life.transactions.find(tx => tx.agentId === ids[6] && tx.residentCycle === 1);
  assert.equal(food.product, 'produce'); assert.equal(food.amount, f.loop.shop.price); assert.equal(food.quantity, 1);
  assert.ok(f.loop.state.nextDepartureTick > f.loop.state.ticks);
  const saved = f.life.snapshot(), corrupt = structuredClone(saved);
  corrupt.residentLoop.completedJobs[0].id = 'harbor-work:harbor-resident-07:2';
  assert.equal(f.life.restore(corrupt), false); assert.deepEqual(f.life.snapshot(), saved);
  resumed(f);
});

test('room circulation includes every authored furniture collider at radius .6', () => {
  const f = fixture();
  assert.ok(f.loop.work.colliders.some(body => body.id.endsWith('repair-assembly-table')));
  for (const data of [f.loop.home, f.loop.work]) for (let index = 1; index < data.path.length; index++) {
    const a = data.path[index - 1], b = data.path[index], samples = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / .02);
    for (let n = 0; n <= samples; n++) assert.equal(data.colliders.some(body => circleOBB({
      x: a.x + (b.x - a.x) * n / samples, z: a.z + (b.z - a.z) * n / samples, radius: .6 }, body)), false);
  }
});

test('arrival, absence and legacy wage slots cannot pay an incomplete work period', () => {
  const f = onJob(), initial = f.loop.agent.money, employer = f.life.supply.money;
  assert.equal(f.loop.state.activeJob.validTicks, 0); assert.equal(f.loop.state.totalWages, 0);
  f.life._wage(f.loop.agent); assert.equal(f.loop.agent.money, initial, 'legacy hourly wage is bypassed for this ID');
  for (let tick = 0; tick < 349; tick++) step(f);
  assert.equal(f.loop.agent.money, initial); assert.equal(f.loop.state.activeJob.paidPeriods, 0);
  const position = { x: f.loop.agent.x, y: f.loop.agent.y, z: f.loop.agent.z };
  f.loop.agent.x += 2; // Controlled CPU absence; no product setter exposes this.
  for (let tick = 0; tick < 100; tick++) step(f, 22);
  assert.equal(f.loop.state.activeJob.validTicks, 349); assert.equal(f.loop.state.totalWages, 0);
  assert.equal(f.loop.state.waitingReason, 'absent-from-workstation');
  Object.assign(f.loop.agent, f.loop.work.building.entrance);
  for (let tick = 0; tick < 20; tick++) step(f, 22);
  assert.equal(f.loop.agent.insideBuildingId, null); assert.equal(f.loop.state.activeJob.validTicks, 349);
  const absent = resumed(f); step(absent); assert.equal(absent.loop.state.totalWages, 0);
  Object.assign(f.loop.agent, position); step(f, 6);
  assert.equal(f.loop.state.activeJob.validTicks, 350); assert.equal(f.loop.agent.money, initial + 3);
  assert.equal(f.loop.state.activeJob.receipts[0].validTicks, 350);
  assert.equal(f.loop.state.activeJob.receipts[0].amount, 3);
  assert.ok(f.life.supply.money <= employer - 3); balanced(f.life);
});

test('saving each tram and furnished-room seam continues deterministically', () => {
  for (const target of ['entering-home', 'outbound-tram', 'entering-work', 'working', 'return-tram', 'to-shop']) {
    const f = fixture();
    until(f, () => f.loop.state.stage === target && (!target.includes('tram') || f.loop.agent.transit?.phase === 'riding'));
    if (target === 'entering-work') { for (let tick = 0; tick < 40; tick++) step(f); }
    const copy = resumed(f);
    for (let tick = 0; tick < 30; tick++) { step(f); step(copy); }
    assert.deepEqual(copy.life.snapshot(), f.life.snapshot(), target); balanced(copy.life);
  }
});

test('partial-work restore cannot replay the first payment or earn by changing visual time', () => {
  const f = onJob(); for (let tick = 0; tick < 350; tick++) step(f);
  const copy = resumed(f), wages = copy.loop.state.totalWages, cash = copy.loop.agent.money;
  for (let tick = 0; tick < 349; tick++) step(copy, tick % 2 ? 1 : 23);
  assert.equal(copy.loop.state.totalWages, wages); assert.equal(copy.loop.agent.money, cash);
  step(copy, 7); assert.equal(copy.loop.state.totalWages, 6);
  assert.equal(new Set(copy.loop.state.activeJob.receipts.map(receipt => receipt.transactionId)).size, 2);
  balanced(copy.life);
});

test('existing carried delivery survives an indoor-work save and pays once alongside the resident ledger', () => {
  const f = fixture(), delivery = f.life.availableJobs[0];
  assert.equal(f.life.acceptDelivery(delivery.id, delivery.pickup).success, true);
  until(f, () => f.loop.state.stage === 'working');
  for (let tick = 0; tick < 350; tick++) step(f);
  const copy = resumed(f); assert.equal(copy.life.activeDelivery.id, delivery.id);
  assert.equal(copy.life.completeDelivery(delivery.destination).cashDelta, 12);
  assert.equal(copy.life.completeDelivery(delivery.destination).handled, false);
  assert.equal(copy.life.player.earnedCash, 12); assert.equal(copy.loop.state.totalWages, 3);
  assert.equal(copy.life.transactions.filter(tx => tx.type === 'delivery' && tx.jobId === delivery.id).length, 1);
  balanced(copy.life);
});

test('unfunded work remains at the job without inventing salary or accruing beyond the contract', () => {
  const f = onJob(), depotMoney = f.life.supply.money;
  f.life.supply.money = 0; f.life.shops[0].money += depotMoney;
  for (let tick = 0; tick < 800; tick++) step(f);
  assert.equal(f.loop.state.activeJob.validTicks, 700); assert.equal(f.loop.state.totalWages, 0);
  assert.equal(f.loop.state.waitingReason, 'employer-unfunded'); assert.equal(f.loop.state.stage, 'working');
  const copy = resumed(f);
  copy.life.shops[0].money -= 6; copy.life.supply.money += 6;
  step(copy); step(copy);
  assert.equal(copy.loop.state.totalWages, 6); assert.equal(copy.loop.state.stage, 'leaving-work'); balanced(copy.life);
});

test('closed and empty public shops wait with unchanged goods, then transact once after real availability', () => {
  const f = fixture(); until(f, () => f.loop.state.stage === 'shopping');
  const stock = f.loop.shop.stock;
  for (let portion = 0; portion < stock; portion++) assert.equal(f.life.buyPlayer(f.loop.shop.id, f.loop.shop.anchor,
    { cash: 1200, requestId: `depletion:${portion}` }).success, true);
  const money = f.loop.agent.money; f.loop._purchase();
  assert.equal(f.loop.state.waitingReason, 'out-of-stock'); assert.equal(f.loop.agent.money, money); balanced(f.life);
  step(f, 22); assert.equal(f.loop.state.waitingReason, 'shop-closed'); assert.equal(f.loop.state.purchases, 0);
  const copy = resumed(f);
  until(copy, () => copy.loop.state.purchases === 1);
  assert.equal(copy.loop.state.purchases, 1); assert.equal(copy.loop.agent.money, money - copy.loop.shop.price);
  assert.ok(copy.life.transactions.some(tx => tx.type === 'delivery' && tx.shopId === copy.loop.shop.id));
  for (let tick = 0; tick < 20; tick++) step(copy);
  assert.equal(copy.loop.state.purchases, 1); balanced(copy.life);
});

test('version-one migration keeps the nineteen other identities and balances, without retroactive payroll', () => {
  const legacy = fixture({ residentLoop: false }); for (let tick = 0; tick < 15; tick++) step(legacy);
  const save = legacy.life.snapshot(); save.version = 1; delete save.residentLoop;
  const migrated = fixture({ save, fleet: legacy.transport.exportState() }); assert.equal(migrated.life.restored, true);
  assert.equal(migrated.loop.state.totalWages, 0); assert.equal(migrated.loop.state.ticks, 0);
  assert.equal(migrated.loop.agent.money, save.agents[6].money);
  for (let index = 0; index < 20; index++) if (index !== 6) assert.deepEqual(migrated.life.snapshot().agents[index], save.agents[index]);
  balanced(migrated.life); assert.equal(migrated.life.snapshot().version, 2);
});

test('the actual pre-repair public snapshot migrates its finite balances and nineteen routines unchanged', () => {
  const legacy = JSON.parse(readFileSync(new URL('./fixtures/harbor-life-pre-crossing-repair.json', import.meta.url), 'utf8'));
  const copy = fixture({ save: legacy.harborLife, fleet: legacy.harborTransit });
  assert.equal(copy.life.restored, true);
  const saved = copy.life.snapshot();
  for (const key of ['supply', 'shops', 'player', 'jobs', 'transactions', 'statistics']) assert.deepEqual(saved[key], legacy.harborLife[key]);
  for (let index = 0; index < 20; index++) if (index !== 6) assert.deepEqual(saved.agents[index], legacy.harborLife.agents[index]);
  assert.equal(copy.loop.state.totalWages, 0); balanced(copy.life);
});

test('retained payroll rejects erased payment bookkeeping without changing accounts', () => {
  const f = onJob(); for (let tick = 0; tick < 350; tick++) step(f);
  const saved = f.life.snapshot(), bad = structuredClone(saved), job = bad.residentLoop.activeJob;
  assert.equal(job.paidPeriods, 1); assert.equal(job.validTicks, 350);
  assert.equal(bad.transactions.filter(tx => tx.type === 'resident-work-wage' && tx.agentId === RESIDENT_LOOP.residentId).length, 1);
  job.paidPeriods = 0; job.paidAmount = 0; job.receipts = [];
  bad.residentLoop.totalWages = 0;
  bad.residentLoop.events = bad.residentLoop.events.filter(event => event.type !== 'paid-work');
  assert.equal(f.life.restore(bad), false, 'retained real paid transaction prevents replay after diary erasure');
  assert.deepEqual(f.life.snapshot(), saved, 'rejected restore is atomic for cash, stock, cargo and diary');
  step(f); assert.equal(f.loop.state.totalWages, 3); assert.equal(f.loop.state.activeJob.paidPeriods, 1);
  balanced(f.life);
});

test('retained payroll requires its exact owned receipt and positive transaction sequence', () => {
  const f = onJob(); for (let tick = 0; tick < 350; tick++) step(f);
  const saved = f.life.snapshot();
  for (const change of [
    (s, tx) => tx.jobId = 'harbor-work:harbor-resident-07:2',
    (s, tx) => tx.period = 2,
    (s, tx) => tx.validTicks = 351,
    (s, tx) => tx.workClockTick -= 1,
    (s, tx) => tx.to = 'harbor-resident-08',
    (s, tx) => { tx.id = 'harbor-tx-0'; s.residentLoop.activeJob.receipts[0].transactionId = tx.id;
      s.residentLoop.events.find(event => event.type === 'paid-work').transactionId = tx.id; },
  ]) {
    const bad = structuredClone(saved), tx = bad.transactions.find(tx => tx.type === 'resident-work-wage' && tx.agentId === RESIDENT_LOOP.residentId);
    change(bad, tx); assert.equal(f.life.restore(bad), false);
    assert.deepEqual(f.life.snapshot(), saved);
  }
  resumed(f);
});

test('missing indoor transit field cannot retain a live passenger ticket during restore', () => {
  const indoors = onJob(), indoorSave = indoors.life.snapshot();
  assert.equal(indoorSave.agents[6].transit, null);
  const riding = fixture(); until(riding, () => riding.loop.agent.transit?.phase === 'riding');
  const before = riding.life.snapshot(), ticket = riding.transport.citizenPassengers.get(RESIDENT_LOOP.residentId);
  assert.ok(ticket); const bad = structuredClone(indoorSave); delete bad.agents[6].transit;
  assert.equal(riding.life.restore(bad), false);
  assert.deepEqual(riding.life.snapshot(), before);
  assert.deepEqual(riding.transport.citizenPassengers.get(RESIDENT_LOOP.residentId), ticket);
  balanced(riding.life);
  const legacy = fixture({ residentLoop: false }), legacySave = legacy.life.snapshot();
  legacySave.version = 1; delete legacySave.residentLoop; delete legacySave.agents[6].transit;
  const migrated = fixture({ save: legacySave, fleet: legacy.transport.exportState() });
  assert.equal(migrated.life.restored, true); assert.equal(migrated.loop.agent.transit, null);
});

test('premature shopping and home-return saves cannot skip actual funded work', () => {
  const f = onJob(), saved = f.life.snapshot();
  assert.equal(saved.residentLoop.activeJob.validTicks, 0);
  for (const stage of ['shopping', 'to-shop', 'to-home', 'entering-home', 'route-blocked']) {
    const bad = structuredClone(saved), agent = bad.agents[6];
    bad.residentLoop.stage = stage;
    bad.residentLoop.waitingReason = stage === 'route-blocked' ? 'to-shop' : null;
    agent.phase = stage === 'shopping' ? 'shopping' : stage === 'entering-home' ? 'entering-home' : stage === 'route-blocked' ? 'route-blocked' : 'walking';
    Object.assign(agent, stage === 'entering-home' ? f.loop.home.anchor : stage === 'to-home' ? f.loop.home.building.entrance : f.loop.shop.anchor);
    agent.path = []; agent.pathIndex = 0; agent.crossingId = null; agent.transit = null;
    f.loop._setContext(agent, bad.residentLoop);
    assert.equal(f.life.restore(bad), false, stage + ' requires the genuinely completed paid work');
    assert.deepEqual(f.life.snapshot(), saved);
  }
  until(f, () => f.loop.state.stage === 'shopping');
  const paidSave = f.life.snapshot();
  assert.equal(paidSave.residentLoop.activeJob.paidPeriods, 2);
  const unpaidReturn = structuredClone(paidSave); unpaidReturn.residentLoop.stage = 'to-home';
  unpaidReturn.agents[6].phase = 'walking';
  assert.equal(f.life.restore(unpaidReturn), false, 'home return requires the current cycle purchase');
  assert.deepEqual(f.life.snapshot(), paidSave); resumed(f);
});

test('invalid payroll, interior ownership and clock saves are rejected atomically', () => {
  const f = onJob(); for (let tick = 0; tick < 350; tick++) step(f);
  const saved = f.life.snapshot();
  for (const change of [s => s.residentLoop.clock.secondsPerHour = 35,
    s => s.residentLoop.activeJob.validTicks = 349,
    s => s.residentLoop.activeJob.receipts[0].period = 2,
    s => s.residentLoop.activeJob.receipts[0].paidTick = s.residentLoop.activeJob.startedTick + 349,
    s => s.residentLoop.events[0].hour += 1,
    s => s.residentLoop.events.find(event => event.type === 'paid-work').amount = 6,
    s => s.residentLoop.purchases = 1,
    s => s.agents[6].path = [{ ...f.loop.work.anchor, y: 9 }],
    s => s.agents[6].insideBuildingId = 'south-079',
    s => s.agents[6].roomId = 'south-086-lobby-1']) {
    const bad = structuredClone(saved); change(bad); assert.equal(f.life.restore(bad), false);
    assert.deepEqual(f.life.snapshot(), saved);
  }
});

test('the worker renders only in the correct room and floor, with real joint motion and no state mutation', () => {
  const f = onJob(), renderer = createHarborLifeRenderer(THREE, new THREE.Scene(), f.life);
  const view = currentRoomId => ({ position: f.loop.work.anchor, interior: { buildingId: 'south-086', floorId: 'lobby', currentRoomId } });
  const selected = () => renderer.root.children.find(model => model.userData.harborResidentId === RESIDENT_LOOP.residentId);
  const before = f.life.snapshot(); renderer.update(view('south-086-lobby-1'), 10); assert.equal(selected(), undefined);
  renderer.update({ position: f.loop.work.anchor, interior: { buildingId: 'south-086', floorId: 'gallery', currentRoomId: f.loop.work.room.id } }, 10);
  assert.equal(selected(), undefined); renderer.update(view(f.loop.work.room.id), 10);
  assert.ok(selected()); const rotation = selected().userData.rightElbow.rotation.x;
  assert.deepEqual(f.life.snapshot(), before);
  for (let tick = 0; tick < 3; tick++) step(f);
  renderer.update(view(f.loop.work.room.id), .3); assert.notEqual(selected().userData.rightElbow.rotation.x, rotation);
  renderer.update({ position: f.loop.work.anchor }, .1); assert.equal(selected(), undefined);
  renderer.dispose(); renderer.dispose();
});
