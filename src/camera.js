import { angleDelta } from './presentation.js';
import { MAX_FRAME_TIME } from './frame-clock.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const lerpPoint = (a, b, t) => ({ x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const CAMERA_RADIUS = 0.45;
const pointInside = (point, box, radius) => box.camera !== false &&
  point.x > box.x - box.hx - radius && point.x < box.x + box.hx + radius &&
  point.z > box.z - box.hz - radius && point.z < box.z + box.hz + radius &&
  point.y > (box.minY ?? 0) - radius && point.y < (box.maxY ?? Infinity) + radius;

/** Player focus can be inside nonphysical foliage or an overhead canopy. */
export function resolveCameraPoint(point, colliders, radius = CAMERA_RADIUS, minimumY = radius) {
  let result = { ...point };
  for (let attempt = 0; attempt < 12; attempt++) {
    const overlaps = colliders.filter(box => pointInside(result, box, radius));
    if (!overlaps.length) return result;
    const exits = overlaps.flatMap(box => [
      { ...result, x: box.x - box.hx - radius - 0.025 },
      { ...result, x: box.x + box.hx + radius + 0.025 },
      { ...result, z: box.z - box.hz - radius - 0.025 },
      { ...result, z: box.z + box.hz + radius + 0.025 },
      { ...result, y: (box.minY ?? 0) - radius - 0.025 },
      { ...result, y: (box.maxY ?? Infinity) + radius + 0.025 },
    ]).filter(p => Number.isFinite(p.y) && p.y >= minimumY)
      .sort((a, b) => distance(a, point) - distance(b, point));
    const clear = exits.find(exit => !colliders.some(box => pointInside(exit, box, radius)));
    if (clear) return clear;
    result = exits[0] || result;
  }
  return result;
}

/** Exact exponential follow for a target moving linearly during this frame.
 * Using both target samples avoids frame-rate-dependent lag at steady speed. */
export function dampMoving(value, previousTarget, target, rate, dt) {
  if (dt <= 0) return value;
  const weight = -Math.expm1(-rate * dt);
  return value + (previousTarget - value) * weight +
    (target - previousTarget) * (1 - weight / (rate * dt));
}

function dampPoint(value, previousTarget, target, rate, dt) {
  return Object.fromEntries(['x', 'y', 'z'].map(key =>
    [key, dampMoving(value[key], previousTarget[key], target[key], rate, dt)]));
}

/** Continuous swept sphere against expanded height-aware boxes. */
export function segmentBoxEntry(start, end, box, radius = CAMERA_RADIUS) {
  if (box.camera === false) return null;
  const low = { x: box.x - box.hx - radius, y: (box.minY ?? 0) - radius,
    z: box.z - box.hz - radius };
  const high = { x: box.x + box.hx + radius, y: (box.maxY ?? Infinity) + radius,
    z: box.z + box.hz + radius };
  let enter = 0, exit = 1;
  for (const axis of ['x', 'y', 'z']) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < 1e-10) {
      if (start[axis] < low[axis] || start[axis] > high[axis]) return null;
      continue;
    }
    const a = (low[axis] - start[axis]) / delta;
    const b = (high[axis] - start[axis]) / delta;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
    if (enter > exit) return null;
  }
  return enter <= 1 && exit >= 0 ? enter : null;
}

export function clipCameraSegment(start, end, colliders, radius = CAMERA_RADIUS) {
  let fraction = 1, colliderId = null;
  for (const collider of colliders) {
    const entry = segmentBoxEntry(start, end, collider, radius);
    if (entry !== null && entry < fraction) {
      fraction = entry;
      colliderId = collider.id ?? null;
    }
  }
  // Leave numerical clearance so a clipped point is outside the expanded box.
  const length = distance(start, end);
  const safe = fraction < 1 ? Math.max(0, fraction - 0.025 / Math.max(length, 0.025)) : 1;
  return { position: lerpPoint(start, end, safe), obstructed: fraction < 1, colliderId };
}

export class ChaseCamera {
  constructor() { this.reset(); }
  reset() { this.initialized = false; this.position = null; this.focus = null; }

