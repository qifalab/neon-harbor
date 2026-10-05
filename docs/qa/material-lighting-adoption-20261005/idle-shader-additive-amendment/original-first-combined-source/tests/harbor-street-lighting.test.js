import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { METROPOLIS_BUILDINGS } from '../src/metropolis-catalog.js';
import { createHarborStreetLighting, streetNightFactor } from '../src/harbor-street-lighting.js';
import { createCityExploration } from '../src/city-exploration.js';
import { GameSimulation } from '../src/simulation.js';

test('a capped real-light pool selects physical sources at both original quay poses, fades at dawn/dusk, and disables indoors', () => {
  const scene = new THREE.Scene(), resident = new Set(['north-0-0']);
  const lighting = createHarborStreetLighting(THREE, scene, { buildings: METROPOLIS_BUILDINGS, isResident: id => resident.has(id) });
  const count = () => { let n = 0; scene.traverse(node => { if (node.isPointLight) n++; }); return n; };
  const first = { x: -568.28, y: 1.62, z: -438.2 }, second = { x: -600, y: 1.62, z: -440.8 };
  assert.equal(lighting.sources.length, 100); assert.equal(count(), 4);
  lighting.update(first, first, 21); let state = lighting.snapshot();
  assert.ok(state.slots.some(s => s.sourceId?.startsWith('tide-museum-canopy-') && s.intensity > 0));
  const identities = lighting.root.children.filter(n => n.isPointLight).map(n => n.uuid);
  lighting.update(second, second, 21); state = lighting.snapshot();
  assert.ok(state.slots.some(s => s.sourceId === 'tide-museum-tree-downlight--1' && s.intensity > 0));
  for (const slot of state.slots.filter(s => s.sourceId)) {
    const source = lighting.sources.find(s => s.id === slot.sourceId);
    assert.deepEqual([slot.x, slot.y, slot.z], [source.x, source.y, source.z]);
    assert.equal(slot.castShadow, false); assert.ok(slot.range <= 24);
  }
  assert.deepEqual(lighting.root.children.filter(n => n.isPointLight).map(n => n.uuid), identities);
  lighting.update(second, second, 18.4); const dusk = lighting.snapshot().slots.find(s => s.sourceId === 'tide-museum-tree-downlight--1').intensity;
  lighting.update(second, second, 21); assert.ok(dusk > 0 && dusk < lighting.snapshot().slots.find(s => s.sourceId === 'tide-museum-tree-downlight--1').intensity);
  assert.ok(streetNightFactor(6.2) > streetNightFactor(6.8));
  for (const [value, expected] of [['balanced', 2], ['low', 0], ['high', 4]]) {
    lighting.setQuality(value); lighting.update(second, second, 21);
    assert.equal(count(), expected); assert.equal(lighting.snapshot().activeLights <= expected, true);
  }
  lighting.update(second, second, 12); assert.equal(lighting.snapshot().activeLights, 0); assert.equal(count(), 4);
  lighting.update(second, second, 21, 1 / 60, false); assert.equal(lighting.snapshot().activeLights, 0);
  resident.clear(); lighting.update(second, second, 21); assert.equal(lighting.snapshot().activeLights, 0);
  assert.equal(lighting.snapshot().fixtureDrawCalls, 0); lighting.dispose();
});

test('the two modeled tree brackets add bounded above-head geometry and release owned resources exactly once', () => {
  const scene = new THREE.Scene(), lighting = createHarborStreetLighting(THREE, scene, { buildings: METROPOLIS_BUILDINGS, isResident: () => true });
  const meshParts = [], resources = new Set();
  lighting.root.traverse(node => { if (node.isInstancedMesh) { meshParts.push(node); resources.add(node); resources.add(node.geometry); resources.add(node.material); } });
  assert.equal(meshParts.length, 2); assert.equal(new Set(meshParts.map(m => m.material)).size, 2);
  assert.equal(meshParts.reduce((n, m) => n + m.count * m.geometry.index.count / 3, 0), 120);
  const matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
  for (const mesh of meshParts) for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    for (let p = 0; p < mesh.geometry.attributes.position.count; p++) {
      vertex.fromBufferAttribute(mesh.geometry.attributes.position, p).applyMatrix4(matrix);
      assert.ok(vertex.y > 3.15, 'no new ground pole or body-height obstacle');
    }
  }
  const released = new Map(); for (const resource of resources) resource.addEventListener('dispose', () => released.set(resource, (released.get(resource) || 0) + 1));
  lighting.dispose(); lighting.dispose(); assert.equal(lighting.root.parent, null);
  assert.equal(released.size, resources.size); assert.ok([...released.values()].every(count => count === 1));
  lighting.update({ x: -600, z: -440.8 }, null, 21); lighting.setQuality('high'); assert.equal(lighting.snapshot().activeLights, 0);
});

test('city propagation reads clock/view/quality and outdoor context without changing the public player state', () => {
  const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
  const sim = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt }); city.bind(sim);
  const playerBefore = JSON.stringify(sim.player), colliders = sim.colliders, view = { position: { x: -600, y: 0, z: -440.8 }, viewerPosition: { x: -600, y: 1.62, z: -440.8 }, velocity: { x: 0, z: 0 } };
  city.update(0, 21 / 24, view); assert.ok(city.north.streetLightingStats.activeLights > 0);
  assert.equal(JSON.stringify(sim.player), playerBefore); assert.equal(sim.colliders, colliders);
  city.setQuality('low'); city.update(0, 21 / 24, view); assert.equal(city.north.streetLightingStats.residentLightObjects, 0);
  city.setQuality('high'); sim.inCar = true; city.update(0, 21 / 24, view); assert.equal(city.north.streetLightingStats.activeLights, 0);
  sim.inCar = false; city.interiors.state.buildingId = 'tide-museum'; city.update(0, 21 / 24, view); assert.equal(city.north.streetLightingStats.activeLights, 0);
  city.interiors.state.buildingId = null; city.north.dispose();
});
