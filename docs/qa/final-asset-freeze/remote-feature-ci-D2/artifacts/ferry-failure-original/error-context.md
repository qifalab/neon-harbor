# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: harbor-sample.spec.js >> ferry: public boarding, physical upper-deck stairs, travel and lower-door alighting
- Location: tests/e2e/harbor-sample.spec.js:136:3

# Error details

```
Test timeout of 900000ms exceeded.
```

```
Error: mouse.up: Target page, context or browser has been closed
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
          - text: 03 · 河口渡轮
          - generic: 19:48 · 晴
      - generic:
        - button "切换步行与跟随视角" [disabled] [ref=e3]: 步行视角
        - button "打开多人房间" [ref=e4] [cursor=pointer]: 多人
        - button "暂停游戏" [ref=e5] [cursor=pointer]: Ⅱ
    - complementary:
      - generic: 港湾公共交通 · 下层
      - heading "03 · 河口渡轮" [level=2]
      - paragraph: 下一站 河口北码头。WASD 在车内走动，Z 慢走，沿楼梯上下层；下车请返回下层车门，停靠时按 E。
      - generic:
        - button "委托中心 ↗" [ref=e6] [cursor=pointer]
        - button "城市导览 ↗" [ref=e7] [cursor=pointer]
        - button "港湾日常 ↗" [ref=e8] [cursor=pointer]
        - generic: 7 s
    - generic:
      - button "打开城市地图" [ref=e9] [cursor=pointer]:
        - generic [ref=e11]: "N"
        - generic [ref=e12]: ↗
      - generic:
        - generic: HP
        - generic: ST
    - generic:
      - generic: WASD
      - generic: 03 · 河口渡轮 · 可在车内走动，到站从下层车门下车
  - status
```

# Test source

