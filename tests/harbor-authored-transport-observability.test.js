import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { createHarborVehicle } from '../src/harbor-vehicle-models.js';
import { HarborTransitService } from '../src/harbor-transit.js';
import { createAuthoredTransportController } from '../src/harbor-authored-transport.js';
import { AUTHORED_TRANSPORT_ASSETS } from '../src/harbor-authored-transport-assets.js';
import { exposeAuthoredTransitSnapshot } from '../src/harbor-authored-transit-snapshot.js';

// Real pinned loader, GLBs and original vehicle API. PNG bytes are NOT decoded:
// explicit CPU bitmap placeholders permit ownership checks without a renderer.
const api = ['setDoorOpenness', 'setDoorsOpen', 'setNight', 'setCabinLightingEnabled', 'setDetail', 'updateLOD', 'update', 'disposeInstance'];
const originalRefs = ['kind', 'dimensions', 'layout', 'collision', 'doors', 'deckLevels', 'stairs'];
const renderRefs = ['lod', 'materials', 'cabinLights', 'wheels', 'manifest'];
const camera = () => { const c = new THREE.PerspectiveCamera(65, 1, .08, 2000); c.position.set(0, 2, 9); c.updateWorldMatrix(true, false); return c; };
async function until(predicate) {
  const deadline = performance.now() + 5000;
  while (!predicate()) { assert(performance.now() < deadline, 'Finite CPU loader deadline'); await new Promise(setImmediate); }
}
function track(gltf) {
  const resources = { geometries: new Set(), materials: new Set(), textures: new Set(), images: new Set() }, disposals = { geometries: 0, materials: 0, textures: 0 };
  gltf.scene.traverse(n => {
    if (!n.isMesh) return;
    const add = (key, value) => { if (!resources[key].has(value)) { resources[key].add(value); value.addEventListener('dispose', () => disposals[key]++); } };
    add('geometries', n.geometry);
    for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
      add('materials', m);
      for (const value of Object.values(m)) if (value?.isTexture) { add('textures', value); resources.images.add(value.image); }
    }
  });
  return { resources, disposals };
}
function assertReleased(loaded) {
  for (const item of loaded) {
    for (const key of ['geometries', 'materials', 'textures']) assert.equal(item.tracked.disposals[key], item.tracked.resources[key].size, `Actual ${key} dispose once`);
    for (const image of item.tracked.resources.images) { assert.equal(image.cpuPlaceholderImage, true); assert.equal(image.closeCalls, 1, 'Actual accepted CPU image closed once'); }
  }
}
async function withCpuImages(run) {
  const original = { fetch: globalThis.fetch, self: globalThis.self, createImageBitmap: globalThis.createImageBitmap };
  globalThis.self = globalThis;
  globalThis.fetch = (input, ...args) => {
    assert(String(input instanceof Request ? input.url : input).startsWith('blob:'), 'Only embedded image blobs, no network');
    return original.fetch(input, ...args);
  };
  globalThis.createImageBitmap = async blob => {
    const png = Buffer.from(await blob.arrayBuffer());
    assert.equal(png.readUInt32BE(0), 0x89504e47); assert.equal(png.toString('ascii', 12, 16), 'IHDR');
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), cpuPlaceholderImage: true, closeCalls: 0, close() { this.closeCalls++; } };
  };
  try { assert.equal(THREE.REVISION, '185'); await run(); }
  finally { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
}
function actualBusLoader(loaded, intercept = null) {
  return async input => {
    const { kind, tier, sha256, url } = input, file = AUTHORED_TRANSPORT_ASSETS.bus.files[tier];
    assert.equal(kind, 'bus'); assert.equal(sha256, file.sha256); assert(url.endsWith(`/bus/${file.file}`));
    const bytes = await fs.readFile(new URL(`../assets/harbor/transport/bus/${file.file}`, import.meta.url));
    assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256);
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    assert(gltf.scene.getObjectByName(`bus-detail-${tier}`));
    const item = { gltf, tier, tracked: track(gltf) }; loaded.push(item);
    return intercept ? intercept(input, gltf) : gltf;
  };
}

