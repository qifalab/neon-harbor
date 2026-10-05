import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// CPU evidence only: creates actual game cities and never creates a renderer,
// calls a browser, requests assets, or makes a network request.
const baselinePath = '/workspace/neon-candidates/harbor-transit-compact-verification-final-20261005';
const candidatePath = '/workspace/neon-candidates/harbor-night-fixture-lighting-candidate-20261005';
const expectedColliderSha = '7bdfb9a064e0225ea07b641dae7ed363403c8d457c589eeefcde6d8c00e09e30';
const outputPath = new URL('./cpu-identity-proof.json', import.meta.url);
const baselineHead = 'ef4112bed4624c9c969b5b5f3746ccbfb64817aa';
const radius = .65;
const sha = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const bytesSha = array => createHash('sha256').update(Buffer.from(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const json = value => JSON.parse(JSON.stringify(value));
const checks = [];
function check(name, action) {
  try { const details = action(); checks.push({ name, pass: true, ...(details || {}) }); }
  catch (error) { checks.push({ name, pass: false, error: String(error.message) }); }
}
let networkAttemptCount = 0;
globalThis.fetch = async () => { networkAttemptCount++; throw Error('CPU proof forbids network/asset fetch'); };

const modules = await Promise.all([baselinePath, candidatePath].map(async root => {
  const [THREE, game, collision] = await Promise.all([
    import(pathToFileURL(path.join(root, 'vendor/three/three.module.js'))),
    import(pathToFileURL(path.join(root, 'src/city-exploration.js'))),
    import(pathToFileURL(path.join(root, 'src/collision.js'))),
  ]);
  return { root, THREE, game, collision };
}));

function attributeRecord(attribute) {
  return { count: attribute.count, itemSize: attribute.itemSize, normalized: attribute.normalized,
    type: attribute.array.constructor.name, bytes: attribute.array.byteLength, sha256: bytesSha(attribute.array) };
}
function geometryRecord(g) {
  const attributes = Object.fromEntries(Object.keys(g.attributes).sort().map(key => [key, attributeRecord(g.attributes[key])]));
  return { type: g.type, attributes, index: g.index ? attributeRecord(g.index) : null,
    groups: json(g.groups), drawRange: json(g.drawRange),
    morphAttributes: Object.fromEntries(Object.keys(g.morphAttributes).sort().map(key => [key, g.morphAttributes[key].map(attributeRecord)])) };
}
function materialRecord(m) {
  const fields = ['type', 'name', 'roughness', 'metalness', 'emissiveIntensity', 'opacity', 'transparent', 'side',
    'depthWrite', 'depthTest', 'toneMapped', 'alphaTest', 'vertexColors', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits'];
  const result = Object.fromEntries(fields.filter(key => key in m).map(key => [key, m[key]]));
  for (const key of ['color', 'emissive']) if (m[key]) result[key] = m[key].toArray();
  result.textures = Object.fromEntries(Object.entries(m).filter(([, v]) => v?.isTexture).map(([key, texture]) => [key, {
    name: texture.name, colorSpace: texture.colorSpace, wrapS: texture.wrapS, wrapT: texture.wrapT,
    magFilter: texture.magFilter, minFilter: texture.minFilter, anisotropy: texture.anisotropy,
    dataSha256: ArrayBuffer.isView(texture.image?.data) ? bytesSha(texture.image.data) : null,
  }]));
  result.userData = json(m.userData);
  result.shaderHookSha256 = sha(String(m.onBeforeCompile));
  result.customProgramCacheKeySha256 = sha(m.customProgramCacheKey());
  return result;
}
function sceneRecords(scene) {
  const records = new Map();
  scene.updateMatrixWorld(true);
  function visit(node, key) {
    const shape = { type: node.type, name: node.name,
      position: node.position.toArray(), quaternion: node.quaternion.toArray(), scale: node.scale.toArray(),
      visible: node.visible, renderOrder: node.renderOrder, frustumCulled: node.frustumCulled,
      castShadow: node.castShadow, receiveShadow: node.receiveShadow };
    if (node.isMesh) {
      shape.geometry = geometryRecord(node.geometry);
      if (node.isInstancedMesh) {
        shape.count = node.count; shape.instanceMatrix = attributeRecord(node.instanceMatrix);
        shape.instanceColor = node.instanceColor ? attributeRecord(node.instanceColor) : null;
      }
      for (const field of ['originalTransforms', 'buildings']) if (node.userData[field]) shape[field] = json(node.userData[field]);
    }
    const material = node.isMesh ? (Array.isArray(node.material) ? node.material.map(materialRecord) : [materialRecord(node.material)]) : null;
    const triangles = node.isMesh ? (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3 * (node.isInstancedMesh ? node.count : 1) : 0;
    const worldInstanceBounds = [];
    if (node.isMesh) {
      node.geometry.computeBoundingBox();
      for (let i = 0; i < (node.isInstancedMesh ? node.count : 1); i++) {
        const transform = node.matrixWorld.clone();
        if (node.isInstancedMesh) {
          const instance = node.matrixWorld.clone(); node.getMatrixAt(i, instance); transform.multiply(instance);
        }
        const box = node.geometry.boundingBox.clone().applyMatrix4(transform);
        worldInstanceBounds.push({ instance: i, min: box.min.toArray(), max: box.max.toArray() });
      }
    }
    records.set(key, { shape, material, triangles, worldInstanceBounds });
    const duplicates = new Map();
    for (const child of node.children) {
      const label = child.name || child.type, ordinal = duplicates.get(label) || 0;
      duplicates.set(label, ordinal + 1); visit(child, `${key}/${label}[${ordinal}]`);
    }
  }
  visit(scene, 'Scene'); return records;
}
function createActual(m, streaming) {
  const scene = new m.THREE.Scene();
  const city = m.game.createCityExploration(m.THREE, scene, { quality: 'high', streaming });
  const snapshot = city.snapshot();
  // This is the exact actual fields/metadata from production creation.
  return { m, streaming, scene, city, snapshot: json(snapshot), records: sceneRecords(scene),
    colliders: json(city.colliders), buildings: json(city.buildings), infrastructureMetadata: json(city.infrastructure.metadata),
    treeStats: json(city.north.sampleTreeStats), northPayload: json(city.north.exportCity()), southPayload: json(city.south.exportCity()) };
}
function pointClearance(city, point) {
  const y = city.groundHeightAt(point.x, point.z), height = 1.8;
  let nearest = null;
  for (const b of city.colliders) {
    if (b.physics === false || (b.maxY ?? Infinity) <= y || (b.minY ?? -Infinity) >= y + height) continue;
    const c = Math.cos(b.yaw || 0), s = Math.sin(b.yaw || 0), dx = point.x - b.x, dz = point.z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    const outside = Math.hypot(Math.max(Math.abs(lx) - b.hx, 0), Math.max(Math.abs(lz) - b.hz, 0));
    const gap = outside > 0 ? outside - radius : -Math.min(b.hx - Math.abs(lx), b.hz - Math.abs(lz)) - radius;
    if (!nearest || gap < nearest.bodyClearanceMetres) nearest = { colliderId: b.id, bodyClearanceMetres: gap };
  }
  return { x: point.x, z: point.z, y, radius, ...(nearest || {}) };
}
const proof = {
  status: 'CPU_IDENTITY_PROOF_RUNNING', baselinePath, candidatePath, baselineHeadProvided: baselineHead,
  basis: 'Actual createCityExploration with High quality; CPU scene construction and real collision API only.',
  scope: { gpuUsed: false, browserUsed: false, rendererCreated: false, runtimeAppearanceClaimed: false, networkUsed: false },
  actualSourceFields: { colliders: 'city.colliders', entryBuildings: 'city.buildings / city.snapshot().buildings',
    supportMetadata: 'city.infrastructure.metadata / city.snapshot().infrastructure', treeState: 'city.north.sampleTreeStats',
    northDetailPayload: 'city.north.exportCity()', southDetailPayload: 'city.south.exportCity()' },
  supportSamplingClarification: 'The 72 values are an explicitly authored 8 x 9 groundHeightAt grid, not 72 source support metadata entries. Complete actual infrastructure.metadata is checked separately.',
  checks,
};
const streamingCities = modules.map(m => createActual(m, true));
const detailedCities = modules.map(m => createActual(m, false));
const [before, after] = detailedCities;

for (const [label, pair] of [['streaming-high', streamingCities], ['full-detail-high', detailedCities]]) {
  const [a, b] = pair;
  check(`${label}: all 4178 serialized colliders exact`, () => {
    assert.equal(a.colliders.length, 4178); assert.equal(b.colliders.length, 4178);
    assert.equal(JSON.stringify(b.colliders), JSON.stringify(a.colliders));
    assert.equal(sha(b.colliders), expectedColliderSha);
    return { count: b.colliders.length, baselineSha256: sha(a.colliders), candidateSha256: sha(b.colliders) };
  });
  check(`${label}: all 220 complete entry building snapshots exact`, () => {
    assert.equal(a.buildings.length, 220); assert.equal(b.buildings.length, 220);
    assert.equal(JSON.stringify(a.buildings), JSON.stringify(a.snapshot.buildings));
    assert.equal(JSON.stringify(b.buildings), JSON.stringify(b.snapshot.buildings));
    assert.equal(JSON.stringify(b.buildings), JSON.stringify(a.buildings));
    return { count: b.buildings.length, baselineSha256: sha(a.buildings), candidateSha256: sha(b.buildings) };
  });
  check(`${label}: actual complete infrastructure support metadata exact`, () => {
    assert.equal(JSON.stringify(b.infrastructureMetadata), JSON.stringify(a.infrastructureMetadata));
    assert.deepEqual(b.infrastructureMetadata, b.snapshot.infrastructure);
    return { sourceFields: Object.keys(b.infrastructureMetadata), baselineSha256: sha(a.infrastructureMetadata), candidateSha256: sha(b.infrastructureMetadata) };
  });
  check(`${label}: original six-tree state exact`, () => {
    assert.deepEqual(b.treeStats, a.treeStats); assert.equal(b.treeStats.trees.length, 6);
    return { sha256: sha(b.treeStats), trees: b.treeStats.trees };
  });
}

check('complete original north and south detail batch exports exact', () => {
  assert.equal(JSON.stringify(after.northPayload), JSON.stringify(before.northPayload));
  assert.equal(JSON.stringify(after.southPayload), JSON.stringify(before.southPayload));
  return { northChunks: after.northPayload.payloads.length, southChunks: after.southPayload.payloads.length,
    northSha256: sha(after.northPayload), southSha256: sha(after.southPayload) };
});

proof.originalGeometry = {};
proof.materialBoundary = {};
for (const [label, pair] of [['streaming-high', streamingCities], ['full-detail-high', detailedCities]]) {
  const [a, b] = pair, missing = [], changedShape = [], changedMaterials = [];
  for (const [key, old] of a.records) {
    const now = b.records.get(key);
    if (!now) { missing.push(key); continue; }
    if (JSON.stringify(now.shape) !== JSON.stringify(old.shape)) changedShape.push(key);
    if (JSON.stringify(now.material) !== JSON.stringify(old.material)) changedMaterials.push({ path: key, baseline: old.material, candidate: now.material });
  }
  const added = [...b.records].filter(([key]) => !a.records.has(key)).map(([key, value]) => ({ path: key, ...value }));
  proof.originalGeometry[label] = { baselineObjects: a.records.size, candidateObjects: b.records.size,
    baselineMeshes: [...a.records.values()].filter(v => v.shape.geometry).length,
    candidateMeshes: [...b.records.values()].filter(v => v.shape.geometry).length,
    missingOriginalObjects: missing, changedOriginalShapeObjects: changedShape, addedObjects: added };
  proof.materialBoundary[label] = { changedOriginalMaterialObjects: changedMaterials,
    materialComparison: 'Colors, emissive/scalar properties, texture bytes, shader hooks and material userData are recorded separately from geometry and collision.' };
  check(`${label}: every original tree/pole/other shape exact`, () => {
    assert.deepEqual(missing, []); assert.deepEqual(changedShape, []);
    return { originalObjectCount: a.records.size, originalShapeDigest: sha([...a.records].map(([key, value]) => [key, value.shape])) };
  });
}

const sampleX = [-1800, -900, -617, -100, 0, 740, 1500, 1800];
const sampleZ = [-1673, -1490, -1382, -1380, -445, -420, 0, 800, 1800];
proof.groundSupportSamples72 = sampleX.flatMap(x => sampleZ.map(z => ({ x, z,
  baseline: before.city.groundHeightAt(x, z), candidate: after.city.groundHeightAt(x, z) })));
check('72 explicit ground support grid samples exact', () => {
  assert.equal(proof.groundSupportSamples72.length, 72);
  for (const sample of proof.groundSupportSamples72) assert.equal(sample.candidate, sample.baseline);
  return { count: 72, sha256: sha(proof.groundSupportSamples72) };
});

const stands = [{ x: -568.28, z: -438.2 }, { x: -600, z: -440.8 }];
const collisionOptions = record => ({ index: new record.m.collision.SpatialIndex(record.city.colliders),
  bounds: record.city.bounds, groundHeightAt: record.city.groundHeightAt });
const options = detailedCities.map(collisionOptions);
proof.standClearance = stands.map(p => ({ baseline: pointClearance(before.city, p), candidate: pointClearance(after.city, p),
  baselineContactIds: before.m.collision.circleContacts({ ...p, y: before.city.groundHeightAt(p.x, p.z) }, radius, options[0]).map(c => c.obstacle.id),
  candidateContactIds: after.m.collision.circleContacts({ ...p, y: after.city.groundHeightAt(p.x, p.z) }, radius, options[1]).map(c => c.obstacle.id) }));
check('two original stands have exact .65 body clearance and no real collision API contacts', () => {
  for (const s of proof.standClearance) { assert.deepEqual(s.candidate, s.baseline);
    assert.deepEqual(s.baselineContactIds, []); assert.deepEqual(s.candidateContactIds, []);
    assert.ok(s.candidate.bodyClearanceMetres >= 0); }
  return { bodyRadius: radius, stands: proof.standClearance };
});

// The route endpoints are from the committed original camera/collision proof;
// the route is resampled and moved through the actual baseline/candidate API.
const routeSource = path.join(baselinePath, 'tools/native-review/runtime-amendments/continuous-crown-20261005/whole-camera-collision-proof-original.json');
const originalRoute = JSON.parse(fs.readFileSync(routeSource, 'utf8')).routeLegs;
proof.routeSource = { path: routeSource, sha256: sha(fs.readFileSync(routeSource, 'utf8')) };
proof.routeSamples = originalRoute.map(leg => {
  const distance = Math.hypot(leg.end.x - leg.start.x, leg.end.z - leg.start.z), intervals = Math.max(1, Math.ceil(distance / .1));
  const reports = detailedCities.map((record, cityIndex) => {
    const opts = options[cityIndex], points = [];
    for (let i = 0; i <= intervals; i++) {
      const t = i / intervals, p = { x: leg.start.x + (leg.end.x - leg.start.x) * t, z: leg.start.z + (leg.end.z - leg.start.z) * t };
      const y = record.city.groundHeightAt(p.x, p.z);
      points.push({ ...p, y, contactIds: record.m.collision.circleContacts({ ...p, y }, radius, opts).map(c => c.obstacle.id),
        nearestBodyClearanceMetres: pointClearance(record.city, p).bodyClearanceMetres });
    }
    const pose = { ...leg.start, y: record.city.groundHeightAt(leg.start.x, leg.start.z), yaw: 0 };
    const move = record.m.collision.moveCircle(pose, leg.end.x - leg.start.x, leg.end.z - leg.start.z, radius, opts);
    return { points, finalPose: pose, moveReport: { ...move, contacts: move.contacts.map(c => ({ kind: c.kind, colliderId: c.obstacle.id, depth: c.depth, normal: c.normal })) } };
  });
  return { label: leg.label, start: leg.start, end: leg.end, sampleCount: intervals + 1,
    baseline: reports[0], candidate: reports[1] };
});
check('complete original route static .1m sampling and actual moveCircle exact and clear', () => {
  for (const leg of proof.routeSamples) {
    assert.deepEqual(leg.candidate, leg.baseline);
    for (const p of leg.candidate.points) { assert.deepEqual(p.contactIds, []); assert.ok(p.nearestBodyClearanceMetres >= 0); }
    assert.deepEqual(leg.candidate.moveReport.contacts, []);
    assert.ok(Math.hypot(leg.candidate.finalPose.x - leg.end.x, leg.candidate.finalPose.z - leg.end.z) < 1e-7);
  }
  return { legs: proof.routeSamples.length, samples: proof.routeSamples.reduce((n, leg) => n + leg.sampleCount, 0), bodyRadius: radius,
    minBodyClearanceMetres: Math.min(...proof.routeSamples.flatMap(leg => leg.candidate.points.map(p => p.nearestBodyClearanceMetres))) };
});

proof.physicsBoundary = { collidersExactSerialized: checks.filter(c => c.name.includes('serialized colliders')).every(c => c.pass),
  entryBuildingsExact: checks.filter(c => c.name.includes('entry building')).every(c => c.pass), supportMetadataExact: checks.filter(c => c.name.includes('support metadata')).every(c => c.pass),
  noRuntimeClaim: 'CPU construction and static collision checks do not establish GPU appearance, browser playability, frame time, streaming network behavior, or material shader compilation.' };
const fixtureMeshes = proof.originalGeometry['full-detail-high'].addedObjects.filter(o => o.shape.geometry);
const actualFixtureMeshes = [];
after.scene.traverse(node => { if (node.isMesh && node.userData.streetFixture) actualFixtureMeshes.push(node); });
proof.addedFixtureGeometryBoundary = { source: 'Actual candidate scene meshes absent from baseline scene',
  meshes: fixtureMeshes.length, instances: fixtureMeshes.reduce((n, o) => n + (o.shape.count ?? 1), 0),
  triangles: fixtureMeshes.reduce((n, o) => n + o.triangles, 0),
  actualGeometryObjects: new Set(actualFixtureMeshes.map(node => node.geometry)).size,
  actualMaterialObjects: new Set(actualFixtureMeshes.map(node => node.material)).size,
  minimumWorldY: Math.min(...fixtureMeshes.flatMap(o => o.worldInstanceBounds.map(b => b.min[1]))),
  noColliderAdded: proof.physicsBoundary.collidersExactSerialized,
  residualRisk: 'These are newly added elevated physical-looking fixtures without new collision. Their minimum geometry height and original ground route are checked on CPU; visual clipping, camera overlap, collision at non-ground supports, and GPU appearance require native review.' };
check('new elevated fixture geometry: 2 meshes / 10 instances / 120 triangles, all bounds above 3m', () => {
  assert.equal(proof.addedFixtureGeometryBoundary.meshes, 2);
  assert.equal(proof.addedFixtureGeometryBoundary.instances, 10);
  assert.equal(proof.addedFixtureGeometryBoundary.triangles, 120);
  assert.equal(actualFixtureMeshes.length, 2);
  assert.equal(proof.addedFixtureGeometryBoundary.actualGeometryObjects, 1);
  assert.equal(proof.addedFixtureGeometryBoundary.actualMaterialObjects, 2);
  assert.ok(proof.addedFixtureGeometryBoundary.minimumWorldY > 3);
  return proof.addedFixtureGeometryBoundary;
});
if ('streetLightingStats' in after.city.north) {
  proof.actualSourceFields.fixtureLightingMetadata = 'city.north.streetLightingStats';
  proof.actualCandidateLightingSnapshot = json(after.city.north.streetLightingStats);
  check('actual lighting diagnostic: 100 sources and 4 High shadowless slots, new field kept separate from original physics identity', () => {
    assert.equal(proof.actualCandidateLightingSnapshot.sourceCount, 100);
    assert.equal(proof.actualCandidateLightingSnapshot.poolCapacity, 4);
    assert.equal(proof.actualCandidateLightingSnapshot.residentLightObjects, 4);
    assert.equal(proof.actualCandidateLightingSnapshot.slots.length, 4);
    assert.ok(proof.actualCandidateLightingSnapshot.slots.every(slot => slot.castShadow === false));
    assert.deepEqual(after.city.snapshot().streetLighting, after.city.north.streetLightingStats);
    return { sourceCount: 100, poolCapacity: 4, shadows: false, actualSnapshotField: 'city.snapshot().streetLighting' };
  });
}
proof.sourceFiles = Object.fromEntries(['src/city-exploration.js', 'src/metropolis-world.js', 'src/ground-support.js', 'src/collision.js',
  'src/metropolis-infrastructure.js', 'src/harbor-sample-trees.js'].map(file => [file,
    Object.fromEntries(modules.map((m, i) => [i === 0 ? 'baselineSha256' : 'candidateSha256', sha(fs.readFileSync(path.join(m.root, file), 'utf8'))]))]));
proof.sourceFiles['src/harbor-street-lighting.js'] = { baselineSha256: null,
  candidateSha256: sha(fs.readFileSync(path.join(candidatePath, 'src/harbor-street-lighting.js'), 'utf8')) };
check('no fetch or network attempted', () => { assert.equal(networkAttemptCount, 0); return { attemptedFetches: networkAttemptCount }; });

for (const record of [...streamingCities, ...detailedCities]) {
  record.city.north.dispose(); record.city.south.dispose?.(); record.city.infrastructure.dispose();
  record.city.sample.district.dispose(); record.city.sample.transit.dispose?.();
}
proof.status = checks.every(c => c.pass) ? 'CPU_IDENTITY_PROOF_PASS_GPU_AND_RUNTIME_UNREVIEWED' : 'CPU_IDENTITY_PROOF_FAIL';
fs.writeFileSync(outputPath, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ status: proof.status, output: outputPath.pathname,
  checks: checks.map(({ name, pass, error }) => ({ name, pass, ...(error ? { error } : {}) })),
  colliders: after.colliders.length, buildings: after.buildings.length, networkAttemptCount,
  addedShapeObjects: Object.fromEntries(Object.entries(proof.originalGeometry).map(([key, value]) => [key, value.addedObjects.filter(o => o.shape.geometry).length])) }, null, 2));
if (!checks.every(c => c.pass)) process.exitCode = 1;
