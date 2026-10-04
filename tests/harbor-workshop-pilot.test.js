import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';
import { expansionBuilding } from '../src/expansion-programmes.js';
import { createInteriorLayout, createInteriorSystem } from '../src/metropolis-interiors.js';
import { SpatialIndex, circleContacts, CHARACTER_RADIUS } from '../src/collision.js';
import { createHarborWorkshopPilot, planHarborWorkshopPilot, WORKSHOP_PILOT } from '../src/harbor-workshop-pilot.js';
import { parseWorkshopAssetCPU, inspectScene } from '../tools/inspect-workshop-assets.mjs';

const json = async relative => JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const fixture = () => {
  const source = createWorld(THREE, new THREE.Scene(), { streaming: true });
  const building = expansionBuilding(source.buildings[85], 'south', 85), floor = building.floors[0];
  return { building, floor, layout: createInteriorLayout(building, floor) };
};
const loadCPU = async id => parseWorkshopAssetCPU(await readFile(new URL(`../assets/harbor/workshop/${id}.glb`, import.meta.url)));

test('GLBs contain exact official acquired BIN and 1K JPEG bytes, original scenes/skins/PBR and proven hashes', async () => {
  const manifest = await json('../assets/harbor/workshop/asset-manifest.json');
  assert.equal(manifest.models.length, 2);
  assert.ok(manifest.runtimeBytes < 12 * 1024 * 1024);
  for (const record of manifest.models) {
    assert.equal(record.license, 'CC0-1.0');
    for (const download of record.sourceDownloads) {
      assert.ok(download.url.startsWith('https://dl.polyhaven.org/file/ph-assets/'));
      const bytes = await readFile(new URL('../' + download.path, import.meta.url));
      assert.equal(bytes.length, download.bytes); assert.equal(hash(bytes), download.sha256);
      assert.equal(hash(bytes, 'md5'), download.officialMd5);
    }
    const bytes = await readFile(new URL('../' + record.output.path, import.meta.url));
    assert.equal(hash(bytes), record.output.sha256); assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.equal(bytes.readUInt32LE(4), 2); assert.equal(bytes.readUInt32LE(8), bytes.length);
    const jsonLength = bytes.readUInt32LE(12), packed = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString());
    const binHeader = 20 + jsonLength, binary = bytes.subarray(binHeader + 8);
    assert.equal(bytes.readUInt32LE(binHeader + 4), 0x004e4942);
    assert.equal(bytes.readUInt32LE(binHeader), binary.length);
    const original = await json(`../docs/qa/art-pilot/sources/${record.id}/${record.id}_1k.gltf`);
    for (const key of ['meshes', 'accessors', 'nodes', 'scenes', 'scene', 'skins', 'materials', 'textures', 'samplers'])
      assert.deepEqual(packed[key], original[key], `${record.id}/${key}: authored data changed`);
    assert.equal(packed.buffers.length, 1); assert.equal(packed.buffers[0].uri, undefined);
    const originalBin = await readFile(new URL(`../docs/qa/art-pilot/sources/${record.id}/${original.buffers[0].uri}`, import.meta.url));
    assert.deepEqual(binary.subarray(0, originalBin.length), originalBin, 'Geometry BIN unchanged');
    for (const [index, image] of original.images.entries()) {
      assert.equal(packed.images[index].uri, undefined);
      const view = packed.bufferViews[packed.images[index].bufferView];
      const source = await readFile(new URL(`../docs/qa/art-pilot/sources/${record.id}/${image.uri}`, import.meta.url));
      assert.deepEqual(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength), source, 'JPEG unchanged');
    }
  }
});

test('matching local r185 loader dependencies and source snapshot hashes are complete and local', async () => {
  assert.equal(THREE.REVISION, '185');
  const manifest = await json('../vendor/three/addons/manifest.json');
  assert.equal(manifest.upstream, 'three.js r185'); assert.equal(manifest.license, 'MIT');
  for (const item of manifest.files) {
    const bytes = await readFile(new URL('../' + item.path, import.meta.url));
    assert.equal(hash(bytes), item.sha256);
    if (item.path.endsWith('.js')) assert.ok(!bytes.toString().includes("} from 'three';"), 'No unresolved bare runtime imports');
  }
  const snapshot = await json('../docs/qa/art-pilot/base-snapshot.json');
  for (const item of snapshot.files) assert.equal(hash(await readFile(new URL('../' + item.path, import.meta.url))), item.sha256);
});

