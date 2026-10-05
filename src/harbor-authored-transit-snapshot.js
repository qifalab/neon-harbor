/** Extend the existing read-only service snapshot; its simulation data stays intact. */
export function exposeAuthoredTransitSnapshot(service, readAuthored) {
  const originalSnapshot = service.snapshot;
  if (typeof originalSnapshot !== 'function' || typeof readAuthored !== 'function') throw new TypeError('Actual service snapshot and authored reader required');
  service.authoredTransportSnapshot = readAuthored;
  service.snapshot = function (...args) {
    const base = originalSnapshot.apply(service, args);
    return { ...base, authored: readAuthored() };
  };
}
