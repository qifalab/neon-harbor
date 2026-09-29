import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { harborAtmosphereAt } from '../src/atmosphere.js';
import { createHarborWaterMaterial, updateHarborWaterMaterial } from '../src/harbor-water.js';
import { createMetropolisMaterials } from '../src/metropolis-materials.js';

test('opposite-shore landmarks retain contrast across the full public harbour view', () => {
  // FogExp2 transmittance at the east shore: this is a sight-line constraint,
  // not a test that a hardcoded density equals the implementation constant.
  for (const hour of [7, 12, 16.5, 18, 23]) {
    const palette = harborAtmosphereAt(hour);
    const contrast = Math.exp(-Math.pow(1150 * palette.fogDensity, 2));
    assert.ok(contrast > .60, `${hour}: 1.15 km skyline disappeared into fog (${contrast})`);
    assert.ok(palette.exposure >= .9 && palette.exposure <= 1.2);
  }
  assert.deepEqual(harborAtmosphereAt(14), harborAtmosphereAt(38));
  assert.deepEqual(harborAtmosphereAt(23), harborAtmosphereAt(-1));
  assert.equal(harborAtmosphereAt(16.5).daylight, 1, 'late afternoon must still be daylight');
  const night = harborAtmosphereAt(21), noon = harborAtmosphereAt(12);
  assert.ok(night.hemisphereIntensity >= .4, 'night kerbs and stairs need readable ambient light');
  assert.ok(night.keyLightIntensity >= .2 && night.keyLightIntensity < noon.keyLightIntensity * .12,
    'night fill must retain orientation while remaining well below sunlight');
});

test('water variants keep independent clocks, shared programs and working cloned shader hooks', () => {
  const original = createHarborWaterMaterial(THREE);
  const clone = original.clone();
  const compile = material => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader);
    return shader;
  };
  const first = compile(original), second = compile(clone);
  updateHarborWaterMaterial(original, 18, 14);
  updateHarborWaterMaterial(clone, 42, 23);
  assert.equal(first.uniforms.harborWaterTime.value, 18);
  assert.equal(second.uniforms.harborWaterTime.value, 42);
  assert.notEqual(first.uniforms.harborWaterTime, second.uniforms.harborWaterTime);
  assert.equal(original.customProgramCacheKey(), clone.customProgramCacheKey());
  assert.ok(original.color.getHSL({}).l > clone.color.getHSL({}).l, 'day and night water must follow sky illumination');
  updateHarborWaterMaterial(original, Number.NaN, 14);
  assert.equal(first.uniforms.harborWaterTime.value, 18, 'invalid clock samples must not poison GPU uniforms');
  assert.equal(original.transparent, false, 'harbour surface must retain opaque depth occlusion');
  assert.ok(original.roughness > .15 && original.metalness < .1);
  original.dispose(); clone.dispose();
});

test('urban finishes separate dielectric glazing, rough mineral surfaces and metal frames', () => {
  const m = createMetropolisMaterials(THREE);
  assert.ok(m.glass.metalness < .1 && m.glassDark.metalness < .1, 'window glass must not behave like coloured metal');
  assert.ok(m.steel.metalness > .7 && m.brass.metalness > .7);
  assert.ok(m.plaster.roughness > .9 && m.stone.roughness > .85);
  assert.ok(m.fabric.roughness > m.glass.roughness + .5);
  assert.equal(m.glass.transparent, false, 'thousands of facade panes must not introduce sorting artifacts');
});
