import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { createResidentAssetLibrary, createNearResident } from '../src/resident-core-assets.js';
import { createCitizenCharacter } from '../src/citizen-appearance.js';
import { createPeopleSystem, citizenNearAssetRole } from '../src/metropolis-people.js';
import { createCitizenIdentity } from '../src/citizen-life.js';

async function loadGeometry(_url, role) {
  const dir = new URL(`../art-source/near-resident/${role === 'worker' ? 'editable' : `editable-${role}`}/`, import.meta.url);
  const data = JSON.parse(await readFile(new URL(`${role}.gltf`, dir), 'utf8')), binary = await readFile(new URL(`${role}.bin`, dir));
  data.images = []; data.textures = [];
  for (const m of data.materials) {
    delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    delete m.normalTexture; delete m.occlusionTexture;
  }
  data.buffers = [{ uri: `data:application/octet-stream;base64,${binary.toString('base64')}`, byteLength: binary.length }];
  globalThis.ProgressEvent ||= class { constructor(type, options) { Object.assign(this, { type }, options); } };
  return new GLTFLoader().parseAsync(JSON.stringify(data), '');
}
async function flush() { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); }
const fixture = (index = 0) => ({ id: `north-fixture-${index}`, name: `Original address ${index}`, district: 'waterfront', x: 1000 + index, z: -52, floors: [] });
function injectedCharacter(library, identity) {
  return createCitizenCharacter(THREE, identity.style, { characterFactory: (T, options) => createNearResident(T,
    { ...options, assetLibrary: library, role: citizenNearAssetRole(identity), allowHeadlessAssetLoad: true }) });
}
function isVisible(object) { for (let o = object; o; o = o.parent) if (!o.visible) return false; return true; }

test('actual occupational book/phone/cup keep private callbacks and object identities, migrate to real wrist, and restore old LOD', async () => {
  const library = createResidentAssetLibrary(THREE, { managed: true, loadGLTF: loadGeometry }), identity = createCitizenIdentity(fixture(), 0, 1);
  const model = injectedCharacter(library, identity), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); scene.add(model);
  model.userData.setCitizen(identity); const scale = model.scale.clone(), originalIdentity = model.userData.identity;
  const elbow = model.userData.leftElbow, props = Object.fromEntries(elbow.children.filter(o => o.name.startsWith('Citizen ')).map(o => [o.name.slice(8), o]));
  assert.deepEqual(Object.keys(props).sort(), ['book', 'camera', 'cup', 'parcel', 'phone', 'toolbag']);
  model.userData.leftElbow.rotation.x = -.82; model.userData.setDetail(0); model.userData.updateCitizenProps('reading', 0);
  library.updatePresentation(camera, 0); assert.equal(library.snapshot().requests, 1); await library.ensureLoaded(citizenNearAssetRole(identity)); await flush(); assert.ok(model.userData.residentCoreActive(), JSON.stringify(model.userData.residentCoreSnapshot()));
  assert.equal(model.userData.identity, originalIdentity); assert.ok(model.scale.equals(scale)); assert.equal(model.userData.leftElbow, elbow);

  for (const [state, propName] of [['reading', 'book'], ['waiting-transit', 'phone'], ['refreshments', 'cup']]) {
    model.userData.updateCitizenProps(state, 0); model.userData.setDetail(0); library.updatePresentation(camera, 0); model.updateMatrixWorld(true);
    const prop = props[propName]; assert.equal(prop.parent, model.userData.leftHand); assert.ok(isVisible(prop));
    assert.ok(prop.children[0].getWorldPosition(new THREE.Vector3()).distanceTo(model.getObjectByName('wrist_L').getWorldPosition(new THREE.Vector3())) < .16,
      `${propName}: actual visible mesh must sit at the new hand, not inside hidden old LOD`);
    assert.ok(Object.entries(props).filter(([name]) => name !== propName).every(([, object]) => !object.visible));
    model.userData.setDetail(2); assert.equal(prop.parent, elbow); assert.equal(prop.position.y, 0);
    model.userData.setDetail(0); library.updatePresentation(camera, 0); await flush(); assert.equal(prop.parent, model.userData.leftHand);
  }
  library.setQuality('low'); assert.equal(library.snapshot().instances, 0); assert.equal(model.userData.lod.visible, true);
  assert.ok(Object.values(props).every(prop => prop.parent === elbow)); model.userData.updateCitizenProps('waiting-transit', 0);
  const visible = []; model.traverse(o => { if (o.name === 'Citizen phone' && isVisible(o)) visible.push(o); });
  assert.equal(visible.length, 1, 'exactly one original-tier phone survives Low, no hidden duplicate bodies/props');
  assert.equal(model.userData.identity, originalIdentity); model.userData.disposeInstance(); library.dispose();
});

