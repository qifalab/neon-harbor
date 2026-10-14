export const CONTINUOUS_ROUTE_STAGES = Object.freeze([
  'home-lobby',
  'home-departure',
  'bus-alighted',
  'produce-room',
  'tram-alighted',
  'workshop-room',
  'ferry-north-alighted',
  'opposite-room',
  'ferry-south-alighted',
  'returned-home-lobby',
  'safe-save-restored',
]);

const finite = value => Number.isFinite(value);

/**
 * Validate the persisted evidence from the continuous harbor route.
 *
 * The route is intentionally a player-input journey. A journal is valid only
 * when its authored milestones are in order, simulation time never rewinds,
 * every sample has a real world position, and no test-only position/clock
 * writes were used to reach a milestone.
 */
export function validateContinuousRouteJournal(records, { allowPrefix = false } = {}) {
  if (!Array.isArray(records)) return { valid: false, reason: 'journal-is-not-an-array' };
  if (!records.length) return { valid: false, reason: 'journal-is-empty' };
  if (records.length > CONTINUOUS_ROUTE_STAGES.length) {
    return { valid: false, reason: 'journal-has-extra-stages' };
  }
  if (!allowPrefix && records.length !== CONTINUOUS_ROUTE_STAGES.length) {
    return { valid: false, reason: 'journal-is-incomplete', expected: CONTINUOUS_ROUTE_STAGES.length, actual: records.length };
  }

  let previousTime = -Infinity;
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const expectedStage = CONTINUOUS_ROUTE_STAGES[index];
    if (!record || record.stage !== expectedStage) {
      return { valid: false, reason: 'stage-out-of-order', index, expected: expectedStage, actual: record?.stage ?? null };
    }
    if (!finite(record.position?.x) || !finite(record.position?.z) || !finite(record.time)) {
      return { valid: false, reason: 'sample-missing-position-or-time', index };
    }
    if (!Number.isInteger(record.teleportRevision) || record.teleportRevision < 0) {
      return { valid: false, reason: 'invalid-teleport-revision', index };
    }
    if (record.positionWrites !== false || record.clockWrites !== false) {
      return { valid: false, reason: 'test-write-detected', index };
    }
    if (record.time < previousTime) {
      return { valid: false, reason: 'simulation-time-rewound', index };
    }
    previousTime = record.time;
  }

  return { valid: true, stageCount: records.length, complete: records.length === CONTINUOUS_ROUTE_STAGES.length };
}
