/** Bounded catch-up keeps the 60 Hz collision solver independent of rendering.
 * A slow visible frame may run up to 250 ms of fixed steps; a long stall never
 * leaves a backlog. Paused/hidden time must be suspended explicitly. */
export const MAX_FRAME_TIME = 0.25;

export class FixedStepClock {
  constructor(step = 1 / 60) {
    this.step = step;
    this.lastTime = null;
    this.accumulator = 0;
    this.suspended = true;
    this.droppedTotal = 0;
  }

  suspend(resetRemainder = false) {
    // Keep the rendered interpolation phase across a pause. Clearing a partial
    // step would rewind the first resumed frame to the previous physics pose.
    if (resetRemainder) this.accumulator = 0;
    this.suspended = true;
  }

  advance(time, active) {
    const wallDt = this.lastTime === null ? 0 : Math.max(0, (time - this.lastTime) / 1000);
    this.lastTime = time;
    const resumed = this.suspended;
    this.suspended = false;
    const dt = resumed ? 0 : Math.min(wallDt, MAX_FRAME_TIME);
    const droppedSeconds = active && !resumed ? Math.max(0, wallDt - dt) : 0;
    this.droppedTotal += droppedSeconds;
    if (active) this.accumulator += dt;
    const steps = active ? Math.floor((this.accumulator + 1e-10) / this.step) : 0;
    this.accumulator = Math.max(0, this.accumulator - steps * this.step);
    return { wallDt, dt, steps, alpha: this.accumulator / this.step,
      simulationDelta: steps * this.step, droppedSeconds, droppedTotal: this.droppedTotal };
  }
}
