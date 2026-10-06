import { expect } from '@playwright/test';

export const snapshot = page => page.evaluate(() => window.__NEON__.snapshot());
const motion = page => page.evaluate(() => {
  const s = window.__NEON__.snapshot();
  return { position: s.position, yaw: s.camera?.yaw, simulationTime: s.simulationTime,
    teleportRevision: s.teleportRevision, floorId: s.city.interior.floorId, stationId: s.city.transit.stationId };
});

function axisKey(yaw, axis, positive) {
  expect(Number.isFinite(yaw), 'a rendered camera supplies the input orientation').toBe(true);
  const candidates = [
    { key: 'w', x: Math.sin(yaw), z: Math.cos(yaw) },
    { key: 's', x: -Math.sin(yaw), z: -Math.cos(yaw) },
    { key: 'd', x: -Math.cos(yaw), z: Math.sin(yaw) },
    { key: 'a', x: Math.cos(yaw), z: -Math.sin(yaw) },
  ].sort((a, b) => positive ? b[axis] - a[axis] : a[axis] - b[axis]);
  expect(Math.abs(candidates[0][axis]), 'the street/room route uses a cardinal camera view').toBeGreaterThan(.995);
  return candidates[0].key;
}

/** Real key input, with early braking and bounded endpoint corrections.
 * A renderer can finish more than one simulation frame between a successful
 * RAF predicate and the protocol key-up. Never assume that first stop is exact.
 */
export async function walkAxis(page, axis, target, { timeout = 120000, tolerance = .75, sprint = false, precision = false } = {}) {
  const before = await motion(page), initial = before.position[axis], deadline = Date.now() + timeout;
  const sprinting = sprint && !precision && Math.abs(target - initial) > 8;
  let current = before, adjustmentStart = initial, precisionHeld = false;
  const samples = [{ value: initial, simulationTime: before.simulationTime }];
  try {
    // Travel can clear the camera until its first rendered pose. Only that
    // initial orientation needs a wait: every input below already waits for
    // physical movement, so another idle frame before each axis is redundant.
    if (Math.abs(target - initial) >= tolerance && !Number.isFinite(current.yaw)) {
      await page.waitForFunction(() => Number.isFinite(window.__NEON__.snapshot().camera?.yaw), null,
        { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) });
      current = await motion(page);
    }
    // Keep a two-metre braking zone for protocol/render latency. Final approach
    // holds each input through its first physical movement, then releases it.
    if (Math.abs(target - initial) > 3.2) {
      const positive = target > initial, key = axisKey(current.yaw, axis, positive);
      try {
        if (sprinting) await page.keyboard.down('Shift');
        await page.keyboard.down(key);
        await page.waitForFunction(({ axis, target, positive }) => {
          const value = window.__NEON__.snapshot().position[axis];
          return positive ? value >= target - 2.2 : value <= target + 2.2;
        }, { axis, target, positive }, { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) });
      } finally {
        try { await page.keyboard.up(key); }
        finally { if (sprinting) await page.keyboard.up('Shift'); }
      }
      current = await motion(page);
      samples.push({ value: current.position[axis], simulationTime: current.simulationTime });
    }
    adjustmentStart = current.position[axis];
    if (precision && Math.abs(target - adjustmentStart) >= tolerance) {
      await page.keyboard.down('z'); precisionHeld = true;
    }
    for (let attempt = 0; Math.abs(current.position[axis] - target) >= tolerance && attempt < 24; attempt++) {
      expect(Date.now(), 'endpoint adjustment keeps the original wall-clock limit').toBeLessThan(deadline);
      const error = target - current.position[axis], key = axisKey(current.yaw, axis, error > 0);
      const start = current.position[axis], sign = Math.sign(error);
      await page.keyboard.down(key);
      try {
        // Short wall-clock taps can fall entirely between slow rendered frames.
        // A clock comparison alone could also pass on a frame before keydown.
        // Observe movement in the requested direction, then release immediately
        // before any extra snapshot round trip can consume another held frame.
        await page.waitForFunction(({ axis, start, sign }) =>
          sign * (window.__NEON__.snapshot().position[axis] - start) > .01,
        { axis, start, sign }, { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) });
      } finally { await page.keyboard.up(key); }
      current = await motion(page);
      samples.push({ value: current.position[axis], simulationTime: current.simulationTime });
      expect(current.teleportRevision, 'walking must not replace the player position').toBe(before.teleportRevision);
    }
    expect(Math.abs(current.position[axis] - target), `walked to ${axis}=${target}`).toBeLessThan(tolerance);
    const movementBudget = precision
      ? Math.abs(adjustmentStart - initial) / 5.6 + Math.abs(target - adjustmentStart) / .8 + 3
      : Math.abs(target - initial) / 5.6 + 3;
    expect(current.simulationTime - before.simulationTime, 'the route is not stalled against a wall').toBeLessThan(movementBudget);
    expect(current.teleportRevision, 'walking must not replace the player position').toBe(before.teleportRevision);
  } catch (error) {
    // A coarse hold can time out before current is refreshed. Read the actual
    // final pose if the page survives; a closed page must not replace the cause.
    try { current = await motion(page); } catch {}
    error.message += `\nWalking diagnostics: ${JSON.stringify({ axis, target, before, current, samples })}`;
    throw error;
  } finally { if (precisionHeld) await page.keyboard.up('z'); }
  return current;
}

/** Choose the open landing's interior, clear of a guard's rounded end.
 * These are ordinary reachable floor positions, not alternative entry points.
 * The full player radius and bounded endpoint tolerance both need clearance.
 */
export function stairWalkingRoute(flight, corridorX) {
  const bottom = { ...flight.bottom, z: flight.startZ + 1.6 };
  const top = { ...flight.top, z: flight.endZ - 2.4 };
  return { bottom, top,
    middle: { x: flight.x, z: (flight.startZ + flight.endZ) / 2, y: (flight.fromY + flight.toY) / 2 },
    bypass: [{ x: corridorX, z: top.z, y: top.y }, { x: corridorX, z: bottom.z, y: top.y }] };
}

/** An explicit route preserves the landing turns; it is never a teleport path. */
export async function walkRoute(page, waypoints, { heightTolerance = .75, onPoint } = {}) {
  const initial = await motion(page), samples = [];
  for (const [index, point] of waypoints.entries()) {
    const before = await motion(page);
    const axes = ['x', 'z'].sort((a, b) => Math.abs(before.position[b] - point[b]) - Math.abs(before.position[a] - point[a]));
    for (const axis of axes) await walkAxis(page, axis, point[axis]);
    await expect.poll(async () => Math.abs((await motion(page)).position.y - point.y), { timeout: 10000 }).toBeLessThan(heightTolerance);
    const arrived = await motion(page);
    expect(arrived.teleportRevision).toBe(initial.teleportRevision);
    samples.push({ index, position: arrived.position, simulationTime: arrived.simulationTime });
    if (onPoint) await onPoint(await snapshot(page), index);
  }
  return samples;
}
