import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { HARBOR_TOWERS, HARBOR_VIEWPOINTS, harborTowerProfile, harborCoastX, createHarborTowerGeometry,
  createHarborSkyline } from '../src/harbor-skyline.js';
import { createWorld } from '../src/world.js';
import { createMetropolisWorld } from '../src/metropolis-world.js';
import { CHARACTER_RADIUS, circleOBB } from '../src/collision.js';

test('harbor towers occupy land behind a continuous shore and have authored geometric crowns', () => {
  assert.equal(new Set(HARBOR_TOWERS.map(t => t.id)).size, HARBOR_TOWERS.length);
  assert.ok(new Set(HARBOR_TOWERS.map(t => t.style)).size >= 8);
  for (const t of HARBOR_TOWERS) {
    assert.ok(t.x - t.width * .67 > harborCoastX(t.z), `${t.id}: podium in the shipping channel`);
    const geometry = createHarborTowerGeometry(THREE, t), position = geometry.attributes.position, box = geometry.boundingBox;
    assert.ok(Array.from(position.array).every(Number.isFinite), `${t.id}: malformed mesh`);
    assert.ok(box.max.y > t.height * .87 && box.max.y <= t.height + .0001);
    assert.ok(box.max.x - box.min.x > t.width * .8 && box.max.z - box.min.z > t.depth * .8);
    assert.ok(harborTowerProfile(t).some(p => p[1] !== 1), `${t.id}: featureless rectangular extrusion`);
    assert.ok(geometry.index.count < 3500, `${t.id}: excessive permanent topology`);
    geometry.dispose();
  }
});

test('the actual eye-level promenade camera sees multiple distinct towers across open water', () => {
  const scene = new THREE.Scene(), harbor = createHarborSkyline(THREE, scene), view = HARBOR_VIEWPOINTS[0];
  const eye = new THREE.Vector3(view.entrance.x, view.entrance.y + 1.62, view.entrance.z);
  const camera = new THREE.PerspectiveCamera(55, 16 / 10, .15, 3200); camera.position.copy(eye);
  camera.lookAt(view.lookAt.x, view.lookAt.y, view.lookAt.z); camera.updateMatrixWorld();
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  scene.updateMatrixWorld(true);
  const meshes = harbor.root.children.filter(m => m.userData.harborTowerId);
  assert.ok(meshes.filter(m => frustum.intersectsObject(m)).length >= 18, 'eye-level framing does not contain a city skyline');
  for (const id of ['pearl-spire', 'cloud-sail', 'triangular-exchange']) {
    const tower = HARBOR_TOWERS.find(t => t.id === id), target = new THREE.Vector3(tower.x, tower.baseY + tower.height * .84, tower.z);
    if (tower.style === 'sail') target.x += Math.sin(.84 * Math.PI / 2) * .33 * tower.width;
    const projected = target.clone().project(camera);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, `${id}: landmark outside the view`);
    const direction = target.clone().sub(eye).normalize(), hits = new THREE.Raycaster(eye, direction).intersectObjects(meshes, false);
    assert.equal(hits[0]?.object.userData.harborTowerId, id, `${id}: the composed landmark is hidden behind another tower`);
  }
  harbor.dispose();
});

test('all three harbor viewpoints are reached on existing real pavement with the full player radius', () => {
  const south = createWorld(THREE, new THREE.Scene(), { streaming: true, openNorth: true });
  const north = createMetropolisWorld(THREE, new THREE.Scene(), { streaming: true });
  const harbor = createHarborSkyline(THREE, new THREE.Scene());
  const colliders = [...south.colliders, ...north.colliders, ...harbor.colliders];
  assert.equal(HARBOR_VIEWPOINTS.length, 3);
  for (const view of HARBOR_VIEWPOINTS) {
    const { x, z } = view.entrance;
    for (let dz = -8; dz <= 8; dz += .25) {
      const y = north.groundHeightAt(x, z + dz) ?? south.groundHeightAt(x, z + dz);
      assert.ok(Math.abs(y - view.entrance.y) < .02, `${view.id}: no real pavement`);
      const blocked = colliders.filter(c => c.physics !== false && y + 1.8 > c.minY && y < c.maxY && circleOBB({ x, z: z + dz, radius: CHARACTER_RADIUS }, c));
      assert.equal(blocked.length, 0, `${view.id}: blocked by ${blocked[0]?.id}`);
      assert.equal(harbor.groundHeightAt(x, z + dz, y), null, 'skyline must not create a false walkable sea');
    }
  }
  north.dispose(); harbor.dispose();
});