test('authored bus exposes isolated cached snapshots and preserves real API across shared cold release', async () => withCpuImages(async () => {
  const loaded = [], errors = [], fleet = [0, 1].map(i => { const mesh = createHarborVehicle(THREE, 'bus', { color: i ? '#966b49' : '#356b68' }); return { mesh, base: { ...mesh.userData }, id: `bus-${i}` }; });
  let memoryReads = 0;
  const controller = createAuthoredTransportController(THREE, { load: actualBusLoader(loaded), onError: e => errors.push(e), readRendererMemory: () => { memoryReads++; return { geometries: 0, textures: 0 }; } });
  try {
    for (const v of fleet) controller.register(v.mesh, { id: v.id, color: '#356b68' });
    assert.equal(loaded.length, 0); controller.update(null, 'high'); assert.equal(loaded.length, 0);
    controller.update(camera(), 'high', fleet[0].id); await until(() => controller.snapshot().fleet.every(v => v.authored));
    assert.equal(loaded.length, 3); assert.equal(errors.length, 0);
    const snap = controller.snapshot(), owned = snap.pools[0].resourceStats;
    assert.equal(snap.pools[0].users, 2); assert.equal(snap.pools[0].generation, 1); assert.equal(snap.pending.length, 0);
    assert.equal(owned.geometryCount, loaded.reduce((n, v) => n + v.tracked.resources.geometries.size, 0));
    assert(owned.images.every(v => v.cpuPlaceholder && !v.actualImageBitmap)); assert.equal(owned.gpuUploadStateKnown, false);
    assert.throws(() => owned.geometryUUIDs.push('mutate'), TypeError);
    for (let i = 0; i < 25; i++) { const s = controller.snapshot(); assert.strictEqual(s.pools[0].resourceStats, owned); assert.equal(s.audit.lastSequence, snap.audit.lastSequence); }
    assert.equal(memoryReads, 0, 'Snapshot does not read renderer counters');
    snap.pools[0].users = 99; snap.fleet[0].id = 'consumer'; snap.audit.events.length = 0;
    assert.equal(controller.snapshot().pools[0].users, 2); assert.equal(controller.snapshot().fleet[0].id, fleet[0].id);
    const service = new HarborTransitService(), base = service.snapshot(), state = service.exportState();
    exposeAuthoredTransitSnapshot(service, controller.snapshot);
    const extended = service.snapshot(), oldFields = { ...extended }; delete oldFields.authored;
    assert.deepEqual(oldFields, base); assert.deepEqual(service.exportState(), state);
    assert.strictEqual(extended.passengerPose, base.passengerPose); assert.strictEqual(extended.activeStation, base.activeStation);
    assert.strictEqual(extended.authored.pools[0].resourceStats, owned);
    for (const v of fleet) for (const field of originalRefs) assert.strictEqual(v.mesh.userData[field], v.base[field]);
    const a = fleet[0].mesh.userData, b = fleet[1].mesh.userData;
    assert.strictEqual(a.lod.levels[0].object.getObjectByName('wheel-front--1').children[0].geometry, b.lod.levels[0].object.getObjectByName('wheel-front--1').children[0].geometry);
    assert.notStrictEqual(a.materials[0], b.materials[0]);
    for (const openness of [0, .5, 1, 0]) {
      a.setDoorOpenness(openness);
      for (const tier of a.lod.levels) for (const door of a.layout.doors) for (const leaf of tier.object.getObjectByName(door.id).children)
        assert.equal(leaf.position.z, leaf.userData.closedZ + leaf.userData.slide * openness);
    }
    a.update({ distanceTravelled: 4.3, timeOfDay: 20 });
    for (const tier of a.lod.levels) assert.equal(tier.object.getObjectByName('wheel-front--1').rotation.x, 4.3 / .43);
    controller.update(camera(), 'low');
    const released = controller.snapshot().audit.events.filter(v => v.type === 'shared-released');
    assert.equal(released.length, 1); assert.equal(released[0].allAuthoredInstancesDetached, true); assert.equal(released[0].activeInstancesAtRelease, 0);
    assert.equal(memoryReads, 2); assert.deepEqual(released[0].rendererRelease.difference, { geometries: 0, textures: 0 }); // Explicit CPU fixture, never GPU proof.
    assertReleased(loaded);
    for (const v of fleet) { for (const field of renderRefs) assert.strictEqual(v.mesh.userData[field], v.base[field]); assert(v.base.lod.visible); }
    controller.dispose();
    for (const v of fleet) for (const method of api) assert.strictEqual(v.mesh.userData[method], v.base[method]);
  } finally { controller.dispose(); for (const v of fleet) v.mesh.userData.disposeInstance(); }
}));