  update(subject, controls, dt, colliders = []) {
    dt = clamp(Number.isFinite(dt) ? dt : 0, 0, MAX_FRAME_TIME);
    if (controls.firstPerson) {
      // Walking inspection and seated passengers share eye-level viewing.
      const requestedYaw = controls.yaw;
      this.yaw = !this.initialized ? requestedYaw : this.yaw + angleDelta(requestedYaw, this.yaw) * -Math.expm1(-12 * dt);
      this.pitch = controls.pitch; this.fov = 65; this.clearanceRadius = CAMERA_RADIUS;
      this.position = { x: subject.x, y: subject.y + 1.62, z: subject.z };
      this.focus = { ...this.position };
      this.target = { x: this.position.x + Math.sin(this.yaw) * 10, y: this.position.y - Math.sin(controls.pitch - 0.15) * 10,
        z: this.position.z + Math.cos(this.yaw) * 10 };
      this.boomLength = this.desiredBoomLength = 0; this.obstructed = false; this.overheadFallback = false; this.colliderId = null;
      this.initialized = true; return this.snapshot();
    }
    const focus = { x: subject.x, y: subject.y + 1.35, z: subject.z };
    const requestedYaw = controls.yaw;
    const pitchTarget = clamp(controls.pitch, 0.08, 0.85);
    const speed = controls.driving ? Math.abs(subject.speed) : 0;
    const distanceTarget = controls.driving ? 10.5 + Math.min(speed, 43) * 0.07 : controls.indoor ? 3.5 : 6.8;
    const fovTarget = controls.driving ? 57 + Math.min(speed, 43) * 0.28 : 55;
    // FOV contracts gradually after braking, so retain the larger current cone.
    const collisionFov = Math.max(this.fov || fovTarget, fovTarget);
    const near = controls.near || 0.15, halfHeight = near * Math.tan(collisionFov * Math.PI / 360);
    this.clearanceRadius = Math.max(CAMERA_RADIUS,
      Math.hypot(near, halfHeight, halfHeight * (controls.aspect || 16 / 10)) + 0.025);
    const reset = !this.initialized || (this.focus && distance(focus, this.focus) > 12);

    if (reset) {
      this.focus = focus;
      this.target = { ...focus };
      this.yaw = this.yawTarget = requestedYaw;
      this.pitch = this.pitchTarget = pitchTarget;
      this.followDistance = this.distanceTarget = distanceTarget;
      this.fov = this.fovTarget = fovTarget;
    } else {
      this.target = dampPoint(this.target, this.focus, focus, 18, dt);
      const yawTarget = this.yawTarget + angleDelta(requestedYaw, this.yawTarget);
      this.yaw = dampMoving(this.yaw, this.yawTarget, yawTarget, controls.manual ? 18 : 4.5, dt);
      this.yawTarget = yawTarget;
      this.pitch = dampMoving(this.pitch, this.pitchTarget, pitchTarget, 18, dt);
      this.followDistance = dampMoving(this.followDistance, this.distanceTarget, distanceTarget, 5, dt);
      this.fov = dampMoving(this.fov, this.fovTarget, fovTarget, 3, dt);
      this.pitchTarget = pitchTarget;
      this.distanceTarget = distanceTarget;
      this.fovTarget = fovTarget;
      this.focus = focus;
    }

    // A smoothed target can otherwise cut a building corner behind the subject.
    const safeFocus = resolveCameraPoint(focus, colliders, this.clearanceRadius,
      (controls.floorY ?? 0) + this.clearanceRadius);
    const safeTarget = clipCameraSegment(safeFocus, this.target, colliders, this.clearanceRadius);
    this.target = safeTarget.position;
    let desired = {
      x: this.target.x - Math.sin(this.yaw) * this.followDistance,
      y: this.target.y + 0.45 + this.followDistance * Math.sin(this.pitch),
      z: this.target.z - Math.cos(this.yaw) * this.followDistance,
    };
    let desiredClip = clipCameraSegment(this.target, desired, colliders, this.clearanceRadius);
    this.overheadFallback = false;
    // Under a canopy, an upward boom can collapse into the avatar even though
    // a level camera has a clear route underneath. Prefer that usable view.
    if (distance(this.target, desiredClip.position) < 2) {
      const level = { ...desired, y: this.target.y };
      const levelClip = clipCameraSegment(this.target, level, colliders, this.clearanceRadius);
      if (distance(this.target, levelClip.position) > distance(this.target, desiredClip.position) + 1) {
        desired = level;
        desiredClip = levelClip;
        this.overheadFallback = true;
      }
    }
    const allowedLength = distance(this.target, desiredClip.position);
    this.desiredBoomLength = distance(this.target, desired);
    // Obstructions retract immediately; leaving a wall extends gradually.
    this.boomLength = reset || allowedLength < this.boomLength ? allowedLength :
      this.boomLength + (allowedLength - this.boomLength) * -Math.expm1(-6 * dt);
    const goal = lerpPoint(this.target, desired, this.desiredBoomLength ?
      this.boomLength / this.desiredBoomLength : 0);
    const candidate = reset ? goal : dampPoint(this.position, this.previousGoal, goal, 10, dt);
    const motion = reset ? candidate : clipCameraSegment(this.position, candidate, colliders, this.clearanceRadius).position;
    // Smoothing the camera in world space can itself cut through a corner; sweep
    // the final position too, rather than only testing the desired boom.
    const finalClip = clipCameraSegment(this.target, motion, colliders, this.clearanceRadius);
    this.position = finalClip.position;
    this.previousGoal = goal;
    this.obstructed = this.overheadFallback || desiredClip.obstructed || finalClip.obstructed;
    this.colliderId = finalClip.colliderId || desiredClip.colliderId;
    this.initialized = true;
    return this.snapshot();
  }

  snapshot() {
    if (!this.initialized) return null;
    return {
      position: { ...this.position }, target: { ...this.target }, focus: { ...this.focus },
      yaw: this.yaw, pitch: this.pitch, fov: this.fov,
      boomLength: this.boomLength, desiredBoomLength: this.desiredBoomLength,
      obstructed: this.obstructed, overheadFallback: this.overheadFallback, colliderId: this.colliderId,
      clearanceRadius: this.clearanceRadius,
    };
  }
}
