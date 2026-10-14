import test from 'node:test';
import assert from 'node:assert/strict';
import { CONTINUOUS_ROUTE_STAGES, validateContinuousRouteJournal } from '../src/harbor-route-contract.js';

const journal = stages => stages.map((stage, index) => ({
  stage,
  position: { x: index, z: -index },
  time: index * 10,
  teleportRevision: index,
  interior: {
    buildingId: {
      'home-lobby': 'south-093', 'produce-room': 'south-095', 'workshop-room': 'south-086',
      'opposite-room': 'sail-club', 'returned-home-lobby': 'south-093',
    }[stage] ?? null,
    roomId: ['produce-room', 'workshop-room', 'opposite-room'].includes(stage) ? `${stage}-room` : null,
  },
  transit: { currentStopId: {
    'bus-alighted': 'harbor-bus-lantern', 'tram-alighted': 'harbor-tram-quay',
    'ferry-north-alighted': 'harbor-ferry-north', 'ferry-south-alighted': 'harbor-ferry-south',
  }[stage] ?? null },
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

  const wrongRoom = journal(CONTINUOUS_ROUTE_STAGES);
  wrongRoom[3].interior.buildingId = 'south-093';
  assert.equal(validateContinuousRouteJournal(wrongRoom).reason, 'unexpected-building-state');

  const wrongStop = journal(CONTINUOUS_ROUTE_STAGES);
  wrongStop[2].transit.currentStopId = 'harbor-bus-market';
  assert.equal(validateContinuousRouteJournal(wrongStop).reason, 'transport-milestone-missing');
});
