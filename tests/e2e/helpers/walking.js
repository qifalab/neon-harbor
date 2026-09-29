import { expect } from '@playwright/test';

export const snapshot = page => page.evaluate(() => window.__NEON__.snapshot());

/** Walk one world axis using only held keys. Camera state is read-only. */
export async function walkAxis(page, axis, target, { timeout = 60000, margin = .3 } = {}) {
  const before = await snapshot(page), initial = before.position[axis];
  if (Math.abs(target - initial) < margin) return before;
  const positive = target > initial, yaw = before.camera?.yaw;
  expect(Number.isFinite(yaw), 'a rendered camera supplies the input orientation').toBe(true);
  const candidates = [
    { key: 'w', x: Math.sin(yaw), z: Math.cos(yaw) },
    { key: 's', x: -Math.sin(yaw), z: -Math.cos(yaw) },
    { key: 'd', x: -Math.cos(yaw), z: Math.sin(yaw) },
    { key: 'a', x: Math.cos(yaw), z: -Math.sin(yaw) },
  ].sort((a, b) => (positive ? b[axis] - a[axis] : a[axis] - b[axis]));
  const movement = candidates[0];
  expect(Math.abs(movement[axis]), 'the street/room route uses a cardinal camera view').toBeGreaterThan(.995);
  await page.keyboard.down(movement.key);
  try {
    await page.waitForFunction(({ axis, target, positive, margin }) => {
      const value = window.__NEON__.snapshot().position[axis];
      return positive ? value >= target - margin : value <= target + margin;
    }, { axis, target, positive, margin }, { polling: 'raf', timeout });
  } catch (error) {
    error.message += `\nWalking diagnostics: ${JSON.stringify(await snapshot(page))}`;
    throw error;
  } finally { await page.keyboard.up(movement.key); }
  const after = await snapshot(page);
  expect(Math.abs(after.position[axis] - target), `walked to ${axis}=${target}`).toBeLessThan(1.2);
  expect(after.simulationTime - before.simulationTime, 'the route is not stalled against a wall').toBeLessThan(Math.abs(target - initial) / 5.6 + 3);
  expect(after.teleportRevision, 'walking must not replace the player position').toBe(before.teleportRevision);
  return after;
}

/** An explicit route preserves the landing turns; it is never a teleport path. */
export async function walkRoute(page, waypoints, { heightTolerance = .75, onPoint } = {}) {
  const initial = await snapshot(page), samples = [];
  for (const [index, point] of waypoints.entries()) {
    const before = await snapshot(page);
    // Authored stairs are orthogonal. Choose the larger leg first so a small
    // preceding-frame overshoot is corrected on the safe landing afterwards.
    const axes = ['x', 'z'].sort((a, b) => Math.abs(before.position[b] - point[b]) - Math.abs(before.position[a] - point[a]));
    for (const axis of axes) await walkAxis(page, axis, point[axis]);
    await expect.poll(async () => Math.abs((await snapshot(page)).position.y - point.y), { timeout: 10000 }).toBeLessThan(heightTolerance);
    const arrived = await snapshot(page);
    expect(arrived.teleportRevision).toBe(initial.teleportRevision);
    samples.push({ index, position: arrived.position, simulationTime: arrived.simulationTime });
    if (onPoint) await onPoint(arrived, index);
  }
  return samples;
}
