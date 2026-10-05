import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { HARBOR_TOWERS } from '../src/harbor-skyline.js';
import { expansionBuilding } from '../src/expansion-programmes.js';
import { createInteriorLayout, createInteriorSystem } from '../src/metropolis-interiors.js';
import { planHarborOfficeCraft, createHarborOfficeCraft, HARBOR_OFFICE_CRAFT_ROOM } from '../src/harbor-office-craft.js';
import { SpatialIndex, moveCircle, circleContacts, CHARACTER_RADIUS } from '../src/collision.js';
import { createMetropolisMaterials } from '../src/metropolis-materials.js';

const building = () => expansionBuilding(HARBOR_TOWERS[11], 'east', 11);
const ownerOf = system => system.root.children[0].children.find(g => g.userData.officeCraft)?.userData.officeCraft;
const floorGroup = (system, id) => system.root.children[0].children.find(g => g.name === `Occupied floor · ${id}`);
const resourceCounters = owner => {
  const geometries = owner.group.children.map(mesh => mesh.geometry), materials = [...new Set(owner.group.children.map(mesh => mesh.material))];
  const counts = new Map([...geometries, ...materials].map(resource => [resource, 0]));
  for (const resource of counts.keys()) resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  return () => [...counts.values()];
};
const ride = (system, floorId) => {
  const cabin = system.snapshot().cabin, player = { x: cabin.x, z: cabin.z, yaw: 0, groundY: cabin.y };
  system.update(0, player); assert.ok(system.selectFloor(floorId));
  for (let frame = 0; frame < 200 && system.state.moving; frame++) {
    const transition = system.update(.1, player);
    if (transition?.position) player.groundY = transition.groundY;
  }
  assert.equal(system.state.moving, false); assert.equal(system.snapshot().floorId, floorId);
};

test('pilot selects exactly two existing workstation/chair envelopes without changing any layout metadata', () => {
  const b = building(), f = b.floors[0], layout = createInteriorLayout(b, f), before = JSON.stringify(layout);
  const plan = planHarborOfficeCraft(b, f, layout), owner = createHarborOfficeCraft(THREE, plan);
  assert.equal(plan.roomId, HARBOR_OFFICE_CRAFT_ROOM); assert.equal(plan.workstations.length, 2);
  assert.equal(plan.replacePartIds.length, 35); assert.equal(new Set(plan.replacePartIds).size, 35);
  assert.ok(plan.replacePartIds.every(id => layout.parts.find(part => part.id === id)?.roomId === HARBOR_OFFICE_CRAFT_ROOM));
  assert.deepEqual(plan.workstations.map(s => s.chairPartIds.length), [6, 6]);
  assert.deepEqual(plan.workstations.map(s => s.cup), [false, true]);
  assert.equal(JSON.stringify(layout), before, 'all room, part, collider, door, stair and lift metadata remains literal');
  assert.equal(planHarborOfficeCraft(b, b.floors[1], createInteriorLayout(b, b.floors[1])), null);
  assert.equal(planHarborOfficeCraft({ ...b, id: 'east-013' }, f, layout), null);
  owner.dispose();
});

test('all craft vertices stay inside original furniture bounds with finite normals and shared owned resources', () => {
  const b = building(), layout = createInteriorLayout(b, b.floors[0]), plan = planHarborOfficeCraft(b, b.floors[0], layout);
  const owner = createHarborOfficeCraft(THREE, plan), envelopes = new Map(plan.workstations.flatMap(s => [s.chairEnvelope, s.deskEnvelope]).map(e => [e.id, e]));
  const origin = [plan.origin.x, plan.origin.y, plan.origin.z];
  for (const record of owner.records) {
    const envelope = envelopes.get(record.envelope); assert.ok(envelope);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(record.min[axis] + origin[axis] >= envelope.min[axis] - 1e-5, record.name);
      assert.ok(record.max[axis] + origin[axis] <= envelope.max[axis] + 1e-5, record.name);
    }
  }
  assert.equal(owner.summary.meshes, 8); assert.ok(owner.summary.triangles < 18000);
  assert.equal(owner.summary.ownedTextures, 0); assert.equal(owner.summary.sharedTextures, 2);
  assert.ok(owner.summary.desktopTop - owner.summary.seatTop > .27 && owner.summary.desktopTop - owner.summary.seatTop < .31);
  for (const mesh of owner.group.children) {
    assert.equal(mesh.castShadow, true); assert.equal(mesh.receiveShadow, true);
    if (mesh.material.map) assert.ok(mesh.material.userData.metropolisWorldMetres > 0);
    for (const name of ['position', 'normal']) assert.ok([...mesh.geometry.attributes[name].array].every(Number.isFinite));
    const normals = mesh.geometry.attributes.normal;
    for (let i = 0; i < normals.count; i++) {
      const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
      assert.ok(length > .95 && length < 1.05, `non-unit normal in ${mesh.name}`);
    }
  }
  const parent = new THREE.Group(); parent.add(owner.group); const releases = resourceCounters(owner);
  owner.dispose(); owner.dispose(); assert.ok(releases().every(n => n === 1)); assert.equal(parent.children.length, 0);
});