test('accepted partial and late actual GLBs release once after cold cancellation without attaching', async () => withCpuImages(async () => {
  const loaded = [], errors = [], mesh = createHarborVehicle(THREE, 'bus'), base = { ...mesh.userData };
  let resolveLate, reachedLate = false, memoryReads = 0;
  const late = new Promise(resolve => { resolveLate = resolve; });
  const controller = createAuthoredTransportController(THREE, {
    load: actualBusLoader(loaded, async ({ tier }, gltf) => { if (tier === 1) { reachedLate = true; await late; } return gltf; }),
    onError: e => errors.push(e), readRendererMemory: () => { memoryReads++; return { geometries: 0, textures: 0 }; },
  });
  try {
    controller.register(mesh, { id: 'bus-late', color: '#356b68' }); controller.update(camera(), 'high');
    await until(() => reachedLate);
    const partial = controller.snapshot(); assert.equal(partial.pools.length, 1); assert.equal(partial.pools[0].loaded, false);
    assert.equal(partial.pools[0].resourceStats.geometryCount, loaded[0].tracked.resources.geometries.size);
    assert.equal(partial.pending.length, 0); assert.equal(partial.fleet[0].authored, false);
    controller.update(camera(), 'low');
    const cold = controller.snapshot(); assert.equal(cold.pools.length, 0); assert.equal(cold.pending.length, 1); assert.equal(cold.pending[0].closed, true);
    assert.equal(memoryReads, 0); assert.strictEqual(mesh.userData.lod, base.lod); assert(base.lod.visible);
    resolveLate(); await until(() => controller.snapshot().pending.length === 0);
    assert.equal(loaded.length, 2, 'No third LOD requested after cancellation'); assert.equal(errors.length, 0);
    const done = controller.snapshot(), released = done.audit.events.filter(v => v.type === 'shared-released');
    assert.equal(done.fleet[0].authored, false); assert.equal(released.length, 1); assert.equal(released[0].reason, 'late-after-cold-or-dispose');
    assert.equal(released[0].poolGeneration, 1); assert.equal(released[0].allAuthoredInstancesDetached, true);
    assert.equal(released[0].owned.geometryCount, loaded.reduce((n, v) => n + v.tracked.resources.geometries.size, 0));
    assert(done.audit.events.some(v => v.type === 'pool-lod-decoded' && v.closed && v.tier === 1));
    assert.equal(memoryReads, 2); assertReleased(loaded);
    for (const field of originalRefs.concat(renderRefs)) assert.strictEqual(mesh.userData[field], base[field]);
  } finally { resolveLate(); controller.dispose(); await until(() => controller.snapshot().pending.length === 0); mesh.userData.disposeInstance(); }
}));

test('real partial load failure still disposes owned GLB when diagnostic counter reads throw', async () => withCpuImages(async () => {
  const loaded = [], errors = [], mesh = createHarborVehicle(THREE, 'bus'), base = { ...mesh.userData }; let memoryReads = 0;
  const parse = actualBusLoader(loaded);
  const controller = createAuthoredTransportController(THREE, {
    load: input => input.tier === 1 ? Promise.reject(new Error('fixture failure before second GLB accepted')) : parse(input),
    onError: e => errors.push(e), readRendererMemory: () => { memoryReads++; throw new Error('fixture diagnostic unavailable'); },
  });
  try {
    controller.register(mesh, { id: 'bus-partial-failure', color: '#356b68' }); controller.update(camera(), 'high');
    await until(() => controller.snapshot().pools[0]?.settled);
    assert.equal(loaded.length, 1); assert.equal(errors.length, 1); assert.equal(controller.snapshot().fleet[0].authored, false);
    const released = controller.snapshot().audit.events.filter(v => v.type === 'shared-released');
    assert.equal(released.length, 1); assert.equal(released[0].reason, 'partial-load-failure');
    assert.equal(released[0].rendererRelease.available, false); assert.equal(released[0].rendererRelease.difference, null);
    assert.deepEqual(released[0].rendererRelease.readErrors.map(v => v.stage), ['before', 'after']); assert.equal(memoryReads, 2);
    assertReleased(loaded); assert.strictEqual(mesh.userData.lod, base.lod); assert(base.lod.visible);
    controller.update(camera(), 'high'); assert.equal(loaded.length, 1, 'Failed live interest does not retry');
    controller.update(camera(), 'low'); assert.equal(controller.snapshot().pools.length, 0); assert.equal(controller.snapshot().pending.length, 0);
  } finally { controller.dispose(); mesh.userData.disposeInstance(); }
}));
