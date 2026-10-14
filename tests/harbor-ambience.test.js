import test from 'node:test';
import assert from 'node:assert/strict';
import { harborAmbience } from '../src/harbor-ambience.js';

test('harbour ambience is derived from current residents, shops, and transit', () => {
  const state = harborAmbience({ hour: 18, agents: [
    { phase: 'walking' }, { phase: 'working' }, { phase: 'riding', transit: { phase: 'riding' } }, { phase: 'resting', insideBuildingId: 'home' },
  ], shops: [{ open: true, staff: 1 }, { open: true, staff: 0 }, { open: false, staff: 0 }], transit: {
    stops: [{ nextArrival: 0 }, { nextArrival: 18 }], vehicles: [{ kind: 'bus', stopId: null, speed: 4 }],
  } });
  assert.equal(state.phase, '晚市');
  assert.equal(state.walking, 1); assert.equal(state.working, 1); assert.equal(state.riding, 1);
  assert.equal(state.openShops, 2); assert.equal(state.staffedShops, 1); assert.equal(state.activeStops, 1); assert.equal(state.movingVehicles, 1);
  assert.equal(state.crowdLevel, 'quiet');
  assert.match(state.detail, /1 位街坊在路上/);
});

test('empty or malformed optional collections still produce a useful quiet bulletin', () => {
  const state = harborAmbience({ hour: 2 });
  assert.equal(state.phase, '深夜'); assert.equal(state.crowdLevel, 'quiet');
  assert.equal(state.openShops, 0); assert.equal(state.activeStops, 0); assert.match(state.headline, /灯还亮着/);
});
