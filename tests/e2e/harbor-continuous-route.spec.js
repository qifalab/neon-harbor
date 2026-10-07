import { test, expect } from '@playwright/test';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHarborVehicleLayout } from '../../src/harbor-vehicle-models.js';
import { snapshot, walkAxis } from './helpers/walking.js';
import { enterRoom, leaveRoom, faceRoom } from './helpers/occupied.js';

// One player-facing day in the authored harbor sample. The sample menu is used
// once to place the player at the real south-093 doorstep; every later leg is
// physical keyboard travel, public boarding, or an actual building doorway.
// This is intentionally separate from the shorter transport and room suites:
// a failure identifies a broken hand-off between otherwise working systems.
test.use({ viewport: { width: 512, height: 320 } });
test.setTimeout(2400000);

const transitState = page => page.evaluate(() => window.__NEON__.snapshot().city.sample.transit);
const buildingState = page => page.evaluate(() => window.__NEON__.snapshot().city.interior);

async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto('/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 });
  await page.locator('#welcome-settings').click();
  await page.locator('#quality').selectOption('low');
  await page.locator('#resume').click();
  await page.locator('#welcome-sample').click();
  await expect(page.locator('#sample-stops')).toBeVisible();
  // This is the only relocation in the scenario. It is the same public
  // product control a player uses to begin the harbor day at home.
  await page.locator('[data-sample-home]').click();
  await expect(page.locator('#panel')).not.toBeVisible({ timeout: 60000 });
  await expect(page.locator('#game')).toBeFocused();
  return errors;
}

async function walkTo(page, target, { precision = false, tolerance = .75, timeout = 120000 } = {}) {
  const before = await snapshot(page);
  // south-093's north doorway faces a solid frontage row. Leave that doorway
  // through the authored alley before turning toward the bus stop; a direct
  // southward hold otherwise presses the avatar into the building shell.
  const leavingSouth093ForMarket = before.city.interior.buildingId == null &&
    Math.abs(before.position.x - 187) < 1 && before.position.z > 195 && target.z < 180 && target.x > 200;
  if (leavingSouth093ForMarket) {
    await walkAxis(page, 'x', 200.5, { precision, tolerance, timeout, sprint: !precision });
    await walkAxis(page, 'z', target.z, { precision, tolerance, timeout, sprint: !precision });
    await walkAxis(page, 'x', target.x, { precision, tolerance, timeout, sprint: !precision });
    return;
  }
  const axes = ['x', 'z'].sort((a, b) => Math.abs(before.position[b] - target[b]) - Math.abs(before.position[a] - target[a]));
  for (const axis of axes) {
    if (Number.isFinite(target[axis])) await walkAxis(page, axis, target[axis], { precision, tolerance, timeout, sprint: !precision });
  }
}

async function walkStreet(page, waypoints) {
  await faceRoom(page, Math.PI);
  for (const point of waypoints) {
    // Explicit axis ordering preserves the actual lane and alley corners.
    // A direct diagonal shortcut could hit the residential shell.
    for (const [axis, value] of Object.entries(point)) await walkAxis(page, axis, value, { timeout: 180000, sprint: true });
  }
}

async function stopById(page, id) {
  const state = await transitState(page);
  return state.stops.find(stop => stop.id === id);
}

async function waitForVehicle(page, stopId, timeout = 240000) {
  await page.waitForFunction(id => window.__NEON__.snapshot().city.sample.transit.vehicles
    .some(vehicle => vehicle.stopId === id && vehicle.remaining > 2), stopId, { polling: 'raf', timeout });
}

async function rideTo(page, fromId, toId, { boardTolerance = .75, timeout = 300000 } = {}) {
  const from = await stopById(page, fromId), to = await stopById(page, toId);
  expect(from, `known origin stop ${fromId}`).toBeTruthy();
  expect(to, `known destination stop ${toId}`).toBeTruthy();
  await walkTo(page, from.board, { precision: from.kind === 'ferry', tolerance: boardTolerance, timeout: 180000 });
  await expect.poll(async () => {
    const s = await snapshot(page);
    return Math.hypot(s.position.x - from.board.x, s.position.z - from.board.z);
  }, { timeout: 30000 }).toBeLessThan(1.25);
  await waitForVehicle(page, fromId);
  const before = await transitState(page);
  await page.keyboard.press('e');
  await expect.poll(async () => (await transitState(page)).riding).toBe(true);
  const boarded = await transitState(page), vehicleId = boarded.ridingVehicleId;
  expect(vehicleId).toBeTruthy();
  expect(boarded.passengerDeck).toBe('lower');
  expect(boarded.passengerLocal?.y).toBeCloseTo(createHarborVehicleLayout(from.kind).deckLevels[0], 2);
  await page.waitForFunction(({ id, destination }) => {
    const t = window.__NEON__.snapshot().city.sample.transit;
    const vehicle = t.vehicles.find(item => item.id === id);
    return vehicle?.stopId === destination && vehicle.doorsOpen && vehicle.remaining > 2;
  }, { id: vehicleId, destination: toId }, { polling: 'raf', timeout });
  const arrivedOnVehicle = await transitState(page);
  expect(arrivedOnVehicle.ridingVehicleId).toBe(vehicleId);
  expect(arrivedOnVehicle.vehicles.find(vehicle => vehicle.id === vehicleId)?.stopId).toBe(toId);
  await page.keyboard.press('e');
  await expect.poll(async () => (await transitState(page)).riding).toBe(false);
  const outside = await transitState(page), pose = await snapshot(page);
  // Leaving the public vehicle clears the active stop marker; the arrival
  // assertion above is the authoritative on-board observation.
  expect(pose.city.interior.buildingId).toBeNull();
  expect(Math.hypot(pose.position.x - to.board.x, pose.position.z - to.board.z)).toBeLessThan(1.5);
  expect(pose.simulationTime).toBeGreaterThan(before.time || 0);
  return { from, to, vehicleId, boarded, arrivedOnVehicle, outside, pose };
}