test('actual indexed geometry, retained vice skin, default-pose bounds and PBR references fit the two-model budget', async () => {
  const expected = { bench_vice_01: { triangles: 2864, meshes: 4, skin: 4 }, metal_tool_chest: { triangles: 13360, meshes: 7, skin: 0 } };
  let totalTriangles = 0, totalDraws = 0;
  for (const id of WORKSHOP_PILOT.assets) {
    const asset = await loadCPU(id), result = inspectScene(asset.scene);
    assert.equal(result.triangles, expected[id].triangles); assert.equal(result.meshes, expected[id].meshes);
    assert.equal(result.skinnedMeshes, expected[id].skin); assert.equal(result.materialCount, 1); assert.equal(result.textureCount, 3);
    asset.scene.traverse(object => {
      if (!object.isMesh) return;
      for (const index of object.geometry.index.array) assert.ok(index < object.geometry.attributes.position.count);
      if (object.isSkinnedMesh) {
        assert.ok(object.skeleton.bones.length > 0);
        for (const inverse of object.skeleton.boneInverses) assert.ok(inverse.elements.every(Number.isFinite));
      }
    });
    totalTriangles += result.triangles; totalDraws += result.potentialColourPassDrawCalls;
  }
  assert.equal(totalTriangles, 16224); assert.equal(totalDraws, 11, 'Potential main-colour pass calls; no GPU/shadow-pass claim');
});

test('single actual workshop scope keeps every existing collider, stairs and >2m main passage; tool box stays on its owner crate', () => {
  const data = fixture(), plan = planHarborWorkshopPilot(data.building, data.floor, data.layout);
  assert.equal(plan.placements.length, 2); assert.equal(plan.replacePartIds.length, 1);
  assert.equal(planHarborWorkshopPilot({ ...data.building, id: 'south-085' }, data.floor, data.layout), null);
  assert.equal(planHarborWorkshopPilot(data.building, data.building.floors[1], data.layout), null);
  const chest = plan.colliders[0], crate = data.layout.parts.find(part => part.id === plan.placements[1].ownerPartId);
  assert.ok(chest.x - chest.hx >= crate.x - crate.sx / 2 && chest.x + chest.hx <= crate.x + crate.sx / 2);
  assert.ok(chest.z - chest.hz >= crate.z - crate.sz / 2 && chest.z + chest.hz <= crate.z + crate.sz / 2);
  assert.equal(chest.minY, crate.y + crate.sy / 2);
  const system = createInteriorSystem(THREE, new THREE.Scene(), { buildings: [data.building] });
  system.enter(data.building.id);
  const physics = system.collisionContext(), byId = new Map(physics.colliders.map(c => [c.id, c]));
  for (const collider of data.layout.colliders) assert.deepEqual(byId.get(collider.id), collider, 'Original collider altered');
  assert.deepEqual(system.snapshot().stairs, data.layout.stairs);
  const partitionEdge = Math.max(...data.layout.parts.filter(p => p.kind === 'door-jamb').map(p => p.x + p.sx / 2));
  const stairEdge = Math.min(...data.layout.parts.filter(p => p.kind === 'stair-stringer').map(p => p.x - p.sx / 2));
  assert.ok(stairEdge - partitionEdge >= 2, 'Full-height rendered main corridor keeps >=2m');
  const index = new SpatialIndex(physics.colliders), room = data.layout.rooms.find(r => r.id === plan.roomId);
  const cabin = data.layout.elevator;
  const bench = data.layout.parts.find(part => part.id === plan.placements[0].ownerPartId);
  const path = [data.layout.entrance, { x: data.building.x, z: room.entrance.z }, room.arrival,
    { x: 190, z: room.z }, { x: bench.x + bench.sx / 2 + CHARACTER_RADIUS + .15, z: plan.placements[0].position.z },
    { x: 190, z: room.z }, room.arrival, { x: data.building.x, z: room.entrance.z },
    { x: data.building.x, z: cabin.doorZ + 1.05 }, { x: cabin.x, z: cabin.doorZ + 1.05 }, cabin];
  for (let step = 1; step < path.length; step++) {
    const from = path[step - 1], to = path[step], count = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .1);
    for (let i = 0; i <= count; i++) {
      const point = { x: from.x + (to.x - from.x) * i / count, z: from.z + (to.z - from.z) * i / count, groundY: data.floor.y };
      assert.equal(circleContacts(point, CHARACTER_RADIUS, { index }).length, 0, JSON.stringify({ from, to, point }));
    }
  }
  system.dispose();
});

