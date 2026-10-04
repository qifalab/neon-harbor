# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: metropolis.spec.js >> ferry: wait, board, travel and alight using public controls
- Location: tests/e2e/metropolis.spec.js:173:3

# Error details

```
TimeoutError: page.waitForFunction: Timeout 60000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic "霓港三维游戏画面" [active] [ref=e2]
  - main "游戏界面":
    - generic:
      - generic:
        - generic:
          - text: 霓港
          - generic: NEON HARBOR
        - generic:
          - text: 维澜海峡
          - generic: 16:37 · 晴
      - generic:
        - button "切换步行与跟随视角" [disabled] [ref=e3]: 步行视角
        - button "打开多人房间" [ref=e4] [cursor=pointer]: 多人
        - button "暂停游戏" [ref=e5] [cursor=pointer]: Ⅱ
    - complementary:
      - generic: 公共交通 · 乘坐中
      - heading "F4 · 星湾渡轮" [level=2]
      - paragraph: E 下车 · 旧城 · 白帆码头（停靠 6 秒）
      - generic:
        - button "委托中心 ↗" [ref=e6] [cursor=pointer]
        - button "城市导览 ↗" [ref=e7] [cursor=pointer]
    - generic:
      - button "打开城市地图" [ref=e8] [cursor=pointer]:
        - generic [ref=e10]: "N"
        - generic [ref=e11]: ↗
      - generic:
        - generic: HP
        - generic: ST
    - generic:
      - generic: E
      - generic: 下车 · 旧城 · 白帆码头（停靠 6 秒）
  - status
```

# Test source

