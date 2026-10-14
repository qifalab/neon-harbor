import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameTelemetry } from '../src/runtime-telemetry.js';

test('frame telemetry reports quantiles and simulation time dropped by a stall', () => {
  const telemetry = new FrameTelemetry({ capacity: 8 });
  for (let i = 0; i < 7; i++) telemetry.record({ wallDt: 1 / 60, steps: 1, simulationDelta: 1 / 60 });
  telemetry.record({ wallDt: .25, droppedSeconds: .2, steps: 15, simulationDelta: .25 });
  const report = telemetry.snapshot();
  assert.equal(report.samples, 8);
  assert.equal(report.totalFrames, 8);
  assert.ok(report.averageFrameMs > 44 && report.averageFrameMs < 47);
  assert.equal(report.p95FrameMs, 250);
  assert.equal(report.p99FrameMs, 250);
  assert.equal(report.maxFrameMs, 250);
  assert.equal(report.stallCount, 1);
  assert.equal(report.droppedSeconds, .2);
  assert.equal(report.status, 'stalled');
});

test('telemetry keeps a bounded window and resets diagnostics', () => {
  const telemetry = new FrameTelemetry({ capacity: 8 });
  for (let i = 0; i < 20; i++) telemetry.record({ wallDt: i % 2 ? .01 : .02 });
  const report = telemetry.snapshot();
  assert.equal(report.samples, 8);
  assert.equal(report.totalFrames, 20);
  assert.ok(report.fps > 60);
  telemetry.reset();
  assert.deepEqual(telemetry.snapshot(), {
    samples: 0, totalFrames: 0, fps: 0, averageFrameMs: 0, p95FrameMs: 0,
    p99FrameMs: 0, maxFrameMs: 0, lastFrameMs: 0, stallCount: 0,
    droppedSeconds: 0, targetFrameMs: 1000 / 60, budget: 'within-budget', status: 'warming',
  });
});
