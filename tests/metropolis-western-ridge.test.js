import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createMetropolisWorld } from '../src/metropolis-world.js';
import { createWesternMountainBatch, WESTERN_RIDGE_RECIPE } from '../src/metropolis-western-ridge.js';

function setup() {
  const world = createMetropolisWorld(THREE, new THREE.Scene(), { streaming: true, quality: 'high' });
  let mountain;
  world.root.traverse(mesh => { if (mesh.userData.westernRidge) mountain = mesh; });
  assert.ok(mountain); return { world, mountain };
}

function hillBounds(positions, range) {
  const bounds = new THREE.Box3(), p = new THREE.Vector3();
  for (let i = range.firstVertex; i < range.firstVertex + range.vertices; i++) bounds.expandByPoint(p.fromBufferAttribute(positions, i));
  return bounds;
}

test('west mountains have bounded continuous slope geometry within every original hill envelope', () => {
  const { world, mountain } = setup();
  try {
    const geometry = mountain.geometry, positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    assert.equal(mountain.isInstancedMesh, undefined);
    assert.ok(!Array.isArray(mountain.material));
    assert.ok(mountain.userData.buildings.every(id => id === null));
    assert.equal(mountain.userData.westernRidge.preparedBytes, 262496);
    assert.ok(mountain.userData.westernRidge.producerTypedArrayBytes <= WESTERN_RIDGE_RECIPE.maxPreparedBytes);
    for (const range of mountain.userData.westernRidge.hillRanges.slice(0, 10)) {
      assert.ok(range.triangles <= WESTERN_RIDGE_RECIPE.maxHillTriangles);
      const t = mountain.userData.originalTransforms[range.hill], bounds = hillBounds(positions, range);
      assert.deepEqual(bounds.min.toArray(), [t[0] - t[3], t[1] - t[4] / 2, t[2] - t[5]]);
      assert.deepEqual(bounds.max.toArray(), [t[0] + t[3], t[1] + t[4] / 2, t[2] + t[5]]);
      const ring = range.firstVertex + 1 + 5 * WESTERN_RIDGE_RECIPE.angularSegments;
      const heights = Array.from({ length: WESTERN_RIDGE_RECIPE.angularSegments }, (_, i) => positions.getY(ring + i));
      assert.ok(Math.max(...heights) - Math.min(...heights) > t[4] * .20, 'a circular ring must expose shoulder/ridge/valley rather than a symmetric cone');
      assert.ok(positions.getY(range.firstVertex) < bounds.max.y - 1, 'the old central cone apex must be replaced by an offset broad spine');
      for (let i = range.firstVertex; i < range.firstVertex + 1 + (WESTERN_RIDGE_RECIPE.radialRings - 1) * WESTERN_RIDGE_RECIPE.angularSegments; i++) {
        assert.ok(normals.getY(i) > 0, 'top height-field triangles must point upwards');
        const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
        assert.ok(Math.abs(length - 1) < 1e-6);
      }
    }
    assert.ok(mountain.userData.westernRidge.westernTriangles <= WESTERN_RIDGE_RECIPE.maxWesternTriangles);
    for (const attribute of Object.values(geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite));
    assert.ok(geometry.index.array.every(i => i < positions.count));
  } finally { world.dispose(); }
});

test('all twelve northern cones retain original transformed vertices, normals and triangle order', () => {
  const { world, mountain } = setup(), original = new THREE.ConeGeometry(1, 1, 12);
  try {
    const positions = mountain.geometry.getAttribute('position'), normals = mountain.geometry.getAttribute('normal');
    const dummy = new THREE.Object3D(), normalMatrix = new THREE.Matrix3(), p = new THREE.Vector3(), n = new THREE.Vector3();
    for (const range of mountain.userData.westernRidge.hillRanges.slice(10)) {
      const t = mountain.userData.originalTransforms[range.hill];
      dummy.position.set(...t.slice(0, 3)); dummy.scale.set(...t.slice(3, 6)); dummy.rotation.set(...t.slice(6)); dummy.updateMatrix(); normalMatrix.getNormalMatrix(dummy.matrix);
      for (let vertex = 0; vertex < original.getAttribute('position').count; vertex++) {
        p.fromBufferAttribute(original.getAttribute('position'), vertex).applyMatrix4(dummy.matrix);
        n.fromBufferAttribute(original.getAttribute('normal'), vertex).applyNormalMatrix(normalMatrix);
        assert.deepEqual([positions.getX(range.firstVertex + vertex), positions.getY(range.firstVertex + vertex), positions.getZ(range.firstVertex + vertex)], Array.from(new Float32Array(p.toArray())));
        assert.deepEqual([normals.getX(range.firstVertex + vertex), normals.getY(range.firstVertex + vertex), normals.getZ(range.firstVertex + vertex)], Array.from(new Float32Array(n.toArray())));
      }
      for (let i = 0; i < original.index.count; i++) assert.equal(mountain.geometry.index.getX(range.firstTriangle * 3 + i), range.firstVertex + original.index.getX(i));
    }
  } finally { original.dispose(); world.dispose(); }
});

