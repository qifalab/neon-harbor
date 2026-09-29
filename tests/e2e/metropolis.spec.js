import { test, expect } from '@playwright/test';
import { walkRoute } from './helpers/walking.js';

// Software-GPU CI still exercises the shipped renderer and real controls.
// State reads are diagnostic only; travel uses the player-facing city atlas.
test.use({ viewport: { width: 640, height: 400 } });
test.setTimeout(240000);
const snapshot = page => page.evaluate(() => window.__NEON__.snapshot());

async function boot(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto('/');
  try { await expect(page.locator('#start')).toBeEnabled({ timeout: 60000 }); }
  catch (error) { error.message += `\nBrowser errors: ${JSON.stringify(errors)}`; throw error; }
  await page.locator('#welcome-settings').click();
  await page.locator('#quality').selectOption('low');
  await page.locator('#resume').click();
  await page.locator('#start').click();
  await expect(page.locator('#game')).toBeFocused();
  return errors;
}

async function atlas(page) {
  await page.locator('#explore-city').click();
  await expect(page.locator('#atlas-results')).toBeVisible();
}

async function visit(page, kind, id) {
  await atlas(page);
  await page.locator(`[data-visit-${kind}="${id}"]`).click();
  await expect(page.locator('#panel')).not.toBeVisible({ timeout: 30000 });
  await expect(page.locator('#game')).toBeFocused();
}

async function walk(page, keys, predicate, timeout = 45000) {
  for (const key of keys) await page.keyboard.down(key);
  try {
    await page.waitForFunction(`(${predicate.toString()})(window.__NEON__.snapshot())`, null, { polling: 'raf', timeout });
  } catch (error) {
    error.message += `\nCity diagnostics: ${JSON.stringify(await snapshot(page))}`;
    throw error;
  } finally { for (const key of keys) await page.keyboard.up(key); }
}

async function waitForLift(page) {
  const start = await snapshot(page);
  // The highest destination is the 260 m observation floor, not the new
  // 4.2 m gallery. Its ~30 simulated seconds can take 120 wall seconds on
  // a 1 FPS software GPU with the shipped 0.25 s catch-up cap.
  const timeout = Math.max(90000, (start.city.interior.elevator.duration + 3) * 4500);
  // Keep the waiting predicate in the browser; transferring the complete city
  // catalog for every poll adds work while a slow GPU is presenting the lift.
  await page.waitForFunction(() => window.__NEON__.snapshot().city.interior.moving === false, null,
    { polling: 'raf', timeout });
  const finish = await snapshot(page);
  expect(finish.simulationTime - start.simulationTime).toBeLessThan(start.city.interior.elevator.duration + 3);
}

test('city atlas exposes all 48 addresses and fetches and evicts real north-shore detail', async ({ page }) => {
  const chunks = [];
  page.on('response', response => { if (/\/assets\/metropolis\/chunks\/[^/]+\.json/.test(response.url())) chunks.push(response); });
  const errors = await boot(page);
  expect((await snapshot(page)).city.buildings).toHaveLength(48);
  await atlas(page);
  await expect(page.locator('[data-building-id]')).toHaveCount(48);
  expect(new Set(await page.locator('[data-building-id]').evaluateAll(nodes => nodes.map(node => node.dataset.buildingId))).size).toBe(48);
  await page.locator('#atlas-district').selectOption('oldtown');
  await expect(page.locator('[data-building-id]')).toHaveCount(8);
  await page.locator('#atlas-district').selectOption('');
  await page.locator('#atlas-search').fill('Apex');
  await expect(page.locator('[data-building-id]')).toHaveCount(1);
  await expect(page.locator('[data-building-id="apex-tower"]')).toBeVisible();
  await page.locator('#atlas-search').fill('');
  await page.locator('[data-visit-building="tide-museum"]').click();
  await expect(page.locator('#panel')).not.toBeVisible();
  const first = (await snapshot(page)).city.streaming;
  expect(first.ready).toBe(true);
  expect(first.loaded).toBeGreaterThan(0);
  await expect(page.locator('#interaction')).toContainText('进入 潮汐海事博物馆');
  await page.screenshot({ path: 'test-results/screenshots/08-north-waterfront.png' });
  await visit(page, 'building', 'harbour-labs');
  await page.waitForFunction(() => {
    const s = window.__NEON__.snapshot().city.streaming;
    return s.pending === 0 && s.unloaded > 0 && s.targetChunks.every(id => s.activeChunks.includes(id));
  }, null, { polling: 'raf', timeout: 30000 });
  const final = (await snapshot(page)).city.streaming;
  expect(final.failed).toBe(0);
  expect(final.loaded).toBeLessThanOrEqual(final.maxResidentChunks);
  expect(final.requested).toBeGreaterThan(first.requested);
  expect(final.disposedInstances).toBeGreaterThan(0);
  expect(first.activeChunks.some(id => !final.activeChunks.includes(id))).toBe(true);
  expect(chunks.length).toBeGreaterThan(1);
  for (const response of chunks) { expect(response.status()).toBe(200); expect((await response.body()).byteLength).toBeGreaterThan(0); }
  await page.keyboard.press('m');
  await expect(page.locator('#city-map')).toBeVisible();
  expect((await snapshot(page)).paused).toBe(true);
  await page.screenshot({ path: 'test-results/screenshots/09-two-shores-map.png' });
  expect(errors).toEqual([]);
});

