import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { createHarborLife, HARBOR_LIFE_SCHEMA } from '../src/harbor-life.js';
import { createHarborLifeRenderer } from '../src/harbor-life-renderer.js';
import { HarborTransitService } from '../src/harbor-transit.js';
import { createInteriorLayout } from '../src/metropolis-interiors.js';
import { circleOBB } from '../src/collision.js';
import { GameSimulation } from '../src/simulation.js';
import { intersectionSignal } from '../src/traffic.js';
import { MultiplayerEconomy } from '../src/multiplayer-economy.js';

const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
const fixture = (options = {}) => createHarborLife({ buildings: city.buildings, colliders: city.colliders, hour: 6, secondsPerHour: 35, residentLoop: false, ...options });
const advance = (life, seconds, options = {}) => { for (let i = 0; i < Math.round(seconds * 10); i++) life.update(.1, options); };
const assertBalanced = life => { assert.equal(life.totalMoney, life.initialMoney); assert.equal(life.totalGoods, life.initialGoods); assert.ok(life.agents.every(a => a.money >= 0)); assert.ok(life.shops.every(s => s.money >= 0 && s.stock >= 0)); };

test('sample binds twenty separate residents to actual homes, counter frontages and legal routes', () => {
  const life = fixture();
  assert.equal(life.agents.length, 20);
  assert.equal(new Set(life.agents.map(a => a.id)).size, 20);
  for (const agent of life.agents) {
    const building = city.buildings.find(b => b.id === agent.home.buildingId);
    const layout = createInteriorLayout(building, building.floors.find(f => f.id === agent.home.floorId));
    assert.ok(layout.rooms.some(r => r.type === 'bedroom'), `${agent.id} has an actual home room`);
    assert.notEqual(agent.phase, 'route-blocked');
    const targets = [...life.shops.map(s => s.anchor), life.supply.anchor, life.supply.workplace];
    for (const target of targets) {
      const path = life.navigation.route(agent.home.anchor, target);
      assert.ok(path, `${agent.home.buildingId} has a pavement route`);
      let previous = agent.home.anchor;
      for (const p of path) { assert.ok(life.navigation.clearSegment(previous, p)); previous = p; }
    }
    const home = life._homePath(agent), radius = .37;
    for (let i = 1; i < home.path.length; i++) {
      const a = home.path[i - 1], b = home.path[i], count = Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / .15);
      for (let step = 0; step <= count; step++) {
        const p = { x: a.x + (b.x - a.x) * step / count, z: a.z + (b.z - a.z) * step / count, radius };
        assert.equal(layout.colliders.find(c => c.minY < a.y + 1.8 && c.maxY > a.y + .05 && circleOBB(p, c)), undefined, `${agent.home.buildingId}: real door-to-bedroom circulation`);
      }
    }
  }
  assert.equal(life.shops.find(s => s.buildingId === 'south-095').name, '潮叶果铺');
  const supplyDoor = city.buildings.find(b => b.id === 'south-089').entrance;
  assert.ok(Math.hypot(life.supply.anchor.x - supplyDoor.x, life.supply.anchor.z - supplyDoor.z) > 5.4);
  assert.equal(life.getPrompt(supplyDoor)?.kind === 'harbor-delivery', false, 'loading never masks the actual residence entrance');
  assert.ok(life.navigation.crossings.length > 0);
  assertBalanced(life);
});

test('actual delivery moves finite stock, debits wholesale and escrow, and pays the player once at the recipient', () => {
  const life = fixture(), job = life.availableJobs[0], shop = life.shops.find(s => s.id === job.shopId), initial = { depot: life.supply.stock[job.product], shop: shop.stock, cash: shop.money };
  assert.equal(life.acceptDelivery(job.id, { x: 0, z: 0 }).reason, 'not-at-supply');
  assert.equal(life.supply.stock[job.product], initial.depot);
  assert.equal(life.acceptDelivery(job.id, job.pickup).success, true);
  assert.equal(life.supply.stock[job.product], initial.depot - job.quantity);
  assert.equal(shop.stock, initial.shop);
  assert.equal(shop.money, initial.cash - job.wholesale - job.reward);
  assertBalanced(life);
  assert.equal(life.completeDelivery(job.pickup).reason, 'not-at-recipient');
  const saved = life.snapshot(), restored = fixture({ save: saved });
  assert.equal(restored.restored, true);
  assert.equal(restored.activeDelivery.id, job.id);
  const result = restored.completeDelivery(job.destination);
  assert.equal(result.cashDelta, job.reward);
  assert.equal(restored.shops.find(s => s.id === job.shopId).stock, initial.shop + job.quantity);
  assert.equal(restored.player.earnedCash, job.reward);
  assert.equal(restored.completeDelivery(job.destination).cashDelta, undefined);
  assert.equal(restored.player.earnedCash, job.reward);
  assert.equal(restored.transactions.filter(t => t.type === 'delivery' && t.jobId === job.id).length, 1);
  assertBalanced(restored);
});

