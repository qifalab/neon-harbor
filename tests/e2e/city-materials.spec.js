import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { snapshot, walkAxis } from './helpers/walking.js';
import { chooseStorey, enterRoom, leaveRoom, frameOccupiedRoom, faceRoom } from './helpers/occupied.js';

// Every movement uses ordinary keys and the public menus. Catalog positions
// describe the route; they are never assigned to the player or retried on failure.
test.use({ viewport: { width: 640, height: 400 }, trace: 'off' });
test.setTimeout(600000);

async function boot(page, quality = 'low') {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto('/');
  await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 });
  expect((await snapshot(page)).settings.quality).toBe('high');
  await page.locator('#welcome-settings').click();
  if (quality !== 'high') await page.locator('#quality').selectOption(quality);
  await page.locator('#cycle').uncheck();
  await page.locator('#resume').click();
  await page.locator('#start').click();
  await expect(page.locator('#game')).toBeFocused();
  if (!(await snapshot(page)).settings.firstPerson) await page.keyboard.press('v');
  return errors;
}

async function enter(page, id) {
  await page.locator('#explore-city').click();
  await expect(page.locator('#atlas-results')).toBeVisible();
  const building = (await snapshot(page)).city.buildings.find(item => item.id === id);
  expect(building).toBeTruthy();
  await page.locator(`[data-visit-building="${id}"]`).click();
  await expect(page.locator('#panel')).not.toBeVisible({ timeout: 45000 });
  await expect(page.locator('#interaction')).toContainText(`进入 ${building.name}`);
  const doorstep = await snapshot(page);
  expect(doorstep.position.x).toBeCloseTo(building.entrance.x, 1);
  expect(doorstep.position.z).toBeCloseTo(building.entrance.z, 1);
  expect(doorstep.position.y).toBeCloseTo(building.entrance.y || 0, 1);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBe(id);
  const indoors = await snapshot(page);
  expect(indoors.city.interior.floorId).toBe(building.floors[0].id);
  if (building.district === 'south-expansion') expect(indoors.city.exterior.southInteriorId).toBe(building.shellId);
  if (building.district === 'east-expansion') {
    expect(indoors.city.exterior.harborInteriorId).toBe(building.shellId);
    expect(indoors.city.harbor.hiddenShells).toBe(1);
  }
  return building;
}

async function quality(page, value) {
  await page.keyboard.press('Escape');
  await page.locator('[data-tab="settings"]').click();
  await page.locator('#quality').selectOption(value);
  await page.locator('#resume').click();
  await expect.poll(async () => (await snapshot(page)).settings.quality).toBe(value);
}

// The shipped Z key keeps real-time keyboard steps under 0.2 m even when a
// software-rendered frame reaches the 250 ms simulation catch-up limit.
const precisionWalkAxis = (page, axis, target) => walkAxis(page, axis, target,
  { precision: true, tolerance: .18, timeout: 90000 });

async function captureHigh(page, info, name) {
  const before = await snapshot(page);
  const viewport = page.viewportSize();
  if (viewport.width !== 640 || viewport.height !== 400) await page.setViewportSize({ width: 640, height: 400 });
  if (before.settings.quality !== 'high') await quality(page, 'high');
  await page.waitForFunction(() => window.__NEON__.snapshot().renderer.triangles > 0);
  const pixels = await page.locator('#game').evaluate(canvas => {
    const gl = canvas.getContext('webgl2');
    return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, lost: gl.isContextLost(), error: gl.getError() };
  });
  expect(pixels).toEqual({ width: 640, height: 400, lost: false, error: 0 });
  const file = info.outputPath(`${name}.png`);
  await page.screenshot({ path: file, timeout: 90000 });
  await info.attach(name, { path: file, contentType: 'image/png' });
  const state = await snapshot(page);
  expect(state.renderer.contactOcclusion.enabled).toBe(true);
  expect(state.renderer.contactOcclusion.passes).toBe(3);
  expect(state.renderer.contactOcclusion.fallback).toBeNull();
  const poseFile = info.outputPath(`${name}-pose.json`);
  await writeFile(poseFile, JSON.stringify({ position: state.position, camera: state.camera,
    hour: state.settings.hour, quality: state.settings.quality, pixels, room: state.city.interior.currentRoomId }, null, 2));
  await info.attach(`${name}-pose`, { path: poseFile, contentType: 'application/json' });
  if (before.settings.quality !== 'high') await quality(page, before.settings.quality);
  if (viewport.width !== 640 || viewport.height !== 400) await page.setViewportSize(viewport);
}