test('distance hysteresis loads once, unloads all GPU-owned resources and releases again on real building exit', async () => {
  const data = fixture(), fallback = new THREE.Group();
  const assets = [], counts = { geometry: 0, material: 0, texture: 0, bitmap: 0, boneTexture: 0 };
  const loadAsset = async id => {
    const asset = await loadCPU(id); assets.push(asset);
    const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    asset.scene.traverse(object => {
      if (!object.isMesh) return;
      geometries.add(object.geometry); materials.add(object.material);
      if (object.skeleton) skeletons.add(object.skeleton);
      for (const value of Object.values(object.material)) if (value?.isTexture) textures.add(value);
    });
    for (const geometry of geometries) geometry.addEventListener('dispose', () => counts.geometry++);
    for (const material of materials) material.addEventListener('dispose', () => counts.material++);
    for (const texture of textures) {
      texture.addEventListener('dispose', () => counts.texture++);
      texture.source.data = { close: () => counts.bitmap++ };
    }
    for (const skeleton of skeletons) { skeleton.computeBoneTexture(); skeleton.boneTexture.addEventListener('dispose', () => counts.boneTexture++); }
    return asset;
  };
  const pilot = createHarborWorkshopPilot(THREE, { ...data, fallbackGroup: fallback, loadAsset, enabled: true });
  const near = { ...pilot.plan.centre, groundY: data.floor.y };
  pilot.update(near); await pilot.whenSettled();
  assert.equal(pilot.snapshot().status, 'ready'); assert.equal(assets.length, 2); assert.equal(fallback.visible, false);
  pilot.update({ ...near, x: near.x + 29 }); assert.equal(assets.length, 2, 'No hysteresis thrash');
  pilot.update({ ...near, x: near.x + 33 });
  assert.equal(pilot.snapshot().assetCount, 0); assert.equal(fallback.visible, true);
  assert.deepEqual(counts, { geometry: 11, material: 2, texture: 6, bitmap: 6, boneTexture: 1 });
  pilot.update(near); await pilot.whenSettled();
  pilot.dispose(); pilot.dispose();
  assert.equal(pilot.snapshot().releasedAssets, 4); assert.equal(counts.geometry, 22);
  const system = createInteriorSystem(THREE, new THREE.Scene(), { buildings: [data.building], workshopAssetLoader: loadCPU });
  system.enter(data.building.id); system.update(1 / 60, near);
  const live = system.root.children[0].children[0].userData.workshopPilot;
  await live.whenSettled(); assert.equal(system.snapshot().workshopPilot.status, 'ready');
  system.exit(); assert.equal(live.snapshot().assetCount, 0); assert.equal(system.snapshot().workshopPilot, null); system.dispose();
});