test('stock availability and shop funds cause actual successful or blocked purchases', () => {
  const life = fixture({ hour: 18 }), shop = life.shops[0], staff = life.agents[1], buyer = life.agents[12];
  Object.assign(staff, shop.anchor, { phase: 'working', goal: { kind: 'work', id: shop.id, anchor: shop.anchor } });
  Object.assign(buyer, shop.anchor, { phase: 'shopping', goal: { kind: 'shop', id: shop.id, anchor: shop.anchor } });
  const start = { stock: shop.stock, money: shop.money, buyer: buyer.money };
  life._purchase(buyer);
  assert.equal(shop.stock, start.stock - 1); assert.equal(buyer.money, start.buyer - shop.price); assert.equal(shop.money, start.money + shop.price);
  assert.equal(life.statistics.consumed, 1);
  // Replaying a shop arrival during this day cannot charge the same resident.
  buyer.goal = { kind: 'shop', id: shop.id, anchor: shop.anchor }; life._purchase(buyer);
  assert.equal(shop.sold, 1);
  const poor = life.agents[13], balance = poor.money;
  poor.money = 0; life.supply.money += balance;
  Object.assign(poor, shop.anchor); poor.goal = { kind: 'shop', id: shop.id, anchor: shop.anchor }; life._purchase(poor);
  assert.equal(shop.sold, 1); assert.equal(poor.purchased.produce, -1);
  const stock = shop.stock; life.supply.stock.produce += stock; shop.stock = 0;
  poor.money = balance; life.supply.money -= balance; life._purchase(poor);
  assert.equal(shop.sold, 1); assert.match(poor.activity, /补货/);
  assertBalanced(life);
});

test('daily schedules complete home, work, shop and courier loops regardless of visible distance or indoor context', () => {
  const life = fixture(), worked = new Set(), slept = new Set();
  for (let tick = 0; tick < 8400; tick++) {
    life.update(.1, { position: { x: 1400, z: -1000 }, interior: { buildingId: 'apex-tower' } });
    for (const a of life.agents) { if (a.phase === 'working') worked.add(a.id); if (a.phase === 'resting' && a.insideBuildingId === a.home.buildingId) slept.add(a.id); }
  }
  assert.equal(slept.size, 20);
  assert.ok(worked.size >= 15, `actual work attendance ${worked.size}`);
  assert.ok(life.statistics.purchases > 10); assert.ok(life.statistics.deliveries >= 3); assert.ok(life.statistics.wages > 20);
  assert.ok(life.shops.every(s => s.sold > 0), 'all three shops trade actual portions');
  assert.ok(life.agents.every(a => a.phase !== 'route-blocked'));
  assertBalanced(life);
});

test('fixed economic ticks and persisted paths resume deterministically without repeating wages or deliveries', () => {
  const a = fixture({ seed: 27 }), b = fixture({ seed: 27 });
  a.update(183); for (let i = 0; i < 1830; i++) b.update(.1);
  assert.deepEqual(a.snapshot(), b.snapshot());
  const restored = fixture({ seed: 27, save: JSON.stringify(a.snapshot()) });
  assert.equal(restored.restored, true);
  a.update(91.37); restored.update(91.37);
  assert.deepEqual(a.snapshot(), restored.snapshot());
  const wageKeys = a.transactions.filter(t => t.type === 'wage').map(t => `${t.agentId}/${t.slot}`);
  assert.equal(new Set(wageKeys).size, wageKeys.length);
  assertBalanced(a);
});