test('minimal four-address north renderer joins the same twelve slots and preserves logical identities, dialogue and pool lifetime', async () => {
  const library = createResidentAssetLibrary(THREE, { managed: true, loadGLTF: loadGeometry });
  const scene = new THREE.Scene(), cameraRig = new THREE.Group(), camera = new THREE.PerspectiveCamera(); scene.add(cameraRig); cameraRig.add(camera); cameraRig.position.set(1000, 1.8, 0);
  const buildings = Array.from({ length: 4 }, (_, i) => fixture(i));
  const people = createPeopleSystem(THREE, scene, { buildings, residentAssets: library }), baseline = createPeopleSystem(THREE, new THREE.Scene(), { buildings });
  // Enable headless requests for actual north factory instances only in this test.
  const viewerPosition = camera.getWorldPosition(new THREE.Vector3()), position = { x: 1050, y: 0, z: 0 };
  for (let i = 0; i < 12; i++) { people.update(0, { position, viewerPosition }); baseline.update(0, { position, viewerPosition }); }
  const models = people.root.children.filter(m => m.userData.residentId);
  assert.equal(models.length, baseline.snapshot().detailed); assert.ok(models.length > 12); assert.equal(people.snapshot().logical, 20);
  // The normal browser guard is intentionally bypassed via a tiny test-only DOM
  // flag: GLTFLoader has images stripped above; no canvas, WebGL or world exists.
  globalThis.document = {};
  const others = Array.from({ length: 8 }, (_, i) => {
    const model = createNearResident(THREE, { style: 0, role: ['worker', 'commuter', 'shopkeeper'][i % 3], assetLibrary: library,
      allowHeadlessAssetLoad: true, nearPriority: i === 0 ? 1 : 0, presentationId: i === 0 ? 'local-player' : i < 4 ? `peer-${i}` : `south-life-${i}` });
    model.position.set(1000 + (i === 0 ? 16 : i * .7), 0, 0); scene.add(model); model.userData.setDetail(0); return model;
  });
  library.updatePresentation(camera, 0); assert.equal(library.snapshot().requests, 3);
  await Promise.all(['worker', 'commuter', 'shopkeeper'].map(role => library.ensureLoaded(role))); await flush(); delete globalThis.document;
  assert.equal(library.snapshot().instances, 12); assert.equal(library.snapshot().selected[0], 'local-player');
  const northActive = models.filter(m => m.userData.residentCoreActive()); assert.ok(northActive.length > 0);
  assert.ok(northActive.every(m => m.userData.residentCoreSnapshot().selected === 0));
  assert.ok(northActive.every(m => Math.abs(m.position.x - position.x) > 40), 'near art follows camera world position rather than subject position');
  assert.ok(library.snapshot().selected.some(id => id.startsWith('peer-')) && library.snapshot().selected.some(id => id.startsWith('south-life-')));
  const plain = object => { const { presentation, ...state } = object; return state; };
  assert.deepEqual(plain(people.snapshot()), plain(baseline.snapshot()), 'presentation cannot modify identity/routine/route/save data');
  const target = people.snapshot().people[0], conversationPosition = { x: target.x, z: target.z, y: 0 };
  assert.equal(people.getPrompt(conversationPosition), baseline.getPrompt(conversationPosition));
  assert.deepEqual(people.interact(conversationPosition), baseline.interact(conversationPosition));
  people.root.visible = false; library.updatePresentation(camera, 0); await flush(); assert.ok(models.every(m => !m.userData.residentCoreActive()));
  assert.equal(library.snapshot().instances, 8); people.root.visible = true;
  people.setQuality('low'); library.updatePresentation(camera, 0); assert.equal(people.snapshot().presentation.nearInstances, 0);
  people.setQuality('high'); globalThis.document = {}; library.updatePresentation(camera, 0); await flush(); delete globalThis.document;
  assert.equal(library.snapshot().instances, 12);
  const previousIds = new Map(models.map(model => [model, model.userData.residentId]));
  people.update(0, { position: { x: 1800, y: 0, z: 0 }, viewerPosition }); library.updatePresentation(camera, 0);
  assert.equal(people.snapshot().detailed, 0); assert.equal(people.snapshot().pooled, models.length); assert.equal(library.snapshot().instances, 8);
  globalThis.document = {};
  for (let i = 0; i < 12; i++) people.update(0, { position: { x: 940, y: 0, z: 0 }, viewerPosition });
  library.updatePresentation(camera, 0); await flush(); delete globalThis.document;
  const currentModels = people.root.children.filter(m => m.userData.residentId);
  assert.ok(currentModels.some(model => previousIds.has(model) && previousIds.get(model) !== model.userData.residentId), 'warm pool must actually reuse a model for a different resident');
  assert.deepEqual(new Set(library.snapshot().selected.filter(id => id.startsWith('resident-'))), new Set(currentModels.filter(model => model.userData.residentCoreActive()).map(model => model.userData.residentId)), 'snapshot selects current logical North ids after reuse');
  const count = library.snapshot().registered, owned = people.snapshot().detailed + people.snapshot().pooled;
  people.dispose(); people.dispose(); assert.equal(library.snapshot().registered, count - owned);
  assert.equal(library.snapshot().instances, 8, 'north dispose must not dispose the externally owned shared city library');
  for (const model of others) model.userData.disposeInstance(); baseline.dispose(); library.dispose();
});
