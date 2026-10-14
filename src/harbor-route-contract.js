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

// These are the state hand-offs that make the journal a city journey rather
// than an ordered list of arbitrary screenshots.  The browser route records
// the same fields at each milestone, so a passing route must also prove that
// it is in the expected room or has actually reached the expected stop.
const STAGE_STATE = Object.freeze({
  'home-lobby': { buildingId: 'south-093' },
  'home-departure': { buildingId: null },
  'bus-alighted': { buildingId: null, stopId: 'harbor-bus-lantern' },
  'produce-room': { buildingId: 'south-095', room: true },
  'tram-alighted': { buildingId: null, stopId: 'harbor-tram-quay' },
  'workshop-room': { buildingId: 'south-086', room: true },
  'ferry-north-alighted': { buildingId: null, stopId: 'harbor-ferry-north' },
  'opposite-room': { buildingId: 'sail-club', room: true },
  'ferry-south-alighted': { buildingId: null, stopId: 'harbor-ferry-south' },
  'returned-home-lobby': { buildingId: 'south-093' },
  'safe-save-restored': { buildingId: null },
});

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
    const expectedState = STAGE_STATE[expectedStage], actualBuilding = record.interior?.buildingId ?? null;
    if (actualBuilding !== expectedState.buildingId) {
      return { valid: false, reason: 'unexpected-building-state', index, expected: expectedState.buildingId, actual: actualBuilding };
    }
    if (expectedState.room && !record.interior?.roomId) {
      return { valid: false, reason: 'room-milestone-missing', index };
    }
    if (expectedState.stopId && record.transit?.currentStopId !== expectedState.stopId) {
      return { valid: false, reason: 'transport-milestone-missing', index, expected: expectedState.stopId, actual: record.transit?.currentStopId ?? null };
    }
    if (record.time < previousTime) {
      return { valid: false, reason: 'simulation-time-rewound', index };
    }
    previousTime = record.time;
  }

  return { valid: true, stageCount: records.length, complete: records.length === CONTINUOUS_ROUTE_STAGES.length };
}