test('view distance streams and disposes real facade details without changing skyline massing or quality', () => {
  const harbor = createHarborSkyline(THREE, new THREE.Scene(), { quality: 'high' });
  const before = harbor.snapshot(); assert.ok(before.residentInstances > 0);
  harbor.update({ x: -720, z: -1300 }, 1, .6);
  const away = harbor.snapshot();
  assert.equal(away.residentDetailGroups, 0); assert.equal(away.residentInstances, 0);
  assert.ok(away.disposedInstances >= before.residentInstances);
  harbor.update(HARBOR_VIEWPOINTS[1].entrance, 1, .6);
  assert.ok(harbor.snapshot().detailLoads > before.detailLoads);
  for (const quality of ['low', 'medium', 'high']) {
    harbor.setQuality(quality);
    assert.equal(harbor.snapshot().permanentTowers, HARBOR_TOWERS.length);
    assert.ok(harbor.root.children.filter(m => m.userData.harborTowerId).every(m => m.visible));
  }
  const savedColliders = harbor.colliders.length;
  harbor.update({ x: -720, z: -1300 }, 1, .6); assert.equal(harbor.colliders.length, savedColliders);
  harbor.dispose(); assert.equal(harbor.root.children.length, 0); assert.equal(harbor.root.parent, null);
});

test('small window bays use metre UVs and sparse office lights follow the world clock', () => {
  const harbor = createHarborSkyline(THREE, new THREE.Scene());
  const tower = harbor.root.children.find(m => m.userData.harborTowerId === 'pearl-spire'), shader = {
    uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  assert.ok(Math.max(...tower.geometry.attributes.uv.array) >= 386, 'facades must preserve metre-scaled UVs');
  tower.material.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.includes('vec2(1.8, 3.9)'));
  assert.ok(shader.fragmentShader.includes('fwidth(harborGrid)'));
  assert.ok(shader.fragmentShader.includes('vec2(7.2, 15.6)'), 'structural modules must survive distant anti-aliasing');
  assert.ok(shader.fragmentShader.includes('mix(harborCoarse,'), 'distant facades must not become a flat color');
  assert.ok(shader.fragmentShader.includes('step(.70, harborVariation)'));
  assert.ok(shader.fragmentShader.includes('harborFilteredAperture'), 'subpixel emitted area must survive distance filtering');
  assert.ok(shader.fragmentShader.includes('step(.57, harborNightVariation)'), 'unoccupied night window groups must remain dark');
  assert.ok(!shader.fragmentShader.includes('mix(.28, 1.0, harborDistant)'), 'never dim already-subpixel night lights a second time');
  const crownMaterials = new Set();
  harbor.root.traverse(mesh => { if (mesh.material?.name?.startsWith('harbor-crown-')) crownMaterials.add(mesh.material); });
  assert.equal(crownMaterials.size, 2, 'real warm/cool landmark fixtures must exist');
  harbor.update(HARBOR_VIEWPOINTS[0].entrance, 0, 12 / 24); assert.equal(shader.uniforms.harborNight.value, 0);
  assert.ok([...crownMaterials].every(m => m.emissiveIntensity === 0), 'crown lights must be off in daylight');
  harbor.update(HARBOR_VIEWPOINTS[0].entrance, 0, 21 / 24); assert.equal(shader.uniforms.harborNight.value, 1);
  assert.ok([...crownMaterials].every(m => m.emissiveIntensity >= 2), 'physical crown fixtures must illuminate after dark');
  harbor.dispose();
});
