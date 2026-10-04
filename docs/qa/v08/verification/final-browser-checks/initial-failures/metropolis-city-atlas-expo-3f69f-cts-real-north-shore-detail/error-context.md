# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: metropolis.spec.js >> city atlas exposes all three shores and fetches and evicts real north-shore detail
- Location: tests/e2e/metropolis.spec.js:62:1

# Error details

```
Error: expect(received).toHaveLength(expected)

Expected length: 48
Received length: 47
Received array:  [{"color": "#c6b79b", "depth": 64, "description": "双翼石墙围合中庭，铜顶灯塔俯瞰轮渡航道。", "district": "waterfront", "englishName": "Tide Maritime Museum", "entrance": [Object], "floors": [Array], "height": 34, "id": "tide-museum", "index": 0, "name": "潮汐海事博物馆", "style": "museum", "width": 88, "x": -560, "z": -490}, {"color": "#a9b6a0", "depth": 66, "description": "锯齿采光屋面下是鱼市与海鲜餐厅，外廊保留旧港仓的尺度。", "district": "waterfront", "englishName": "Harbour Fish Market", "entrance": [Object], "floors": [Array], "height": 24, "id": "harbor-market", "index": 1, "name": "海湾鱼市场", "style": "market", "width": 100, "x": -400, "z": -490}, {"color": "#dfd2b6", "depth": 60, "description": "连续拱廊与钟楼组成海滨会馆，屋顶露台面向老港。", "district": "waterfront", "englishName": "Ferry House", "entrance": [Object], "floors": [Array], "height": 42, "id": "ferry-house", "index": 2, "name": "渡海会馆", "style": "colonial", "width": 76, "x": -240, "z": -490}, {"color": "#bdb29e", "depth": 66, "description": "层层退台的客房塔楼，入口雨棚与高处空中花园相呼应。", "district": "waterfront", "englishName": "Meridian Hotel", "entrance": [Object], "floors": [Array], "height": 144, "id": "meridian-hotel", "index": 3, "name": "子午线酒店", "style": "hotel", "width": 66, "x": -80, "z": -490}, {"color": "#d5d6ca", "depth": 74, "description": "起伏壳形屋面覆盖展厅，海滨大厅连通会议层。", "district": "waterfront", "englishName": "Pearl Convention Centre", "entrance": [Object], "floors": [Array], "height": 48, "id": "pearl-convention", "index": 4, "name": "明珠会展中心", "style": "convention", "width": 108, "x": 80, "z": -490}, {"color": "#d6d0b9", "depth": 60, "description": "斜撑立面与逐级收拢的船帆轮廓，观景台朝向海湾。", "district": "waterfront", "englishName": "Sail Yacht Club", "entrance": [Object], "floors": [Array], "height": 48, "id": "sail-club", "index": 5, "name": "帆影游艇会", "style": "sail", "width": 78, "x": 240, "z": -490}, {"color": "#aebbb7", "depth": 68, "description": "叠合弧拱构成剧院外壳，门厅前设有公共广场。", "district": "waterfront", "englishName": "Wave Theatre", "entrance": [Object], "floors": [Array], "height": 46, "id": "wave-theatre", "index": 6, "name": "浪潮剧院", "style": "theatre", "width": 100, "x": 400, "z": -490}, {"color": "#759a94", "depth": 70, "description": "竖向青绿金属鳍片包裹金融塔楼，石材大堂通向屋顶花园。", "district": "central", "englishName": "Jade Bank", "entrance": [Object], "floors": [Array], "height": 188, "id": "jade-bank", "index": 8, "name": "翡翠银行", "style": "fins", "width": 72, "x": -560, "z": -630}, {"color": "#c9c1ab", "depth": 76, "description": "宽阔柱廊托起交易大厅，中央高窗呈现旧金融建筑的比例。", "district": "central", "englishName": "Harbour Exchange", "entrance": [Object], "floors": [Array], "height": 74, "id": "exchange-hall", "index": 9, "name": "港城交易所", "style": "exchange", "width": 104, "x": -400, "z": -630}, {"color": "#8caaae", "depth": 62, "description": "三段收分的超高层与细长塔冠，城市最高的公共观景层。", "district": "central", "englishName": "Apex Financial Centre", "entrance": [Object], "floors": [Array], "height": 276, "id": "apex-tower", "index": 10, "name": "天际金融中心", "style": "spire", "width": 62, "x": -240, "z": -630}, …]
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
          - text: 海风大道
          - generic: 16:31 · 晴
      - generic:
        - button "切换步行与跟随视角" [ref=e3] [cursor=pointer]: 步行视角
        - button "打开多人房间" [ref=e4] [cursor=pointer]: 多人
        - button "暂停游戏" [ref=e5] [cursor=pointer]: Ⅱ
    - complementary:
      - generic: 自由探索
      - heading "这座城市，等你出发。" [level=2]
      - paragraph: M 查看全城地图，城市导览可寻找建筑与站点。跨海桥通往北岸六区。
      - generic:
        - button "委托中心 ↗" [ref=e6] [cursor=pointer]
        - button "城市导览 ↗" [ref=e7] [cursor=pointer]
        - generic: TAB
    - generic:
      - button "打开城市地图" [ref=e8] [cursor=pointer]:
        - generic [ref=e10]: "N"
        - generic [ref=e11]: ↗
      - generic:
        - generic: HP
        - generic: ST
    - generic:
      - generic: V
      - generic: 切换步行 / 跟随视角 · 拖动画面环顾
  - status
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { walkRoute } from './helpers/walking.js';
  3   | 
  4   | // Software-GPU CI still exercises the shipped renderer and real controls.
  5   | // State reads are diagnostic only; travel uses the player-facing city atlas.
  6   | test.use({ viewport: { width: 640, height: 400 } });
  7   | test.setTimeout(240000);
  8   | const snapshot = page => page.evaluate(() => window.__NEON__.snapshot());
  9   | 
  10  | async function boot(page) {
  11  |   const errors = [];
  12  |   page.on('pageerror', error => errors.push(error.message));
  13  |   page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  14  |   page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  15  |   await page.goto('/');
  16  |   try { await expect(page.locator('#start')).toBeEnabled({ timeout: 60000 }); }
  17  |   catch (error) { error.message += `\nBrowser errors: ${JSON.stringify(errors)}`; throw error; }
  18  |   await page.locator('#welcome-settings').click();
  19  |   await page.locator('#quality').selectOption('low');
  20  |   await page.locator('#resume').click();
  21  |   await page.locator('#start').click();
  22  |   await expect(page.locator('#game')).toBeFocused();
  23  |   return errors;
  24  | }
  25  | 
  26  | async function atlas(page) {
  27  |   await page.locator('#explore-city').click();
  28  |   await expect(page.locator('#atlas-results')).toBeVisible();
  29  | }
  30  | 
  31  | async function visit(page, kind, id) {
  32  |   await atlas(page);
  33  |   await page.locator(`[data-visit-${kind}="${id}"]`).click();
  34  |   await expect(page.locator('#panel')).not.toBeVisible({ timeout: 30000 });
  35  |   await expect(page.locator('#game')).toBeFocused();
  36  | }
  37  | 
  38  | async function walk(page, keys, predicate, timeout = 45000) {
  39  |   for (const key of keys) await page.keyboard.down(key);
  40  |   try {
  41  |     await page.waitForFunction(`(${predicate.toString()})(window.__NEON__.snapshot())`, null, { polling: 'raf', timeout });
  42  |   } catch (error) {
  43  |     error.message += `\nCity diagnostics: ${JSON.stringify(await snapshot(page))}`;
  44  |     throw error;
  45  |   } finally { for (const key of keys) await page.keyboard.up(key); }
  46  | }
  47  | 
  48  | async function waitForLift(page) {
  49  |   const start = await snapshot(page);
  50  |   // The highest destination is the 260 m observation floor, not the new
  51  |   // 4.2 m gallery. Its ~30 simulated seconds can take 120 wall seconds on
  52  |   // a 1 FPS software GPU with the shipped 0.25 s catch-up cap.
  53  |   const timeout = Math.max(90000, (start.city.interior.elevator.duration + 3) * 4500);
  54  |   // Keep the waiting predicate in the browser; transferring the complete city
  55  |   // catalog for every poll adds work while a slow GPU is presenting the lift.
  56  |   await page.waitForFunction(() => window.__NEON__.snapshot().city.interior.moving === false, null,
  57  |     { polling: 'raf', timeout });
  58  |   const finish = await snapshot(page);
  59  |   expect(finish.simulationTime - start.simulationTime).toBeLessThan(start.city.interior.elevator.duration + 3);
  60  | }
  61  | 
  62  | test('city atlas exposes all three shores and fetches and evicts real north-shore detail', async ({ page }) => {
  63  |   const chunks = [];
  64  |   page.on('response', response => { if (/\/assets\/metropolis\/chunks\/[^/]+\.json/.test(response.url())) chunks.push(response); });
  65  |   const errors = await boot(page);
  66  |   const buildings = (await snapshot(page)).city.buildings;
> 67  |   expect(buildings.filter(building => !['south-expansion', 'east-expansion'].includes(building.district))).toHaveLength(48);
      |                                                                              ^ Error: expect(received).toHaveLength(expected)
  68  |   expect(buildings.filter(building => building.district === 'south-expansion')).toHaveLength(96);
  69  |   expect(buildings.filter(building => building.district === 'east-expansion')).toHaveLength(76);
  70  |   expect(buildings).toHaveLength(220);
  71  |   await atlas(page);
  72  |   await expect(page.locator('[data-building-id]')).toHaveCount(buildings.length);
  73  |   expect((await page.locator('[data-building-id]').evaluateAll(nodes => nodes.map(node => node.dataset.buildingId))).sort()).toEqual(buildings.map(building => building.id).sort());
  74  |   await page.locator('#atlas-district').selectOption('south-expansion');
  75  |   await expect(page.locator('[data-building-id]')).toHaveCount(96);
  76  |   await page.locator('#atlas-district').selectOption('east-expansion');
  77  |   await expect(page.locator('[data-building-id]')).toHaveCount(76);
  78  |   await page.locator('#atlas-district').selectOption('oldtown');
  79  |   await expect(page.locator('[data-building-id]')).toHaveCount(8);
  80  |   await page.locator('#atlas-district').selectOption('');
  81  |   await page.locator('#atlas-search').fill('Apex');
  82  |   await expect(page.locator('[data-building-id]')).toHaveCount(1);
  83  |   await expect(page.locator('[data-building-id="apex-tower"]')).toBeVisible();
  84  |   await page.locator('#atlas-search').fill('');
  85  |   await page.locator('[data-visit-building="tide-museum"]').click();
  86  |   await expect(page.locator('#panel')).not.toBeVisible();
  87  |   const first = (await snapshot(page)).city.streaming;
  88  |   expect(first.ready).toBe(true);
  89  |   expect(first.loaded).toBeGreaterThan(0);
  90  |   await expect(page.locator('#interaction')).toContainText('进入 潮汐海事博物馆');
  91  |   await page.screenshot({ path: 'test-results/screenshots/08-north-waterfront.png' });
  92  |   await visit(page, 'building', 'harbour-labs');
  93  |   await page.waitForFunction(() => {
  94  |     const s = window.__NEON__.snapshot().city.streaming;
  95  |     return s.pending === 0 && s.unloaded > 0 && s.targetChunks.every(id => s.activeChunks.includes(id));
  96  |   }, null, { polling: 'raf', timeout: 30000 });
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
```