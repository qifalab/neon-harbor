import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { HarborLife } from '../src/harbor-life.js';
import { HarborTransitService } from '../src/harbor-transit.js';
import { HARBOR_ROLE_ROUTINES } from '../src/harbor-role-routines.js';

const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
function fixture({ save, fleet, hour = 6, roleRoutines = true, residentLoop = true } = {}) {
  const transport = new HarborTransitService({ groundHeightAt: city.groundHeightAt });
  if (fleet) assert.equal(transport.restoreState(fleet), true);
  const life = new HarborLife({ buildings: city.buildings, colliders: city.colliders, transport, hour, save, roleRoutines, residentLoop });
  return { life, transport, roles: life.roleRoutines };
}
function step(f, count = 1, mutual = true) {
  for (let index = 0; index < count; index++) {
    f.transport.update(.1, null, mutual ? { pedestrianDistanceAt: body => f.life.trafficStopDistanceAt(body) } : {});
    f.life.update(.1, { trafficTime: f.transport.time, vehicles: mutual ? f.transport.trafficBodies : [] });
  }
}
function until(f, condition, maximum = 16000) {
  for (let tick = 0; tick < maximum && !condition(); tick++) step(f);
  assert.ok(condition(), JSON.stringify(f.roles?.publicStatus()));
}
function balanced(life) { assert.equal(life.totalMoney, life.initialMoney); assert.equal(life.totalGoods, life.initialGoods); }
function resumed(f) {
  const save = f.life.snapshot(), next = fixture({ save, fleet: f.transport.exportState() });
  assert.equal(next.life.restored, true); assert.deepEqual(next.life.snapshot(), save); return next;
}

test('three different real roles complete a shared-calendar day without walking teleports or new money and stock', () => {
  const f = fixture(), ids = f.life.agents.map(agent => agent.id), stages = new Map(HARBOR_ROLE_ROUTINES.residents.map(id => [id, new Set()]));
  const maximumSteps = new Map(HARBOR_ROLE_ROUTINES.residents.map(id => [id, 0]));
  // One actual calendar day, ending before 22:00. Traffic admissions and
  // occupied contacts can delay a real 17:00 departure beyond 18:30.
  for (let tick = 0; tick < 19200 && !f.roles.state.roles.every(role => role.completedDays >= 1); tick++) {
    const before = new Map(HARBOR_ROLE_ROUTINES.residents.map(id => [id, { ...f.roles.agent(id) }])); step(f);
    for (const id of HARBOR_ROLE_ROUTINES.residents) {
      const agent = f.roles.agent(id), previous = before.get(id); stages.get(id).add(f.roles.role(id).stage);
      const home = f.roles.homes.get(id), role = f.roles.role(id);
      if (['entering-home', 'leaving-home', 'resting-home'].includes(role.stage)) assert.equal(home.supported(agent), true, 'foot height stays on the real lobby slab and doorway curb');
      maximumSteps.set(id, Math.max(maximumSteps.get(id), Math.hypot(agent.x - previous.x, agent.y - previous.y, agent.z - previous.z)));
    }
    balanced(f.life);
  }
  const clerk = f.roles.role('harbor-resident-01'), courier = f.roles.role('harbor-resident-11');
  assert.equal(clerk.completedDays, 1); assert.equal(courier.completedDays, 1);
  assert.equal(f.life.day, 0); assert.ok(f.life.hour < 22);
  assert.ok(clerk.workTicks >= 1200); assert.ok(clerk.totalWages >= 3); assert.equal(clerk.totalWages, clerk.paidPeriods * 3);
  assert.ok(courier.deliveries >= 1); assert.equal(courier.deliveryIncome, courier.deliveries * 12); assert.equal(courier.totalWages, 0);
  assert.ok(stages.get(clerk.residentId).has('working-counter')); assert.ok(stages.get(courier.residentId).has('loading'));
  assert.ok(stages.get(courier.residentId).has('unloading')); assert.ok(stages.get(courier.residentId).has('to-recipient'));
  for (const id of HARBOR_ROLE_ROUTINES.residents) {
    const agent = f.roles.agent(id), home = f.roles.homes.get(id);
    assert.ok(maximumSteps.get(id) <= agent.speed * .1 + 1e-8);
    assert.equal(agent.insideBuildingId, home.building.id); assert.equal(agent.roomId, home.room.id);
    assert.ok(home.path.every((pose, index) => !index || home.clearSegment(home.path[index - 1], pose)));
  }
  assert.deepEqual(f.life.agents.map(agent => agent.id), ids); assert.equal(ids.length, 20);
  assert.equal(f.roles.agent(clerk.residentId).home.buildingId, 'south-093');
  assert.equal(f.roles.agent(courier.residentId).home.buildingId, 'south-084');
  assert.equal(f.life.residentLoop.state.completedCycles, 1); assert.equal(f.life.residentLoop.state.totalWages, 6);
  resumed(f);
});