test('late asynchronous loads cannot attach to released floor, and missing/corrupt PBR keeps the primitive fallback', async () => {
  const data = fixture(), waits = [], fallback = new THREE.Group();
  const pilot = createHarborWorkshopPilot(THREE, { ...data, fallbackGroup: fallback, enabled: true,
    loadAsset: (id, { signal }) => new Promise(resolve => waits.push({ id, signal, resolve })) });
  pilot.update({ ...pilot.plan.centre, groundY: data.floor.y }); const pending = pilot.whenSettled();
  pilot.dispose(); assert.ok(waits.every(wait => wait.signal.aborted));
  for (const wait of waits) wait.resolve(await loadCPU(wait.id));
  await pending; assert.equal(pilot.snapshot().assetCount, 0); assert.equal(pilot.snapshot().releasedAssets, 2);
  assert.equal(pilot.group.children.length, 1, 'Only supplied fallback survives, no late scene attachment');
  const failed = createHarborWorkshopPilot(THREE, { ...data, fallbackGroup: new THREE.Group(), enabled: true,
    loadAsset: async id => { if (id === 'metal_tool_chest') throw new Error('deliberate missing asset'); return loadCPU(id); } });
  failed.update(failed.plan.centre); await failed.whenSettled();
  assert.equal(failed.snapshot().status, 'failed'); assert.equal(failed.snapshot().releasedAssets, 1);
  assert.equal(failed.group.children[0].visible, true); failed.dispose();
  const corrupt = createHarborWorkshopPilot(THREE, { ...data, fallbackGroup: new THREE.Group(), enabled: true,
    loadAsset: async id => { const asset = await loadCPU(id); if (id === 'metal_tool_chest') asset.scene.children[0].material.normalMap = null; return asset; } });
  corrupt.update(corrupt.plan.centre); await corrupt.whenSettled();
  assert.equal(corrupt.snapshot().status, 'failed'); assert.equal(corrupt.snapshot().assetCount, 0);
  assert.equal(corrupt.group.children[0].visible, true); assert.equal(corrupt.snapshot().releasedAssets, 2); corrupt.dispose();
});

test('old pending generation cannot clear or replace a successful new near generation', async () => {
  const data = fixture(), waits = [];
  const pilot = createHarborWorkshopPilot(THREE, { ...data, fallbackGroup: new THREE.Group(), enabled: true,
    loadAsset: (id, { signal }) => new Promise(resolve => waits.push({ id, signal, resolve })) });
  const near = { ...pilot.plan.centre, groundY: data.floor.y };
  pilot.update(near); const oldPending = pilot.whenSettled();
  pilot.update({ ...near, x: near.x + 40 }); assert.ok(waits.slice(0, 2).every(wait => wait.signal.aborted));
  pilot.update(near); const newPending = pilot.whenSettled();
  assert.notEqual(oldPending, newPending); assert.equal(waits.length, 4);
  for (const wait of waits.slice(2)) wait.resolve(await loadCPU(wait.id));
  await newPending; assert.equal(pilot.snapshot().status, 'ready');
  const current = pilot.group.children.filter(child => child.userData.workshopAssetId);
  assert.equal(current.length, 2);
  for (const wait of waits.slice(0, 2)) wait.resolve(await loadCPU(wait.id));
  await oldPending;
  assert.equal(pilot.snapshot().status, 'ready'); assert.equal(pilot.snapshot().assetCount, 2);
  assert.equal(pilot.snapshot().releasedAssets, 2);
  assert.deepEqual(pilot.group.children.filter(child => child.userData.workshopAssetId), current);
  pilot.dispose(); assert.equal(pilot.snapshot().releasedAssets, 4);
});

