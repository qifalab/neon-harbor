import { test, expect } from '@playwright/test';
import { snapshot, walkAxis, walkRoute, stairWalkingRoute } from './helpers/walking.js';

// The default-quality panorama and the physical stair route are separate gates.
// Every relocation uses visible product controls; diagnostics never write state.
test.use({ viewport: { width: 800, height: 500 } });
test.setTimeout(360000);

async function boot(page, { low = false } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto('/');
  await expect(page.locator('#harbor-start')).toBeEnabled({ timeout: 90000 });
  if (low) {
    await page.locator('#welcome-settings').click();
    await page.locator('#quality').selectOption('low');
    await page.locator('#resume').click();
  }
  return errors;
}

async function capture(page, testInfo, name) {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, timeout: 90000 });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function visit(page, kind, id) {
  await page.locator('#explore-city').click();
  await expect(page.locator('#atlas-results')).toBeVisible();
  await page.locator(`[data-visit-${kind}="${id}"]`).click();
  await expect(page.locator('#panel')).not.toBeVisible({ timeout: 45000 });
  await expect(page.locator('#game')).toBeFocused();
}


test('the primary start reaches a walkable harbor panorama in default high quality, with day and night views', async ({ page }, testInfo) => {
  const errors = await boot(page);
  expect((await snapshot(page)).settings.quality).toBe('high');
  await capture(page, testInfo, 'harbor-realism-menu-high');
  await page.locator('#harbor-start').click();
  await expect(page.locator('#welcome')).not.toBeVisible({ timeout: 90000 });
  await expect.poll(async () => (await snapshot(page)).position.x).toBeCloseTo(285.5, 1);
  await expect(page.locator('#game')).toBeFocused();
  await expect.poll(async () => (await snapshot(page)).camera?.boomLength).toBe(0);
  const start = await snapshot(page), harbor = start.city.harbor;
  expect(start.settings.firstPerson).toBe(true);
  expect(start.settings.quality).toBe('high');
  expect(harbor.quality).toBe('high');
  expect(harbor.scenicOppositeShore).toBe(false);
  expect(harbor.landmarkTowers).toBe(40);
  expect(harbor.neighborhoodBuildings).toBeGreaterThanOrEqual(30);
  expect(harbor.towers).toBe(harbor.landmarkTowers + harbor.neighborhoodBuildings);
  expect(harbor.permanentTowers, 'distant buildings stay present without a detail chunk').toBe(harbor.towers);
  for (const id of ['pearl-spire', 'cloud-sail', 'triangular-exchange']) expect(harbor.towerIds).toContain(id);
  expect(harbor.maximumRoofHeight).toBeGreaterThan(350);
  expect(start.camera.position.y - start.position.y).toBeCloseTo(1.62, 1);
  expect(start.camera.target.x).toBeGreaterThan(start.camera.position.x + 8);
  expect(start.renderer.calls).toBeGreaterThan(0);
  expect(start.renderer.triangles).toBeGreaterThan(0);
  // Walking along the same real boardwalk changes the rendered position while
  // retaining ground support and the high-quality panorama; no photo backdrop.
  await walkAxis(page, 'z', start.position.z - 10);
  const walked = await snapshot(page);
  expect(Math.abs(walked.position.y - start.position.y)).toBeLessThan(.3);
  expect(Math.abs(walked.position.x - start.position.x)).toBeLessThan(.4);
  expect(walked.teleportRevision).toBe(start.teleportRevision);
  await capture(page, testInfo, 'harbor-realism-day-high');

  await page.locator('#explore-city').click();
  await expect(page.locator('[data-visit-viewpoint]')).toHaveCount(3);
  expect(start.city.buildings.filter(building => !['south-expansion', 'east-expansion'].includes(building.district))).toHaveLength(48);
  expect(start.city.buildings.filter(building => building.district === 'south-expansion')).toHaveLength(96);
  expect(start.city.buildings.filter(building => building.district === 'east-expansion')).toHaveLength(76);
  await expect(page.locator('[data-building-id]')).toHaveCount(start.city.buildings.length);
  await expect(page.locator('#panel-content')).toContainText('共享');
  await page.locator('[data-tab="settings"]').click();
  // A real range-input keypress selects late night through the settings UI.
  await page.locator('#time').press('End');
  await page.locator('#resume').click();
  await expect.poll(async () => (await snapshot(page)).city.harbor.night).toBeGreaterThan(.8);
  expect((await snapshot(page)).settings.quality).toBe('high');
  await capture(page, testInfo, 'harbor-realism-night-high');
  expect(errors).toEqual([]);
});

