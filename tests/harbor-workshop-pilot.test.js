import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import { createCompactInteriorLayout } from '../src/compact-interiors.js';
import { applyAuthoredWorkshopLayout } from '../src/harbor-workshop-authored.js';
import { expansionBuilding } from '../src/expansion-programmes.js';
import { createInteriorLayout, createInteriorSystem } from '../src/metropolis-interiors.js';
import { SpatialIndex, circleContacts, CHARACTER_RADIUS } from '../src/collision.js';
import { createHarborWorkshopPilot, planHarborWorkshopPilot, WORKSHOP_PILOT } from '../src/harbor-workshop-pilot.js';
import { parseWorkshopAssetCPU, inspectScene } from '../tools/inspect-workshop-assets.mjs';

const json = async relative => JSON.parse(await readFile(new URL(relative, import.meta.url), 'utf8'));
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
// Exact single-building catalogue captured before the frozen native tour.
// Geometry unit checks need neither createWorld nor a global city fixture.
const capturedBuilding = JSON.parse(readFileSync(new URL('../docs/qa/authored-workshop/source-building.json', import.meta.url), 'utf8'));
const fixture = (authored = false) => {
  const building = expansionBuilding(JSON.parse(JSON.stringify(capturedBuilding)), 'south', 85), floor = building.floors[0];
  const original = createCompactInteriorLayout(building, floor);
  return { building, floor, original, layout: authored ? applyAuthoredWorkshopLayout(building, floor, original) : original };
};
const loadCPU = async id => parseWorkshopAssetCPU(await readFile(new URL(`../assets/harbor/workshop/${id}.glb`, import.meta.url)));