test('counter and in-flight finite cargo save and resume the same routes, work receipts, queue ownership and balances', () => {
  const f = fixture(); until(f, () => f.roles.role('harbor-resident-11').stage === 'loading' && f.roles.role('harbor-resident-11').serviceTicks >= 7);
  assert.equal(f.roles.state.queues[0].owner, 'harbor-resident-11');
  assert.equal(f.life._pickup(f.life.jobs.find(job => job.id === f.roles.role('harbor-resident-11').jobId), f.life.player), false, 'an available reservation cannot be stolen by another carrier');
  let next = resumed(f);
  for (let tick = 0; tick < 120; tick++) { step(f); step(next); assert.deepEqual(next.life.snapshot(), f.life.snapshot()); }
  until(f, () => f.roles.role('harbor-resident-11').stage === 'unloading' && f.roles.role('harbor-resident-11').serviceTicks >= 7);
  next = resumed(f); step(f, 200); step(next, 200); assert.deepEqual(next.life.snapshot(), f.life.snapshot()); balanced(f.life);
  until(f, () => f.roles.role('harbor-resident-01').paidPeriods >= 1);
  next = resumed(f); step(f, 100); step(next, 100); assert.deepEqual(next.life.snapshot(), f.life.snapshot());
  const receipts = f.roles.role('harbor-resident-01').wageReceipts;
  assert.equal(new Set(receipts.map(receipt => receipt.period)).size, receipts.length); balanced(f.life);
});

test('absence, closed shift and actual employer insolvency cannot fund unworked clerk time or pay a period twice', () => {
  const f = fixture(); until(f, () => f.roles.role('harbor-resident-01').stage === 'working-counter');
  const agent = f.roles.agent('harbor-resident-01'), role = f.roles.role(agent.id), position = { x: agent.x, y: agent.y, z: agent.z };
  const oldTicks = role.workTicks; agent.x += 2; step(f, 20);
  assert.equal(role.workTicks, oldTicks); assert.equal(role.waitingReason, 'absent-from-counter'); Object.assign(agent, position);
  const employer = f.life.shops[0], balance = employer.money; employer.money = 0; f.life.supply.money += balance;
  until(f, () => role.workTicks >= f.roles.periodTicks);
  assert.equal(role.paidPeriods, 0); assert.equal(role.waitingReason, 'employer-unfunded');
  const oldMoney = agent.money; f.life._wage(agent); assert.equal(agent.money, oldMoney, 'old arrival-hour payroll does not duplicate continuous work pay');
  until(f, () => role.stage === 'resting-home', 11000);
  assert.equal(role.paidPeriods, 0); assert.ok(role.workTicks >= f.roles.periodTicks);
  const earned = role.workTicks, unpaid = Math.floor(earned / f.roles.periodTicks);
  assert.ok(unpaid >= 1); assert.equal(f.roles.agent(agent.id).insideBuildingId, 'south-093');
  resumed(f); step(f, 100); assert.equal(role.workTicks, earned, 'leaving an insolvent employer does not earn off-shift time');
  // Pay the earned debt from existing depot money on the next real calendar
  // day, after the clerk walks back to the counter. No retrospective hours.
  const funding = unpaid * 3;
  assert.ok(f.life.supply.money >= funding); f.life.supply.money -= funding; employer.money += funding;
  const paidBefore = role.paidPeriods;
  until(f, () => role.stage === 'working-counter', 21000); assert.equal(role.paidPeriods, paidBefore);
  step(f); assert.equal(role.paidPeriods, unpaid); assert.equal(agent.money, oldMoney + funding);
  const periods = role.paidPeriods; step(f, 30); assert.equal(role.paidPeriods, periods); balanced(f.life);

});