test('a visitor walks both physical stair flights into a furnished third-floor workshop and returns to the street', async ({ page }, testInfo) => {
  // Match the other functional suites; the separate panorama gate stays High.
  await page.setViewportSize({ width: 640, height: 400 });
  const errors = await boot(page, { low: true });
  await page.locator('#start').click();
  await expect(page.locator('#game')).toBeFocused();
  await visit(page, 'building', 'tide-museum');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBe('tide-museum');
  const entered = await snapshot(page), lobby = entered.city.interior;
  expect(lobby.floorId).toBe('lobby');
  expect(lobby.activeFloors).toBe(3);
  expect(lobby.stairs).toHaveLength(lobby.totalFloors - 1);
  const [lower, upper] = lobby.stairs;
  expect(lower.fromFloorId).toBe('lobby');
  expect(lower.toFloorId).toBe('gallery');
  expect(upper.fromFloorId).toBe('gallery');
  expect(upper.toFloorId).toBe('workplace');
  expect(lower.width).toBeGreaterThanOrEqual(2.8);
  const lowerWalk = stairWalkingRoute(lower, lobby.entrance.x), upperWalk = stairWalkingRoute(upper, lobby.entrance.x);

  await walkRoute(page, [{ ...lowerWalk.bottom, x: lobby.entrance.x }, lowerWalk.bottom, lowerWalk.middle, lowerWalk.top]);
  await expect.poll(async () => (await snapshot(page)).city.interior.floorId).toBe('gallery');
  expect((await snapshot(page)).city.interior.moving).toBe(false);
  await capture(page, testInfo, 'harbor-realism-second-floor-stair');
  await walkRoute(page, [...lowerWalk.bypass, upperWalk.bottom, upperWalk.middle, upperWalk.top]);
  await expect.poll(async () => (await snapshot(page)).city.interior.floorId).toBe('workplace');
  const third = (await snapshot(page)).city.interior;
  expect(third.floorName).toContain('研习');
  expect(third.roomCount).toBe(4);
  expect(third.furnitureCount).toBeGreaterThan(12);
  expect(third.activeFloors).toBe(3);
  const room = third.rooms.find(room => room.type === 'workshop');
  expect(room, 'third-floor learning space has a real furnished restoration workshop').toBeTruthy();
  expect(room.entrance).toBeTruthy();
  expect(room.arrival).toBeTruthy();
  // Leave the stair opening via its landing, then use the actual central aisle
  // and room doorway. A valid room record alone cannot pass this route.
  await walkRoute(page, [upperWalk.bypass[0]]);
  await walkAxis(page, 'z', room.entrance.z);
  await walkAxis(page, 'x', room.arrival.x);
  await walkAxis(page, 'z', room.arrival.z);
  const inRoom = await snapshot(page);
  expect(inRoom.city.interior.currentRoomId).toBe(room.id);
  expect(inRoom.position.y).toBeCloseTo(8.4, 1);
  expect(inRoom.teleportRevision).toBe(entered.teleportRevision);
  await capture(page, testInfo, 'harbor-realism-third-floor-workshop');

  await walkAxis(page, 'z', room.entrance.z);
  await walkAxis(page, 'x', lobby.entrance.x);
  await walkRoute(page, [upperWalk.bypass[0], upperWalk.top, upperWalk.middle, upperWalk.bottom]);
  await expect.poll(async () => (await snapshot(page)).city.interior.floorId).toBe('gallery');
  await walkRoute(page, [...lowerWalk.bypass].reverse().concat([lowerWalk.top, lowerWalk.middle, lowerWalk.bottom]));
  await expect.poll(async () => (await snapshot(page)).city.interior.floorId).toBe('lobby');
  const returned = await snapshot(page);
  expect(returned.teleportRevision).toBe(entered.teleportRevision);
  expect(returned.city.interior.moving).toBe(false);
  await walkAxis(page, 'x', lobby.entrance.x);
  await walkAxis(page, 'z', lobby.entrance.z);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBeNull();
  expect((await snapshot(page)).cars.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
