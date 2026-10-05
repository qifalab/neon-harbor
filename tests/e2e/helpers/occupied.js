import { expect } from '@playwright/test';
import { snapshot, walkAxis } from './walking.js';

export async function bootOccupied(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto('/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 });
  await page.locator('#welcome-settings').click();
  await page.locator('#quality').selectOption('low');
  await page.locator('#cycle').uncheck();
  await page.locator('#resume').click();
  await page.locator('#start').click();
  await expect(page.locator('#game')).toBeFocused();
  await page.keyboard.press('v');
  expect((await snapshot(page)).settings.firstPerson).toBe(true);
  return errors;
}

export async function enterAddress(page, id) {
  await page.locator('#explore-city').click();
  await expect(page.locator('#atlas-results')).toBeVisible();
  await page.locator(`[data-visit-building="${id}"]`).click();
  await expect(page.locator('#panel')).not.toBeVisible({ timeout: 45000 });
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBe(id);
}

export async function chooseStorey(page, id, { walkingTimeout = 60000, arrivalTimeout = 180000 } = {}) {
  const before = await snapshot(page);
  if (before.city.interior.floorId === id) return before.city.interior;
  await walkAxis(page, 'x', before.city.interior.cabin.x, { timeout: walkingTimeout });
  await walkAxis(page, 'z', before.city.interior.cabin.z, { sprint: true, timeout: walkingTimeout });
  await page.keyboard.press('e');
  await expect(page.locator('[data-floor-id]')).toHaveCount(before.city.interior.totalFloors);
  await page.locator(`[data-floor-id="${id}"]`).click();
  const rideStarted = Date.now();
  try {
    await page.waitForFunction(() => !window.__NEON__.snapshot().city.interior.moving, null,
      { polling: 'raf', timeout: arrivalTimeout });
  } catch (error) {
    // Read progress after the original failure. A diagnostic failure must not
    // replace the timeout or turn an unfinished physical ride into a pass.
    try {
      const failed = await snapshot(page);
      error.message += `\nElevator arrival diagnostics: ${JSON.stringify({ targetFloorId: id,
        wallMilliseconds: Date.now() - rideStarted, position: failed.position,
        simulationTime: failed.simulationTime, timing: failed.timing,
        elevator: failed.city.interior.elevator, moving: failed.city.interior.moving })}`;
    } catch (diagnosticError) {
      error.message += `\nSecondary elevator diagnostic error: ${diagnosticError.message}`;
    }
    throw error;
  }
  const arrived = await snapshot(page);
  expect(arrived.city.interior.floorId).toBe(id);
  expect(arrived.city.interior.activeFloors).toBe(3);
  expect(arrived.city.interior.elevator.doorOpen).toBe(1);
  expect(arrived.simulationTime - before.simulationTime).toBeLessThan(60);
  return arrived.city.interior;
}

export async function faceRoom(page, yaw) {
  await page.waitForFunction(() => Number.isFinite(window.__NEON__.snapshot().camera?.yaw), null,
    { polling: 'raf', timeout: 30000 });
  const current = await page.evaluate(() => window.__NEON__.snapshot().camera.yaw);
  const delta = Math.atan2(Math.sin(yaw - current), Math.cos(yaw - current));
  if (Math.abs(delta) < .003) return;
  const canvas = await page.locator('#game').boundingBox();
  const x = canvas.x + canvas.width * .86, y = canvas.y + canvas.height * .3;
  await page.mouse.move(x, y); await page.mouse.down();
  // One ordinary pointer drag supplies the target. The shipped camera still
  // eases to it; many redundant protocol moves make software-GPU photography
  // spend seconds on identical intermediate cursor events.
  await page.mouse.move(x - delta / .005, y); await page.mouse.up();
  await page.waitForFunction(yaw => {
    const actual = window.__NEON__.snapshot().camera.yaw;
    return Math.abs(Math.atan2(Math.sin(actual - yaw), Math.cos(actual - yaw))) < .003;
  }, yaw, { polling: 'raf', timeout: 15000 });
}

export async function enterRoom(page, room, corridorX, { doorwayView = false } = {}) {
  await faceRoom(page, Math.PI);
  await walkAxis(page, 'x', corridorX, { timeout: 120000 });
  await walkAxis(page, 'z', room.entrance.z, { sprint: true, timeout: 120000 });
  // A small kitchen's chairs can require a turn after entry. Photograph from
  // the clear doorway instead of demanding a straight walk through furniture.
  const arrivalX = doorwayView && room.enclosed && room.width <= 10
    ? room.entrance.x + Math.sign(room.x - corridorX) * 1.6 : room.arrival.x;
  await walkAxis(page, 'x', arrivalX, { timeout: 120000 });
  await walkAxis(page, 'z', room.arrival.z, { timeout: 120000 });
  expect((await snapshot(page)).city.interior.currentRoomId).toBe(room.id);
  if (!doorwayView) await faceRoom(page, Math.sign(room.x - corridorX) * (Math.PI / 2 - .28));
}

export async function leaveRoom(page, room, corridorX) {
  await faceRoom(page, Math.PI);
  await walkAxis(page, 'z', room.entrance.z, { timeout: 120000 });
  await walkAxis(page, 'x', corridorX, { timeout: 120000 });
}


/** Frame narrow rooms from a real doorway viewpoint. Their usual arrival
 * point can lie beyond the centre, so looking back at it faces the corridor. */
export async function frameOccupiedRoom(page, room, corridorX) {
  const side = Math.sign(room.x - corridorX);
  if (room.enclosed && room.width <= 10) {
    await faceRoom(page, Math.PI);
    await walkAxis(page, 'x', room.entrance.x + side * 1.6, { timeout: 120000 });
  }
  const state = await snapshot(page), pose = state.position;
  expect(state.city.interior.currentRoomId).toBe(room.id);
  const depth = side * (pose.x - room.entrance.x);
  const targetX = room.entrance.x + side * Math.max(room.width / 2, depth + 1.5);
  await faceRoom(page, Math.atan2(targetX - pose.x, room.z - pose.z));
}