test('one batched material uses real slope colors and roughness, with zero additional north finish', () => {
  const { world, mountain } = setup();
  try {
    const colors = mountain.geometry.getAttribute('color'), surface = mountain.geometry.getAttribute('mountainSurface');
    const cutoff = mountain.userData.westernRidge.hillRanges[10].firstVertex;
    const roughnesses = Array.from({ length: cutoff }, (_, i) => surface.getX(i));
    assert.ok(Math.max(...roughnesses) - Math.min(...roughnesses) > .06);
    for (let i = 0; i < cutoff; i++) { assert.equal(surface.getY(i), 1); assert.ok(surface.getX(i) >= .85 && surface.getX(i) <= .99); }
    const north = new THREE.Color('#526e59');
    for (let i = cutoff; i < colors.count; i++) {
      assert.equal(surface.getY(i), 0); assert.equal(surface.getX(i), Math.fround(.93));
      assert.deepEqual([colors.getX(i), colors.getY(i), colors.getZ(i)], Array.from(new Float32Array(north.toArray())));
    }
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    mountain.material.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('attribute vec2 mountainSurface;'));
    assert.ok(shader.fragmentShader.includes('roughnessFactor = vMountainSurface.x;'));
    assert.ok(shader.fragmentShader.includes('roughnessFactor = clamp(roughnessFactor + vMountainSurface.y *'));
    assert.ok(shader.fragmentShader.includes('diffuseColor.rgb *= 1.0 + vMountainSurface.y *'));
    assert.ok(shader.fragmentShader.includes('float nhRelief = vMountainSurface.y * nhDetail *'));
    assert.ok(shader.fragmentShader.includes('nhSurfaceBand'));
    assert.equal(mountain.material.map, null);
  } finally { world.dispose(); }
});

test('permanent mountain ownership survives interior/quality switches and disposes geometry/material once', () => {
  const { world, mountain } = setup();
  let geometries = 0, materials = 0;
  mountain.geometry.addEventListener('dispose', () => geometries++); mountain.material.addEventListener('dispose', () => materials++);
  world.setInteriorBuilding(world.buildings[0].id); assert.equal(mountain.visible, true);
  world.setInteriorBuilding(null); assert.equal(mountain.visible, true);
  world.setQuality('low'); assert.equal(mountain.castShadow, false); assert.equal(mountain.visible, true);
  world.setQuality('high'); assert.equal(mountain.castShadow, true); assert.equal(mountain.receiveShadow, true);
  world.dispose(); assert.equal(geometries, 1); assert.equal(materials, 1);
});

test('changed source batches are rejected rather than rewriting another cone or terrain family', () => {
  const { world, mountain } = setup(), cone = new THREE.ConeGeometry(1, 1, 12);
  try {
    const good = { kind: 'cone', material: 'leaves', transforms: mountain.userData.originalTransforms, buildings: mountain.userData.buildings };
    const changed = structuredClone(good); changed.transforms[0][0] += 1;
    assert.throws(() => createWesternMountainBatch(THREE, changed, cone, mountain.material), /source transform changed/);
    assert.throws(() => createWesternMountainBatch(THREE, { ...good, material: 'brass' }, cone, mountain.material), /original permanent/);
    assert.throws(() => createWesternMountainBatch(THREE, { ...good, buildings: ['building', ...good.buildings.slice(1)] }, cone, mountain.material), /original permanent/);
    assert.throws(() => createWesternMountainBatch(THREE, { ...good, transforms: good.transforms.slice(0, 10) }, cone, mountain.material), /original permanent/);
  } finally { cone.dispose(); world.dispose(); }
});
