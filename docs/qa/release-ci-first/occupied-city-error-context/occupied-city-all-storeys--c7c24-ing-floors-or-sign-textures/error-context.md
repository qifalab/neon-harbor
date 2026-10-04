# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: occupied-city.spec.js >> all storeys are selectable and a visitor walks an upper stair flight without accumulating floors or sign textures
- Location: tests/e2e/occupied-city.spec.js:11:1

# Error details

```
TimeoutError: page.waitForFunction: Timeout 59923ms exceeded.
Walking diagnostics: {"axis":"z","target":-656.9499999999999,"before":{"position":{"x":-240,"y":0,"z":-602.15,"yaw":3.141592653589793},"yaw":3.141592653589793,"simulationTime":1.9999999999999978,"teleportRevision":3,"floorId":"lobby","stationId":null},"current":{"position":{"x":-240,"y":0,"z":-623.1499999999945,"yaw":3.141592653589793},"yaw":3.141592653589793,"simulationTime":3.9999999999999907,"teleportRevision":3,"floorId":"lobby","stationId":null},"samples":[{"value":-602.15,"simulationTime":1.9999999999999978}]}
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
          - text: 天际金融中心 · 室内
          - generic: 16:30 · 晴
      - generic:
        - button "切换步行与跟随视角" [pressed] [ref=e3] [cursor=pointer]: 跟随视角
        - button "打开多人房间" [ref=e4] [cursor=pointer]: 多人
        - button "暂停游戏" [ref=e5] [cursor=pointer]: Ⅱ
    - complementary:
      - generic: 室内探索
      - heading "天际金融迎宾厅" [level=2]
      - generic:
        - button "城市导览 ↗" [ref=e6] [cursor=pointer]
        - button "港湾日常 ↗" [ref=e7] [cursor=pointer]
        - generic: 0 m
    - generic:
      - generic: V
      - generic: Z 慢走微调 · 沿大厅前往电梯
  - status
```

# Test source

