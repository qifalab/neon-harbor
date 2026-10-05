# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: stability.spec.js >> a fast steering approach stops the full car body outside the generated buildings
- Location: tests/e2e/stability.spec.js:182:1

# Error details

```
Error: The route must actually contact a building, not just damage a roadside prop

expect(received).toBeLessThan(expected)

Expected: < 0.12
Received:   3.607706203071066
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
          - text: 中央城区
          - generic: 16:35 · 晴
      - generic:
        - generic "追捕等级 0": ☆☆☆☆☆
        - generic: $ 1,200
        - button "切换步行与跟随视角" [disabled] [ref=e3]: 步行视角
        - button "打开多人房间" [ref=e4] [cursor=pointer]: 多人
        - button "暂停游戏" [ref=e5] [cursor=pointer]: Ⅱ
    - complementary:
      - generic: 自由探索
      - heading "这座城市，等你出发。" [level=2]
      - paragraph: M 查看全城地图，城市导览可寻找建筑与站点。跨海桥通往北岸六区。
      - generic:
        - button "委托中心 ↗" [ref=e6] [cursor=pointer]
        - button "城市导览 ↗" [ref=e7] [cursor=pointer]
        - button "港湾日常 ↗" [ref=e8] [cursor=pointer]
        - generic: TAB
    - generic:
      - button "打开城市地图" [ref=e9] [cursor=pointer]:
        - generic [ref=e11]: "N"
        - generic [ref=e12]: ↗
      - generic:
        - generic: HP
        - generic: ST
    - generic:
      - generic: E
      - generic: 离开车辆
    - generic:
      - generic:
        - generic: "00"
        - generic: KM/H
  - status
```

# Test source

