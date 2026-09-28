import test from 'node:test';
import assert from 'node:assert/strict';
import { DistrictStreamer, validateCityChunk } from '../src/city-streaming.js';

const meta = (id, x, z = 0) => ({ id, x, z, hx: 40, hz: 40, file: `${id}.json` });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(chunks, options = {}) {
  const attached = new Set(), detached = [];
  const streamer = new DistrictStreamer({ chunks, load: async m => ({ node: { id: m.id }, bytes: 64, instances: 8, meshes: 2 }),
    attach: (node, m) => attached.add(m.id), detach: (node, m) => { attached.delete(m.id); detached.push(m.id); return 8; }, ...options });
  return { streamer, attached, detached };
}

test('prepare fetches only nearby real district payloads and exposes resident metrics', async () => {
  const { streamer, attached } = fixture([meta('home', 0), meta('next', 80), meta('far', 600)]);
  assert.equal((await streamer.prepare({ x: 0, z: 0 })).ready, true);
  assert.deepEqual([...attached].sort(), ['home', 'next']);
  assert.equal(streamer.stats.requested, 2); assert.equal(streamer.stats.residentMeshes, 4);
  assert.equal(streamer.stats.residentInstances, 16); assert.equal(streamer.stats.bytes, 128);
});

test('directional prefetch anticipates travel while distance and hysteresis drive actual disposal', async () => {
  const { streamer, attached, detached } = fixture([meta('start', 0), meta('front', 240), meta('destination', 560)]);
  await streamer.prepare({ x: 0, z: 0 });
  streamer.update({ x: 0, z: 0 }, { x: 40, z: 0 }, 0.3); await flush();
  assert.ok(attached.has('front'), 'ahead district prefetched outside stationary load radius');
  await streamer.prepare({ x: 560, z: 0 });
  assert.ok(attached.has('start'), 'hysteresis retains the old district initially');
  streamer.update({ x: 560, z: 0 }, { x: 0, z: 0 }, 2.1);
  assert.ok(detached.includes('start')); assert.ok(!attached.has('start'));
  assert.ok(streamer.stats.disposedInstances >= 8); assert.ok(streamer.stats.unloaded > 0);
});

test('resident budget is a hard bound even when more targets are nearby', async () => {
  const { streamer } = fixture([meta('one', 0), meta('two', 10), meta('three', 20), meta('four', 30)], { maxResidentChunks: 2 });
  const result = await streamer.prepare({ x: 0, z: 0 });
  assert.equal(result.ready, true); assert.equal(streamer.stats.loaded, 2); assert.equal(streamer.stats.targetChunks.length, 2);
});

test('failed near district remains failed until retry succeeds without pretending a proxy is full detail', async () => {
  let attempts = 0;
  const { streamer, attached } = fixture([meta('home', 0)], { load: async () => {
    if (++attempts === 1) throw new Error('HTTP 503'); return { node: {}, bytes: 9, instances: 2, meshes: 1 };
  } });
  assert.equal((await streamer.prepare({ x: 0, z: 0 })).ready, false);
  assert.equal(streamer.stats.failed, 1); assert.equal(attached.size, 0);
  assert.equal((await streamer.retry()).ready, true); assert.equal(streamer.stats.failed, 0); assert.equal(attached.size, 1);
});

test('dispose settles prepare, releases late payloads, and never attaches after disposal', async () => {
  let finish;
  const { streamer, attached, detached } = fixture([meta('home', 0)], { load: () => new Promise(resolve => { finish = resolve; }) });
  const pending = streamer.prepare({ x: 0, z: 0 }); await flush(); streamer.dispose();
  assert.equal((await pending).ready, false);
  finish({ node: {}, bytes: 9, instances: 8 }); await flush();
  assert.equal(attached.size, 0); assert.deepEqual(detached, ['home']);
  assert.equal(streamer.stats.pending, 0); assert.equal(streamer.stats.ready, false);
  assert.equal((await streamer.prepare({ x: 0, z: 0 })).disposed, true);
});

test('cancelled district can be revisited before its aborted request settles', async () => {
  const { streamer } = fixture([meta('A', 0), meta('B', 1000)], { concurrency: 2, load: async (m, signal) => {
    await flush(); if (signal.aborted) throw new Error('aborted'); return { node: { id: m.id }, bytes: 10, instances: 1, meshes: 1 };
  } });
  const first = streamer.prepare({ x: 0, z: 0 });
  const away = streamer.prepare({ x: 1000, z: 0 });
  const back = streamer.prepare({ x: 0, z: 0 });
  await Promise.all([first, away]); assert.equal((await back).ready, true);
  assert.equal(streamer.stats.ready, true); assert.equal(streamer.stats.lastPrepareReady, true);
  assert.deepEqual(streamer.stats.activeChunks, ['A']); assert.equal(streamer.stats.failed, 0);
});

test('old request failure cannot overwrite the latest successful prepare state', async () => {
  let rejectOld;
  const { streamer } = fixture([meta('old', 0), meta('new', 1000)], { load: m => m.id === 'old' ? new Promise((_, reject) => { rejectOld = reject; }) : Promise.resolve({ node: {}, bytes: 4 }) });
  const old = streamer.prepare({ x: 0, z: 0 }); await flush();
  assert.equal((await streamer.prepare({ x: 1000, z: 0 })).ready, true);
  rejectOld(new Error('late failure')); await old; await flush();
  assert.equal(streamer.stats.lastPrepareReady, true); assert.equal(streamer.stats.ready, true); assert.equal(streamer.stats.failed, 0);
});

test('chunk validation rejects malformed geometry before creating GPU resources', () => {
  const good = { version: 1, id: '0_0', batches: [{ kind: 'box', material: 'stone', transforms: [[0, 1, 2, 1, 1, 1, 0, 0, 0]] }] };
  assert.equal(validateCityChunk(good, '0_0'), good);
  assert.throws(() => validateCityChunk(good, '1_0'));
  assert.throws(() => validateCityChunk({ ...good, batches: [{ ...good.batches[0], transforms: [[0, 0, 0, -1, 1, 1, 0, 0, 0]] }] }, '0_0'));
});
