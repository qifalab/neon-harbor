/**
 * Low-allocation frame telemetry for the browser hot path.
 *
 * The simulation clock already clamps long frames. This module records the
 * visible frame cost and the amount of simulation time intentionally dropped
 * by that clamp, so QA can distinguish a slow renderer from a slow simulation
 * clock without changing gameplay state.
 */
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return sorted[index];
}

export class FrameTelemetry {
  constructor({ capacity = 240, targetFrameMs = 1000 / 60 } = {}) {
    if (!Number.isInteger(capacity) || capacity < 8) throw new RangeError('Frame telemetry capacity must be at least 8.');
    this.capacity = capacity;
    this.targetFrameMs = targetFrameMs;
    // Keep only frame durations in a typed ring. The hot path writes a number
    // and advances two counters; snapshots do the sorting/copying off path.
    this.samples = new Float64Array(capacity);
    this.sampleCount = 0;
    this.cursor = 0;
    this.totalDroppedSeconds = 0;
    this.totalFrames = 0;
    this.stallCount = 0;
  }

  record({ wallDt = 0, droppedSeconds = 0, steps = 0, simulationDelta = 0 } = {}) {
    const frameMs = Math.max(0, finite(wallDt) * 1000);
    const dropped = Math.max(0, finite(droppedSeconds));
    // Keep the arguments in the signature so callers can record the same
    // frame timing object without allocating a second instrumentation path.
    void steps;
    void simulationDelta;
    this.samples[this.cursor] = frameMs;
    this.cursor = (this.cursor + 1) % this.capacity;
    this.sampleCount = Math.min(this.capacity, this.sampleCount + 1);
    this.totalDroppedSeconds += dropped;
    this.totalFrames += 1;
    if (frameMs >= 50) this.stallCount += 1;
  }

  snapshot() {
    const frames = [];
    const start = (this.cursor - this.sampleCount + this.capacity) % this.capacity;
    for (let index = 0; index < this.sampleCount; index++) {
      frames.push(this.samples[(start + index) % this.capacity]);
    }
    const totalMs = frames.reduce((sum, value) => sum + value, 0);
    const averageFrameMs = frames.length ? totalMs / frames.length : 0;
    const lastFrameMs = frames.at(-1) || 0;
    const fps = averageFrameMs > 0 ? 1000 / averageFrameMs : 0;
    const p95FrameMs = percentile(frames, .95);
    const p99FrameMs = percentile(frames, .99);
    const budget = p95FrameMs <= this.targetFrameMs ? 'within-budget' : 'over-budget';
    return {
      samples: frames.length,
      totalFrames: this.totalFrames,
      fps,
      averageFrameMs,
      p95FrameMs,
      p99FrameMs,
      maxFrameMs: frames.length ? Math.max(...frames) : 0,
      lastFrameMs,
      stallCount: this.stallCount,
      droppedSeconds: this.totalDroppedSeconds,
      targetFrameMs: this.targetFrameMs,
      budget,
      status: frames.length < 8 ? 'warming' : (p95FrameMs >= 50 ? 'stalled' : budget),
    };
  }

  reset() {
    this.samples.fill(0);
    this.sampleCount = 0;
    this.cursor = 0;
    this.totalDroppedSeconds = 0;
    this.totalFrames = 0;
    this.stallCount = 0;
  }
}
