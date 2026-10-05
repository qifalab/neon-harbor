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
    assert.equal(mountain.userData.westernRidge.preparedBytes, geometry.index.array.byteLength + Object.values(geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,0));
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

test('northern backdrop replaces twelve cones with a bounded continuous surface and separate standard material', () => {
 const {world,mountain}=setup();let north;world.root.traverse(m=>{if(m.userData.northernRidge)north=m;});
 try {
  assert.ok(north);assert.equal(mountain.userData.westernRidge.retainedNorthernHills,0);assert.equal(mountain.userData.westernRidge.hillRanges.length,10);
  assert.equal(north.userData.northernRidge.sourceNorthernCones,12);assert.equal(north.userData.northernRidge.decorativeOnly,true);assert.equal(north.material.isMeshStandardMaterial,true);
  assert.ok(north.material.normalMap.isDataTexture);assert.ok(north.material.roughnessMap.isDataTexture);assert.equal(north.material.metalness,0);assert.equal(north.material.roughness,1);
  const b=north.geometry.boundingBox;assert.deepEqual(b.min.toArray(),[-912,-57,-1673]);assert.deepEqual(b.max.toArray(),[914,173,-1342]);
  assert.ok(north.geometry.index.count/3>=15000&&north.geometry.index.count/3<=18000);assert.notEqual(north.material,mountain.material);
  for(const a of Object.values(north.geometry.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));
  const normals=north.geometry.attributes.normal,position=north.geometry.attributes.position;assert.equal(normals.count,position.count);
  const heights=Array.from(position.array).filter((_,i)=>i%3===1);assert.ok(new Set(heights.map(v=>Math.round(v))).size>120,'backdrop must have varied shoulder and gully elevations');
 } finally{world.dispose();}
});

test('western material keeps its original slope colors and mineral response after north is separated', () => {
  const { world, mountain } = setup();
  try {
    const colors = mountain.geometry.getAttribute('color'), surface = mountain.geometry.getAttribute('mountainSurface');
    const cutoff = colors.count;
    const roughnesses = Array.from({ length: cutoff }, (_, i) => surface.getX(i));
    assert.ok(Math.max(...roughnesses) - Math.min(...roughnesses) > .06);
    for (let i = 0; i < cutoff; i++) { assert.equal(surface.getY(i), 1); assert.ok(surface.getX(i) >= .85 && surface.getX(i) <= .99); }
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
