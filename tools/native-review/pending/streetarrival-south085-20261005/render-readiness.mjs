export function currentRenderedCamera({ expectedRevision, state }) {
  const s = state ?? globalThis.window.__NEON__.snapshot(), c = s.camera;
  if (s.teleportRevision !== expectedRevision || !c || !s.presentation?.subject) return false;
  if (s.settings.firstPerson) return c.fov === 65 && ['position', 'target', 'focus'].every(k => c[k] && ['x', 'y', 'z'].every(a => Number.isFinite(c[k][a])));
  return c.fov === 55 && Number.isFinite(c.yaw) && Number.isFinite(c.pitch) && c.boomLength > 2.4 && c.boomLength < 7.2
    && ['position', 'target', 'focus'].every(k => c[k] && ['x', 'y', 'z'].every(a => Number.isFinite(c[k][a])));
}
export function phaseTimeout(now, wholeDeadline, phaseDeadline) {
  const ms = Math.min(60000, wholeDeadline - now, phaseDeadline - now); if (ms <= 0) throw new Error('Actual render readiness deadline exhausted'); return ms;
}