```ts
  120 |     expect(Math.abs(angleDifference(renderedSubject.yaw, subject.yaw))).toBeLessThan(.001);
  121 |     expect(focusError).toBeLessThan(.001);
  122 |     const lag = Math.hypot(sample.camera.target.x - subject.x, sample.camera.target.z - subject.z);
  123 |     maximumTargetLag = Math.max(maximumTargetLag, lag);
  124 |     expect(lag).toBeLessThan(3);
  125 |     expect(cameraPenetrations(sample.camera).map(b => b.id)).toEqual([]);
  126 |     if (sample.inCar) {
  127 |       for (const body of [sample.cars.find(car => car.id === sample.inCar), renderedSubject]) {
  128 |         const deepest = world.colliders.reduce((worst, box) => {
  129 |           const depth = vehiclePenetration(body, box);
  130 |           return depth > worst.depth ? { depth, id: box.id } : worst;
  131 |         }, { depth: 0, id: null });
  132 |         maximumPenetration = Math.max(maximumPenetration, deepest.depth);
  133 |         expect(deepest.depth, `Car intersects ${deepest.id} by ${deepest.depth.toFixed(3)}m`).toBeLessThan(.02);
  134 |       }
  135 |     }
  136 |   }
  137 |   return { frames: samples.length, maximumFocusError, maximumTargetLag, maximumPenetration,
  138 |     minimumObservedFPS: Math.min(...samples.map(s => s.fps)),
  139 |     maximumObservedFPS: Math.max(...samples.map(s => s.fps)),
  140 |     maximumDrawCalls: Math.max(...samples.map(s => s.renderer.calls)),
  141 |     maximumTriangles: Math.max(...samples.map(s => s.renderer.triangles)) };
  142 | }
  143 | 
  144 | test('driving and steering share one render pose; pause/resume and exit remain stable', async ({ page }, testInfo) => {
  145 |   const errors = await boot(page);
  146 |   await travel(page, ['w'], s => s.position.z < 164);
  147 |   await page.keyboard.press('e');
  148 |   await expect.poll(async () => (await snapshot(page)).inCar).toBe('starter');
  149 |   await travel(page, ['w'], s => s.speed > 13);
  150 |   const left = await recordInput(page, ['a'], .75);
  151 |   const right = await recordInput(page, ['d'], .75);
  152 |   expect(Math.abs(angleDifference(left.at(-1).position.yaw, left[0].position.yaw))).toBeGreaterThan(.35);
  153 |   expect(Math.abs(angleDifference(right.at(-1).position.yaw, right[0].position.yaw))).toBeGreaterThan(.2);
  154 |   const metrics = assertPresentation([...left, ...right]);
  155 |   await page.screenshot({ path: 'test-results/screenshots/06-stable-driving.png' });
  156 |   await travel(page, ['Space'], s => s.speed < .04);
  157 |   await page.keyboard.press('Escape');
  158 |   const paused = await record(page, { frames: 4 });
  159 |   for (const frame of paused.slice(1)) {
  160 |     expect(frame.time).toBe(paused[0].time);
  161 |     expect(frame.camera).toEqual(paused[0].camera);
  162 |     expect(frame.presentation.subject).toEqual(paused[0].presentation.subject);
  163 |   }
  164 |   await page.locator('#resume').click();
  165 |   const resumed = await record(page, { seconds: .25 });
  166 |   expect(Math.hypot(resumed.at(-1).position.x - paused[0].position.x,
  167 |     resumed.at(-1).position.z - paused[0].position.z)).toBeLessThan(.05);
  168 |   await page.keyboard.press('e');
  169 |   await expect.poll(async () => (await snapshot(page)).inCar).toBeNull();
  170 |   const exited = await snapshot(page);
  171 |   for (const car of exited.cars) {
  172 |     const dx = exited.position.x - car.x, dz = exited.position.z - car.z;
  173 |     const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
  174 |     const gap = Math.hypot(Math.max(Math.abs(dx * c - dz * s) - VEHICLE_DIMENSIONS.halfWidth, 0),
  175 |       Math.max(Math.abs(dx * s + dz * c) - VEHICLE_DIMENSIONS.halfLength, 0));
  176 |     expect(gap).toBeGreaterThanOrEqual(PLAYER_DIMENSIONS.radius - .02);
  177 |   }
  178 |   expect(errors).toEqual([]);
  179 |   await attachMetrics(testInfo, 'driving-stability-metrics', metrics);
  180 | });
  181 | 
  182 | test('a fast steering approach stops the full car body outside the generated buildings', async ({ page }, testInfo) => {
  183 |   const errors = await boot(page, { x: 8, z: 164, yaw: Math.PI });
  184 |   await page.keyboard.press('e');
  185 |   await expect.poll(async () => (await snapshot(page)).inCar).toBe('starter');
  186 |   let approach;
  187 |   // Keep the throttle held through the turn so control/renderer latency does not
  188 |   // insert a coast before this route reaches the clear section of the façade.
  189 |   const accelerationStarted = (await snapshot(page)).simulationTime;
  190 |   await page.keyboard.down('w');
  191 |   try {
  192 |     await page.waitForFunction(started => {
  193 |       const state = window.__NEON__.snapshot();
  194 |       if (state.simulationTime - started > 12) throw new Error('Movement exceeded its simulated-time budget');
  195 |       return state.position.z < 142;
  196 |     }, accelerationStarted, { polling: 'raf', timeout: 45000 });
  197 |     const accelerated = await snapshot(page);
  198 |     expect(accelerated.simulationTime - accelerationStarted).toBeLessThan(12);
  199 |     expect(accelerated.speed).toBeGreaterThan(25);
  200 |     await page.keyboard.down('d');
  201 |     try { approach = await record(page, { untilVehicleDamaged: 'starter' }); }
  202 |     finally { await page.keyboard.up('d'); }
  203 |   } catch (error) {
  204 |     const state = await snapshot(page);
  205 |     error.message += `\nFast approach diagnostics: ${JSON.stringify({ position: state.position, speed: state.speed,
  206 |       inCar: state.inCar, paused: state.paused, fps: state.fps, accelerationStarted,
  207 |       simulationTime: state.simulationTime, renderer: state.renderer, streaming: state.streaming })}`;
  208 |     throw error;
  209 |   } finally { await page.keyboard.up('w'); }
  210 |   const car = approach.at(-1).cars.find(car => car.id === 'starter');
  211 |   expect(car.health).toBeLessThan(100);
  212 |   // An oblique impact preserves tangential sliding; verify a substantial loss
  213 |   // relative to the measured approach speed rather than requiring a full stop.
  214 |   const peakSpeed = Math.max(...approach.map(frame => frame.speed));
  215 |   expect(peakSpeed).toBeGreaterThan(25);
  216 |   expect(approach.at(-1).speed).toBeLessThan(peakSpeed * .6);
  217 |   const contact = approach.flatMap(frame => world.colliders.filter(box => box.kind === 'building')
  218 |     .map(box => ({ building: box.id, separation: -vehiclePenetration(frame.cars.find(c => c.id === 'starter'), box) })))
  219 |     .sort((a, b) => a.separation - b.separation)[0];
> 220 |   expect(contact.separation, 'The route must actually contact a building, not just damage a roadside prop').toBeLessThan(.12);
      |                                                                                                             ^ Error: The route must actually contact a building, not just damage a roadside prop
  221 |   const metrics = assertPresentation(approach);
  222 |   expect(errors).toEqual([]);
  223 |   await attachMetrics(testInfo, 'wall-contact-metrics', { ...metrics, contact, peakSpeed, impactSpeed: approach.at(-1).speed, health: car.health });
  224 | });
  225 | 
  226 | test('orbiting beside a real façade retracts the camera and walking cannot enter it', async ({ page }, testInfo) => {
  227 |   const wall = world.colliders.find(b => b.kind === 'building' && b.x === -187 && b.z === 133);
  228 |   expect(wall).toBeTruthy();
  229 |   const spawn = { x: wall.x, z: wall.z + wall.hz + 1.4, yaw: Math.PI };
  230 |   const errors = await boot(page, spawn);
  231 |   const canvas = await page.locator('#game').boundingBox();
  232 |   // Start on the unobstructed right side: the minimap covers the lower left at
  233 |   // compact desktop widths. Pointer capture then keeps the entire orbit on game.
  234 |   await page.mouse.move(canvas.x + canvas.width * .88, canvas.y + canvas.height * .5);
  235 |   await page.mouse.down();
  236 |   await expect(page.locator('#game')).toBeFocused();
  237 |   // Half an orbit turns the camera boom into the wall while the player stays still.
  238 |   await page.mouse.move(canvas.x + canvas.width * .88 - Math.PI / .005,
  239 |     canvas.y + canvas.height * .5, { steps: 20 });
  240 |   await page.mouse.up();
  241 |   const orbit = await record(page, { seconds: .65 });
  242 |   expect(orbit.some(frame => frame.camera.obstructed)).toBe(true);
  243 |   expect(orbit.at(-1).camera.boomLength).toBeLessThan(orbit.at(-1).camera.desiredBoomLength - 1);
  244 |   const metrics = assertPresentation(orbit);
  245 |   await page.screenshot({ path: 'test-results/screenshots/07-wall-camera.png' });
  246 |   await page.keyboard.press('c');
  247 |   // Recentring is deliberately damped. Start the straight walking assertion
  248 |   // when the visible camera has finished turning, rather than assuming a snap.
  249 |   await page.waitForFunction(() => Math.abs(Math.atan2(
  250 |     Math.sin(window.__NEON__.snapshot().camera.yaw - Math.PI),
  251 |     Math.cos(window.__NEON__.snapshot().camera.yaw - Math.PI))) < .002,
  252 |   null, { polling: 'raf', timeout: 20000 });
  253 |   const walk = await recordInput(page, ['w'], .65);
  254 |   const final = walk.at(-1).position;
  255 |   expect(spawn.z - final.z).toBeGreaterThan(.3);
  256 |   expect(final.z - (wall.z + wall.hz)).toBeGreaterThanOrEqual(PLAYER_DIMENSIONS.radius - .01);
  257 |   expect(Math.abs(final.x - spawn.x)).toBeLessThan(.05);
  258 |   assertPresentation(walk);
  259 |   expect(errors).toEqual([]);
  260 |   await attachMetrics(testInfo, 'camera-clearance-metrics', metrics);
  261 | });
  262 | 
  263 | test('driving streams real city resources and evicts distant detail within the cache limit', async ({ page }, testInfo) => {
  264 |   const chunkResponses = [];
  265 |   page.on('response', response => {
  266 |     if (/\/assets\/city\/chunks\/[^/]+\.json(?:\?|$)/.test(response.url())) chunkResponses.push(response);
  267 |   });
  268 |   let initial;
  269 |   const errors = await boot(page, undefined, state => {
  270 |     initial = state.streaming;
  271 |     expect(state.settings.quality).toBe('high');
  272 |     expect(initial.ready).toBe(true);
  273 |     expect(initial.failed).toBe(0);
  274 |     expect(initial.pending).toBe(0);
  275 |     expect(initial.loaded).toBeGreaterThan(0);
  276 |     expect(initial.targetChunks.every(id => initial.activeChunks.includes(id))).toBe(true);
  277 |   });
  278 |   await travel(page, ['w'], s => s.position.z < 164);
  279 |   await page.keyboard.press('e');
  280 |   await expect.poll(async () => (await snapshot(page)).inCar).toBe('starter');
  281 |   const route = [];
  282 |   // Cross multiple 80m neighbourhoods through the normal driving controls.
  283 |   // Sampling by simulation duration remains meaningful under CI software GPU.
  284 |   for (let segment = 0; segment < 12 && (await snapshot(page)).position.z > -60; segment++) {
  285 |     route.push(...await recordInput(page, ['w'], .75));
  286 |   }
  287 |   expect((await snapshot(page)).position.z).toBeLessThan(-60);
  288 |   await travel(page, ['Space'], state => state.speed < .04);
  289 |   await page.waitForFunction(() => {
  290 |     const s = window.__NEON__.snapshot().streaming;
  291 |     return s.pending === 0 && s.unloaded > 0 && s.targetChunks.every(id => s.activeChunks.includes(id));
  292 |   }, null, { polling: 'raf', timeout: 20000 });
  293 |   const final = (await snapshot(page)).streaming;
  294 |   expect(final.failed).toBe(0);
  295 |   expect(final.requested).toBeGreaterThan(initial.requested);
  296 |   expect(final.bytes).toBeGreaterThan(initial.bytes);
  297 |   expect(final.residentBytes).toBeGreaterThan(0);
  298 |   expect(final.unloaded).toBeGreaterThan(0);
  299 |   expect(initial.activeChunks.some(id => !final.activeChunks.includes(id))).toBe(true);
  300 |   for (const { streaming, position } of route) {
  301 |     expect(streaming.failed).toBe(0);
  302 |     expect(streaming.loaded).toBeLessThanOrEqual(streaming.maxResidentChunks);
  303 |     expect(streaming.residentMeshes).toBeGreaterThan(0);
  304 |     const currentDistrict = `${Math.floor((position.x + 320) / 80)}_${Math.floor((position.z + 320) / 80)}`;
  305 |     expect(streaming.activeChunks, `Near street detail missing in ${currentDistrict}`).toContain(currentDistrict);
  306 |   }
  307 |   expect(final.disposedInstances).toBeGreaterThan(0);
  308 |   // These responses are south-shore files; the aggregate also includes the
  309 |   // independent north-shore cache retained for distant silhouettes.
  310 |   expect(chunkResponses.length).toBeGreaterThan(initial.south.loaded);
  311 |   // Reading the actual response bodies proves these are fetched detail assets,
  312 |   // rather than visibility toggles over a fully preconstructed city.
  313 |   const payloadSizes = await Promise.all(chunkResponses.map(async response => {
  314 |     expect(response.status()).toBe(200);
  315 |     return (await response.body()).byteLength;
  316 |   }));
  317 |   expect(payloadSizes.every(size => size > 0)).toBe(true);
  318 |   expect(errors).toEqual([]);
  319 |   await attachMetrics(testInfo, 'city-streaming-metrics', {
  320 |     requestedChunks: chunkResponses.length,
```