```ts
  97  |   const final = (await snapshot(page)).city.streaming;
  98  |   expect(final.failed).toBe(0);
  99  |   expect(final.loaded).toBeLessThanOrEqual(final.maxResidentChunks);
  100 |   expect(final.requested).toBeGreaterThan(first.requested);
  101 |   expect(final.disposedInstances).toBeGreaterThan(0);
  102 |   expect(first.activeChunks.some(id => !final.activeChunks.includes(id))).toBe(true);
  103 |   expect(chunks.length).toBeGreaterThan(1);
  104 |   for (const response of chunks) { expect(response.status()).toBe(200); expect((await response.body()).byteLength).toBeGreaterThan(0); }
  105 |   await page.keyboard.press('m');
  106 |   await expect(page.locator('#city-map')).toBeVisible();
  107 |   expect((await snapshot(page)).paused).toBe(true);
  108 |   await page.screenshot({ path: 'test-results/screenshots/09-two-shores-map.png' });
  109 |   expect(errors).toEqual([]);
  110 | });
  111 | 
  112 | for (const id of ['tide-museum', 'apex-tower', 'camellia-court']) {
  113 |   test(`${id}: ${id === 'apex-tower' ? 'ride to a high floor and travel back to the street' : 'walk through the lobby, ride the elevator, return to the street'}`, async ({ page }) => {
  114 |     if (id === 'apex-tower') test.setTimeout(300000);
  115 |     const errors = await boot(page);
  116 |     await visit(page, 'building', id);
  117 |     await page.keyboard.press('e');
  118 |     await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBe(id);
  119 |     const lobby = (await snapshot(page)).city.interior;
  120 |     expect(lobby.floorId).toBe('lobby');
  121 |     expect(lobby.furnitureCount).toBeGreaterThan(12);
  122 |     expect(lobby.activeFloors).toBe(3);
  123 |     await walk(page, ['w', 'Shift'], s => Math.abs(s.position.z - s.city.interior.cabin.z) < 1.2);
  124 |     await page.keyboard.press('e');
  125 |     await expect(page.locator('[data-floor-id]')).toHaveCount(lobby.totalFloors);
  126 |     const floor = id === 'camellia-court' ? 'gallery' : 'observation';
  127 |     await page.locator(`[data-floor-id="${floor}"]`).click();
  128 |     await expect.poll(async () => (await snapshot(page)).city.interior.moving).toBe(true);
  129 |     const startY = lobby.elevator.y;
  130 |     await page.waitForFunction(() => {
  131 |       const s = window.__NEON__.snapshot();
  132 |       return s.city.interior.moving && s.city.interior.elevator.phase === 'moving' && s.position.y > 2;
  133 |     }, null, { polling: 'raf', timeout: 30000 });
  134 |     expect((await snapshot(page)).position.y).toBeGreaterThan(startY);
  135 |     await waitForLift(page);
  136 |     const arrived = (await snapshot(page)).city.interior;
  137 |     expect(arrived.floorId).toBe(floor);
  138 |     expect(arrived.elevator.doorOpen).toBe(1);
  139 |     expect(arrived.activeFloors).toBe(3);
  140 |     if (id === 'apex-tower') expect((await snapshot(page)).position.y).toBeGreaterThan(250);
  141 |     // Leave the cabin into the furnished destination, then walk back to return.
  142 |     await walk(page, ['s'], s => s.position.z > s.city.interior.cabin.z + 10);
  143 |     await page.screenshot({ path: `test-results/screenshots/10-${id}-interior.png` });
  144 |     if (id === 'apex-tower') {
  145 |       // The museum and residence cover complete lift round trips. This tall
  146 |       // tower covers the distinct case of leaving an upper floor via the atlas.
  147 |       await visit(page, 'building', 'tide-museum');
  148 |       const outside = await snapshot(page);
  149 |       expect(outside.city.interior.buildingId).toBeNull();
  150 |       expect(outside.cars.length).toBeGreaterThan(0);
  151 |       expect(outside.position.x).toBe(-560);
  152 |       expect(outside.position.z).toBe(-455);
  153 |       expect(errors).toEqual([]);
  154 |       return;
  155 |     }
  156 |     await walk(page, ['w'], s => Math.abs(s.position.z - s.city.interior.cabin.z) < 1.2);
  157 |     await page.keyboard.press('e');
  158 |     await page.locator('[data-floor-id="lobby"]').click();
  159 |     await waitForLift(page);
  160 |     expect((await snapshot(page)).city.interior.floorId).toBe('lobby');
  161 |     await walk(page, ['s', 'Shift'], s => Math.abs(s.position.z - s.city.interior.entrance.z) < 1.1);
  162 |     await page.keyboard.press('e');
  163 |     await expect.poll(async () => (await snapshot(page)).city.interior.buildingId).toBeNull();
  164 |     expect((await snapshot(page)).cars.length).toBeGreaterThan(0);
  165 |     expect(errors).toEqual([]);
  166 |   });
  167 | }
  168 | 
  169 | for (const journey of [
  170 |   { route: 'metro', from: 'metro-old', to: 'metro-quay', boardZ: 250, exitZ: -409 },
  171 |   { route: 'ferry', from: 'ferry-south', to: 'ferry-north', boardZ: -310, exitZ: -394 },
  172 | ]) {
  173 |   test(`${journey.route}: wait, board, travel and alight using public controls`, async ({ page }) => {
  174 |     // v0.4's teleport entrances left about 25 m of platform walking. The real
  175 |     // metro stair routes now cover 110 m, about 85 m more plus landing checks.
  176 |     // Software rendering may reach the destination at the old wall-time
  177 |     // deadline. Keep physical route assertions and give CI arrival headroom.
  178 |     // The ferry retains its original total budget.
  179 |     test.setTimeout(journey.route === 'metro' ? (process.env.CI ? 600000 : 480000) : 360000);
  180 |     const errors = await boot(page);
  181 |     await visit(page, 'stop', journey.from);
  182 |     if (journey.route === 'metro') {
  183 |       const station = (await snapshot(page)).city.transit.stops.find(stop => stop.id === journey.from);
  184 |       expect(station.walkable).toBe(true);
  185 |       expect(station.access.kind).toBe('walkable-stairs');
  186 |       const samples = await walkRoute(page, station.access.waypoints);
  187 |       expect(samples.some(sample => sample.position.y < -2.75 && sample.position.y > -4.25)).toBe(true);
  188 |       expect(samples.some(sample => sample.position.y < -9.75 && sample.position.y > -11.25)).toBe(true);
  189 |     } else await page.keyboard.press('e');
  190 |     await expect.poll(async () => (await snapshot(page)).city.transit.currentStop).toBe(journey.from);
  191 |     const waiting = await snapshot(page);
  192 |     await page.waitForFunction(({ from, route }) => window.__NEON__.snapshot().city.transit.vehicles.some(v => v.routeId === route && v.stopId === from && v.remaining > 4), journey, { polling: 'raf', timeout: 90000 });
  193 |     expect((await snapshot(page)).simulationTime - waiting.simulationTime).toBeLessThan(17);
  194 |     await page.keyboard.press('e');
  195 |     await expect.poll(async () => (await snapshot(page)).city.transit.riding).toBe(true);
  196 |     const boarded = await snapshot(page);
> 197 |     await page.waitForFunction(() => {
      |                ^ TimeoutError: page.waitForFunction: Timeout 60000ms exceeded.
  198 |       const s = window.__NEON__.snapshot().city.transit;
  199 |       return s.vehicles.find(v => v.id === s.ridingVehicleId)?.stopId === null;
  200 |     }, null, { polling: 'raf', timeout: 60000 });
  201 |     expect((await snapshot(page)).simulationTime - boarded.simulationTime).toBeLessThan(11);
  202 |     // Leaving a moving vehicle must preserve the passenger; no mid-water exit.
  203 |     await page.keyboard.press('e');
  204 |     expect((await snapshot(page)).city.transit.riding).toBe(true);
  205 |     await page.screenshot({ path: `test-results/screenshots/11-${journey.route}-riding.png` });
  206 |     try {
  207 |       await page.waitForFunction(to => {
  208 |         const s = window.__NEON__.snapshot().city.transit;
  209 |         return s.vehicles.find(v => v.id === s.ridingVehicleId)?.stopId === to;
  210 |       }, journey.to, { polling: 'raf', timeout: process.env.CI ? 240000 : 120000 });
  211 |     } catch (error) {
  212 |       const state = await snapshot(page);
  213 |       const transit = state.city.transit;
  214 |       error.message += `\nTransit arrival diagnostics: ${JSON.stringify({
  215 |         simulationTime: state.simulationTime, phase: transit.phase,
  216 |         nextStopId: transit.nextStopId, secondsToArrival: transit.secondsToArrival,
  217 |         vehicle: transit.vehicles.find(v => v.id === transit.ridingVehicleId),
  218 |       })}`;
  219 |       throw error;
  220 |     }
  221 |     const arrived = await snapshot(page);
  222 |     expect(Math.hypot(arrived.position.x - boarded.position.x, arrived.position.z - boarded.position.z)).toBeGreaterThan(journey.route === 'metro' ? 600 : 45);
  223 |     await page.keyboard.press('e');
  224 |     await expect.poll(async () => (await snapshot(page)).city.transit.riding).toBe(false);
  225 |     expect((await snapshot(page)).city.transit.currentStop).toBe(journey.to);
  226 |     await page.screenshot({ path: `test-results/screenshots/11-${journey.route}-arrival.png` });
  227 |     if (journey.route === 'metro') {
  228 |       const station = (await snapshot(page)).city.transit.stops.find(stop => stop.id === journey.to);
  229 |       // Clear the physical entrance's activation band, not just its center:
  230 |       // the bounded walking tolerance can legitimately stop inside that band.
  231 |       await walkRoute(page, [...station.access.waypoints].reverse().concat(station.streetExit));
  232 |       expect((await snapshot(page)).position.y).toBeCloseTo(0, 1);
  233 |     } else {
  234 |       await walk(page, ['w'], s => s.position.z < -392);
  235 |       await page.keyboard.press('e');
  236 |     }
  237 |     await expect.poll(async () => (await snapshot(page)).city.transit.currentStop).toBeNull();
  238 |     expect((await snapshot(page)).city.transit.boardingState).toBe('street');
  239 |     expect(errors).toEqual([]);
  240 |   });
  241 | }
  242 | 
```