async function enterBuildingRoom(page, id, roomType) {
  const state = await snapshot(page), building = state.city.buildings.find(item => item.id === id);
  expect(building, `known building ${id}`).toBeTruthy();
  await faceRoom(page, Math.PI);
  await walkTo(page, building.entrance, { precision: true, tolerance: .6 });
  await expect(page.locator('#interaction')).toContainText('进入');
  await page.keyboard.press('e');
  await expect.poll(async () => (await buildingState(page)).buildingId).toBe(id);
  const interior = await buildingState(page), room = interior.rooms.find(item => item.type === roomType);
  expect(room, `${id} exposes a ${roomType} room`).toBeTruthy();
  await enterRoom(page, room, building.x);
  expect((await buildingState(page)).currentRoomId).toBe(room.id);
  return { building, room };
}

async function exitBuildingRoom(page, building, room) {
  await leaveRoom(page, room, building.x);
  const lobby = await buildingState(page);
  expect(lobby.buildingId).toBe(building.id);
  await faceRoom(page, Math.PI);
  await walkAxis(page, 'z', lobby.entrance.z, { sprint: true, timeout: 120000 });
  await page.keyboard.press('e');
  await expect.poll(async () => (await buildingState(page)).buildingId).toBeNull();
  const outside = await snapshot(page);
  expect(outside.city.exterior.southInteriorId ?? null).toBeNull();
  return outside;
}

async function saveAndReload(page) {
  if (!(await page.locator('#panel').isVisible())) await page.keyboard.press('Escape');
  await page.locator('[data-tab="settings"]').click();
  const download = page.waitForEvent('download');
  await page.locator('#export-save').click();
  await download;
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('neon-harbor.progress.v1')));
  await page.locator('#resume').click();
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 });
  await page.locator('#start').click();
  await expect(page.locator('#game')).toBeFocused();
  return { saved, restored: await snapshot(page) };
}