test('two actual courier IDs walk from separate physical FIFO places to one finite loading contact without overlap or double pickup', () => {
  // Controlled initial contact fixture: existing identities and original funded
  // orders, before any movement. The observed interval uses only actual walks.
  const f = fixture({ hour: 8 }), first = f.roles.agent('harbor-resident-11'), second = f.life.agents[11];
  const [one, two] = f.life.jobs, [firstPlace, secondPlace] = f.roles.contacts.get(f.life.supply.id);
  for (const [agent, place, job] of [[first, firstPlace, one], [second, secondPlace, two]]) {
    Object.assign(agent, place, { insideBuildingId: null, floorId: null, roomId: null, path: [], pathIndex: 0, transit: null, phase: 'working' });
    job.carrierId = agent.id; agent.goal = { kind: 'pickup', id: job.id, anchor: { ...f.life.supply.anchor } };
  }
  Object.assign(f.roles.role(first.id), { stage: 'loading', jobId: one.id, serviceTicks: 0 });
  f.roles.contactDestination(first); f.roles.contactDestination(second);
  const original = f.life.supply.stock[two.product];
  assert.equal(f.life._pickup(two, second), false, 'a queue token cannot pick up stock from a waiting place');
  assert.ok(Math.hypot(first.x - second.x, first.z - second.z) >= .86);
  let observedOwnedContact = false, actualSecondTravel = 0;
  for (let tick = 0; tick < 200 && two.status !== 'picked-up'; tick++) {
    const old = { x: second.x, y: second.y, z: second.z }; step(f);
    const delta = Math.hypot(second.x - old.x, second.y - old.y, second.z - old.z);
    assert.ok(delta <= second.speed * .1 + 1e-8); actualSecondTravel += delta;
    assert.ok(Math.hypot(first.x - second.x, first.z - second.z) >= .86 - 1e-8);
    if (f.roles.state.queues[0].owner === first.id) {
      observedOwnedContact = true; assert.equal(two.status, 'available');
      assert.ok(Math.hypot(second.x - f.life.supply.anchor.x, second.z - f.life.supply.anchor.z) >= .86);
    }
    balanced(f.life);
  }
  assert.equal(observedOwnedContact, true); assert.equal(one.status, 'picked-up'); assert.equal(two.status, 'picked-up');
  assert.ok(actualSecondTravel >= 2.19, 'the second person reaches the counter through movement');
  assert.equal(f.life.supply.stock[two.product], original - two.quantity);
  assert.equal(f.life._pickup(two, second), false); balanced(f.life);
  // A genuine loss of available funding while loading cancels that contact.
  // It must not block a second existing, still-funded order behind it.
  const cancel = fixture({ hour: 8 }), a = cancel.roles.agent('harbor-resident-11'), b = cancel.life.agents[11];
  const [unfunded, funded, remaining] = cancel.life.jobs;
  for (const [agent, place, job] of [[a, cancel.life.supply.anchor, unfunded], [b, cancel.roles.contacts.get(cancel.life.supply.id)[1], funded]]) {
    Object.assign(agent, place, { insideBuildingId: null, floorId: null, roomId: null, path: [], pathIndex: 0, transit: null, phase: 'working' });
    job.carrierId = agent.id; agent.goal = { kind: 'pickup', id: job.id, anchor: { ...cancel.life.supply.anchor } };
  }
  Object.assign(cancel.roles.role(a.id), { stage: 'loading', jobId: unfunded.id, serviceTicks: 0 });
  cancel.roles.contactDestination(a); cancel.roles.contactDestination(b); step(cancel);
  assert.equal(cancel.roles.state.queues[0].owner, a.id);
  const stockBefore = cancel.life.supply.stock[unfunded.product];
  for (const id of [unfunded.shopId, remaining.shopId]) {
    const shop = cancel.life.shops.find(shop => shop.id === id);
    assert.equal(cancel.life._transfer(shop, cancel.life.supply, shop.money), true);
  }
  let actualCancelledTravel = 0;
  for (let tick = 0; tick < 200 && funded.status !== 'picked-up'; tick++) {
    const before = { ...a }; step(cancel);
    const delta = Math.hypot(a.x - before.x, a.y - before.y, a.z - before.z);
    assert.ok(delta <= a.speed * .1 + 1e-8); actualCancelledTravel += delta;
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= .86 - 1e-8); balanced(cancel.life);
  }
  assert.equal(funded.status, 'picked-up'); assert.equal(unfunded.status, 'available');
  assert.equal(unfunded.carrierId, null); assert.equal(unfunded.escrow, 0);
  assert.equal(cancel.life.supply.stock[unfunded.product], stockBefore);
  assert.ok(actualCancelledTravel >= 1.09); assert.ok(cancel.roles.role(a.id).waitingReason === 'no-funded-order');
  assert.equal(cancel.roles.state.queues[0].departing.includes(a.id), false);
  // The actual depleted-shop regression ends on a redundant grid point
  // inside the other courier's waiting body. The original counter remains
  // reachable; discard only that point, then walk there at the normal speed.
  const blocked = fixture({ hour: 14.3 }), waiting = blocked.roles.agent('harbor-resident-11'), approaching = blocked.life.agents[11];
  const [waitingJob, approachingJob] = blocked.life.jobs, counter = blocked.life.supply.anchor;
  Object.assign(waiting, blocked.roles.contacts.get(blocked.life.supply.id)[0],
    { insideBuildingId: null, floorId: null, roomId: null, path: [], pathIndex: 0, transit: null, phase: 'working' });
  Object.assign(approaching, { x: 193.6154273047981, y: .18, z: 120.05906984765537,
    insideBuildingId: null, floorId: null, roomId: null, path: [{ x: 194, y: .18, z: 120 }, { ...counter }],
    pathIndex: 0, transit: null, crossingId: null, phase: 'walking' });
  for (const [agent, job] of [[waiting, waitingJob], [approaching, approachingJob]]) {
    job.carrierId = agent.id; agent.goal = { kind: 'pickup', id: job.id, anchor: { ...counter } };
  }
  Object.assign(blocked.roles.role(waiting.id), { stage: 'loading', jobId: waitingJob.id, serviceTicks: 0 });
  blocked.roles.contactDestination(approaching); blocked.roles.contactDestination(waiting);
  assert.equal(blocked.roles.contactBypass(approaching, approaching.path[0]), true);
  approaching.crossingId = blocked.life.navigation.crossings[0].id;
  assert.equal(blocked.roles.contactBypass(approaching, approaching.path[0]), false);
  assert.equal(blocked.roles.contactDetour(approaching, approaching.path[0]), null); approaching.crossingId = null;
  approaching.path[1].y = .215;
  assert.equal(blocked.roles.contactBypass(approaching, approaching.path[0]), false); approaching.path[1].y = .18;
  let finalCounterTravel = 0;
  for (let tick = 0; tick < 8 && approachingJob.status !== 'picked-up'; tick++) {
    const before = { ...approaching }; step(blocked);
    const delta = Math.hypot(approaching.x - before.x, approaching.y - before.y, approaching.z - before.z);
    assert.ok(delta <= approaching.speed * .1 + 1e-8); finalCounterTravel += delta;
    assert.ok(Math.hypot(waiting.x - approaching.x, waiting.z - approaching.z) >= .86 - 1e-8); balanced(blocked.life);
  }
  assert.equal(approachingJob.status, 'picked-up'); assert.ok(finalCounterTravel > .13);
  assert.equal(waitingJob.status, 'available');
  // A queued order that has not deducted goods or escrow is released at the
  // actual 17:00 shift end; its carrier walks home instead of working at night.
  const offShift = fixture({ hour: 16.998 }), ending = offShift.roles.agent('harbor-resident-11'), queued = offShift.life.jobs[0];
  Object.assign(ending, offShift.roles.contacts.get(offShift.life.supply.id)[0],
    { insideBuildingId: null, floorId: null, roomId: null, path: [], pathIndex: 0, transit: null, phase: 'working' });
  queued.carrierId = ending.id; ending.goal = { kind: 'pickup', id: queued.id, anchor: { ...offShift.life.supply.anchor } };
  Object.assign(offShift.roles.role(ending.id), { stage: 'loading', jobId: queued.id, serviceTicks: 0 });
  step(offShift, 3);
  assert.equal(offShift.roles.role(ending.id).jobId, null); assert.equal(ending.cargoJobId, null);
  assert.notEqual(queued.carrierId, ending.id); assert.equal(queued.escrow, 0);
  until(offShift, () => offShift.roles.role(ending.id).stage === 'resting-home', 5000);
  assert.equal(ending.insideBuildingId, 'south-084'); assert.equal(offShift.roles.role(ending.id).deliveryIncome, 0); balanced(offShift.life);
});

