import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTINUOUS_ROUTE_STAGES, validateContinuousRouteJournal } from '../src/harbor-route-contract.js';

const journal = stages => stages.map((stage, index) => ({
  stage,
  position: { x: index, z: -index },
  time: index * 10,
  teleportRevision: index,
  positionWrites: false,
  clockWrites: false,
}));

test('continuous route contract accepts the complete ordered journal', () => {
  const result = validateContinuousRouteJournal(journal(CONTINUOUS_ROUTE_STAGES));
  assert.deepEqual(result, { valid: true, stageCount: CONTINUOUS_ROUTE_STAGES.length, complete: true });
});

test('continuous route contract accepts the deliberate bus stop prefix', () => {
  const result = validateContinuousRouteJournal(journal(CONTINUOUS_ROUTE_STAGES.slice(0, 3)), { allowPrefix: true });
  assert.deepEqual(result, { valid: true, stageCount: 3, complete: false });
});

test('continuous route contract rejects reordering, rewinds, and test writes', () => {
  const reordered = journal(CONTINUOUS_ROUTE_STAGES);
  reordered[3].stage = 'tram-alighted';
  assert.equal(validateContinuousRouteJournal(reordered).reason, 'stage-out-of-order');

  const rewound = journal(CONTINUOUS_ROUTE_STAGES);
  rewound[4].time = 1;
  assert.equal(validateContinuousRouteJournal(rewound).reason, 'simulation-time-rewound');

  const written = journal(CONTINUOUS_ROUTE_STAGES);
  written[2].positionWrites = true;
  assert.equal(validateContinuousRouteJournal(written).reason, 'test-write-detected');
});
