import { test, expect } from '@playwright/test';

// Player-facing menus, keys and walking provide every transition. Diagnostics
// are read-only: room entrances never become teleport targets in this suite.
test.use({ viewport: { width: 640, height: 400 } });
test.setTimeout(360000);
const snapshot = page => page.evaluate(() => window.__NEON__.snapshot());

async function boot(page, { low = false } = {}) {
  const errors = [], materials = new Set();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    if (response.ok() && /\/assets\/materials\/v04\/.+\.webp/.test(response.url())) materials.add(response.url().split('/').pop());
  });
  await page.goto('/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 });
  if (low) {
    await page.locator('#welcome-settings').click();
    await page.locator('#quality').selectOption('low');
    await page.locator('#resume').click();
  }
  await page.locator('#start').click();
  await expect(page.locator('#game')).toBeFocused();
  return { errors, materials };
}

async function visit(page, kind, id) {
  await page.locator('#explore-city').click();
  await expect(page.locator('#atlas-results')).toBeVisible();
  await page.locator(`[data-visit-${kind}="${id}"]`).click();
  await expect(page.locator('#panel')).not.toBeVisible({ timeout: 45000 });
  await expect(page.locator('#game')).toBeFocused();
}

async function moveAxis(page, axis, target, { sprint = false } = {}) {
  const before = await snapshot(page), start = before.position[axis];
  if (Math.abs(start - target) < .4) return;
  sprint = sprint && Math.abs(start - target) > 8;
  // Building entrances reset the camera to face north. Strafe keeps that view
  // fixed, allowing a real L-shaped route via the clear central aisle.
  const positive = target > start;
  const key = axis === 'z' ? positive ? 's' : 'w' : positive ? 'd' : 'a';
  if (sprint) await page.keyboard.down('Shift');
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(({ axis, target, positive, margin }) => {
      const value = window.__NEON__.snapshot().position[axis];
      return positive ? value >= target - margin : value <= target + margin;
    }, { axis, target, positive, margin: sprint ? 3 : .35 }, { polling: 'raf', timeout: 90000 });
  } catch (error) {
    error.message += `\nRoom walk diagnostics: ${JSON.stringify(await snapshot(page))}`;
    throw error;
  } finally { await page.keyboard.up(key); if (sprint) await page.keyboard.up('Shift'); }
  // Finish door/elevator approaches at walking pace, even when a software-GPU
  // frame contains several fixed simulation steps of sprinting.
  if (sprint) await moveAxis(page, axis, target);
  const after = await snapshot(page);
  expect(after.simulationTime - before.simulationTime).toBeLessThan(Math.abs(start - target) / 5.6 + 3);
  expect(Math.abs(after.position[axis] - target)).toBeLessThan(1.2);
  expect(after.teleportRevision).toBe(before.teleportRevision);
}

async function takeLift(page, floorId) {
  await page.keyboard.press('e');
  await expect(page.locator(`[data-floor-id="${floorId}"]`)).toBeEnabled();
  await page.locator(`[data-floor-id="${floorId}"]`).click();
  await expect.poll(async () => (await snapshot(page)).city.interior.moving).toBe(true);
  const moving = await snapshot(page);
  await expect.poll(async () => (await snapshot(page)).city.interior.moving, { timeout: 90000 }).toBe(false);
  const arrived = await snapshot(page);
  expect(arrived.city.interior.floorId).toBe(floorId);
  expect(arrived.city.interior.elevator.doorOpen).toBe(1);
  expect(arrived.simulationTime - moving.simulationTime).toBeLessThan(moving.city.interior.elevator.duration + 3);
}

async function capture(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, timeout: 90000 });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