async function exitToStreet(page, building) {
  await faceRoom(page, Math.PI);
  const inside = (await snapshot(page)).city.interior;
  const walk = building.compact ? precisionWalkAxis : walkAxis;
  expect(inside.floorId).toBe(building.floors[0].id);
  if (building.compact && Math.abs((await snapshot(page)).position.z - inside.cabin.z) < 2)
    await walk(page, 'z', inside.cabin.doorZ + 1.05);
  await walk(page, 'x', inside.entrance.x);
  await walk(page, 'z', inside.entrance.z, { sprint: true });
  await expect(page.locator('#interaction')).toContainText('返回街道');
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBeNull();
  const outside = await snapshot(page);
  expect(outside.city.exterior).toEqual({ southInteriorId: null, harborInteriorId: null });
  expect(outside.city.harbor.hiddenShells).toBe(0);
  expect(outside.position.y).toBeCloseTo(building.entrance.y || 0, 1);
  expect(outside.cars.length).toBeGreaterThan(0);
  // Moving clear of the doorway checks the restored outdoor collision context.
  await walkAxis(page, 'z', outside.position.z + 3);
}

test('a northern home renders its furnished bedroom in High and survives quality changes at the same pose', async ({ page }, info) => {
  const errors = await boot(page);
  const building = await enter(page, 'camellia-court');
  const floor = await chooseStorey(page, building.floors[1].id);
  const room = floor.rooms.find(item => item.type === 'bedroom');
  expect(room).toBeTruthy();
  await enterRoom(page, room, building.x, { doorwayView: true });
  await frameOccupiedRoom(page, room, building.x);
  await captureHigh(page, info, 'north-bedroom-high');
  const before = await snapshot(page);
  for (const value of ['balanced', 'high', 'low']) {
    await quality(page, value);
    await page.waitForFunction(() => window.__NEON__.snapshot().renderer.triangles > 0);
    const after = await snapshot(page);
    expect(after.city.interior.currentRoomId).toBe(room.id);
    expect(after.position).toEqual(before.position);
    expect(after.settings.hour).toBe(before.settings.hour);
    expect(after.renderer.contactOcclusion.enabled).toBe(value !== 'low');
    expect(after.renderer.contactOcclusion.passes).toBe(value === 'low' ? 1 : 3);
    expect(await page.locator('#game').evaluate(canvas => canvas.getContext('webgl2').isContextLost())).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('an old-quarter visitor walks the compact stairs and a room doorway, rides down and exits', async ({ page }, info) => {
  const timingEvidence = info.outputPath('input-timing.json');
  test.setTimeout(900000);
  await writeFile(timingEvidence, JSON.stringify({ mode: 'real browser clock with the public Z precision-walking key at narrow endpoints',
    keyboard: 'real Playwright keyboard events', positionWrites: false, endpointToleranceMetres: .18,
    viewport: [640, 400], priorFailure: 'Before Z walking was available, real-time SwiftShader trials quantized normal-speed input into 1.4 m steps.' }, null, 2));
  await info.attach('input-timing', { path: timingEvidence, contentType: 'application/json' });
  const errors = await boot(page);
  const building = await enter(page, 'south-001');
  expect(building.compact).toBe(true);
  const entered = await snapshot(page), lobby = entered.city.interior;
  expect(lobby.roomCount).toBe(2);
  expect(lobby.activeFloors).toBe(3);
  const flight = lobby.stairs.find(item => item.fromFloorId === building.floors[0].id);
  expect(flight.toFloorId).toBe(building.floors[1].id);
  const route = { bottom: flight.bottom, top: flight.top,
    middle: { x: flight.x, z: (flight.startZ + flight.endZ) / 2, y: (flight.fromY + flight.toY) / 2 } };
  // A 1.6 m compact flight needs closer lateral alignment than the broad
  // northern stairs: keep the full player radius clear of both handrails.
  for (const point of [{ x: building.x, z: route.bottom.z, y: flight.fromY }, route.bottom, route.middle, route.top]) {
    await precisionWalkAxis(page, 'x', point.x);
    await precisionWalkAxis(page, 'z', point.z);
    await expect.poll(async () => Math.abs((await snapshot(page)).position.y - point.y)).toBeLessThan(.4);
    expect((await snapshot(page)).teleportRevision).toBe(entered.teleportRevision);
  }
  await expect.poll(async () => (await snapshot(page)).city.interior.floorId).toBe(building.floors[1].id);
  const upstairs = await snapshot(page);
  expect(upstairs.teleportRevision).toBe(entered.teleportRevision);
  expect(upstairs.city.interior.moving).toBe(false);
  expect(upstairs.position.y).toBeCloseTo(building.floors[1].y, 1);
  await precisionWalkAxis(page, 'x', building.x);
  const room = upstairs.city.interior.rooms[0];
  await precisionWalkAxis(page, 'z', room.entrance.z);
  await precisionWalkAxis(page, 'x', room.arrival.x);
  await precisionWalkAxis(page, 'z', room.arrival.z);
  await faceRoom(page, Math.atan2(room.x - room.arrival.x, room.z - room.arrival.z));
  expect((await snapshot(page)).city.interior.currentRoomId).toBe(room.id);
  await captureHigh(page, info, 'old-quarter-upstairs-room-high');
  await faceRoom(page, Math.PI);
  await precisionWalkAxis(page, 'z', room.entrance.z);
  await precisionWalkAxis(page, 'x', building.x);
  const cabin = (await snapshot(page)).city.interior.cabin;
  await precisionWalkAxis(page, 'z', cabin.doorZ + 1.05);
  await precisionWalkAxis(page, 'x', cabin.x);
  await precisionWalkAxis(page, 'z', cabin.z);
  await page.keyboard.press('e');
  await expect(page.locator('[data-floor-id]')).toHaveCount(building.floors.length);
  await page.locator(`[data-floor-id="${building.floors[0].id}"]`).click();
  await expect.poll(async () => (await snapshot(page)).city.interior.moving, { timeout: 90000 }).toBe(false);
  expect((await snapshot(page)).city.interior.floorId).toBe(building.floors[0].id);
  await exitToStreet(page, building);
  await enter(page, building.id);
  expect((await snapshot(page)).city.interior.roomCount).toBe(2);
  await exitToStreet(page, building);
  expect(errors).toEqual([]);
});

test('an eastern visitor enters an enclosed office, rides to the observation terrace and reloads safely', async ({ page }, info) => {
  const errors = await boot(page);
  const building = await enter(page, 'east-001');
  expect(building.entrance.y).toBeGreaterThan(0);
  expect((await snapshot(page)).city.harbor.scenicOppositeShore).toBe(false);
  const lobby = (await snapshot(page)).city.interior;
  const office = lobby.rooms.find(item => item.enclosed && item.type === 'office');
  expect(office, 'the east-shore sample includes a furnished enclosed room as well as the rooftop terrace').toBeTruthy();
  await enterRoom(page, office, building.x);
  await frameOccupiedRoom(page, office, building.x);
  expect((await snapshot(page)).city.interior.currentRoomId).toBe(office.id);
  await captureHigh(page, info, 'east-enclosed-room-high');
  await leaveRoom(page, office, building.x);
  const observation = building.floors.at(-1);
  const floor = await chooseStorey(page, observation.id);
  expect((await snapshot(page)).position.y).toBeCloseTo(observation.y, 1);
  expect(floor.roomCount).toBe(4);
  const room = floor.rooms.find(item => item.type === 'lookout');
  expect(room).toBeTruthy();
  await enterRoom(page, room, building.x);
  await captureHigh(page, info, 'east-observation-room-high');
  await leaveRoom(page, room, building.x);
  await chooseStorey(page, building.floors[0].id);
  await exitToStreet(page, building);
  await enter(page, building.id);
  // Closing the public settings panel saves a safe street doorstep while the
  // player is indoors; a reload must never respawn inside its restored shell.
  await quality(page, 'low');
  await page.reload();
  await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 });
  await page.locator('#start').click();
  const restored = await snapshot(page);
  expect(restored.city.interior.buildingId).toBeNull();
  expect(restored.city.exterior).toEqual({ southInteriorId: null, harborInteriorId: null });
  expect(restored.city.harbor.hiddenShells).toBe(0);
  expect(restored.position.x).toBeCloseTo(building.entrance.x, 1);
  expect(restored.position.z).toBeCloseTo(building.entrance.z, 1);
  expect(restored.position.y).toBeCloseTo(building.entrance.y, 1);
  await expect(page.locator('#interaction')).toContainText(`进入 ${building.name}`);
  await page.keyboard.press('e');
  await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBe(building.id);
  await exitToStreet(page, building);
  expect(errors).toEqual([]);
});
