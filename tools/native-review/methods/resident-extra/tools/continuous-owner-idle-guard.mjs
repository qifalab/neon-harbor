/** Read-only callback for one uninterrupted, finite, real simulation cooldown.
 * The optional readSnapshot parameter exists solely for CPU proof; the browser
 * reads the public snapshot itself. This function never writes world/cache state.
 */
export function continuousOwnerIdleGuard({ startTime, teleportRevision }, readSnapshot = () => window.__NEON__.snapshot()) {
  const s = readSnapshot(), a = s.residentAssets;
  const fail = reason => { throw new Error(`Continuous owner cooldown invalid: ${reason}; ${JSON.stringify({simulationTime:s.simulationTime,position:s.position,instances:a?.instances,selected:a?.selected,pending:a?.pending,roles:a?.roles})}`); };
  if (!s.started || s.paused || s.settings?.quality !== 'high' || s.settings?.firstPerson !== true) fail('original live High first-person observation changed');
  if (s.teleportRevision !== teleportRevision) fail('physical observation teleported');
  if (!Number.isFinite(s.simulationTime) || s.simulationTime < startTime) fail('invalid real simulation clock');
  if (!a || a.residencyCooldown !== 12 || a.error) fail('actual source-bound 12-second residency guard unavailable');
  if (a.instances !== 0 || a.pending || !Array.isArray(a.selected) || a.selected.length !== 0) fail('natural actor/request demand entered the fixed observation point');
  if (Object.values(a.roles || {}).some(role => role.instances !== 0 || role.pending)) fail('actual role retained live/request demand');
  return s.simulationTime - startTime >= 13;
}