test('the exact noodles contact counterexample rejects unsupported road detours and the original walker waits with bounded real steps', () => {
  // Controlled initial poses from the independent actual-city geometry probe.
  // Use the existing identities, contact and finite order; no invented cargo.
  const f = fixture(), agent = f.life.agents[11], peer = f.life.agents[10];
  const shop = f.life.shops.find(shop => shop.id === 'harbor-noodles'), job = f.life.jobs.find(job => job.shopId === shop.id);
  Object.assign(agent, { x: 194.1, y: .18, z: 147.42007884336635, insideBuildingId: null, floorId: null,
    roomId: null, transit: null, crossingId: null, phase: 'walking', path: [{ ...shop.anchor }], pathIndex: 0 });
  Object.assign(peer, { x: 194.1, y: .18, z: 146.42007884336635, insideBuildingId: null, floorId: null,
    roomId: null, transit: null, crossingId: null, path: [], pathIndex: 0 });
  agent.goal = { kind: 'deliver', id: job.id, anchor: { ...shop.anchor } };
  const bad = { x: 194.1, y: .18, z: 148.52007884336635 }, ground = city.groundHeightAt(bad.x, bad.z, bad.y);
  assert.ok(Math.abs(ground - .04318107759207606) < 1e-8); assert.ok(Math.abs(bad.y - ground) > .136);
  assert.equal(city.groundHeightAt(agent.x, agent.z, agent.y), .18);
  assert.equal(city.groundHeightAt(peer.x, peer.z, peer.y), .18);
  assert.equal(f.life.navigation.clear(agent), true); assert.equal(f.life.navigation.clear(peer), true);
  assert.equal(f.roles.contactDetour(agent, agent.path[0]), null);
  // Explicit query-only negative fixture: both real supply endpoints remain
  // supported, while a narrow support dip exists in the segment middle.
  const from = f.roles.contacts.get(f.life.supply.id)[0], to = f.life.supply.anchor, originalGround = f.transport.streetGroundHeightAt;
  assert.equal(f.roles.contactPavementSegment(from, to), true);
  const middleX = (from.x + to.x) / 2;
  try {
    f.transport.streetGroundHeightAt = (x, z, y) => Math.abs(x - middleX) < .015 && Math.abs(z - from.z) < .01 ? .16 : originalGround(x, z, y);
    assert.equal(f.transport.streetGroundHeightAt(from.x, from.z, from.y), .18);
    assert.equal(f.transport.streetGroundHeightAt(to.x, to.z, to.y), .18);
    assert.equal(f.roles.contactPavementSegment(from, to), false, 'support is checked along the whole segment');
    f.transport.streetGroundHeightAt = undefined;
    assert.equal(f.roles.contactPavementSegment(from, to), false, 'an absent real support query cannot assume flat ground');
  } finally { f.transport.streetGroundHeightAt = originalGround; }
  const money = f.life.totalMoney, goods = f.life.totalGoods, orders = structuredClone(f.life.jobs), transactions = structuredClone(f.life.transactions);
  let actualTravel = 0, waitingTicks = 0;
  for (let tick = 0; tick < 40; tick++) {
    const before = { ...agent }; f.life._walk(agent, .1, []);
    const delta = Math.hypot(agent.x - before.x, agent.y - before.y, agent.z - before.z);
    assert.ok(delta <= agent.speed * .1 + 1e-8); actualTravel += delta;
    assert.ok(Math.hypot(agent.x - peer.x, agent.z - peer.z) >= .86 - 1e-8);
    assert.ok(Math.abs(agent.y - city.groundHeightAt(agent.x, agent.z, agent.y)) <= .035);
    assert.ok(agent.z <= before.z + 1e-8, 'no unsupported detour takes the walker farther into the road');
    assert.equal(agent.crossingId, null); assert.equal(agent.path.length, 1);
    if (agent.activity === '在实际柜台保持身体间距') waitingTicks++;
  }
  assert.ok(actualTravel > 0 && actualTravel < .3); assert.ok(waitingTicks >= 38);
  assert.equal(agent.pathIndex, 0); assert.equal(f.life.totalMoney, money); assert.equal(f.life.totalGoods, goods);
  assert.deepEqual(f.life.jobs, orders); assert.deepEqual(f.life.transactions, transactions); balanced(f.life);
});