```ts
  83  |     const s = window.__NEON__.snapshot();
  84  |     return s.city.sample.transit.passengerLocal && Number.isFinite(s.camera?.yaw);
  85  |   }, null, { polling: 'raf', timeout: 15000 });
  86  |   const box = await page.locator('#game').boundingBox();
  87  |   const pointer = { x: box.x + box.width * .86, y: box.y + box.height * .30 };
  88  |   await page.mouse.move(pointer.x, pointer.y); await page.mouse.down();
  89  |   pointer.orbitYaw = (await cabinMotion(page)).cameraYaw;
  90  |   return pointer;
  91  | }
  92  | 
  93  | async function walkLocal(page, target, pointer, { precision = true } = {}) {
  94  |   const start = await cabinMotion(page), deadline = Date.now() + 150000, samples = [start];
  95  |   let current = start;
  96  |   try {
  97  |     for (let step = 0; Math.hypot(target.x - current.local.x, target.z - current.local.z) >= .06 && step < 1800; step++) {
  98  |       expect(Date.now(), 'local walking retains its wall-clock deadline').toBeLessThan(deadline);
  99  |       const dx = target.x - current.local.x, dz = target.z - current.local.z;
  100 |       const key = Math.abs(dx) > Math.abs(dz) ? dx > 0 ? 'a' : 'd' : dz > 0 ? 'w' : 's';
  101 |       const offset = { w: 0, s: Math.PI, a: Math.PI / 2, d: -Math.PI / 2 }[key];
  102 |       const desired = current.vehicle.yaw + Math.atan2(dx, dz) - offset;
  103 |       // Drag deltas apply to the intended orbit, not the still-easing camera.
  104 |       const delta = angle(desired - pointer.orbitYaw);
  105 |       if (Math.abs(delta) > .002) {
  106 |         pointer.x -= delta / (.005 * current.sensitivity);
  107 |         await page.mouse.move(pointer.x, pointer.y);
  108 |         pointer.orbitYaw = desired;
  109 |         await page.waitForFunction(yaw => {
  110 |           const actual = window.__NEON__.snapshot().camera.yaw;
  111 |           return Math.abs(Math.atan2(Math.sin(actual - yaw), Math.cos(actual - yaw))) < .025;
  112 |         }, desired, { polling: 'raf', timeout: Math.min(15000, Math.max(1, deadline - Date.now())) });
  113 |       }
  114 |       const slow = precision || Math.hypot(target.x - current.local.x, target.z - current.local.z) < 1.2;
  115 |       if (slow) await page.keyboard.down('z');
  116 |       await page.keyboard.down(key);
  117 |       try {
  118 |         await page.waitForFunction(before => {
  119 |           const p = window.__NEON__.snapshot().city.sample.transit.passengerLocal;
  120 |           return p && Math.hypot(p.x - before.x, p.z - before.z) > .009;
  121 |         }, current.local, { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) });
  122 |       } finally { await page.keyboard.up(key); if (slow) await page.keyboard.up('z'); }
  123 |       current = await cabinMotion(page); samples.push({ ...current, key, slow });
  124 |       expect(current.teleportRevision, 'cabin movement must not relocate the player').toBe(start.teleportRevision);
  125 |     }
  126 |     expect(Math.hypot(target.x - current.local.x, target.z - current.local.z), 'actual local waypoint reached').toBeLessThan(.06);
  127 |     if (target.y != null) expect(Math.abs(current.local.y - target.y)).toBeLessThan(.15);
  128 |   } catch (error) {
  129 |     error.message += `\nCabin movement diagnostics: ${JSON.stringify({ target, start, current, samples })}`;
  130 |     throw error;
  131 |   }
  132 |   return samples;
  133 | }
  134 | 
  135 | for (const kind of ['bus', 'tram', 'ferry']) {
  136 |   test(`${kind}: public boarding, physical upper-deck stairs, travel and lower-door alighting`, async ({ page }, info) => {
  137 |     // The preserved first-run ferry trace reached its lower door approach at
  138 |     // simulation time 115.6 s when the 600 s software-rendering budget expired.
  139 |     // Increase this scenario only; local walking and arrival limits stay fixed.
  140 |     if (kind === 'ferry') test.setTimeout(900000);
  141 |     const errors = await boot(page), layout = createHarborVehicleLayout(kind), stair = layout.stairs[0], door = layout.doors[0];
  142 |     const stop = (await snapshot(page)).city.sample.transit.stops.find(s => s.kind === kind);
  143 |     await publicStart(page, `[data-sample-stop="${stop.id}"]`);
  144 |     if (kind === 'ferry') {
  145 |       await faceRoom(page, Math.PI);
  146 |       await walkAxis(page, 'z', stop.board.z, { precision: true, tolerance: .18, timeout: 120000 });
  147 |       expect((await snapshot(page)).position.y).toBeCloseTo(stop.board.y, 1);
  148 |     }
  149 |     await page.waitForFunction(id => window.__NEON__.snapshot().city.sample.transit.vehicles.some(v => v.stopId === id && v.remaining > 2),
  150 |       stop.id, { polling: 'raf', timeout: 180000 });
  151 |     await page.keyboard.press('e');
  152 |     await expect.poll(async () => (await snapshot(page)).city.sample.transit.riding).toBe(true);
  153 |     const boarded = await snapshot(page), vehicleId = boarded.city.sample.transit.ridingVehicleId, revision = boarded.teleportRevision;
  154 |     console.log(JSON.stringify({ stage: `${kind}-boarded`, vehicleId, stopId: stop.id, time: boarded.simulationTime,
  155 |       local: boarded.city.sample.transit.passengerLocal }));
  156 |     expect(boarded.city.sample.transit.passengerDeck).toBe('lower');
  157 |     expect(boarded.city.sample.transit.passengerLocal.y).toBeCloseTo(layout.deckLevels[0], 2);
  158 |     const samples = [], route = [{ x: 0, z: door.z }, { x: 0, z: stair.bottom.z }, stair.bottom,
  159 |       { x: stair.x, z: (stair.startZ + stair.endZ) / 2, y: (stair.fromY + stair.toY) / 2 }, stair.top, { x: 0, z: stair.top.z, y: stair.toY }];
  160 |     let pointer = await cabinPointer(page);
  161 |     try {
  162 |       for (const target of route) {
  163 |         const reached = await walkLocal(page, target, pointer, { precision: kind !== 'ferry' || target.x !== 0 });
  164 |         samples.push(...reached);
  165 |         console.log(JSON.stringify({ stage: `${kind}-upper-waypoint`, target, local: reached.at(-1).local, time: reached.at(-1).time }));
  166 |       }
  167 |     } finally { await page.mouse.up(); }
  168 |     const upper = await snapshot(page);
  169 |     expect(upper.city.sample.transit.passengerDeck).toBe('upper');
  170 |     expect(samples.some(s => s.local.y > stair.fromY + .25 && s.local.y < stair.toY - .25)).toBe(true);
  171 |     expect(upper.teleportRevision).toBe(revision);
  172 |     await page.keyboard.press('e');
  173 |     expect((await snapshot(page)).city.sample.transit.ridingVehicleId).toBe(vehicleId);
  174 |     await captureHigh(page, info, `${kind}-upper-deck-high`);
  175 |     pointer = await cabinPointer(page);
  176 |     try {
  177 |       for (const target of [stair.top, { x: stair.x, z: (stair.startZ + stair.endZ) / 2, y: (stair.fromY + stair.toY) / 2 }, stair.bottom,
  178 |         { x: 0, z: stair.bottom.z, y: stair.fromY }, { x: 0, z: door.z, y: stair.fromY }, door.inside]) {
  179 |         const reached = await walkLocal(page, target, pointer, { precision: kind !== 'ferry' || target.x !== 0 });
  180 |         samples.push(...reached);
  181 |         console.log(JSON.stringify({ stage: `${kind}-lower-waypoint`, target, local: reached.at(-1).local, time: reached.at(-1).time }));
  182 |       }
> 183 |     } finally { await page.mouse.up(); }
      |                                  ^ Error: mouse.up: Target page, context or browser has been closed
  184 |     expect((await snapshot(page)).city.sample.transit.passengerDeck).toBe('lower');
  185 |     await page.waitForFunction(({ id, from }) => {
  186 |       const v = window.__NEON__.snapshot().city.sample.transit.vehicles.find(v => v.id === id);
  187 |       return v.stopId && v.stopId !== from && v.doorsOpen && v.remaining > 2;
  188 |     }, { id: vehicleId, from: stop.id }, { polling: 'raf', timeout: 180000 });
  189 |     const arrival = await snapshot(page), destination = arrival.city.sample.transit.stops.find(s => s.id === arrival.city.sample.transit.currentStopId);
  190 |     expect(arrival.simulationTime).toBeGreaterThan(boarded.simulationTime);
  191 |     expect(arrival.teleportRevision).toBe(revision);
  192 |     expect(Math.hypot(arrival.position.x - boarded.position.x, arrival.position.z - boarded.position.z)).toBeGreaterThan(10);
  193 |     await page.keyboard.press('e');
  194 |     await expect.poll(async () => (await snapshot(page)).city.sample.transit.riding).toBe(false);
  195 |     const outside = await snapshot(page);
  196 |     console.log(JSON.stringify({ stage: `${kind}-alighted`, destination: destination.id, time: outside.simulationTime, position: outside.position }));
  197 |     expect(outside.position.x).toBeCloseTo(destination.board.x, 1);
  198 |     expect(outside.position.z).toBeCloseTo(destination.board.z, 1);
  199 |     expect(outside.city.interior.buildingId).toBeNull();
  200 |     expect(errors).toEqual([]);
  201 |     const evidence = info.outputPath(`${kind}-physical-route.json`);
  202 |     await writeFile(evidence, JSON.stringify({ kind, vehicleId, from: stop.id, to: destination.id, boardedTime: boarded.simulationTime,
  203 |       arrivalTime: arrival.simulationTime, initialSetup: 'one public sample-menu location button',
  204 |       arrival: { position: arrival.position, teleportRevision: arrival.teleportRevision, local: arrival.city.sample.transit.passengerLocal,
  205 |         vehicle: arrival.city.sample.transit.vehicles.find(v => v.id === vehicleId), time: arrival.simulationTime },
  206 |       outside: { position: outside.position, teleportRevision: outside.teleportRevision, riding: outside.city.sample.transit.riding,
  207 |         interiorBuildingId: outside.city.interior.buildingId, time: outside.simulationTime },
  208 |       keyboard: 'real WASD and Z keys with real manual mouse steering', positionWrites: false, clockWrites: false, samples }, null, 2));
  209 |     await info.attach(`${kind}-physical-route`, { path: evidence, contentType: 'application/json' });
  210 |   });
  211 | }
  212 | 
  213 | test('funded cargo and a real purchase persist across reload, with physical delivery and the actual High shop room', async ({ page }, info) => {
  214 |   const errors = await boot(page);
  215 |   await publicStart(page, '[data-sample-supply]');
  216 |   await expect(page.locator('#interaction')).toContainText('货栈领货');
  217 |   const initial = await snapshot(page), job = initial.city.sample.life.availableJobs[0];
  218 |   expect(job.quantity).toBeGreaterThan(0); expect(job.reward).toBe(12);
  219 |   await page.keyboard.press('e');
  220 |   await expect.poll(async () => (await snapshot(page)).city.sample.life.activeDelivery?.id).toBe(job.id);
  221 |   const carrying = await saveThroughUI(page), cargo = carrying.harborLife.jobs.find(j => j.id === job.id);
  222 |   console.log(JSON.stringify({ stage: 'cargo-funded-and-saved', jobId: job.id, quantity: cargo.quantity,
  223 |     escrow: cargo.escrow, time: carrying.harborTransit.time }));
  224 |   expect(cargo).toMatchObject({ status: 'picked-up', carrierId: 'player', escrow: 12, quantity: job.quantity });
  225 |   expect(carrying.harborLife.transactions.filter(t => t.type === 'pickup' && t.jobId === job.id)).toHaveLength(1);
  226 |   expect(carrying.harborLife.transactions.find(t => t.type === 'pickup' && t.jobId === job.id))
  227 |     .toMatchObject({ shopId: job.shopId, from: job.shopId, to: 'harbor-supply', amount: job.wholesale,
  228 |       quantity: job.quantity, product: job.product, escrow: 12 });
  229 |   expect((await snapshot(page)).city.sample.life.totalMoney).toBe(initial.city.sample.life.initialMoney);
  230 |   expect((await snapshot(page)).city.sample.life.totalGoods).toBe(initial.city.sample.life.initialGoods);
  231 |   await page.reload();
  232 |   await expect(page.locator('#start')).toBeEnabled({ timeout: 90000 });
  233 |   const restored = await snapshot(page);
  234 |   expect(restored.city.sample.life.activeDelivery).toMatchObject({ id: job.id, quantity: job.quantity, escrow: 12 });
  235 |   expect(restored.city.sample.transit.time).toBeCloseTo(carrying.harborTransit.time, 3);
  236 |   expect(restored.city.sample.life.totalMoney).toBe(restored.city.sample.life.initialMoney);
  237 |   expect(restored.city.sample.life.totalGoods).toBe(restored.city.sample.life.initialGoods);
  238 |   await page.locator('#start').click();
  239 |   await expect(page.locator('#game')).toBeFocused();
  240 |   const loaded = await snapshot(page), revision = loaded.teleportRevision;
  241 |   await faceRoom(page, Math.PI);
  242 |   // Read the actual pickup location; its counter can move independently of the
  243 |   // building entrance. Offset the central alley from resident queues, then use
  244 |   // the marked x=226 crossing and a pavement point clear of the lamppost.
  245 |   expect(job.shopId).toBe('harbor-produce');
  246 |   const supplyBuilding = loaded.city.buildings.find(b => b.id === 'south-089');
  247 |   const recipientBuilding = loaded.city.buildings.find(b => b.id === 'south-095');
  248 |   const alleyZ = supplyBuilding.entrance.z + .7, pavementZ = Math.floor(recipientBuilding.z / 80) * 80 - 12.5;
  249 |   for (const p of [{ x: loaded.position.x, z: alleyZ }, { x: 201, z: alleyZ }, { x: 201, z: pavementZ },
  250 |     { x: 226, z: pavementZ }, { x: 226, z: job.destination.z }]) {
  251 |     await walkAxis(page, 'x', p.x, { precision: true, tolerance: .18, timeout: 90000 });
  252 |     await walkAxis(page, 'z', p.z, { precision: true, tolerance: .18, timeout: 90000 });
  253 |     expect((await snapshot(page)).teleportRevision).toBe(revision);
  254 |   }
  255 |   await expect(page.locator('#interaction')).toContainText('交货');
  256 |   await page.keyboard.press('e');
  257 |   await expect.poll(async () => (await snapshot(page)).city.sample.life.activeDelivery).toBeNull();
  258 |   const delivered = await saveThroughUI(page), completed = delivered.harborLife.jobs.find(j => j.id === job.id);
  259 |   console.log(JSON.stringify({ stage: 'cargo-delivered-and-saved', jobId: job.id, cash: delivered.cash, time: delivered.harborTransit.time }));
  260 |   expect(completed).toMatchObject({ status: 'delivered', carrierId: 'player', escrow: 0 });
  261 |   expect(delivered.cash).toBe(carrying.cash + job.reward);
  262 |   expect(delivered.harborLife.player.earnedCash).toBe(carrying.harborLife.player.earnedCash + job.reward);
  263 |   expect(delivered.harborLife.player.completed).toBe(carrying.harborLife.player.completed + 1);
  264 |   expect(delivered.harborLife.shops.find(s => s.id === job.shopId).received).toBeGreaterThanOrEqual(job.quantity);
  265 |   expect(delivered.harborLife.transactions.filter(t => t.type === 'delivery' && t.jobId === job.id)).toHaveLength(1);
  266 |   await page.locator('#resume').click();
  267 |   await page.waitForFunction(id => {
  268 |     const shop = window.__NEON__.snapshot().city.sample.life.shops.find(s => s.id === id);
  269 |     return shop.open && shop.staff > 0 && shop.stock > 0;
  270 |   }, job.shopId, { polling: 'raf', timeout: 180000 });
  271 |   const beforePurchase = await snapshot(page), shop = beforePurchase.city.sample.life.shops.find(s => s.id === job.shopId);
  272 |   await expect(page.locator('#interaction')).toContainText('购买');
  273 |   await page.keyboard.press('e');
  274 |   await expect.poll(async () => (await snapshot(page)).city.sample.life.playerInventory[job.product])
  275 |     .toBe(beforePurchase.city.sample.life.playerInventory[job.product] + 1);
  276 |   const purchased = await saveThroughUI(page);
  277 |   expect(purchased.cash).toBe(beforePurchase.cash - shop.price);
  278 |   expect(purchased.harborLife.player.spentCash).toBe(delivered.harborLife.player.spentCash + shop.price);
  279 |   expect(purchased.harborLife.player.inventory[job.product]).toBe(delivered.harborLife.player.inventory[job.product] + 1);
  280 |   expect(purchased.harborLife.transactions.filter(t => t.type === 'delivery' && t.jobId === job.id)).toHaveLength(1);
  281 |   expect(purchased.harborLife.transactions.filter(t => t.type === 'player-purchase' && t.shopId === job.shopId)).toHaveLength(1);
  282 |   expect((await snapshot(page)).city.sample.life.totalMoney).toBe(initial.city.sample.life.initialMoney);
  283 |   expect((await snapshot(page)).city.sample.life.totalGoods).toBe(initial.city.sample.life.initialGoods);
```