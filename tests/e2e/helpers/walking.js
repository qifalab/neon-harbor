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
export async function walkAxis(page, axis, target, { timeout = 60000, tolerance = .75 } = {}) {
  const before = await motion(page), initial = before.position[axis], deadline = Date.now() + timeout;
  let current = before;
  const samples = [{ value: initial, simulationTime: before.simulationTime }];
  const afterPhysicsFrame = async since => {
    expect(Date.now(), 'waiting for a physics frame keeps the original wall-clock limit').toBeLessThan(deadline);
    await page.waitForFunction(since => window.__NEON__.snapshot().simulationTime > since, since,
      { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) });
    return motion(page);
  };
  try {
    // Resuming settings suspends the frame clock; shader compilation may also
    // leave many protocol reads on that same paused frame. Await actual physics
    // before sending a move, rather than spending all corrections on stale data.
    if (Math.abs(target - initial) >= tolerance) current = await afterPhysicsFrame(before.simulationTime);
    // Keep a two-metre braking zone for protocol/render latency. Final approach
    // holds each input through its first physical movement, then releases it.
    if (Math.abs(target - initial) > 3.2) {
      const positive = target > initial, key = axisKey(current.yaw, axis, positive);
      await page.keyboard.down(key);
      try {
        await page.waitForFunction(({ axis, target, positive }) => {
          const value = window.__NEON__.snapshot().position[axis];
          return positive ? value >= target - 2.2 : value <= target + 2.2;
        }, { axis, target, positive }, { polling: 'raf', timeout: Math.max(1, deadline - Date.now()) });
      } finally { await page.keyboard.up(key); }
      current = await motion(page);
      samples.push({ value: current.position[axis], simulationTime: current.simulationTime });
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
    expect(current.simulationTime - before.simulationTime, 'the route is not stalled against a wall').toBeLessThan(Math.abs(target - initial) / 5.6 + 3);
    expect(current.teleportRevision, 'walking must not replace the player position').toBe(before.teleportRevision);
  } catch (error) {
    error.message += `\nWalking diagnostics: ${JSON.stringify({ axis, target, before, current, samples })}`;
    throw error;
  }
  return snapshot(page);
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
  const initial = await snapshot(page), samples = [];
  for (const [index, point] of waypoints.entries()) {
    const before = await motion(page);
    const axes = ['x', 'z'].sort((a, b) => Math.abs(before.position[b] - point[b]) - Math.abs(before.position[a] - point[a]));
    for (const axis of axes) await walkAxis(page, axis, point[axis]);
    await expect.poll(async () => Math.abs((await motion(page)).position.y - point.y), { timeout: 10000 }).toBeLessThan(heightTolerance);
    const arrived = await snapshot(page);
    expect(arrived.teleportRevision).toBe(initial.teleportRevision);
    samples.push({ index, position: arrived.position, simulationTime: arrived.simulationTime });
    if (onPoint) await onPoint(arrived, index);
  }
  return samples;
}
