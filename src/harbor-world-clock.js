/** Calendar ownership lives in HarborLife; render time is only a light preview.
 * Epochs let older 35-second hours retain their already elapsed calendar days
 * when a save moves to the shared 120-second sample calendar. */
export const HARBOR_SECONDS_PER_HOUR = 120;
export const HARBOR_CLOCK_STEP = .1;
export const calendarHour = (clock, ticks, secondsPerHour) =>
  clock.absoluteHour + (ticks - clock.epochTick) * HARBOR_CLOCK_STEP / secondsPerHour;
export function validCalendar(clock, ticks) {
  return clock?.version === 1 && Number.isSafeInteger(clock.epochTick) && clock.epochTick >= 0 && clock.epochTick <= ticks &&
    Number.isFinite(clock.absoluteHour) && clock.absoluteHour >= 0 &&
    (clock.legacySecondsPerHour === undefined || Number.isFinite(clock.legacySecondsPerHour) && clock.legacySecondsPerHour > 0);
}
