# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rooms.spec.js >> two browsers synchronize expanded east-bay addresses and elevator floors beyond the former 320 metre limit
- Location: tests/multiplayer-browser/rooms.spec.js:122:1

# Error details

```
TimeoutError: page.waitForFunction: Timeout 180000ms exceeded.
```

# Test source

```ts
  1   | import { expect } from '@playwright/test';
  2   | import { snapshot, walkAxis } from './walking.js';
  3   | 
  4   | export async function bootOccupied(page) {
  5   |   const errors = [];
  6   |   page.on('pageerror', error => errors.push(error.message));
  7   |   page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  8   |   page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  9   |   await page.goto('/');
  10  |   await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 });
  11  |   await page.locator('#welcome-settings').click();
  12  |   await page.locator('#quality').selectOption('low');
  13  |   await page.locator('#cycle').uncheck();
  14  |   await page.locator('#resume').click();
  15  |   await page.locator('#start').click();
  16  |   await expect(page.locator('#game')).toBeFocused();
  17  |   await page.keyboard.press('v');
  18  |   expect((await snapshot(page)).settings.firstPerson).toBe(true);
  19  |   return errors;
  20  | }
  21  | 
  22  | export async function enterAddress(page, id) {
  23  |   await page.locator('#explore-city').click();
  24  |   await expect(page.locator('#atlas-results')).toBeVisible();
  25  |   await page.locator(`[data-visit-building="${id}"]`).click();
  26  |   await expect(page.locator('#panel')).not.toBeVisible({ timeout: 45000 });
  27  |   await page.keyboard.press('e');
  28  |   await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBe(id);
  29  | }
  30  | 
  31  | export async function chooseStorey(page, id, { walkingTimeout = 60000 } = {}) {
  32  |   const before = await snapshot(page);
  33  |   if (before.city.interior.floorId === id) return before.city.interior;
  34  |   await walkAxis(page, 'x', before.city.interior.cabin.x, { timeout: walkingTimeout });
  35  |   await walkAxis(page, 'z', before.city.interior.cabin.z, { sprint: true, timeout: walkingTimeout });
  36  |   await page.keyboard.press('e');
  37  |   await expect(page.locator('[data-floor-id]')).toHaveCount(before.city.interior.totalFloors);
  38  |   await page.locator(`[data-floor-id="${id}"]`).click();
> 39  |   await page.waitForFunction(() => !window.__NEON__.snapshot().city.interior.moving, null,
      |              ^ TimeoutError: page.waitForFunction: Timeout 180000ms exceeded.
  40  |     { polling: 'raf', timeout: 180000 });
  41  |   const arrived = await snapshot(page);
  42  |   expect(arrived.city.interior.floorId).toBe(id);
  43  |   expect(arrived.city.interior.activeFloors).toBe(3);
  44  |   expect(arrived.city.interior.elevator.doorOpen).toBe(1);
  45  |   expect(arrived.simulationTime - before.simulationTime).toBeLessThan(60);
  46  |   return arrived.city.interior;
  47  | }
  48  | 
  49  | export async function faceRoom(page, yaw) {
  50  |   await page.waitForFunction(() => Number.isFinite(window.__NEON__.snapshot().camera?.yaw), null,
  51  |     { polling: 'raf', timeout: 30000 });
  52  |   const current = await page.evaluate(() => window.__NEON__.snapshot().camera.yaw);
  53  |   const delta = Math.atan2(Math.sin(yaw - current), Math.cos(yaw - current));
  54  |   if (Math.abs(delta) < .003) return;
  55  |   const canvas = await page.locator('#game').boundingBox();
  56  |   const x = canvas.x + canvas.width * .86, y = canvas.y + canvas.height * .3;
  57  |   await page.mouse.move(x, y); await page.mouse.down();
  58  |   // One ordinary pointer drag supplies the target. The shipped camera still
  59  |   // eases to it; many redundant protocol moves make software-GPU photography
  60  |   // spend seconds on identical intermediate cursor events.
  61  |   await page.mouse.move(x - delta / .005, y); await page.mouse.up();
  62  |   await page.waitForFunction(yaw => {
  63  |     const actual = window.__NEON__.snapshot().camera.yaw;
  64  |     return Math.abs(Math.atan2(Math.sin(actual - yaw), Math.cos(actual - yaw))) < .003;
  65  |   }, yaw, { polling: 'raf', timeout: 15000 });
  66  | }
  67  | 
  68  | export async function enterRoom(page, room, corridorX, { doorwayView = false } = {}) {
  69  |   await faceRoom(page, Math.PI);
  70  |   await walkAxis(page, 'x', corridorX, { timeout: 120000 });
  71  |   await walkAxis(page, 'z', room.entrance.z, { sprint: true, timeout: 120000 });
  72  |   // A small kitchen's chairs can require a turn after entry. Photograph from
  73  |   // the clear doorway instead of demanding a straight walk through furniture.
  74  |   const arrivalX = doorwayView && room.enclosed && room.width <= 10
  75  |     ? room.entrance.x + Math.sign(room.x - corridorX) * 1.6 : room.arrival.x;
  76  |   await walkAxis(page, 'x', arrivalX, { timeout: 120000 });
  77  |   await walkAxis(page, 'z', room.arrival.z, { timeout: 120000 });
  78  |   expect((await snapshot(page)).city.interior.currentRoomId).toBe(room.id);
  79  |   if (!doorwayView) await faceRoom(page, Math.sign(room.x - corridorX) * (Math.PI / 2 - .28));
  80  | }
  81  | 
  82  | export async function leaveRoom(page, room, corridorX) {
  83  |   await faceRoom(page, Math.PI);
  84  |   await walkAxis(page, 'z', room.entrance.z, { timeout: 120000 });
  85  |   await walkAxis(page, 'x', corridorX, { timeout: 120000 });
  86  | }
  87  | 
  88  | 
  89  | /** Frame narrow rooms from a real doorway viewpoint. Their usual arrival
  90  |  * point can lie beyond the centre, so looking back at it faces the corridor. */
  91  | export async function frameOccupiedRoom(page, room, corridorX) {
  92  |   const side = Math.sign(room.x - corridorX);
  93  |   if (room.enclosed && room.width <= 10) {
  94  |     await faceRoom(page, Math.PI);
  95  |     await walkAxis(page, 'x', room.entrance.x + side * 1.6, { timeout: 120000 });
  96  |   }
  97  |   const state = await snapshot(page), pose = state.position;
  98  |   expect(state.city.interior.currentRoomId).toBe(room.id);
  99  |   const depth = side * (pose.x - room.entrance.x);
  100 |   const targetX = room.entrance.x + side * Math.max(room.width / 2, depth + 1.5);
  101 |   await faceRoom(page, Math.atan2(targetX - pose.x, room.z - pose.z));
  102 | }
  103 | 
```