test('corrupt or foreign snapshots cannot mint stock, money, arbitrary positions or orphan delivery payouts', () => {
  const life = fixture(), valid = life.snapshot();
  assert.equal(valid.schema, HARBOR_LIFE_SCHEMA);
  for (const change of [s => s.version++, s => s.seed++, s => s.supply.money++, s => s.shops[0].stock++, s => { s.supply.stock.produce--; s.supply.stock.tea++; }, s => s.agents[0].x = Infinity, s => s.player.activeJobId = 'missing']) {
    const bad = structuredClone(valid); change(bad); assert.equal(life.restore(bad), false); assert.deepEqual(life.snapshot(), valid);
  }
  const job = life.availableJobs[0]; life.acceptDelivery(job.id, job.pickup); life.completeDelivery(job.destination);
  life.restore(null);
  assert.equal(life.player.earnedCash, 0); assert.equal(life.statistics.deliveries, 0); assert.equal(life.ticks, 0); assert.equal(life.agents.length, 20);
  assertBalanced(life);
});

test('warehouse commutes board real moving trams and physically alight onto legal final pavement routes', () => {
  const transport = new HarborTransitService({ groundHeightAt: city.groundHeightAt }), life = fixture({ transport, hour: 8 });
  const seen = new Set(); let maxBoardingStep = 0;
  for (let tick = 0; tick < 4500; tick++) {
    const before = life.agents.map(a => ({ phase: a.phase, x: a.x, z: a.z }));
    transport.update(.1); life.update(.1);
    for (const [i, a] of life.agents.entries()) {
      if (a.transit?.phase === 'riding') seen.add(a.id);
      if (['boarding', 'alighting'].includes(a.phase) && ['boarding', 'alighting'].includes(before[i].phase)) maxBoardingStep = Math.max(maxBoardingStep, Math.hypot(a.x - before[i].x, a.z - before[i].z));
    }
  }
  assert.ok(seen.size >= 3, `real commuting residents ${seen.size}`);
  assert.ok(life.statistics.alighted >= 3); assert.ok(maxBoardingStep < .2, 'door paths are physically walked');
  assertBalanced(life);
});

test('renderer streams at most twelve detailed instances while presentation never advances city state', () => {
  const life = fixture(), scene = new THREE.Scene(), renderer = createHarborLifeRenderer(THREE, scene, life);
  const before = life.snapshot(); renderer.update({ position: life.supply.anchor }, 1000);
  assert.ok(renderer.snapshot().detailed <= 12); assert.equal(renderer.snapshot().logical, 20);
  renderer.update({ position: { x: 1400, z: -1000 } }, 1000); assert.equal(renderer.snapshot().detailed, 0);
  assert.deepEqual(life.snapshot(), before); renderer.dispose(); renderer.dispose();
  assert.equal(scene.children.length, 0);
});


test('restoring real in-flight fleet tickets preserves boarding, cargo and deterministic continuation', () => {
  const transport = new HarborTransitService({ groundHeightAt: city.groundHeightAt }), life = fixture({ transport, hour: 8 });
  for (let tick = 0; tick < 2500 && !life.agents.some(a => a.phase === 'riding'); tick++) { transport.update(.1); life.update(.1); }
  assert.ok(life.agents.some(a => a.phase === 'riding'));
  const saved = life.snapshot(), fleet = transport.exportState();
  const restoredTransport = new HarborTransitService({ groundHeightAt: city.groundHeightAt });
  assert.equal(restoredTransport.restoreState(fleet), true);
  const resumed = fixture({ transport: restoredTransport, hour: 18, save: saved });
  assert.equal(resumed.restored, true); assert.deepEqual(resumed.snapshot(), saved);
  for (let tick = 0; tick < 800; tick++) { transport.update(.1); life.update(.1); restoredTransport.update(.1); resumed.update(.1); }
  assert.deepEqual(life.snapshot(), resumed.snapshot()); assertBalanced(resumed);
});

test('rewinding display time never repeats an elapsed wage slot or changes the money supply', () => {
  const life = fixture({ hour: 18 }), worker = life.agents[1];
  Object.assign(worker, worker.work.anchor, { phase: 'working', goal: { kind: 'work', id: worker.work.employer, anchor: worker.work.anchor } });
  life.update(.1, { hour: 18 }); const earned = worker.money, count = life.statistics.wages;
  life.update(.1, { hour: 12 }); life.update(.1, { hour: 18 });
  assert.equal(worker.money, earned); assert.equal(life.statistics.wages, count); assertBalanced(life);
});

