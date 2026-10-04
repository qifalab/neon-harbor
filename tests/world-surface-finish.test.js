import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { applyWorldSurfaceFinish, createWorld } from '../src/world.js';
import { createHarborSkyline } from '../src/harbor-skyline.js';

const compile = material => {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader);
  return shader;
};

test('world finish composes existing hooks, preserves physical values and runs once in real instance metres', () => {
  const material = new THREE.MeshStandardMaterial({ color: '#afab98', roughness: .87, metalness: .025 });
  material.onBeforeCompile = shader => {
    shader.uniforms.existingProjection = { value: 2 };
    shader.vertexShader += '\n// existing metre projection';
  };
  material.customProgramCacheKey = () => 'existing-metre-projection';
  const physical = [material.color.getHex(), material.roughness, material.metalness];
  applyWorldSurfaceFinish(material, 'mineral');
  const key = material.customProgramCacheKey();
  applyWorldSurfaceFinish(material, 'mineral');
  const shader = compile(material);
  assert.deepEqual([material.color.getHex(), material.roughness, material.metalness], physical);
  assert.equal(material.customProgramCacheKey(), key);
  assert.ok(key.includes('existing-metre-projection') && key.includes('nh-surface-v1:mineral'));
  assert.equal(shader.uniforms.existingProjection.value, 2);
  assert.equal(shader.vertexShader.match(/existing metre projection/g).length, 1);
  assert.equal(shader.vertexShader.match(/varying vec3 vNHSurfacePosition/g).length, 1);
  assert.ok(shader.vertexShader.includes('instanceMatrix * nhWorldSurfacePosition'));
  assert.ok(shader.vertexShader.includes('(modelMatrix * nhWorldSurfacePosition).xyz'));
  assert.equal(shader.vertexShader.includes('vNHSurfacePosition = position;'), false);
  assert.ok(shader.fragmentShader.includes('nhSurfaceBand') && shader.fragmentShader.includes('nhSurfaceNormal'));
  const transparent = new THREE.MeshPhysicalMaterial({ transparent: true, opacity: .4 });
  const originalHook = transparent.onBeforeCompile;
  applyWorldSurfaceFinish(transparent, 'mineral');
  assert.equal(transparent.onBeforeCompile, originalHook);
  assert.equal(transparent.userData.surfaceFinish, undefined);
});

test('southern street and eastern shore retain checkpoint mineral and metal coverage without modifying glazing shaders', () => {
  const world = createWorld(THREE, new THREE.Scene(), { streaming: false });
  const byKey = new Map();
  world.root.traverse(mesh => {
    if (mesh.userData.batchId) byKey.set(mesh.userData.batchId.split(':').at(-1), mesh.material);
  });
  for (const key of ['asphalt', 'sidewalk', 'cream', 'stone', 'brick', 'coral', 'roof', 'pink', 'navy']) {
    assert.equal(byKey.get(key)?.userData.worldSurfaceFinish, 'mineral', `south ${key}`);
  }
  // brickwork is a palette option with no present geometry; every emitted
  // mineral batch above is inspected rather than inventing a palette instance.
  for (const key of ['metal', 'frame', 'brass']) assert.equal(byKey.get(key)?.userData.worldSurfaceFinish, 'metal', `south ${key}`);
  for (const key of ['glass', 'glassDark', 'glassLight', 'shopGlass']) {
    if (byKey.has(key)) assert.equal(byKey.get(key).userData.surfaceFinish, undefined, `south glazing ${key}`);
  }
  const harbor = createHarborSkyline(THREE, new THREE.Scene());
  harbor.update(0, { x: 1250, z: -180 }, 12);
  const finishes = new Set();
  harbor.root.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (mesh.material.userData.worldSurfaceFinish) finishes.add(mesh.material.userData.worldSurfaceFinish);
    if (mesh.userData.harborTowerId) {
      assert.equal(mesh.material.userData.surfaceFinish, undefined, 'authored facade shader stays independent');
      assert.ok(mesh.material.customProgramCacheKey().includes('harbor'));
    }
  });
  assert.deepEqual([...finishes].sort(), ['metal', 'mineral']);
  assert.equal(harbor.root.getObjectByName('East Bay · walkable shore').material.userData.worldSurfaceFinish, 'mineral');
  harbor.dispose();
});

test('browser facade texture projection survives the added world grain shader', () => {
  const previous = globalThis.document;
  try {
    globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
    const world = createWorld(THREE, new THREE.Scene(), { streaming: false });
    const wall = world.root.children.find(mesh => mesh.userData.batchId === 'architecture:cream');
    assert.ok(wall, 'real southern cream facade batch');
    const shader = compile(wall.material);
    assert.ok(shader.vertexShader.includes('mat4 cityTransform = modelMatrix'));
    assert.ok(shader.vertexShader.includes('vMapUv = cityPosition.xz / 2.0'));
    assert.ok(shader.vertexShader.includes('instanceMatrix * nhWorldSurfacePosition'));
    assert.ok(wall.material.customProgramCacheKey().includes('city-metric-texture-plaster-1'));
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});