test('older v3 residents adopt furnished routes without relocating, resetting wallets or replaying a delivered cargo payout', () => {
  const old = fixture({ roleRoutines: false });
  until({ ...old, roles: null }, () => !!old.life.agents[10].cargoJobId, 5000);
  const save = old.life.snapshot(); delete save.roleRoutines;
  const next = fixture({ save, fleet: old.transport.exportState() }); assert.equal(next.life.restored, true);
  for (const [index, agent] of next.life.agents.entries()) {
    assert.equal(agent.money, save.agents[index].money); assert.equal(agent.x, save.agents[index].x);
    assert.equal(agent.y, save.agents[index].y); assert.equal(agent.z, save.agents[index].z);
  }
  assert.deepEqual(next.life.residentLoop.snapshot(), save.residentLoop); assert.deepEqual(next.life.transactions, save.transactions);
  assert.deepEqual(next.life.jobs, save.jobs); assert.equal(next.roles.role('harbor-resident-01').workTicks, 0);
  const cargo = save.agents[10].cargoJobId; until(next, () => next.life.jobs.find(job => job.id === cargo)?.status === 'delivered', 5000);
  assert.equal(next.life.transactions.filter(tx => tx.type === 'delivery' && tx.jobId === cargo).length, 1); balanced(next.life);
  // Real old-mode doorway save: the old walker raises feet 35 mm before the
  // slab. Restore preserves that pose; the first real walker step corrects it.
  const door = fixture({ hour: 22, roleRoutines: false }); step(door, 15);
  const doorwaySave = door.life.snapshot(), previous = doorwaySave.agents[0]; delete doorwaySave.roleRoutines;
  assert.ok(previous.y > .18 && previous.y < .215);
  const adopted = fixture({ save: doorwaySave, fleet: door.transport.exportState() });
  assert.equal(adopted.life.restored, true); assert.deepEqual(adopted.life.snapshot().agents[0], previous);
  assert.doesNotThrow(() => step(adopted)); const current = adopted.life.agents[0];
  assert.ok(Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z) <= current.speed * .1 + 1e-8);
  assert.equal(current.x, previous.x); assert.equal(current.z, previous.z);
  assert.equal(current.y, .18); assert.equal(current.money, previous.money); balanced(adopted.life);
  assert.equal(adopted.roles.role(current.id).workTicks, 0);
  until(adopted, () => adopted.roles.role(current.id).stage === 'resting-home', 300); resumed(adopted);
});