test('wood and ceramic clones retain shared texture/projection ownership without releasing source maps or materials', () => {
  const b = building(), layout = createInteriorLayout(b, b.floors[0]), plan = planHarborOfficeCraft(b, b.floors[0], layout);
  const shared = createMetropolisMaterials(THREE), owner = createHarborOfficeCraft(THREE, plan, { timberMaterial: shared.timber, ceramicMaterial: shared.ceramic });
  for (const [source, name] of [[shared.timber, 'Office · original timber desktop'], [shared.ceramic, 'Office · ceramic cup']]) {
    const clone = owner.group.children.find(mesh => mesh.material.name === name).material;
    assert.notEqual(clone, source); assert.equal(clone.map, source.map);
    assert.equal(clone.onBeforeCompile, source.onBeforeCompile); assert.equal(clone.customProgramCacheKey(), source.customProgramCacheKey());
    const shader = { uniforms: {}, vertexShader: '#include <defaultnormal_vertex>\n#include <project_vertex>',
      fragmentShader: '#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>' };
    clone.onBeforeCompile(shader); assert.ok(shader.fragmentShader.includes('metropolisUV'));
    assert.ok(shader.uniforms.metropolisRelief.value > 0); assert.ok(shader.uniforms.metropolisRoughnessVariation.value > 0);
  }
  let sharedDisposals = 0;
  const sources = [shared.timber, shared.ceramic, shared.timber.map, shared.ceramic.map], onDispose = () => sharedDisposals++;
  sources.forEach(resource => resource.addEventListener('dispose', onDispose));
  owner.dispose(); owner.dispose(); assert.equal(sharedDisposals, 0);
  sources.forEach(resource => resource.removeEventListener('dispose', onDispose));
});

test('candidate preserves literal collision/navigation identity and the physical entrance-to-lift walk', () => {
  const b = building(), baseline = createInteriorSystem(THREE, new THREE.Scene(), { buildings: [b], harborOfficeCraft: false });
  const candidate = createInteriorSystem(THREE, new THREE.Scene(), { buildings: [b] });
  const oldEntry = baseline.enter(b.id), entry = candidate.enter(b.id);
  assert.deepEqual(JSON.parse(JSON.stringify(entry)), JSON.parse(JSON.stringify(oldEntry)));
  assert.deepEqual(candidate.collisionContext().colliders, baseline.collisionContext().colliders);
  for (const point of [entry.position, candidate.snapshot().cabin, ...candidate.snapshot().stairs.map(s => ({ x: s.x, z: s.startZ }))])
    assert.equal(candidate.collisionContext().groundHeightAt(point.x, point.z, entry.groundY), baseline.collisionContext().groundHeightAt(point.x, point.z, entry.groundY));
  for (const key of ['rooms', 'entrance', 'cabin', 'stairs', 'navigation', 'residentFloors', 'visibleFloors']) assert.deepEqual(candidate.snapshot()[key], baseline.snapshot()[key]);
  const collision = { index: new SpatialIndex(candidate.collisionContext().colliders), groundHeightAt: candidate.collisionContext().groundHeightAt, bounds: 1450 };
  const player = { ...entry.position, y: 0, groundY: entry.groundY }, cabin = candidate.snapshot().cabin;
  moveCircle(player, 0, cabin.z - player.z, CHARACTER_RADIUS, collision);
  assert.ok(Math.abs(player.z - cabin.z) < .01); assert.equal(circleContacts(player, CHARACTER_RADIUS, collision).length, 0);
  assert.equal(candidate.getPrompt(player).kind, 'elevator');
  ride(candidate, 'gallery'); ride(baseline, 'gallery');
  assert.deepEqual(candidate.collisionContext().colliders, baseline.collisionContext().colliders);
  assert.deepEqual(candidate.snapshot().navigation, baseline.snapshot().navigation);
  baseline.dispose(); candidate.dispose();
});

test('only current pilot floor owns custom geometry; adjacent cache uses original furniture and reentry/exit fully releases', () => {
  const b = building(), system = createInteriorSystem(THREE, new THREE.Scene(), { buildings: [b] });
  assert.equal(ownerOf(system), undefined); system.enter(b.id);
  const first = ownerOf(system), firstReleased = resourceCounters(first), cachedLobby = floorGroup(system, 'lobby');
  assert.equal(system.snapshot().officeCraft.length, 1); assert.equal(cachedLobby.userData.officeCraftFallback.visible, false);
  ride(system, 'gallery');
  assert.equal(ownerOf(system), undefined); assert.equal(system.snapshot().officeCraft.length, 0);
  assert.equal(floorGroup(system, 'lobby'), cachedLobby); assert.equal(cachedLobby.userData.officeCraftFallback.visible, true);
  assert.ok(firstReleased().every(n => n === 1));
  ride(system, 'lobby');
  const second = ownerOf(system); assert.ok(second); assert.notEqual(second, first);
  const secondReleased = resourceCounters(second); system.exit(); assert.ok(secondReleased().every(n => n === 1));
  system.enter(b.id); const thirdReleased = resourceCounters(ownerOf(system)); system.dispose();
  assert.ok(thirdReleased().every(n => n === 1)); assert.equal(system.root.parent, null);
});