test('cold synchronous disposal counters separate owned rendered objects from never-rendered decoded resources', async () => {
  // CPU counter adapter emulates Three dispose listeners. It tests transaction
  // order/diagnostic semantics; it is not evidence of a browser upload or JPEG decode.
  const data = fixture(), memory = { geometries: 42, textures: 50 }, events = [];
  let reads = 0;
  const loadAsset = async id => {
    const asset = await loadCPU(id), geometries = new Set(), textures = new Set(), skeletons = new Set();
    asset.scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.skeleton) skeletons.add(object.skeleton);
      for (const value of Object.values(object.material || {})) if (value?.isTexture) textures.add(value);
    });
    for (const skeleton of skeletons) { skeleton.computeBoneTexture(); textures.add(skeleton.boneTexture); }
    memory.geometries += geometries.size; memory.textures += textures.size;
    for (const geometry of geometries) geometry.addEventListener('dispose', () => memory.geometries--);
    for (const texture of textures) { texture.addEventListener('dispose', () => memory.textures--);
      if (!texture.isDataTexture) texture.source.data = { close() {} }; }
    return asset;
  };
  const pilot = createHarborWorkshopPilot(THREE, { ...data, enabled: true, loadAsset,
    readRendererMemory: () => { reads++; return memory; }, onAudit: event => events.push(event) });
  pilot.update(pilot.plan.centre); await pilot.whenSettled();
  for (let i = 0; i < 20; i++) pilot.snapshot();
  assert.equal(reads, 0, 'No renderer counter reads on update/load/snapshot hot paths');
  pilot.dispose(); assert.equal(reads, 4);
  const releases = events.filter(event => event.kind === 'asset-released');
  assert.deepEqual(releases.map(event => event.rendererRelease.difference),
    [{ geometries: 4, textures: 4 }, { geometries: 7, textures: 3 }]);
  assert.deepEqual(releases.map(event => event.resourceRelease.boneTextures), [1, 0]);
  assert.ok(releases.every(event => event.rendererRelease.available && event.rendererRelease.attachedAtRelease));
  assert.deepEqual(memory, { geometries: 42, textures: 50 });
  memory.geometries = 999;
  assert.equal(releases[0].rendererRelease.before.geometries, 53, 'Captured counter values do not alias renderer state');
  assert.equal(releases[1].rendererRelease.after.geometries, 42);

  const neverRendered = [], zeroMemory = { geometries: 42, textures: 50 };
  const failed = createHarborWorkshopPilot(THREE, { ...data, enabled: true,
    loadAsset: async id => { if (id === 'metal_tool_chest') throw new Error('controlled404'); return loadCPU(id); },
    readRendererMemory: () => zeroMemory, onAudit: event => neverRendered.push(event) });
  failed.update(failed.plan.centre); await failed.whenSettled();
  const unrendered = neverRendered.find(event => event.kind === 'asset-released');
  assert.equal(unrendered.rendererRelease.attachedAtRelease, false);
  assert.deepEqual(unrendered.rendererRelease.difference, { geometries: 0, textures: 0 });
  assert.equal(unrendered.resourceRelease.geometries, 4);
  assert.equal(unrendered.resourceRelease.textures, 3); assert.equal(unrendered.resourceRelease.boneTextures, 0);
  failed.dispose();
});

test('throwing optional renderer diagnostics cannot prevent real GLB cleanup and snapshots do not alias read errors', async () => {
  const data = fixture(), counts = { geometries: 0, textures: 0, closedImages: 0 }; let reads = 0;
  const loadAsset = async id => {
    const asset = await loadCPU(id), geometries = new Set(), textures = new Set();
    asset.scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      for (const value of Object.values(object.material || {})) if (value?.isTexture) textures.add(value);
    });
    for (const geometry of geometries) geometry.addEventListener('dispose', () => counts.geometries++);
    for (const texture of textures) { texture.addEventListener('dispose', () => counts.textures++);
      texture.source.data = { close: () => counts.closedImages++ }; }
    return asset;
  };
  const system = createInteriorSystem(THREE, new THREE.Scene(), { buildings: [data.building], workshopAssetLoader: loadAsset,
    readRendererMemory: () => { reads++; throw new Error('controlled reader failure'); } });
  system.enter(data.building.id); system.update(1 / 60, { ...planHarborWorkshopPilot(data.building, data.floor, data.layout).centre, groundY: data.floor.y });
  const live = system.root.children[0].children[0].userData.workshopPilot;
  await live.whenSettled(); system.exit();
  assert.deepEqual(counts, { geometries: 11, textures: 6, closedImages: 6 });
  assert.equal(reads, 4); assert.equal(live.snapshot().assetCount, 0);
  const released = system.snapshot().workshopPilotEvents.filter(event => event.kind === 'asset-released');
  for (const event of released) {
    assert.equal(event.rendererRelease.available, false);
    assert.equal(event.rendererRelease.before, null); assert.equal(event.rendererRelease.after, null);
    assert.equal(event.rendererRelease.difference, null, 'Unavailable is not a fabricated zero delta');
    assert.deepEqual(event.rendererRelease.readErrors, [{ stage: 'before', message: 'controlled reader failure' },
      { stage: 'after', message: 'controlled reader failure' }]);
  }
  released[0].rendererRelease.readErrors[0].message = 'mutated snapshot';
  assert.equal(system.snapshot().workshopPilotEvents.find(event => event.kind === 'asset-released')
    .rendererRelease.readErrors[0].message, 'controlled reader failure');
  assert.equal(reads, 4, 'Repeated snapshots do not call the reader'); system.dispose();
});
