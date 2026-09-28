import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXED_STEP, RenderSnapshots, angleDelta, captureSimulation } from '../src/presentation.js';
import { ChaseCamera, clipCameraSegment, dampMoving, resolveCameraPoint, segmentBoxEntry } from '../src/camera.js';
import { overlapOBB, VEHICLE_SHAPE } from '../src/collision.js';

const pose = (z = 0, yaw = 0) => ({ x: 0, y: 0, z, yaw, pitch: 0, roll: 0, speed: 43 });
const frame = (elapsed, vehicle = pose(elapsed * 43), revision = 0) => ({
  elapsed, player: pose(), cars: new Map([['car', vehicle]]), inCar: 'car', teleportRevision: revision,
});
const near = (actual, expected, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const variance = values => {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
};
const controls = { driving: true, yaw: 0, pitch: 0.28 };

test('render interpolation removes fixed-step staircasing at 30/60/90/144 Hz and uneven cadences', () => {
  for (const cadence of [[1 / 30], [1 / 60], [1 / 90], [1 / 144], [1 / 144, 1 / 35, 1 / 90, 1 / 55]]) {
    const snapshots = new RenderSnapshots(frame(0));
    let accumulator = 0, elapsed = 0, wallTime = 0, previous;
    const rawSpeeds = [], renderSpeeds = [];
    for (let i = 0; i < 400; i++) {
      const dt = cadence[i % cadence.length];
      wallTime += dt; accumulator += dt;
      while (accumulator >= FIXED_STEP - 1e-12) {
        elapsed += FIXED_STEP;
        accumulator = Math.max(0, accumulator - FIXED_STEP);
        snapshots.advance(frame(elapsed));
      }
      const sampled = snapshots.sample(accumulator / FIXED_STEP);
      if (wallTime > FIXED_STEP) near(sampled.subject.z, 43 * (wallTime - FIXED_STEP), 1e-8);
      if (i > 5) {
        rawSpeeds.push((snapshots.current.cars.get('car').z - previous.raw) / dt);
        renderSpeeds.push((sampled.subject.z - previous.render) / dt);
      }
      previous = { raw: snapshots.current.cars.get('car').z, render: sampled.subject.z };
    }
    assert.ok(Math.sqrt(variance(renderSpeeds)) < 1e-8);
    if (cadence[0] === 1 / 144 && cadence.length === 1) {
      assert.ok(Math.sqrt(variance(rawSpeeds)) > 40);
    }
  }
});

test('yaw interpolation follows the shortest arc; ground, pitch and roll remain shared', () => {
  const a = frame(0, { ...pose(), yaw: Math.PI - 0.02, y: 0.18, pitch: -0.08, roll: 0.1 });
  const b = frame(FIXED_STEP, { ...pose(), yaw: -Math.PI + 0.02, y: 0.28, pitch: 0.04, roll: -0.06 });
  const snapshots = new RenderSnapshots(a);
  snapshots.advance(b);
  const rendered = snapshots.sample(0.5);
  near(Math.abs(rendered.subject.yaw), Math.PI);
  near(rendered.subject.y, 0.23);
  near(rendered.subject.pitch, -0.02);
  near(rendered.subject.roll, 0.02);
  assert.equal(rendered.subject, rendered.cars.get('car'));
  const capture = captureSimulation({ player: { ...pose(), groundY: 0.18, y: 0.5 }, cars: [], inCar: null, elapsed: 0 });
  near(capture.player.y, 0.68);
});

test('teleports and entering or leaving a vehicle never interpolate across the city', () => {
  const snapshots = new RenderSnapshots(frame(0));
  const moved = frame(FIXED_STEP, pose(150));
  assert.equal(snapshots.advance(moved), true);
  near(snapshots.sample(0.01).subject.z, 150);
  const steppedOut = { ...moved, inCar: null, player: { ...pose(), x: 3.5, z: 150 } };
  assert.equal(snapshots.advance(steppedOut), true);
  near(snapshots.sample(0.1).subject.x, 3.5);
  assert.equal(snapshots.advance({ ...steppedOut, teleportRevision: 1 }), true);
});

test('rendered OBB interpolation cannot clip a corner between two legal headings', () => {
  const wall = { x: 11.207742295320596, z: 12.305650245109005, hx: 10, hz: 10 };
  const previous = pose(0, 0), current = pose(0, 0.024);
  assert.equal(overlapOBB(previous, wall), null);
  assert.equal(overlapOBB(current, wall), null);
  assert.ok(overlapOBB(pose(0, 0.012), wall));
  const snapshots = new RenderSnapshots(frame(0, previous), p => !overlapOBB(p, wall));
  snapshots.advance(frame(FIXED_STEP, current));
  assert.equal(overlapOBB(snapshots.sample(0.5).subject, wall), null);
});

test('sequential legal vehicle moves cannot produce a colliding render interpolant', () => {
  const a = { ...pose(), x: -2 * VEHICLE_SHAPE.hx - 0.03, z: -2 * VEHICLE_SHAPE.hz + 0.06 };
  const b = pose();
  const nextA = { ...a, z: a.z - 0.1 }, nextB = { ...b, x: -0.1 };
  assert.equal(overlapOBB(a, b), null);
  assert.equal(overlapOBB(nextA, b), null);
  assert.equal(overlapOBB(nextA, nextB), null);
  assert.ok(overlapOBB({ ...a, z: a.z - 0.05 }, { ...b, x: -0.05 }));
  const previous = { ...frame(0), inCar: 'a', cars: new Map([['a', a], ['b', b]]) };
  const current = { ...frame(FIXED_STEP), inCar: 'a', cars: new Map([['a', nextA], ['b', nextB]]) };
  const snapshots = new RenderSnapshots(previous);
  snapshots.advance(current);
  const sampled = snapshots.sample(0.5);
  assert.equal(overlapOBB(sampled.cars.get('a'), sampled.cars.get('b')), null);
});

test('moving-target exponential damping is cadence-independent at constant speed', () => {
  const outputs = [];
  for (const hz of [30, 60, 90, 144]) {
    let value = 0, previous = 0;
    for (let i = 1; i <= hz * 3; i++) {
      const target = 43 * i / hz;
      value = dampMoving(value, previous, target, 18, 1 / hz);
      previous = target;
    }
    outputs.push(value);
  }
  for (const value of outputs) near(value, outputs[0]);
});

test('chase camera position, look target and yaw stay consistent at 30/60/144 Hz', () => {
  const results = [];
  for (const hz of [30, 60, 144]) {
    const camera = new ChaseCamera();
    camera.update(pose(), controls, 0);
    let result;
    for (let i = 1; i <= hz * 6; i++) {
      const t = i / hz, heading = 0.24 * t;
      result = camera.update({ ...pose(), x: 40 * Math.sin(heading), z: 40 * (1 - Math.cos(heading)), yaw: heading },
        { ...controls, yaw: heading }, 1 / hz);
    }
    results.push(result);
    assert.ok(Math.hypot(result.target.x - result.focus.x, result.target.z - result.focus.z) < 1);
  }
  for (const state of results) {
    assert.ok(Math.hypot(state.position.x - results[0].position.x, state.position.z - results[0].position.z) < 0.03);
    near(state.yaw, results[0].yaw, 1e-8);
  }
});

test('camera follows the same bounded simulation time at 4 Hz and uneven slow frames', () => {
  const results = [];
  for (const cadence of [[1 / 4], [1 / 10], [1 / 60], [0.25, 1 / 60, 0.18, 1 / 30]]) {
    const camera = new ChaseCamera();
    camera.update(pose(), controls, 0);
    let elapsed = 0, state;
    for (let i = 0; elapsed < 6 - 1e-10; i++) {
      const dt = Math.min(cadence[i % cadence.length], 6 - elapsed);
      elapsed += dt;
      state = camera.update(pose(43 * elapsed), controls, dt);
      assert.ok(Math.abs(state.target.z - state.focus.z) < 2.4,
        `${dt} s frame left the camera target ${state.focus.z - state.target.z} m behind`);
    }
    results.push(state);
  }
  for (const result of results) {
    near(result.target.z, results[0].target.z, 1e-8);
    assert.ok(Math.abs(result.position.z - results[0].position.z) < 0.01);
  }
});

test('height-aware swept camera clears curbs, catches thin walls, and pads the near plane', () => {
  const start = { x: 0, y: 1.35, z: 0 }, end = { x: 0, y: 4.2, z: -12 };
  const curb = { x: 0, z: -4, hx: 1, hz: 1, minY: 0, maxY: 0.18 };
  assert.equal(segmentBoxEntry(start, end, curb), null);
  const wall = { x: 0, z: -4.37, hx: 2, hz: 0.01, minY: 0, maxY: 20 };
  const clipped = clipCameraSegment(start, end, [wall]);
  assert.equal(clipped.obstructed, true);
  assert.equal(segmentBoxEntry(start, clipped.position, wall), null);
  const camera = new ChaseCamera();
  const wide = camera.update(pose(), { ...controls, aspect: 8, near: 0.15 }, 0, [wall]);
  assert.ok(wide.clearanceRadius > 0.8);
  assert.equal(segmentBoxEntry(wide.target, wide.position, wall, wide.clearanceRadius), null);
  const braking = camera.update({ ...pose(), speed: 0 }, { ...controls, aspect: 8, near: 0.15 }, 1 / 60, [wall]);
  const nearHalfHeight = 0.15 * Math.tan(braking.fov * Math.PI / 360);
  assert.ok(braking.clearanceRadius >= Math.hypot(0.15, nearHalfHeight, nearHalfHeight * 8));
});

test('camera focus inside foliage is moved to a legal pivot before the boom sweep', () => {
  const foliage = { id: 'canopy', x: 0, z: 0, hx: 2, hz: 2, minY: 1.75, maxY: 5, physics: false };
  const resolved = resolveCameraPoint({ x: 0, y: 1.35, z: 0 }, [foliage]);
  assert.ok(resolved.y < 1.3);
  const camera = new ChaseCamera();
  const state = camera.update(pose(), controls, 0, [foliage]);
  assert.equal(state.overheadFallback, true);
  assert.ok(Math.hypot(state.position.x - state.target.x, state.position.z - state.target.z) > 6);
  assert.equal(segmentBoxEntry(state.target, state.position, foliage), null);
  assert.equal(segmentBoxEntry(state.position, state.position, foliage), null);
});

test('camera retracts without entering buildings and releases an obstruction gradually', () => {
  const wall = { id: 'wall', x: 0, z: -5, hx: 10, hz: 0.3, minY: 0, maxY: 30 };
  const camera = new ChaseCamera();
  const blocked = camera.update(pose(), controls, 0, [wall]);
  assert.equal(blocked.obstructed, true);
  assert.equal(segmentBoxEntry(blocked.target, blocked.position, wall), null);
  const released = camera.update(pose(), controls, 1 / 60, []);
  assert.ok(released.boomLength > blocked.boomLength);
  assert.ok(released.boomLength < released.desiredBoomLength);
  const snapped = camera.update({ ...pose(), x: 200 }, controls, 1 / 60, []);
  near(snapped.focus.x, 200);
  near(snapped.target.x, 200);
  near(snapped.position.x, 200);
});

test('camera takes shortest yaw arc and does not advance its pose with a zero timestep', () => {
  const camera = new ChaseCamera();
  const start = camera.update(pose(), { ...controls, yaw: Math.PI - 0.02 }, 0);
  const state = camera.update(pose(), { ...controls, yaw: -Math.PI + 0.02 }, 1 / 60);
  assert.ok(Math.abs(angleDelta(state.yaw, start.yaw)) < 0.02);
  const frozen = camera.update(pose(), { ...controls, yaw: -Math.PI + 0.02 }, 0);
  assert.deepEqual(frozen.position, state.position);
  assert.deepEqual(frozen.target, state.target);
  near(frozen.yaw, state.yaw);
});