test('player buys an actual stocked portion only from the staffed counter and game-owned cash funds the shop', () => {
  const life = fixture({ hour: 16.5 }), shop = life.shops.find(s => s.product === 'tea');
  const position = shop.anchor;
  assert.equal(life.interact(position, { cash: 1200 }).reason, 'unstaffed');
  for (let tick = 0; tick < 700 && !life.shopStatuses.find(s => s.id === shop.id).staff; tick++) life.update(.1);
  assert.ok(life.shopStatuses.find(s => s.id === shop.id).staff, 'staff physically arrives under its schedule');
  assert.match(life.getPrompt(position).label, /购买.*\$4\/份/);
  const before = { stock: shop.stock, cash: shop.money }, cash = 1200;
  const bought = life.interact(position, { cash, requestId: 'purchase:tea:first' });
  assert.equal(bought.success, true); assert.equal(bought.cashDelta, -shop.price);
  assert.equal(shop.stock, before.stock - 1); assert.equal(shop.money, before.cash + shop.price);
  assert.equal(life.player.inventory.tea, 1); assert.equal(life.player.spentCash, shop.price);
  assert.equal(cash + bought.cashDelta, 1196, 'the returned debit updates the one game wallet');
  assertBalanced(life);
  const resumed = fixture({ hour: 16.5, save: life.snapshot() });
  assert.equal(resumed.restored, true);
  const duplicate = resumed.interact(position, { cash: 1196, requestId: 'purchase:tea:first' });
  assert.equal(duplicate.reason, 'already-purchased'); assert.equal(duplicate.cashDelta, 0);
  assert.equal(resumed.player.inventory.tea, 1); assert.equal(resumed.player.spentCash, 4);
  assertBalanced(resumed);
});

test('remote, unfunded, unstaffed, closed and sold-out retail requests never debit the game wallet', () => {
  const life = fixture({ hour: 16.5 }), shop = life.shops.find(s => s.product === 'tea');
  assert.equal(life.buyPlayer(shop.id, { x: 0, z: 0 }, { cash: 1200 }).reason, 'not-at-shop');
  assert.equal(life.buyPlayer(shop.id, shop.anchor, { cash: 1200 }).reason, 'unstaffed');
  for (let tick = 0; tick < 700 && !life.shopStatuses.find(s => s.id === shop.id).staff; tick++) life.update(.1);
  const before = life.snapshot();
  for (const cash of [0, 3, NaN, Infinity]) {
    const result = life.buyPlayer(shop.id, shop.anchor, { cash });
    assert.equal(result.success, false); assert.equal(result.cashDelta, 0); assert.deepEqual(life.snapshot(), before);
  }
  for (let i = 0; i < 4; i++) assert.equal(life.buyPlayer(shop.id, shop.anchor, { cash: 1200, requestId: `retail:${i}` }).success, true);
  assert.equal(shop.stock, 0);
  assert.equal(life.buyPlayer(shop.id, shop.anchor, { cash: 1200 }).reason, 'out-of-stock');
  assert.equal(life.player.inventory.tea, 4); assertBalanced(life);
  life.update(.1, { hour: 22 });
  assert.equal(life.hour < 21, true, 'light preview does not close the shop');
  advance(life, (21 - life.absoluteHour) * life.secondsPerHour + .1);
  assert.equal(life.buyPlayer(shop.id, shop.anchor, { cash: 1200 }).reason, 'closed');
  const state = life.snapshot(), forged = structuredClone(state);
  forged.player.spentCash++; assert.equal(life.restore(forged), false);
  const fakePayout = structuredClone(state); fakePayout.player.earnedCash += 12; fakePayout.supply.money -= 12;
  assert.equal(life.restore(fakePayout), false, 'balanced transfers still require a real delivery payout');
  const duplicateRequest = structuredClone(state); duplicateRequest.player.purchaseRequests.push(duplicateRequest.player.purchaseRequests[0]);
  assert.equal(life.restore(duplicateRequest), false); assert.deepEqual(life.snapshot(), state);
});


