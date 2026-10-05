import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { HarborLife } from '../src/harbor-life.js';
import { HarborTransitService } from '../src/harbor-transit.js';

// CPU geometry and logical state only; no renderer owns or advances this clock.
const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
const oldPublic = JSON.parse(readFileSync(new URL('./fixtures/harbor-life-pre-crossing-repair.json', import.meta.url), 'utf8'));
const oldV2 = JSON.parse(readFileSync(new URL('./fixtures/harbor-life-v2-shared-clock-migration.json', import.meta.url), 'utf8'));
function world({ hour = 7, save, fleet, residentLoop = true } = {}) {
  const transport = new HarborTransitService({ groundHeightAt: city.groundHeightAt });
  if (fleet) assert.equal(transport.restoreState(fleet), true);
  const life = new HarborLife({ buildings: city.buildings, colliders: city.colliders, transport, hour, save, residentLoop });
  return { life, transport, loop: life.residentLoop };
}
function step(f, previewHour) {
  f.transport.update(.1);
  f.life.update(.1, { hour: previewHour, trafficTime: f.transport.time, vehicles: [] });
}
function balanced(life) {
  assert.equal(life.totalMoney, life.initialMoney);
  assert.equal(life.totalGoods, life.initialGoods);
}
function economicSnapshot(life) {
  const result = life.snapshot();
  delete result.externalHour; // The saved lighting preview is presentation only.
  return result;
}
function restoreLegacy(frame) {
  const result = world({ save: frame.harborLife, fleet: frame.harborTransit });
  assert.equal(result.life.restored, true);
  return result;
}

test('lighting previews cannot change shared resident schedules, economy or route progression', () => {
  const fixed = world(), dragged = world();
  for (let tick = 0; tick < 2400; tick++) {
    step(fixed, 7); step(dragged, tick % 2 ? 1 : 23);
  }
  assert.deepEqual(economicSnapshot(dragged.life), economicSnapshot(fixed.life));
  assert.deepEqual(dragged.transport.exportState(), fixed.transport.exportState());
  assert.equal(dragged.loop.absoluteHour, dragged.life.absoluteHour);
  assert.equal(dragged.loop.publicStatus().scheduleHour, dragged.life.hour);
  assert.equal(dragged.loop.publicStatus().scheduleDay, dragged.life.day);
  assert.ok(dragged.loop.state.events.some(event => event.type === 'depart-home'));
  balanced(dragged.life);
});

test('actual clock controls opening, closing, shifts and midnight while preview time does not', () => {
  const opening = world({ hour: 5.999, residentLoop: false });
  assert.ok(opening.life.shopStatuses.every(shop => !shop.open));
  opening.life.update(.05, { hour: 12 });
  assert.ok(opening.life.shopStatuses.every(shop => !shop.open));
  opening.life.update(.15, { hour: 1 });
  assert.ok(opening.life.shopStatuses.every(shop => shop.open));

  const closing = world({ hour: 20.999, residentLoop: false });
  assert.ok(closing.life.shopStatuses.every(shop => shop.open));
  closing.life.update(.05, { hour: 22 });
  assert.ok(closing.life.shopStatuses.every(shop => shop.open));
  closing.life.update(.15, { hour: 12 });
  assert.ok(closing.life.shopStatuses.every(shop => !shop.open));
  assert.equal(closing.life.buyPlayer(closing.life.shops[0].id, closing.life.shops[0].anchor, { cash: 1200 }).reason, 'closed');

  const shift = world({ hour: 13.999, residentLoop: false }), staff = shift.life.agents[0];
  assert.equal(shift.life._inShift(staff), true);
  shift.life.update(.05, { hour: 23 }); assert.equal(shift.life._inShift(staff), true);
  shift.life.update(.15, { hour: 6 }); assert.equal(shift.life._inShift(staff), false);

  const midnight = world({ hour: 23.999 });
  midnight.life.update(.05, { hour: 6 }); assert.equal(midnight.life.day, 0);
  midnight.life.update(.15, { hour: 12 });
  assert.equal(midnight.life.day, 1); assert.ok(midnight.life.hour < .001);
  assert.equal(midnight.loop.publicStatus().scheduleDay, 1);
  assert.equal(midnight.loop.publicStatus().scheduleHour, midnight.life.hour);
});

test('one real economic hour pays one funded wage and daylight cannot repeat or suppress it', () => {
  const f = world({ hour: 18.999, residentLoop: false }), staff = f.life.agents[1];
  Object.assign(staff, staff.work.anchor, { phase: 'working', goal: { kind: 'work', id: staff.work.employer, anchor: staff.work.anchor } });
  const cash = staff.money;
  step(f, 1); assert.equal(staff.money, cash + 3); assert.equal(staff.lastWageSlot, 18);
  step(f, 1); assert.equal(staff.money, cash + 6); assert.equal(staff.lastWageSlot, 19);
  step(f, 23); step(f, 1); assert.equal(staff.money, cash + 6);
  assert.deepEqual(f.life.transactions.filter(tx => tx.type === 'wage' && tx.agentId === staff.id).map(tx => tx.slot), [18, 19]);
  balanced(f.life);
});