test('tampered role receipts, absent service owners, fictitious cargo and furniture-crossing paths fail atomically', () => {
  const f = fixture(); until(f, () => f.roles.role('harbor-resident-01').paidPeriods >= 1);
  const valid = f.life.snapshot();
  const changes = [s => s.roleRoutines.roles[0].paidPeriods++, s => s.roleRoutines.roles[0].workTicks = 0,
    s => s.roleRoutines.roles[0].wageReceipts[0].amount++, s => s.roleRoutines.roles[1].jobId = 'harbor-order-99999',
    s => { s.roleRoutines.queues[0].owner = 'harbor-resident-11'; s.roleRoutines.queues[0].claimedTick = s.ticks; },
    s => s.roleRoutines.roles[0].events[0].hour++, s => s.roleRoutines.roles[0].residentId = 'harbor-resident-07',
    s => s.agents[0].y = f.roles.homes.get('harbor-resident-01').floor.y + 1,
    s => s.agents[0].path.push({ x: f.roles.homes.get('harbor-resident-01').anchor.x, y: 5, z: f.roles.homes.get('harbor-resident-01').anchor.z }),
    s => s.roleRoutines.queues[0].waiting.push('harbor-resident-02')];
  for (const change of changes) { const corrupt = structuredClone(valid); change(corrupt);
    assert.equal(f.life.restore(corrupt), false); assert.deepEqual(f.life.snapshot(), valid); }
  resumed(f); assert.equal(f.life.reset({ hour: 6 }), true); assert.equal(f.roles.role('harbor-resident-01').workTicks, 0);
  assert.equal(f.roles.state.queues.every(queue => queue.owner === null && !queue.waiting.length), true); balanced(f.life);
});