test('continuous harbor day keeps real home, three transports, shop, workshop, opposite interior and return state', async ({ page }, info) => {
  const journalPath = info.outputPath('harbor-continuous-route.jsonl');
  await mkdir(dirname(journalPath), { recursive: true });
  const journal = async stage => {
    const state = await snapshot(page);
    const record = { stage, position: state.position, time: state.simulationTime, teleportRevision: state.teleportRevision,
      interior: { buildingId: state.city.interior.buildingId, roomId: state.city.interior.currentRoomId },
      transit: { riding: state.city.sample.transit.riding, vehicleId: state.city.sample.transit.ridingVehicleId,
        currentStopId: state.city.sample.transit.currentStopId }, positionWrites: false, clockWrites: false };
    await appendFile(journalPath, `${JSON.stringify(record)}\n`);
    console.log(JSON.stringify(record));
  };
  const errors = await boot(page);
  const initial = await snapshot(page), home = initial.city.buildings.find(building => building.id === 'south-093');
  expect(home).toBeTruthy();
  expect(Math.hypot(initial.position.x - home.entrance.x, initial.position.z - home.entrance.z)).toBeLessThan(1.5);
  const initialRevision = initial.teleportRevision;

  // south-093 is a shared residence shell; enter its real lobby, then leave
  // through the public doorway. The authored bedroom gate is covered on the
  // return at the end, where its room-specific route is the user milestone.
  const dwelling = { building: home };
  await faceRoom(page, Math.PI);
  await walkTo(page, home.entrance, { precision: true, tolerance: .6 });
  await page.keyboard.press('e');
  await expect.poll(async () => (await buildingState(page)).buildingId).toBe('south-093');
  await journal('home-lobby');
  const lobby = await buildingState(page);
  await faceRoom(page, Math.PI);
  await walkAxis(page, 'z', lobby.entrance.z, { sprint: true, timeout: 120000 });
  await page.keyboard.press('e');
  await expect.poll(async () => (await buildingState(page)).buildingId).toBeNull();
  await journal('home-departure');

  await walkStreet(page, [{ x: 201 }, { z: 172.275 }, { x: 203.74 }]);
  await rideTo(page, 'harbor-bus-market', 'harbor-bus-lantern');
  await journal('bus-alighted');
  if (process.env.NEON_ROUTE_STOP === 'bus') {
    await info.attach('harbor-continuous-route', { path: journalPath, contentType: 'application/jsonl' });
    return;
  }
  // The bus stop's signed pole sits on the exact x=252.275 landing line.
  // Step around that authored street fixture before taking the northbound
  // lane; a straight x hold would correctly collide with the pole forever.
  await walkStreet(page, [{ z: 52 }, { x: 258 }, { z: 172.5 }, { x: 226 }, { z: 201 }, { x: 213 }]);
  const shop = await enterBuildingRoom(page, 'south-095', 'produce');
  await journal('produce-room');
  await exitBuildingRoom(page, shop.building, shop.room);

  // The tram stop's signed pole occupies the direct x=252.15 approach at
  // z≈104.13. Move below the pole, cross its x line, then return to the board.
  await walkStreet(page, [{ x: 226 }, { z: 172.5 }, { x: 258 }, { z: 100 }, { x: 252.15 }, { z: 103.45 }]);
  await rideTo(page, 'harbor-tram-lantern', 'harbor-tram-quay');
  await journal('tram-alighted');
  await walkStreet(page, [{ x: 258 }, { z: -95.5 }, { x: 200 }]);
  const workshop = await enterBuildingRoom(page, 'south-086', 'workshop');
  await journal('workshop-room');
  await exitBuildingRoom(page, workshop.building, workshop.room);

  await walkStreet(page, [{ x: 228 }, { z: -240 }, { x: 220 }, { z: -280 }]);
  const ferryNorth = await rideTo(page, 'harbor-ferry-south', 'harbor-ferry-north', { boardTolerance: 1.0, timeout: 600000 });
  await journal('ferry-north-alighted');
  await walkStreet(page, [{ z: -400 }, { z: -440 }, { x: 240 }, { z: -457 }]);
  const opposite = await enterBuildingRoom(page, 'sail-club', 'booth');
  await journal('opposite-room');
  await exitBuildingRoom(page, opposite.building, opposite.room);
  await walkStreet(page, [{ z: -440 }, { x: 220 }, { z: -400 }]);
  await rideTo(page, 'harbor-ferry-north', 'harbor-ferry-south', { boardTolerance: 1.0, timeout: 600000 });
  await journal('ferry-south-alighted');

  await walkStreet(page, [{ z: -280 }, { x: 228 }, { z: 172.5 }, { x: 201 }, { z: 201 }, { x: 187 }]);
  await walkTo(page, home.entrance, { precision: true, tolerance: .8, timeout: 240000 });
  const returned = await snapshot(page);
  expect(Math.hypot(returned.position.x - home.entrance.x, returned.position.z - home.entrance.z)).toBeLessThan(1.5);
  expect(returned.teleportRevision).toBeGreaterThan(initialRevision);
  expect(returned.city.interior.buildingId).toBeNull();
  await faceRoom(page, Math.PI);
  await page.keyboard.press('e');
  await expect.poll(async () => (await buildingState(page)).buildingId).toBe('south-093');
  await journal('returned-home-lobby');
  const returnedLobby = await buildingState(page);
  await faceRoom(page, Math.PI);
  await walkAxis(page, 'z', returnedLobby.entrance.z, { sprint: true, timeout: 120000 });
  await page.keyboard.press('e');
  await expect.poll(async () => (await buildingState(page)).buildingId).toBeNull();
  const evidence = await saveAndReload(page);
  expect(evidence.restored.city.interior.buildingId).toBeNull();
  expect(Math.hypot(evidence.restored.position.x - home.entrance.x, evidence.restored.position.z - home.entrance.z)).toBeLessThan(2.0);
  // A restored session starts a new diagnostic teleport counter, so compare
  // the safe saved pose and progress rather than counters across reload.
  expect(evidence.saved.cash).toBe(evidence.restored.cash);
  await journal('safe-save-restored');
  expect(errors).toEqual([]);

  const record = { initial: initial.position, home: home.entrance, bus: { from: 'harbor-bus-market', to: 'harbor-bus-lantern' },
    shop: shop.building.id, tram: { from: 'harbor-tram-lantern', to: 'harbor-tram-quay' }, workshop: workshop.building.id,
    ferryNorth: { vehicleId: ferryNorth.vehicleId, from: ferryNorth.from.id, to: ferryNorth.to.id }, opposite: opposite.building.id,
    ferrySouth: { from: 'harbor-ferry-north', to: 'harbor-ferry-south' }, returned: returned.position,
    restored: evidence.restored.position, savedProgress: evidence.saved, positionWrites: false, clockWrites: false };
  await info.attach('harbor-continuous-route', { body: Buffer.from(JSON.stringify(record, null, 2)), contentType: 'application/json' });
});