test('real home arrival waits for the same seven oclock departure and reset rebases both clocks', () => {
  const f = world({ hour: 6.5 });
  while (f.life.ticks < 599) step(f, 23);
  assert.equal(f.loop.state.stage, 'resting-home'); assert.equal(f.loop.state.cycle, 0);
  assert.equal(f.loop.agent.insideBuildingId, f.loop.home.building.id);
  assert.equal(f.loop.agent.roomId, f.loop.home.room.id);
  step(f, 1); assert.equal(f.loop.state.cycle, 1);
  assert.equal(f.loop.absoluteHour, f.life.absoluteHour);
  assert.equal(f.life.reset({ hour: 6 }), true);
  assert.equal(f.life.ticks, 0); assert.equal(f.life.hour, 6); assert.equal(f.loop.absoluteHour, 6);
  assert.equal(f.loop.state.cycle, 0); assert.equal(f.loop.state.totalWages, 0);
  assert.equal(f.loop.state.nextDepartureTick, 1200);
  const copy = world({ hour: 18, save: f.life.snapshot(), fleet: f.transport.exportState() });
  assert.equal(copy.life.restored, true); assert.deepEqual(copy.life.snapshot(), f.life.snapshot());
  balanced(f.life);
});

test('genuine old public v1 save preserves finite balances and nineteen routines at a slower future clock', () => {
  const f = restoreLegacy(oldPublic), saved = f.life.snapshot(), old = oldPublic.harborLife;
  assert.equal(saved.version, 3); assert.equal(saved.secondsPerHour, 120);
  const oldAbsoluteHour = old.startHour + old.ticks * .1 / old.secondsPerHour;
  assert.equal(f.life.absoluteHour, oldAbsoluteHour);
  assert.equal(saved.clock.epochTick, old.ticks); assert.equal(saved.clock.legacySecondsPerHour, 35);
  for (const key of ['supply', 'shops', 'player', 'jobs', 'transactions', 'statistics']) assert.deepEqual(saved[key], old[key], key);
  for (let index = 0; index < 20; index++) if (index !== 6) assert.deepEqual(saved.agents[index], old.agents[index], `resident ${index + 1}`);
  assert.equal(saved.agents[6].money, old.agents[6].money);
  assert.deepEqual(saved.agents[6].transit, old.agents[6].transit);
  assert.equal(f.loop.state.totalWages, 0);
  step(f, 1); assert.ok(Math.abs(f.life.absoluteHour - oldAbsoluteHour - .1 / 120) < 1e-10);
  assert.equal(f.loop.absoluteHour, f.life.absoluteHour); balanced(f.life);
});

test('genuine v2 payroll migration preserves historical event clocks and settles partial work once', () => {
  assert.equal(oldV2.provenance.commit, '199b89c62b216b2a07f2eb7e7d5920430ac46473');
  const before = restoreLegacy(oldV2.beforePay), after = restoreLegacy(oldV2.afterPay);
  for (const [f, frame] of [[before, oldV2.beforePay], [after, oldV2.afterPay]]) {
    assert.equal(f.life.snapshot().version, 3); assert.equal(f.loop.state.version, 2);
    assert.deepEqual(f.loop.state.events, frame.harborLife.residentLoop.events);
    assert.deepEqual(f.loop.state.activeJob, frame.harborLife.residentLoop.activeJob);
    assert.deepEqual(f.life.transactions, frame.harborLife.transactions);
    assert.equal(f.loop.state.historyClock.untilTick, frame.harborLife.residentLoop.ticks);
    assert.equal(f.loop.absoluteHour, f.life.absoluteHour);
    balanced(f.life);
  }
  const cash = before.loop.agent.money;
  step(before, 23);
  assert.equal(before.loop.state.activeJob.validTicks, 350);
  assert.equal(before.loop.agent.money, cash + 3);
  assert.equal(before.loop.state.activeJob.receipts.length, 1);
  const copy = world({ save: before.life.snapshot(), fleet: before.transport.exportState() });
  assert.equal(copy.life.restored, true);
  for (let tick = 0; tick < 10; tick++) { step(before, 1); step(copy, 23); }
  assert.deepEqual(economicSnapshot(before.life), economicSnapshot(copy.life));
  assert.equal(copy.loop.state.activeJob.receipts.length, 1);
  assert.equal(after.loop.state.activeJob.paidPeriods, 1);
  step(after, 1); assert.equal(after.loop.state.activeJob.paidPeriods, 1);
  balanced(copy.life);
});

test('actual warehouse shift ending freezes valid work even at the real workstation', () => {
  const f = restoreLegacy(oldV2.afterPay), position = { x: f.loop.agent.x, y: f.loop.agent.y, z: f.loop.agent.z };
  f.loop.agent.x += 2; // Controlled physical absence, as in the existing work attendance test.
  let boundaryTick = f.life.clock.epochTick + Math.ceil((17 - f.life.clock.absoluteHour) * 1200);
  const hourAt = tick => f.life.clock.absoluteHour + (tick - f.life.clock.epochTick) * .1 / f.life.secondsPerHour;
  while (hourAt(boundaryTick) < 17) boundaryTick++;
  while (hourAt(boundaryTick - 1) >= 17) boundaryTick--;
  assert.ok(boundaryTick - f.life.ticks < 8000);
  while (f.life.ticks < boundaryTick - 2) step(f, 7);
  assert.equal(f.loop.state.activeJob.validTicks, 350);
  Object.assign(f.loop.agent, position);
  step(f, 23); assert.equal(f.loop.state.activeJob.validTicks, 351);
  const cash = f.loop.agent.money;
  step(f, 7); step(f, 8);
  assert.ok(f.life.hour >= 17); assert.equal(f.loop.state.activeJob.validTicks, 351);
  assert.equal(f.loop.state.waitingReason, 'off-shift'); assert.equal(f.loop.agent.money, cash);
  balanced(f.life);
});