test('a resident rides to a furnished bedroom, walks through its doorway, and returns to the street', async ({ page }, testInfo) => {
  const { errors } = await boot(page, { low: true });
  await visit(page, 'building', 'camellia-court');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBe('camellia-court');
  const entered = await snapshot(page), lobby = entered.city.interior;
  expect(lobby.floorId).toBe('lobby');
  await moveAxis(page, 'z', lobby.cabin.z, { sprint: true });
  await takeLift(page, 'gallery');
  const floor = (await snapshot(page)).city.interior;
  expect(floor.roomCount).toBe(4);
  const room = floor.rooms.find(room => room.type === 'bedroom');
  expect(room, 'the residential upper floor has an actual furnished bedroom').toBeTruthy();
  expect(room.name).toContain('卧');
  expect(room.enclosed).toBe(true);
  expect(room.width).toBeLessThanOrEqual(10);
  expect(room.depth).toBeLessThanOrEqual(10);
  expect(room.entrance).toBeTruthy();
  expect(room.arrival).toBeTruthy();
  // First align with the real door, then pass through it. This exposes a blocked
  // doorway even if the directory and furniture metadata are perfectly valid.
  await moveAxis(page, 'z', room.entrance.z, { sprint: true });
  await moveAxis(page, 'x', room.arrival.x);
  await moveAxis(page, 'z', room.arrival.z);
  const inside = await snapshot(page);
  expect(Math.abs(inside.position.x - room.x)).toBeLessThan(room.width / 2);
  expect(Math.abs(inside.position.z - room.z)).toBeLessThan(room.depth / 2);
  const targetFloor = inside.city.buildings.find(building => building.id === 'camellia-court').floors.find(floor => floor.id === 'gallery');
  expect(inside.position.y).toBeCloseTo(targetFloor.y, 1);
  expect(inside.city.interior.currentRoomId).toBe(room.id);
  expect(inside.city.interior.activeFloors).toBe(3);
  await capture(page, testInfo, 'living-city-camellia-bedroom');

  await moveAxis(page, 'z', room.entrance.z);
  await moveAxis(page, 'x', floor.entrance.x);
  await moveAxis(page, 'z', floor.cabin.z, { sprint: true });
  await takeLift(page, 'lobby');
  await moveAxis(page, 'z', lobby.entrance.z, { sprint: true });
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBeNull();
  expect((await snapshot(page)).cars.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('default high quality loads crafted materials and exposes walk-in viewing and real infrastructure entrances', async ({ page }, testInfo) => {
  const { errors, materials } = await boot(page);
  expect((await snapshot(page)).settings.quality).toBe('high');
  await visit(page, 'building', 'tide-museum');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBe('tide-museum');
  const floor = (await snapshot(page)).city.interior;
  expect(floor.floorName).toContain('潮');
  expect(floor.rooms.some(room => room.type === 'maritime')).toBe(true);
  await page.keyboard.press('v');
  await expect(page.locator('#view-toggle')).toHaveAttribute('aria-pressed', 'true');
  // Switching view resets the rig immediately; the next actual render frame
  // supplies its new pose, so a transient null snapshot is expected here.
  await expect.poll(async () => (await snapshot(page)).camera?.boomLength).toBe(0);
  const eye = await snapshot(page);
  expect(eye.settings.firstPerson).toBe(true);
  expect(eye.camera.position.y - eye.position.y).toBeCloseTo(1.62, 1);
  expect(eye.renderer.calls).toBeGreaterThan(0);
  expect(eye.renderer.triangles).toBeGreaterThan(0);
  await expect.poll(() => materials.size).toBeGreaterThanOrEqual(3);
  for (const name of ['weathered-plaster.webp', 'aggregate-asphalt.webp', 'woven-linen.webp']) expect(materials.has(name), name).toBe(true);
  await capture(page, testInfo, 'living-city-museum-high-walking-view');
  // Both keyboard and visible button must leave the player in the same mode.
  await page.locator('#view-toggle').click();
  await expect(page.locator('#view-toggle')).toHaveAttribute('aria-pressed', 'false');
  expect((await snapshot(page)).settings.firstPerson).toBe(false);

  await page.locator('#explore-city').click();
  await expect(page.locator('[data-visit-landmark]')).toHaveCount(3);
  for (const id of ['west-link', 'east-link', 'victoria-freight']) await expect(page.locator(`[data-visit-landmark="${id}"]`)).toBeVisible();
  await page.locator('[data-visit-landmark="victoria-freight"]').click();
  await expect(page.locator('#panel')).not.toBeVisible({ timeout: 45000 });
  const outside = await snapshot(page);
  expect(outside.city.interior.buildingId).toBeNull();
  expect(outside.position.x).toBe(-620);
  expect(outside.position.z).toBe(-415);
  expect(outside.position.y).toBeCloseTo(0, 1);
  expect(outside.settings.quality).toBe('high');
  expect(errors).toEqual([]);
});
