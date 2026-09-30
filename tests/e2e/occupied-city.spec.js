import { test, expect } from '@playwright/test';
import { snapshot, walkAxis, walkRoute, stairWalkingRoute } from './helpers/walking.js';
import { bootOccupied, enterAddress, chooseStorey, enterRoom, leaveRoom } from './helpers/occupied.js';

test.use({ viewport: { width: 640, height: 400 } });
test.setTimeout(600000);

test('all storeys are selectable and a visitor walks an upper stair flight without accumulating floors or sign textures', async ({ page }, testInfo) => {
  const errors = await bootOccupied(page);
  await enterAddress(page, 'apex-tower');
  const building = (await snapshot(page)).city.buildings.find(item => item.id === 'apex-tower');
  expect(building.floors).toHaveLength(63);
  await walkAxis(page, 'z', (await snapshot(page)).city.interior.cabin.z, { sprint: true });
  await page.keyboard.press('e');
  await expect(page.locator('[data-floor-id]')).toHaveCount(63);
  await page.getByRole('searchbox', { name: '找楼层或房间' }).fill('16F');
  await expect(page.locator('[data-floor-id]:visible')).toHaveCount(1);
  await page.locator('[data-floor-id="level-16"]').click();
  await page.waitForFunction(() => !window.__NEON__.snapshot().city.interior.moving, null, { polling: 'raf', timeout: 180000 });
  const upper = await snapshot(page), floor = upper.city.interior;
  expect(floor.floorId).toBe('level-16');
  expect(upper.position.y).toBeCloseTo(building.floors[15].y, 1);
  const flight = floor.stairs.find(item => item.fromFloorId === 'level-16');
  expect(flight.toFloorId).toBe('level-17');
  const route = stairWalkingRoute(flight, building.x);
  await walkRoute(page, [{ x: building.x, z: route.bottom.z, y: flight.fromY }, route.bottom, route.middle, route.top]);
  const walked = await snapshot(page);
  expect(walked.city.interior.floorId).toBe('level-17');
  expect(walked.teleportRevision).toBe(upper.teleportRevision);
  expect(walked.city.interior.residentFloors).toEqual(['level-16', 'level-17', 'level-18']);
  const room = walked.city.interior.rooms[0];
  await walkAxis(page, 'x', building.x);
  await enterRoom(page, room, building.x);
  const picture = testInfo.outputPath('apex-17F-crafted-room.png');
  await page.screenshot({ path: picture }); await testInfo.attach('apex-17F-crafted-room', { path: picture, contentType: 'image/png' });
  await leaveRoom(page, room, building.x);
  const samples = [];
  for (const id of ['level-08', 'level-16', 'level-05', 'level-16']) {
    const resident = await chooseStorey(page, id);
    samples.push({ id, floors: resident.residentFloors, textures: resident.ownedSignTextures });
    expect(resident.activeFloors).toBe(3); expect(resident.ownedSignTextures).toBeLessThan(180);
  }
  expect(samples[1].textures).toBe(samples[3].textures);
  await testInfo.attach('streaming-floor-residency', { body: Buffer.from(JSON.stringify(samples, null, 2)), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('the rendered resident enters a real workplace and stays there during working hours', async ({ page }, testInfo) => {
  test.setTimeout(1200000);
  const errors = await bootOccupied(page);
  await enterAddress(page, 'tide-museum');
  await chooseStorey(page, 'workplace');
  const initial = await snapshot(page), person = initial.city.people.people.find(item => item.id === 'resident-tide-museum-0');
  expect(person.journey.work.floorId).toBe('workplace');
  const monitor = setInterval(async () => {
    try {
      const state = await snapshot(page), resident = state.city.people.people.find(item => item.id === person.id);
      console.log(`Resident progress: ${JSON.stringify({ time: state.simulationTime, phase: resident.journey.phase,
        x: resident.x, y: resident.y, z: resident.z, floor: resident.floorId, visible: resident.materialized })}`);
    } catch {}
  }, 30000);
  try { await page.waitForFunction(id => {
    const person = window.__NEON__.snapshot().city.people.people.find(item => item.id === id);
    return person.journey.phase === 'room-activity' && person.materialized && person.state === 'working';
  }, person.id, { polling: 'raf', timeout: 900000 }); }
  catch (error) {
    const state = await snapshot(page);
    error.message += `\nResident diagnostics: ${JSON.stringify({ time: state.simulationTime, fps: state.fps,
      player: state.position, interior: state.city.interior.floorId,
      resident: state.city.people.people.find(item => item.id === person.id) })}`;
    throw error;
  }
  finally { clearInterval(monitor); }
  const working = await snapshot(page), resident = working.city.people.people.find(item => item.id === person.id);
  expect(resident.insideBuildingId).toBe('tide-museum'); expect(resident.floorId).toBe('workplace');
  expect(resident.y).toBeCloseTo(8.4, 1);
  expect(resident.journey.history.some(item => item.kind === 'work' && item.roomId === resident.roomId)).toBe(true);
  const room = working.city.interior.rooms.find(item => item.id === resident.roomId);
  await enterRoom(page, room, working.city.interior.entrance.x);
  await page.screenshot({ path: testInfo.outputPath('resident-in-workshop.png') });
  const after = (await snapshot(page)).city.people.people.find(item => item.id === person.id);
  expect(after.journey.phase).toBe('room-activity'); expect(after.roomId).toBe(resident.roomId);
  expect(errors).toEqual([]);
});