test('original fittings distinguish MIT geometry/prints from CC0 maps and embed exact checked texture bytes', async () => {
  const manifest = await json('../assets/harbor/workshop/asset-manifest.json');
  const record = manifest.models.find(model => model.id === 'workshop-fittings');
  assert.match(record.license, /MIT.*CC0-1\.0/);
  assert.match(await readFile(new URL('../assets/harbor/workshop/LICENSE-NEON-AUTHORED.txt', import.meta.url), 'utf8'), /MIT License/);
  assert.ok(record.authors.QifaLab && record.authors['Rob Tuytel']);
  const bytes = await readFile(new URL('../' + record.output.path, import.meta.url));
  assert.equal(bytes.length, record.output.bytes); assert.equal(hash(bytes), record.output.sha256);
  const len = bytes.readUInt32LE(12), packed = JSON.parse(bytes.subarray(20, 20 + len).toString()), binary = bytes.subarray(28 + len);
  assert.equal(packed.meshes.length, 11); assert.equal(packed.images.length, 4); assert.equal(packed.skins, undefined);
  for (const [index, source] of record.sourceTextures.entries()) {
    const original = await readFile(new URL('../' + source.path, import.meta.url));
    assert.equal(original.length, source.size); assert.equal(hash(original), source.sha256); assert.equal(hash(original, 'md5'), source.md5);
    const view = packed.bufferViews[packed.images[index].bufferView];
    assert.deepEqual(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength), original);
  }
  const label = await readFile(new URL('../docs/qa/authored-workshop/authored-source/workshop-labels.png', import.meta.url));
  assert.equal(label.length, record.labelRaster.bytes); assert.equal(hash(label), record.labelRaster.sha256);
  const labelView = packed.bufferViews[packed.images[3].bufferView];
  assert.deepEqual(binary.subarray(labelView.byteOffset, labelView.byteOffset + labelView.byteLength), label);
  const asset = await loadCPU(record.id); let meshes = 0, triangles = 0;
  asset.scene.traverse(object => { if (!object.isMesh) return; meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    for (const attribute of Object.values(object.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
  });
  assert.equal(meshes, 11); assert.equal(triangles, 17784);
  for (const name of ['core', 'near', 'far']) assert.ok(asset.scene.getObjectByName('workshop-tier-' + name));
});

test('new official desk and shelf retain indexed geometry and complete PBR references', async () => {
  for (const [id, triangles, meshes] of [['metal_office_desk', 6898, 9], ['wooden_bookshelf_worn', 10106, 1]]) {
    const asset = await loadCPU(id), result = inspectScene(asset.scene);
    assert.equal(result.triangles, triangles); assert.equal(result.meshes, meshes);
    assert.equal(result.skinnedMeshes, 0); assert.equal(result.materialCount, 1); assert.equal(result.textureCount, 3);
    asset.scene.traverse(object => { if (!object.isMesh) return;
      for (const index of object.geometry.index.array) assert.ok(index < object.geometry.attributes.position.count);
    });
  }
});

test('authored five-model owner switches three tiers, shares three shelves and releases every unique resource once', async () => {
  const data = fixture(true), fallback = new THREE.Group(), counts = { geometry: 0, material: 0, texture: 0, bitmap: 0, boneTexture: 0 };
  for (const part of planHarborWorkshopPilot(data.building, data.floor, data.layout).fallbackParts) {
    const child = new THREE.Object3D(); child.userData.workshopFallbackKind = part.kind; fallback.add(child);
  }
  const loadAsset = async id => {
    const asset = await loadCPU(id), geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
    asset.scene.traverse(object => { if (!object.isMesh) return;
      geometries.add(object.geometry); materials.add(object.material); if (object.skeleton) skeletons.add(object.skeleton);
      for (const value of Object.values(object.material)) if (value?.isTexture) textures.add(value);
    });
    for (const geometry of geometries) geometry.addEventListener('dispose', () => counts.geometry++);
    for (const material of materials) material.addEventListener('dispose', () => counts.material++);
    for (const texture of textures) { texture.addEventListener('dispose', () => counts.texture++); texture.source.data = { close: () => counts.bitmap++ }; }
    for (const skeleton of skeletons) { skeleton.computeBoneTexture(); skeleton.boneTexture.addEventListener('dispose', () => counts.boneTexture++); }
    return asset;
  };
  const owner = createHarborWorkshopPilot(THREE, { ...data, fallbackGroup: fallback, loadAsset, enabled: true });
  owner.update({ x: 180.9, z: -114.58, groundY: data.floor.y }); await owner.whenSettled();
  assert.equal(owner.snapshot().status, 'ready'); assert.equal(owner.snapshot().assetCount, 5); assert.equal(owner.snapshot().lodTier, 0);
  const shelf = owner.group.children.find(child => child.userData.workshopAssetId === 'wooden_bookshelf_worn'), shelves = [];
  shelf.traverse(object => { if (object.isMesh) shelves.push(object); });
  assert.equal(shelves.length, 3); assert.equal(new Set(shelves.map(object => object.geometry)).size, 1);
  assert.equal(new Set(shelves.map(object => object.material)).size, 1);
  const visible = () => { let meshes = 0, triangles = 0; owner.group.traverseVisible(object => { if (!object.isMesh) return; meshes++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3; }); return { meshes, triangles }; };
  assert.deepEqual(visible(), { meshes: 37, triangles: 79560 });
  assert.deepEqual(owner.snapshot().details, { meshes: 5, triangles: 8820, textures: 0, envelopeCount: 9, detailPieces: 105 });
  const detailGroup = owner.group.children.find(child => child.name === 'Workshop · repair and archive detail');
  const detailReleases = { geometry: 0, material: 0 };
  for (const child of detailGroup.children) {
    child.geometry.addEventListener('dispose', () => detailReleases.geometry++);
    child.material.addEventListener('dispose', () => detailReleases.material++);
  }
  owner.update({ x: 197.7, z: -105.5, groundY: data.floor.y }); assert.equal(owner.snapshot().lodTier, 1);
  assert.deepEqual(visible(), { meshes: 34, triangles: 72044 });
  owner.update({ x: 205, z: -105, groundY: data.floor.y }); assert.equal(owner.snapshot().lodTier, 2);
  assert.deepEqual(visible(), { meshes: 2, triangles: 484 });
  assert.ok(fallback.children.every(child => child.visible === ['bench-vice', 'tool-chest-fallback'].includes(child.userData.workshopFallbackKind)));
  owner.update({ x: 230, z: -105, groundY: data.floor.y }); assert.equal(owner.snapshot().assetCount, 0);
  assert.equal(owner.snapshot().details, null);
  assert.equal(detailGroup.parent, null);
  assert.deepEqual(detailReleases, { geometry: 5, material: 5 });
  assert.ok(fallback.visible && fallback.children.every(child => child.visible)); owner.dispose(); owner.dispose();
  assert.deepEqual(counts, { geometry: 32, material: 10, texture: 16, bitmap: 16, boneTexture: 1 });
  assert.deepEqual(detailReleases, { geometry: 5, material: 5 });
});

test('authored owner rejects partial/corrupt new models and never attaches five late results after floor release', async () => {
  const data = fixture(true), plan = planHarborWorkshopPilot(data.building, data.floor, data.layout);
  for (const mode of ['missing', 'corrupt']) {
    const fallback = new THREE.Group(), owner = createHarborWorkshopPilot(THREE, { ...data, fallbackGroup: fallback, enabled: true,
      loadAsset: async id => {
        if (mode === 'missing' && id === 'wooden_bookshelf_worn') throw new Error('Expected missing new shelf');
        const asset = await loadCPU(id);
        if (mode === 'corrupt' && id === 'metal_office_desk') asset.scene.traverse(object => { if (object.isMesh) object.material.normalMap = null; });
        return asset;
      } });
    owner.update(plan.centre); await owner.whenSettled();
    assert.equal(owner.snapshot().status, 'failed'); assert.equal(owner.snapshot().assetCount, 0); assert.equal(fallback.visible, true);
    assert.equal(owner.snapshot().releasedAssets, mode === 'missing' ? 4 : 5); owner.dispose();
  }
  const waits = [], owner = createHarborWorkshopPilot(THREE, { ...data, enabled: true,
    loadAsset: (id, { signal }) => new Promise(resolve => waits.push({ id, signal, resolve })) });
  owner.update(plan.centre); const pending = owner.whenSettled(); assert.equal(waits.length, 5); owner.dispose();
  assert.ok(waits.every(wait => wait.signal.aborted)); for (const wait of waits) wait.resolve(await loadCPU(wait.id));
  await pending; assert.equal(owner.snapshot().assetCount, 0); assert.equal(owner.snapshot().releasedAssets, 5); assert.equal(owner.group.children.length, 0);
});

test('GLBs contain exact official acquired BIN and 1K JPEG bytes, original scenes/skins/PBR and proven hashes', async () => {
  const manifest = await json('../assets/harbor/workshop/asset-manifest.json');
  assert.equal(manifest.models.length, 5);
  assert.deepEqual(manifest.models.filter(r => r.license === 'CC0-1.0').map(r => r.id).sort(),
    ['bench_vice_01','metal_office_desk','metal_tool_chest','wooden_bookshelf_worn']);
  assert.ok(manifest.runtimeBytes <= 12000000);
  for (const record of manifest.models.filter(record => record.license === 'CC0-1.0')) {
    assert.equal(record.license, 'CC0-1.0');
    for (const download of record.metadataDownloads) {
      assert.ok(download.url.startsWith('https://api.polyhaven.com/'));
      const bytes = await readFile(new URL('../' + download.path, import.meta.url));
      assert.equal(bytes.length, download.bytes); assert.equal(hash(bytes), download.sha256);
    }
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
    const gltfSource = record.sourceDownloads.find(source => source.sourceUri === `${record.id}_1k.gltf`);
    assert.ok(gltfSource);
    const sourceUrl = new URL('../' + gltfSource.path, import.meta.url);
    const original = JSON.parse(await readFile(sourceUrl, 'utf8'));
    for (const key of ['meshes', 'accessors', 'nodes', 'scenes', 'scene', 'skins', 'animations', 'materials', 'textures', 'samplers'])
      assert.deepEqual(packed[key], original[key], `${record.id}/${key}: authored data changed`);
    assert.equal(packed.buffers.length, 1); assert.equal(packed.buffers[0].uri, undefined);
    const originalBin = await readFile(new URL(original.buffers[0].uri, sourceUrl));
    assert.deepEqual(binary.subarray(0, originalBin.length), originalBin, 'Geometry BIN unchanged');
    for (const [index, image] of original.images.entries()) {
      assert.equal(packed.images[index].uri, undefined);
      const view = packed.bufferViews[packed.images[index].bufferView];
      const source = await readFile(new URL(image.uri, sourceUrl));
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
  for (const item of snapshot.files) {
    const historical = await readFile(new URL('../docs/qa/art-pilot/base-source/' + item.path, import.meta.url));
    assert.equal(historical.length, item.bytes); assert.equal(hash(historical), item.sha256);
  }
  // base-snapshot describes historical evidence, not mutable current sources.
  assert.equal(snapshot.baseCommit, '0330df7ee1042d0f211304b042e01cdf6a0b4d44');
});

test('actual indexed geometry, retained vice skin, default-pose bounds and PBR references fit the two-model budget', async () => {
  const expected = { bench_vice_01: { triangles: 2864, meshes: 4, skin: 4 }, metal_tool_chest: { triangles: 13360, meshes: 7, skin: 0 } };
  let totalTriangles = 0, totalDraws = 0;
  for (const id of Object.keys(expected)) {
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

test('single workshop preserves original routes/unaffected colliders and >2m main passage; chest stays on its owner crate', () => {
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
  const authored = applyAuthoredWorkshopLayout(data.building, data.floor, data.layout);
  const replacedArchiveIds = new Set(authored.workshopAuthored.replacedArchiveParts.map(part => part.id));
  for (const collider of data.layout.colliders) {
    if (replacedArchiveIds.has(collider.id)) assert.ok(!byId.has(collider.id), 'Replaced archive obstacle must be removed with its visible furnishing');
    else assert.deepEqual(byId.get(collider.id), collider, 'Unrelated original collider altered');
  }
  assert.equal(system.snapshot().workshopPilot.placementPlan.placements.length, 5);
  assert.deepEqual(authored.rooms, data.layout.rooms);
  assert.deepEqual(authored.entrance, data.layout.entrance);
  assert.deepEqual(authored.elevator, data.layout.elevator);
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

test('distance hysteresis loads once, releases owned resource callbacks and releases again on building exit', async () => {
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
  assert.deepEqual(counts, { geometries: 32, textures: 16, closedImages: 16 });
  assert.equal(reads, 10); assert.equal(live.snapshot().assetCount, 0);
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
  assert.equal(reads, 10, 'Repeated snapshots do not call the reader'); system.dispose();
});
