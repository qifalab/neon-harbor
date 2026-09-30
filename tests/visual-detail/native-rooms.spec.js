import { test, expect } from '@playwright/test';
import { bootOccupied, enterAddress, chooseStorey, enterRoom, frameOccupiedRoom } from '../e2e/helpers/occupied.js';
import { snapshot } from '../e2e/helpers/walking.js';

for (const [building, floorId, roomIndex] of [
  ['camellia-court','level-04',1], ['camellia-court','level-04',3],
  ['garden-hospital','level-04',0], ['music-conservatory','level-04',1],
  ['science-forum','level-04',1], ['design-foundry','level-04',2],
]) {
  test(`${building}-${floorId}-${roomIndex + 1} at native High quality`, async ({ page }, info) => {
    const errors = await bootOccupied(page);
    await enterAddress(page, building);
    const floor = await chooseStorey(page, floorId), room = floor.rooms[roomIndex];
    await enterRoom(page, room, floor.cabin.x, { doorwayView: true });
    await frameOccupiedRoom(page, room, floor.cabin.x);
    await page.keyboard.press('Escape');
    await page.locator('[data-tab="settings"]').click();
    await page.locator('#quality').selectOption('high');
    await page.locator('#resume').click();
    await page.setViewportSize({ width: 960, height: 600 });
    await expect.poll(async () => (await snapshot(page)).settings.quality).toBe('high');
    const readPixels = () => page.locator('#game').evaluate(canvas => {
      const gl = canvas.getContext('webgl2');
      return { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight, lost: gl.isContextLost() };
    });
    await expect.poll(readPixels, { timeout: 60000 }).toEqual({ width: 960, height: 600, lost: false });
    const pixels = await readPixels();
    await page.screenshot({ path: info.outputPath(`${building}-${floorId}-room-${roomIndex + 1}-high.png`), timeout: 90000 });
    await info.attach('native-room-evidence', { body: JSON.stringify({ building, floorId, room: room.name,
      roomId: room.id, quality: 'high', pixels, position: (await snapshot(page)).position }), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
}