test('runtime traffic clock controls crossing permission independently of persisted economic days', () => {
  const life = fixture(), crossing = life.navigation.crossings.find(c => c.axis === 'x' && c.road === 160 && c.lane === 146);
  let red = 0; while (intersectionSignal(red, crossing.x, crossing.z, crossing.axis) === 'green') red++;
  let green = red; while (intersectionSignal(green, crossing.x, crossing.z, crossing.axis) !== 'green') green++;
  const walker = { ...life.agents[0], x: crossing.road - 14, z: crossing.lane, y: .18, pathIndex: 0, crossingId: null,
    path: [{ x: crossing.road + 12, z: crossing.lane, y: .18, crossingId: crossing.id }] };
  const day = life.day, balance = life.totalMoney;
  life.update(.01, { trafficTime: red }); life._walk(walker, .1, []);
  assert.equal(walker.x, crossing.road - 14);
  life.update(.01, { trafficTime: green }); life._walk(walker, .1, []);
  assert.ok(walker.x > crossing.road - 14);
  assert.equal(life.day, day); assert.equal(life.totalMoney, balance);
  assert.equal(life.snapshot().trafficTime, undefined, 'fleet timing does not become an economic clock');
  const restored = fixture({ save: life.snapshot() }); assert.equal(restored.restored, true);
  assert.equal(restored.trafficTime, undefined); assertBalanced(restored);
});

test('integrated E retail changes the sole game wallet and a saved inventory restores alongside its ledger', async () => {
  const sim = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt });
  city.bind(sim, { hour: 16.5 });
  const shop = city.sample.life.shops.find(s => s.product === 'tea');
  for (let tick = 0; tick < 700 && !city.sample.life.shopStatuses.find(s => s.id === shop.id).staff; tick++) city.step(.1, {});
  assert.ok(city.sample.life.shopStatuses.find(s => s.id === shop.id).staff);
  assert.equal(await city.travelTo({ name: shop.name, entrance: shop.anchor }), true);
  assert.equal(city.getPrompt().kind, 'harbor-shop');
  const cash = sim.cash, stock = shop.stock, bought = city.interact();
  assert.equal(bought.success, true); assert.equal(sim.cash, cash - shop.price); assert.equal(shop.stock, stock - 1);
  const save = city.safeSave(), resumedSim = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt, save });
  city.bind(resumedSim, { save, hour: 16.5 });
  assert.equal(resumedSim.cash, cash - shop.price); assert.equal(city.sample.life.player.inventory.tea, 1);
  assert.equal(city.sample.life.player.spentCash, shop.price); assertBalanced(city.sample.life);
});

test('room v2 economy applies resident accounts and finite consumption while preserving local presentation poses', () => {
  const life = fixture(), ledger = new MultiplayerEconomy();
  const pose = { x: life.agents[0].x, y: life.agents[0].y, z: life.agents[0].z, phase: life.agents[0].phase };
  ledger.advance(35 * 20);
  const state = ledger.snapshot('room-player');
  life.setRoomAuthority(true);
  assert.equal(life.applyRoomEconomy(state), true, 'live room economy version is accepted');
  assert.equal(life.agents[0].money, ledger.residents[0].money);
  assert.equal(life.agents[0].roomWages, ledger.residents[0].wages);
  assert.equal(life.agents[0].roomPurchases, ledger.residents[0].purchases);
  assert.deepEqual({ x: life.agents[0].x, y: life.agents[0].y, z: life.agents[0].z, phase: life.agents[0].phase }, pose,
    'room ledger does not accept peer resident routes or positions');
  assert.deepEqual(life.consumedByProduct, ledger.consumed);
  assert.equal(life.statistics.wages, ledger.residents.reduce((sum, resident) => sum + resident.wages, 0));
  assert.equal(life.hour, state.hour);
  assert.equal(life.applyRoomEconomy({ ...state, version: 99 }), false);
  assert.equal(life.applyRoomEconomy({ ...state, consumed: { ...state.consumed, produce: 101 } }), false,
    'out-of-range consumed units are rejected');
  assert.equal(life.applyRoomEconomy({ ...state, shops: [null, ...state.shops.slice(1)] }), false,
    'malformed shop rows are rejected without throwing');
  assert.deepEqual(life.consumedByProduct, ledger.consumed, 'rejected versions leave the applied ledger unchanged');
  life.setRoomAuthority(false);
  assert.equal(life.agents[0].money, 50 + (life.seed + 0 * 17) % 31, 'leaving restores the local ledger snapshot');
});

test('leaving room authority restores the local simulation wallet', () => {
  const sim = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt });
  city.bind(sim, { hour: 16.5 });
  const localCash = sim.cash;
  assert.equal(city.setEconomyAuthority(true), true);
  sim.cash = localCash - 6;
  assert.equal(city.safeSave().cash, localCash, 'autosave keeps the local wallet while room authority is active');
  assert.equal(city.setEconomyAuthority(false), false);
  assert.equal(sim.cash, localCash, 'shared room purchase cannot leak into the local wallet');
});
