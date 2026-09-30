import { test, expect } from '@playwright/test';
import { METROPOLIS_BUILDINGS } from '../../src/metropolis-catalog.js';
import { snapshot } from '../e2e/helpers/walking.js';
import { bootOccupied, enterAddress, chooseStorey, enterRoom, leaveRoom, frameOccupiedRoom } from '../e2e/helpers/occupied.js';

// This captures actual rendered rooms using the atlas, lift, walk controls and
// camera drag. Geometry/count assertions are never labelled pixel approval.
for (const building of METROPOLIS_BUILDINGS) {
  test(`${building.id}: photograph all four original programmes and the middle upper programme`, async ({ page }, testInfo) => {
    const errors = await bootOccupied(page); await enterAddress(page, building.id);
    const middle = building.floors[Math.max(3, Math.min(building.floors.length - 2, Math.floor(building.floors.length / 2)))];
    const floors = [...new Set(['lobby', 'gallery', 'workplace', middle.id, 'observation'])];
    const evidence = [];
    for (const id of floors) {
      const floor = await chooseStorey(page, id);
      expect(floor.rooms).toHaveLength(4);
      // Visit the near pair and then the far pair; repeatedly crossing the
      // entire corridor adds travel without improving room evidence.
      const ordered = [...floor.rooms.entries()].sort((a, b) => b[1].entrance.z - a[1].entrance.z || a[0] - b[0]);
      for (const [index, room] of ordered) {
        await enterRoom(page, room, building.x);
        await frameOccupiedRoom(page, room, building.x);
        const state = await snapshot(page);
        expect(state.position.y).toBeCloseTo(building.floors.find(item => item.id === id).y, 1);
        expect(room.number).toBeTruthy(); expect(room.art.subject).toBeTruthy();
        const name = `${building.id}-${id}-room-${index + 1}.jpg`;
        // These are actual 800×500 Low-mode browser frames, with the shipped
        // 0.8 renderer scale. Native High detail photographs are separate.
        await page.setViewportSize({ width: 800, height: 500 });
        await expect.poll(() => page.locator('#game').evaluate(canvas => {
          const gl = canvas.getContext('webgl2');
          return [gl.drawingBufferWidth, gl.drawingBufferHeight];
        }), { timeout: 60000 }).toEqual([640, 400]);
        await page.screenshot({ path: testInfo.outputPath(name), type: 'jpeg', quality: 83, timeout: 90000 });
        await page.setViewportSize({ width: 512, height: 320 });
        await expect.poll(() => page.locator('#game').evaluate(canvas => {
          const gl = canvas.getContext('webgl2');
          return [gl.drawingBufferWidth, gl.drawingBufferHeight];
        }), { timeout: 60000 }).toEqual([409, 256]);
        evidence.push({ building: building.id, floor: id, room: room.id, name: room.name, type: room.type,
          number: room.number, artwork: room.art, file: name, position: state.position, residentFloors: state.city.interior.residentFloors,
          photograph: { quality: 'low', screenshot: [800, 500], drawingBuffer: [640, 400] } });
        await leaveRoom(page, room, building.x);
      }
    }
    await testInfo.attach('rendered-room-index', { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
}
