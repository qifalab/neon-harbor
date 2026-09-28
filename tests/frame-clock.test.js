import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepClock, MAX_FRAME_TIME } from '../src/frame-clock.js';

test('bounded fixed-step clock preserves visible simulation time at 4–144 Hz', () => {
  for (const hz of [4, 5, 10, 30, 60, 90, 144]) {
    const clock = new FixedStepClock();
    clock.advance(0, true);
    let elapsed = 0;
    for (let i = 1; i <= hz * 12; i++) {
      const frame = clock.advance(i * 1000 / hz, true);
      elapsed += frame.simulationDelta;
      assert.ok(frame.steps <= 15);
      assert.ok(frame.alpha >= 0 && frame.alpha < 1);
    }
    assert.ok(Math.abs(elapsed - 12) < 1e-8, `${hz} Hz simulated ${elapsed} seconds`);
    assert.ok(clock.droppedTotal < 1e-8);
  }
});

test('a long rendering stall runs at most 15 small steps without a future backlog', () => {
  const clock = new FixedStepClock();
  clock.advance(0, true);
  const stalled = clock.advance(3000, true);
  assert.equal(stalled.wallDt, 3);
  assert.equal(stalled.steps, 15);
  assert.equal(stalled.simulationDelta, MAX_FRAME_TIME);
  assert.equal(stalled.droppedSeconds, 2.75);
  assert.equal(clock.advance(3000 + 1000 / 60, true).steps, 1);
});

test('pause and visibility resume discard inactive time without rewinding the rendered phase', () => {
  const clock = new FixedStepClock();
  clock.advance(0, true);
  const frozenAlpha = clock.advance(10, true).alpha;
  assert.ok(frozenAlpha > 0);
  clock.suspend();
  assert.equal(clock.advance(1000, false).steps, 0);
  assert.equal(clock.advance(3000, false).steps, 0);
  clock.suspend();
  const resumed = clock.advance(63000, true);
  assert.equal(resumed.steps, 0);
  assert.equal(resumed.dt, 0);
  assert.equal(resumed.alpha, frozenAlpha);
  assert.equal(resumed.droppedTotal, 0);
  assert.equal(clock.advance(63000 + 1000 / 60, true).steps, 1);
  clock.suspend(true);
  assert.equal(clock.advance(64000, true).alpha, 0);
});
