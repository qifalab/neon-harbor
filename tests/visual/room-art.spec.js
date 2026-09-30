import { test, expect } from '@playwright/test';
import { METROPOLIS_BUILDINGS } from '../../src/metropolis-catalog.js';
import { snapshot } from '../e2e/helpers/walking.js';
import { bootOccupied, enterAddress, chooseStorey, enterRoom, leaveRoom } from '../e2e/helpers/occupied.js';

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
      for (const [index, room] of floor.rooms.entries()) {
        await enterRoom(page, room, building.x);
        const state = await snapshot(page);
        expect(state.position.y).toBeCloseTo(building.floors.find(item => item.id === id).y, 1);
        expect(room.number).toBeTruthy(); expect(room.art.subject).toBeTruthy();
        const name = `${building.id}-${id}-room-${index + 1}.jpg`;
        await page.screenshot({ path: testInfo.outputPath(name), type: 'jpeg', quality: 83, timeout: 90000 });
        evidence.push({ building: building.id, floor: id, room: room.id, name: room.name, type: room.type,
          number: room.number, artwork: room.art, file: name, position: state.position, residentFloors: state.city.interior.residentFloors });
        await leaveRoom(page, room, building.x);
      }
    }
    await testInfo.attach('rendered-room-index', { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
}