```ts
  1   | import { expect } from '@playwright/test';
  2   | 
  3   | export const snapshot = page => page.evaluate(() => window.__NEON__.snapshot());
  4   | const motion = page => page.evaluate(() => {
  5   |   const s = window.__NEON__.snapshot();
  6   |   return { position: s.position, yaw: s.camera?.yaw, simulationTime: s.simulationTime,
  7   |     teleportRevision: s.teleportRevision, floorId: s.city.interior.floorId, stationId: s.city.transit.stationId };
  8   | });
  9   | 
  10  | function axisKey(yaw, axis, positive) {
  11  |   expect(Number.isFinite(yaw), 'a rendered camera supplies the input orientation').toBe(true);
  12  |   const candidates = [
  13  |     { key: 'w', x: Math.sin(yaw), z: Math.cos(yaw) },
  14  |     { key: 's', x: -Math.sin(yaw), z: -Math.cos(yaw) },
  15  |     { key: 'd', x: -Math.cos(yaw), z: Math.sin(yaw) },
  16  |     { key: 'a', x: Math.cos(yaw), z: -Math.sin(yaw) },
  17  |   ].sort((a, b) => positive ? b[axis] - a[axis] : a[axis] - b[axis]);
  18  |   expect(Math.abs(candidates[0][axis]), 'the street/room route uses a cardinal camera view').toBeGreaterThan(.995);
  19  |   return candidates[0].key;
  20  | }
  21  | 
  22  | /** Real key input, with early braking and bounded endpoint corrections.
  23  |  * A renderer can finish more than one simulation frame between a successful
  24  |  * RAF predicate and the protocol key-up. Never assume that first stop is exact.
  25  |  */
  26  | export async function walkAxis(page, axis, target, { timeout = 60000, tolerance = .75, sprint = false, precision = false } = {}) {
  27  |   const before = await motion(page), initial = before.position[axis], deadline = Date.now() + timeout;
  28  |   const sprinting = sprint && !precision && Math.abs(target - initial) > 8;
  29  |   let current = before, adjustmentStart = initial, precisionHeld = false;
  30  |   const samples = [{ value: initial, simulationTime: before.simulationTime }];
  31  |   try {
  32  |     // Travel can clear the camera until its first rendered pose. Only that
  33  |     // initial orientation needs a wait: every input below already waits for
  34  |     // physical movement, so another idle frame before each axis is redundant.
  35  |     if (Math.abs(target - initial) >= tolerance && !Number.isFinite(current.yaw)) {
  36  |       await page.waitForFunction(() => Number.isFinite(window.__NEON__.snapshot().camera?.yaw), null,
  37  |         { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) });
  38  |       current = await motion(page);
  39  |     }
  40  |     // Keep a two-metre braking zone for protocol/render latency. Final approach
  41  |     // holds each input through its first physical movement, then releases it.
  42  |     if (Math.abs(target - initial) > 3.2) {
  43  |       const positive = target > initial, key = axisKey(current.yaw, axis, positive);
  44  |       try {
  45  |         if (sprinting) await page.keyboard.down('Shift');
  46  |         await page.keyboard.down(key);
> 47  |         await page.waitForFunction(({ axis, target, positive }) => {
      |                    ^ TimeoutError: page.waitForFunction: Timeout 59923ms exceeded.
  48  |           const value = window.__NEON__.snapshot().position[axis];
  49  |           return positive ? value >= target - 2.2 : value <= target + 2.2;
  50  |         }, { axis, target, positive }, { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) });
  51  |       } finally {
  52  |         try { await page.keyboard.up(key); }
  53  |         finally { if (sprinting) await page.keyboard.up('Shift'); }
  54  |       }
  55  |       current = await motion(page);
  56  |       samples.push({ value: current.position[axis], simulationTime: current.simulationTime });
  57  |     }
  58  |     adjustmentStart = current.position[axis];
  59  |     if (precision && Math.abs(target - adjustmentStart) >= tolerance) {
  60  |       await page.keyboard.down('z'); precisionHeld = true;
  61  |     }
  62  |     for (let attempt = 0; Math.abs(current.position[axis] - target) >= tolerance && attempt < 24; attempt++) {
  63  |       expect(Date.now(), 'endpoint adjustment keeps the original wall-clock limit').toBeLessThan(deadline);
  64  |       const error = target - current.position[axis], key = axisKey(current.yaw, axis, error > 0);
  65  |       const start = current.position[axis], sign = Math.sign(error);
  66  |       await page.keyboard.down(key);
  67  |       try {
  68  |         // Short wall-clock taps can fall entirely between slow rendered frames.
  69  |         // A clock comparison alone could also pass on a frame before keydown.
  70  |         // Observe movement in the requested direction, then release immediately
  71  |         // before any extra snapshot round trip can consume another held frame.
  72  |         await page.waitForFunction(({ axis, start, sign }) =>
  73  |           sign * (window.__NEON__.snapshot().position[axis] - start) > .01,
  74  |         { axis, start, sign }, { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) });
  75  |       } finally { await page.keyboard.up(key); }
  76  |       current = await motion(page);
  77  |       samples.push({ value: current.position[axis], simulationTime: current.simulationTime });
  78  |       expect(current.teleportRevision, 'walking must not replace the player position').toBe(before.teleportRevision);
  79  |     }
  80  |     expect(Math.abs(current.position[axis] - target), `walked to ${axis}=${target}`).toBeLessThan(tolerance);
  81  |     const movementBudget = precision
  82  |       ? Math.abs(adjustmentStart - initial) / 5.6 + Math.abs(target - adjustmentStart) / .8 + 3
  83  |       : Math.abs(target - initial) / 5.6 + 3;
  84  |     expect(current.simulationTime - before.simulationTime, 'the route is not stalled against a wall').toBeLessThan(movementBudget);
  85  |     expect(current.teleportRevision, 'walking must not replace the player position').toBe(before.teleportRevision);
  86  |   } catch (error) {
  87  |     // A coarse hold can time out before current is refreshed. Read the actual
  88  |     // final pose if the page survives; a closed page must not replace the cause.
  89  |     try { current = await motion(page); } catch {}
  90  |     error.message += `\nWalking diagnostics: ${JSON.stringify({ axis, target, before, current, samples })}`;
  91  |     throw error;
  92  |   } finally { if (precisionHeld) await page.keyboard.up('z'); }
  93  |   return current;
  94  | }
  95  | 
  96  | /** Choose the open landing's interior, clear of a guard's rounded end.
  97  |  * These are ordinary reachable floor positions, not alternative entry points.
  98  |  * The full player radius and bounded endpoint tolerance both need clearance.
  99  |  */
  100 | export function stairWalkingRoute(flight, corridorX) {
  101 |   const bottom = { ...flight.bottom, z: flight.startZ + 1.6 };
  102 |   const top = { ...flight.top, z: flight.endZ - 2.4 };
  103 |   return { bottom, top,
  104 |     middle: { x: flight.x, z: (flight.startZ + flight.endZ) / 2, y: (flight.fromY + flight.toY) / 2 },
  105 |     bypass: [{ x: corridorX, z: top.z, y: top.y }, { x: corridorX, z: bottom.z, y: top.y }] };
  106 | }
  107 | 
  108 | /** An explicit route preserves the landing turns; it is never a teleport path. */
  109 | export async function walkRoute(page, waypoints, { heightTolerance = .75, onPoint } = {}) {
  110 |   const initial = await motion(page), samples = [];
  111 |   for (const [index, point] of waypoints.entries()) {
  112 |     const before = await motion(page);
  113 |     const axes = ['x', 'z'].sort((a, b) => Math.abs(before.position[b] - point[b]) - Math.abs(before.position[a] - point[a]));
  114 |     for (const axis of axes) await walkAxis(page, axis, point[axis]);
  115 |     await expect.poll(async () => Math.abs((await motion(page)).position.y - point.y), { timeout: 10000 }).toBeLessThan(heightTolerance);
  116 |     const arrived = await motion(page);
  117 |     expect(arrived.teleportRevision).toBe(initial.teleportRevision);
  118 |     samples.push({ index, position: arrived.position, simulationTime: arrived.simulationTime });
  119 |     if (onPoint) await onPoint(await snapshot(page), index);
  120 |   }
  121 |   return samples;
  122 | }
  123 | 
```