for (const id of ['tide-museum', 'apex-tower', 'camellia-court']) {
  test(`${id}: ${id === 'apex-tower' ? 'ride to a high floor and travel back to the street' : 'walk through the lobby, ride the elevator, return to the street'}`, async ({ page }) => {
    if (id === 'apex-tower') test.setTimeout(300000);
    const errors = await boot(page);
    await visit(page, 'building', id);
    await page.keyboard.press('e');
    await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBe(id);
    const lobby = (await snapshot(page)).city.interior;
    expect(lobby.floorId).toBe('lobby');
    expect(lobby.furnitureCount).toBeGreaterThan(12);
    expect(lobby.activeFloors).toBe(3);
    await walk(page, ['w', 'Shift'], s => Math.abs(s.position.z - s.city.interior.cabin.z) < 1.2);
    await page.keyboard.press('e');
    await expect(page.locator('[data-floor-id]')).toHaveCount(4);
    const floor = id === 'camellia-court' ? 'gallery' : 'observation';
    await page.locator(`[data-floor-id="${floor}"]`).click();
    await expect.poll(async () => (await snapshot(page)).city.interior.moving).toBe(true);
    const startY = lobby.elevator.y;
    await page.waitForFunction(() => {
      const s = window.__NEON__.snapshot();
      return s.city.interior.moving && s.city.interior.elevator.phase === 'moving' && s.position.y > 2;
    }, null, { polling: 'raf', timeout: 30000 });
    expect((await snapshot(page)).position.y).toBeGreaterThan(startY);
    await waitForLift(page);
    const arrived = (await snapshot(page)).city.interior;
    expect(arrived.floorId).toBe(floor);
    expect(arrived.elevator.doorOpen).toBe(1);
    expect(arrived.activeFloors).toBe(floor === 'observation' ? 1 : 3);
    if (id === 'apex-tower') expect((await snapshot(page)).position.y).toBeGreaterThan(250);
    // Leave the cabin into the furnished destination, then walk back to return.
    await walk(page, ['s'], s => s.position.z > s.city.interior.cabin.z + 10);
    await page.screenshot({ path: `test-results/screenshots/10-${id}-interior.png` });
    if (id === 'apex-tower') {
      // The museum and residence cover complete lift round trips. This tall
      // tower covers the distinct case of leaving an upper floor via the atlas.
      await visit(page, 'building', 'tide-museum');
      const outside = await snapshot(page);
      expect(outside.city.interior.buildingId).toBeNull();
      expect(outside.cars.length).toBeGreaterThan(0);
      expect(outside.position.x).toBe(-560);
      expect(outside.position.z).toBe(-455);
      expect(errors).toEqual([]);
      return;
    }
    await walk(page, ['w'], s => Math.abs(s.position.z - s.city.interior.cabin.z) < 1.2);
    await page.keyboard.press('e');
    await page.locator('[data-floor-id="lobby"]').click();
    await waitForLift(page);
    expect((await snapshot(page)).city.interior.floorId).toBe('lobby');
    await walk(page, ['s', 'Shift'], s => Math.abs(s.position.z - s.city.interior.entrance.z) < 1.1);
    await page.keyboard.press('e');
    await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBeNull();
    expect((await snapshot(page)).cars.length).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

for (const journey of [
  { route: 'metro', from: 'metro-old', to: 'metro-quay', boardZ: 250, exitZ: -409 },
  { route: 'ferry', from: 'ferry-south', to: 'ferry-north', boardZ: -310, exitZ: -394 },
]) {
  test(`${journey.route}: wait, board, travel and alight using public controls`, async ({ page }) => {
    // v0.4's teleport entrances left about 25 m of platform walking. The real
    // metro stair routes now cover 110 m, about 85 m more plus landing checks.
    // Allocate that added route 120 s; all independent service and walking
    // limits stay unchanged, and the ferry retains its original total budget.
    test.setTimeout(journey.route === 'metro' ? 480000 : 360000);
    const errors = await boot(page);
    await visit(page, 'stop', journey.from);
    if (journey.route === 'metro') {
      const station = (await snapshot(page)).city.transit.stops.find(stop => stop.id === journey.from);
      expect(station.walkable).toBe(true);
      expect(station.access.kind).toBe('walkable-stairs');
      const samples = await walkRoute(page, station.access.waypoints);
      expect(samples.some(sample => sample.position.y < -2.75 && sample.position.y > -4.25)).toBe(true);
      expect(samples.some(sample => sample.position.y < -9.75 && sample.position.y > -11.25)).toBe(true);
    } else await page.keyboard.press('e');
    await expect.poll(async () => (await snapshot(page)).city.transit.currentStop).toBe(journey.from);
    const waiting = await snapshot(page);
    await page.waitForFunction(({ from, route }) => window.__NEON__.snapshot().city.transit.vehicles.some(v => v.routeId === route && v.stopId === from && v.remaining > 4), journey, { polling: 'raf', timeout: 90000 });
    expect((await snapshot(page)).simulationTime - waiting.simulationTime).toBeLessThan(17);
    await page.keyboard.press('e');
    await expect.poll(async () => (await snapshot(page)).city.transit.riding).toBe(true);
    const boarded = await snapshot(page);
    await page.waitForFunction(() => {
      const s = window.__NEON__.snapshot().city.transit;
      return s.vehicles.find(v => v.id === s.ridingVehicleId)?.stopId === null;
    }, null, { polling: 'raf', timeout: 60000 });
    expect((await snapshot(page)).simulationTime - boarded.simulationTime).toBeLessThan(11);
    // Leaving a moving vehicle must preserve the passenger; no mid-water exit.
    await page.keyboard.press('e');
    expect((await snapshot(page)).city.transit.riding).toBe(true);
    await page.screenshot({ path: `test-results/screenshots/11-${journey.route}-riding.png` });
    await page.waitForFunction(to => {
      const s = window.__NEON__.snapshot().city.transit;
      return s.vehicles.find(v => v.id === s.ridingVehicleId)?.stopId === to;
    }, journey.to, { polling: 'raf', timeout: 120000 });
    const arrived = await snapshot(page);
    expect(Math.hypot(arrived.position.x - boarded.position.x, arrived.position.z - boarded.position.z)).toBeGreaterThan(journey.route === 'metro' ? 600 : 45);
    await page.keyboard.press('e');
    await expect.poll(async () => (await snapshot(page)).city.transit.riding).toBe(false);
    expect((await snapshot(page)).city.transit.currentStop).toBe(journey.to);
    await page.screenshot({ path: `test-results/screenshots/11-${journey.route}-arrival.png` });
    if (journey.route === 'metro') {
      const station = (await snapshot(page)).city.transit.stops.find(stop => stop.id === journey.to);
      // Clear the physical entrance's activation band, not just its center:
      // the bounded walking tolerance can legitimately stop inside that band.
      await walkRoute(page, [...station.access.waypoints].reverse().concat(station.streetExit));
      expect((await snapshot(page)).position.y).toBeCloseTo(0, 1);
    } else {
      await walk(page, ['w'], s => s.position.z < -392);
      await page.keyboard.press('e');
    }
    await expect.poll(async () => (await snapshot(page)).city.transit.currentStop).toBeNull();
    expect((await snapshot(page)).city.transit.boardingState).toBe('street');
    expect(errors).toEqual([]);
  });
}
