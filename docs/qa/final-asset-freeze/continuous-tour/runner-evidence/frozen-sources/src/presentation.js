/** Fixed-step simulation poses are sampled once, then shared by models and camera. */
import { overlapOBB, circleOBB, CHARACTER_RADIUS } from './collision.js';
import { vehiclePoseEnvelope } from './ground-support.js';
import { PLAYER_DIMENSIONS } from './world-config.js';
export const FIXED_STEP = 1 / 60;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const angleDelta = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const pose = (entity, ground = 0) => ({
  id: entity.id, health: entity.health ?? 100,
  x: entity.x, y: ground + (entity.y || 0), z: entity.z,
  yaw: entity.yaw, pitch: entity.pitch || 0, roll: entity.roll || 0, speed: entity.speed || 0,
});

export function captureSimulation(simulation) {
  return {
    player: pose(simulation.player, simulation.player.groundY || 0),
    cars: new Map(simulation.cars.map(car => [car.id, pose(car)])),
    inCar: simulation.inCar,
    elapsed: simulation.elapsed,
    teleportRevision: simulation.teleportRevision || 0,
  };
}

function subject(frame) { return frame.cars.get(frame.inCar) || frame.player; }
function movedFar(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 12; }
function interpolatePose(previous, current, alpha) {
  if (!previous || movedFar(previous, current)) return { ...current };
  const lerp = key => previous[key] + (current[key] - previous[key]) * alpha;
  return { ...current, x: lerp('x'), y: lerp('y'), z: lerp('z'),
    yaw: previous.yaw + angleDelta(current.yaw, previous.yaw) * alpha,
    pitch: lerp('pitch'), roll: lerp('roll'), speed: lerp('speed') };
}

/** Simultaneously interpolated bodies may cross although sequential physics
 * moves were legal. Revert only interacting interpolants, propagating through
 * a contact cluster, to the already-resolved authoritative snapshot. */
export function resolveDynamicInterpolation(frame, authoritative) {
  const ids = [...frame.cars.keys()].filter(id => frame.cars.get(id).health !== 0);
  const reverted = new Set();
  let playerReverted = false;
  const shape = value => ({ ...value, ...vehiclePoseEnvelope(value) });
  const shaped = new Map(ids.map(id => [id, shape(frame.cars.get(id))]));
  const revert = id => {
    if (reverted.has(id)) return false;
    frame.cars.set(id, { ...authoritative.cars.get(id) });
    shaped.set(id, shape(frame.cars.get(id)));
    reverted.add(id); return true;
  };
  for (let pass = 0; pass <= ids.length; pass++) {
    let changed = false;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = shaped.get(ids[i]), b = shaped.get(ids[j]);
      if (a.minY >= b.maxY || b.minY >= a.maxY) continue;
      if (overlapOBB(a, b)) {
        changed = revert(ids[i]) || changed;
        changed = revert(ids[j]) || changed;
      }
    }
    if (!frame.inCar) for (const id of ids) {
      const car = shaped.get(id), player = frame.player;
      if (player.y >= car.maxY || player.y + PLAYER_DIMENSIONS.height <= car.minY) continue;
      if (circleOBB({ ...player, radius: CHARACTER_RADIUS }, car)) {
        changed = revert(id) || changed;
        if (!playerReverted) { frame.player = { ...authoritative.player }; playerReverted = true; changed = true; }
      }
    }
    if (!changed) break;
  }
  return frame;
}

export class RenderSnapshots {
  constructor(frame, isPoseSafe = null) {
    this.isPoseSafe = isPoseSafe;
    this.resetCount = 0;
    this.reset(frame);
  }

  reset(frame) {
    this.previous = frame;
    this.current = frame;
    this.resetCount += 1;
  }

  /** Called immediately after each physics step, never from the renderer. */
  advance(frame) {
    if (frame.inCar !== this.current.inCar ||
        frame.teleportRevision !== this.current.teleportRevision ||
        movedFar(subject(frame), subject(this.current))) {
      this.reset(frame);
      return true;
    }
    this.previous = this.current;
    this.current = frame;
    return false;
  }

  sample(alpha) {
    alpha = clamp(alpha, 0, 1);
    const current = this.current;
    const samplePose = (previous, pose, kind) => {
      const interpolated = interpolatePose(previous, pose, alpha);
      // Legal endpoints do not imply a legal rotating/diagonal middle pose.
      // Keep the authoritative collision-safe endpoint for that rare corner.
      return this.isPoseSafe && !this.isPoseSafe(interpolated, kind) ? { ...pose } : interpolated;
    };
    const frame = {
      player: samplePose(this.previous.player, current.player, 'player'),
      cars: new Map([...current.cars].map(([id, car]) =>
        [id, samplePose(this.previous.cars.get(id), car, 'vehicle')])),
      inCar: current.inCar,
      elapsed: this.previous.elapsed + (current.elapsed - this.previous.elapsed) * alpha,
      alpha,
    };
    resolveDynamicInterpolation(frame, current);
    frame.subject = subject(frame);
    return frame;
  }
}
