import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { createResidentAssetLibrary, createNearResident, RESIDENT_CORE_ROLES } from '../src/resident-core-assets.js';

const roles = ['worker', 'commuter', 'shopkeeper'];
const data = {};
for (const role of roles) {
  const dir = new URL(`../art-source/near-resident/${role === 'worker' ? 'editable' : `editable-${role}`}/`, import.meta.url);
  data[role] = { dir, gltf: JSON.parse(await readFile(new URL(`${role}.gltf`, dir), 'utf8')),
    binary: await readFile(new URL(`${role}.bin`, dir)),
    manifest: JSON.parse(await readFile(new URL(`../assets/resident/core-${role}/manifest.json`, import.meta.url), 'utf8')) };
}
function attribute(role, i) {
  const { gltf, binary } = data[role], a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
  const type = a.componentType === 5126 ? Float32Array : Uint16Array;
  return new type(binary.buffer, binary.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0),
    a.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]));
}
async function loadGeometry(_url, role = 'worker') {
  const { gltf, binary } = data[role], clean = structuredClone(gltf); clean.images = []; clean.textures = [];
  for (const m of clean.materials) {
    delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    delete m.normalTexture; delete m.occlusionTexture;
  }
  clean.buffers = [{ uri: `data:application/octet-stream;base64,${binary.toString('base64')}`, byteLength: binary.length }];
  globalThis.ProgressEvent ||= class { constructor(type, options) { Object.assign(this, { type }, options); } };
  return new GLTFLoader().parseAsync(JSON.stringify(clean), '');
}
function fallbackFactory(T, { style }) {
  const root = new T.Group(); root.userData.style = style;
  const lod = new T.Group(); root.userData.lod = lod; root.add(lod);
  for (const name of ['leftLeg', 'rightLeg', 'leftKnee', 'rightKnee', 'leftArm', 'rightArm', 'leftElbow', 'rightElbow']) {
    const joint = new T.Group(); root.userData[name] = joint; lod.add(joint);
  }
  root.userData.setDetail = tier => { root.userData.oldDetail = tier; lod.visible = true; };
  root.userData.updateLOD = () => {}; root.userData.disposeInstance = () => {};
  return root;
}
function actor(library, role, options = {}) {
  return createNearResident(THREE, { role, style: 'courier', assetLibrary: library, fallbackFactory,
    allowHeadlessAssetLoad: true, ...options });
}
async function flush() { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); }

test('three actual core wardrobes obey per-role budgets and embedded texture MIME, preserve smooth skin normals, eyes and all fingers', async () => {
  const hashes = new Set();
  for (const role of roles) {
    const { gltf, binary, manifest, dir } = data[role];
    assert.equal(manifest.triangles, RESIDENT_CORE_ROLES[role].triangles);
    assert.ok(manifest.triangles >= 25000 && manifest.triangles <= 35000);
    assert.equal(manifest.materials, 4); assert.equal(manifest.bones, 71); assert.equal(gltf.meshes.length, 4);
    assert.equal(manifest.meshes[3].name, 'eyes'); assert.equal(manifest.meshes[3].triangles, 2040);
    assert.equal(gltf.materials[3].alphaMode, 'MASK');
    assert.ok(Math.abs(manifest.restBounds.min[1]) < 1e-6 && Math.abs(manifest.restBounds.max[1] - 1.78) < 1e-6);
    const glb = await readFile(new URL(`../assets/resident/core-${role}/${role}.glb`, import.meta.url));
    assert.ok(glb.length < 6_000_000); hashes.add(createHash('sha256').update(glb).digest('hex'));
    const jsonLength = glb.readUInt32LE(12), packed = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength)), binStart = 28 + jsonLength;
    assert.equal(glb.readUInt32LE(8), glb.length); assert.deepEqual(packed.meshes, gltf.meshes);
    assert.equal(glb.subarray(binStart, binStart + binary.length).equals(binary), true);
    assert.equal(packed.images.length, 6);
    for (let i = 0; i < packed.images.length; i++) {
      const image = packed.images[i], view = packed.bufferViews[image.bufferView];
      const bytes = glb.subarray(binStart + view.byteOffset, binStart + view.byteOffset + view.byteLength);
      assert.equal(bytes.equals(await readFile(new URL(gltf.images[i].uri, dir))), true);
      assert.equal(image.mimeType, bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : 'image/png');
    }
    let pixels = 0;
    for (const texture of manifest.textures) pixels += texture.pixels[0] * texture.pixels[1];
    assert.equal(pixels * 4, 30 * 1024 * 1024, 'decoded RGBA estimate must use actual image dimensions');
    const skin = gltf.meshes[0].primitives[0], normals = attribute(role, skin.attributes.NORMAL), indices = attribute(role, skin.indices);
    let smoothFaces = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i] * 3, b = indices[i + 1] * 3;
      if (Math.hypot(normals[a] - normals[b], normals[a + 1] - normals[b + 1], normals[a + 2] - normals[b + 2]) > .002) smoothFaces++;
    }
    assert.ok(smoothFaces > indices.length / 6, 'actual skin normals must vary smoothly across faces');
    const names = gltf.skins[0].joints.map(i => gltf.nodes[i].name), weights = attribute(role, skin.attributes.WEIGHTS_0), joints = attribute(role, skin.attributes.JOINTS_0);
    for (const side of ['L', 'R']) for (let finger = 1; finger <= 5; finger++) {
      let influenced = 0;
      for (let i = 0; i < joints.length; i++) if (weights[i] > .05 && names[joints[i]].startsWith(`finger${finger}-`) && names[joints[i]].endsWith(`_${side}`)) influenced++;
      assert.ok(influenced > 12, `${role}: ${side} finger${finger} lost anatomical vertices`);
    }
    for (const file of manifest.files) {
      const bytes = await readFile(new URL(`../${file.path}`, import.meta.url));
      assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    }
  }
  assert.equal(hashes.size, 3);
  assert.equal(data.commuter.manifest.wardrobeAsset, 'male_casualsuit03');
  assert.equal(data.shopkeeper.manifest.wardrobeAsset, 'female_elegantsuit01');
  assert.equal(data.shopkeeper.manifest.macroTarget, 'asian-female-young');
  assert.equal(data.shopkeeper.manifest.hairAsset, 'bob02');
  const garmentHash = role => { const values = attribute(role, data[role].gltf.meshes[1].primitives[0].attributes.POSITION); return createHash('sha256').update(Buffer.from(values.buffer, values.byteOffset, values.byteLength)).digest('hex'); };
  assert.notEqual(garmentHash('worker'), garmentHash('commuter'), 'different real garment geometry, not recolors');
});

test('commuter and female shopkeeper parse real skinning and original walk/stair clips without invalid inverse binds or missing eyes', async () => {
  for (const role of ['commuter', 'shopkeeper']) {
    const template = await loadGeometry(null, role); template.scene.updateMatrixWorld(true);
    const meshes = []; template.scene.traverse(m => { if (m.isSkinnedMesh) meshes.push(m); });
    assert.equal(meshes.length, 4); assert.equal(template.animations.length, 3);
    for (const mesh of meshes) {
      mesh.skeleton.update(); assert.equal(mesh.skeleton.bones.length, 71);
      for (let i = 0; i < mesh.skeleton.boneMatrices.length; i++) assert.ok(Math.abs(mesh.skeleton.boneMatrices[i] - ([0, 5, 10, 15].includes(i % 16) ? 1 : 0)) < 1e-5);
    }
    for (const name of ['NH walk FK', 'NH stair FK']) {
      const clip = THREE.AnimationClip.findByName(template.animations, name), mixer = new THREE.AnimationMixer(template.scene);
      mixer.clipAction(clip).play(); mixer.setTime(clip.duration / 4); template.scene.updateMatrixWorld(true);
      let moved = false;
      for (const mesh of meshes) {
        mesh.skeleton.update(); const position = mesh.geometry.attributes.position;
        for (let i = 0; i < position.count; i += 137) {
          const before = new THREE.Vector3().fromBufferAttribute(position, i), after = before.clone(); mesh.applyBoneTransform(i, after);
          assert.ok([after.x, after.y, after.z].every(Number.isFinite));
          assert.ok(Math.abs(after.x) < .8 && after.y > -.25 && after.y < 2.1 && Math.abs(after.z) < .8);
          if (before.distanceTo(after) > .05) moved = true;
        }
      }
      assert.ok(moved); mixer.stopAllAction(); mixer.uncacheRoot(template.scene);
    }
  }
});

test('one world-camera pool includes visible player, peers and residents in twelve slots; hidden/first-person subjects never fetch', async () => {
  const library = createResidentAssetLibrary(THREE, { managed: true, loadGLTF: loadGeometry });
  const scene = new THREE.Scene(), rig = new THREE.Group(), camera = new THREE.PerspectiveCamera(); scene.add(rig); rig.add(camera); rig.position.x = 1000;
  const subject = actor(library, 'commuter', { nearPriority: 1, presentationId: 'local-player', firstPerson: true }); subject.position.x = 1016; scene.add(subject);
  subject.userData.setDetail(0); library.updatePresentation(camera, 0); await flush(); assert.equal(library.snapshot().requests, 0);
  subject.userData.setPresentation({ firstPerson: false, dead: true }); library.updatePresentation(camera, 0); await flush(); assert.equal(library.snapshot().requests, 0);
  subject.userData.setPresentation({ dead: false }); subject.visible = false; library.updatePresentation(camera, 0); await flush(); assert.equal(library.snapshot().requests, 0);
  subject.visible = true;
  const others = Array.from({ length: 18 }, (_, i) => {
    const model = actor(library, roles[i % 3], { presentationId: i < 2 ? `peer-${i}` : `resident-${i}` });
    model.position.x = 1000 + i * .7; scene.add(model); model.userData.setDetail(0); return model;
  });
  library.updatePresentation(camera, 0); await flush();
  const snap = library.snapshot(); assert.equal(snap.instances, 12); assert.equal(snap.requests, 3); assert.equal(snap.selected[0], 'local-player');
  assert.deepEqual(new Set(snap.selected.slice(1)), new Set(['peer-0', 'peer-1', ...Array.from({ length: 9 }, (_, i) => `resident-${i + 2}`)]));
  assert.ok(subject.userData.residentCoreActive());
  for (const model of [subject, ...others]) {
    assert.equal(model.userData.lod.visible, !model.userData.residentCoreActive(), 'no simultaneous old and near bodies');
  }
  const a = others[0].getObjectByName('upperleg01_L'), b = others[3].getObjectByName('upperleg01_L'); assert.notEqual(a, b);
  subject.userData.setPresentation({ firstPerson: true }); subject.visible = false; library.updatePresentation(camera, 0); await flush();
  assert.equal(library.snapshot().instances, 12); assert.ok(!library.snapshot().selected.includes('local-player'));
  camera.position.x = 500; library.updatePresentation(camera, 0); await flush(); assert.equal(library.snapshot().instances, 0);
  assert.ok(others.every(model => model.userData.lod.visible));
  library.setQuality('low'); assert.equal(library.snapshot().loaded, false); assert.equal(library.snapshot().textureEstimate.decodedRGBABytes, 0);
  for (const model of [subject, ...others]) model.userData.disposeInstance(); library.dispose();
});

test('role residency counts actual instances, holds brief far/paused gaps, evicts each role after cooldown and reloads lazily', async () => {
  const library = createResidentAssetLibrary(THREE, { loadGLTF: loadGeometry });
  await library.ensureLoaded('worker'); await library.ensureLoaded('commuter');
  const one = library.acquire('worker'), two = library.acquire('worker'), commuter = library.acquire('commuter');
  const resources = []; one.scene.traverse(m => { if (m.isMesh) resources.push(m.geometry, m.material); });
  const disposed = new Map(); for (const resource of resources) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) || 0) + 1));
  library.release(one); library.updateResidency(20); assert.equal(library.snapshot().roles.worker.loaded, true, 'second live skeleton owns role residency');
  library.release(two); library.updateResidency(11.9); assert.equal(library.snapshot().roles.worker.loaded, true);
  for (let i = 0; i < 90; i++) library.updateResidency(0); assert.equal(library.snapshot().roles.worker.loaded, true, 'paused presentation does not advance cooldown');
  const returned = library.acquire('worker'); assert.ok(returned); assert.equal(library.snapshot().requests, 2);
  library.updateResidency(20); assert.equal(library.snapshot().roles.worker.loaded, true);
  library.release(returned); library.updateResidency(12); assert.equal(library.snapshot().roles.worker.loaded, false);
  assert.equal(library.snapshot().roles.commuter.loaded, true); assert.equal(library.snapshot().textureEstimate.decodedRGBABytes, 30 * 1024 * 1024);
  assert.ok(resources.every(r => disposed.get(r) === 1));
  await library.ensureLoaded('worker'); assert.equal(library.snapshot().requests, 3); const reloaded = library.acquire('worker'); assert.ok(reloaded);
  library.release(reloaded); library.release(commuter); library.dispose();
  assert.ok(resources.every(r => disposed.get(r) === 1));
});

test('superseded pending role releases late geometry and cannot repopulate a newly requested role generation', async () => {
  const old = await loadGeometry(null, 'shopkeeper'), next = await loadGeometry(null, 'shopkeeper'); let finish; let requests = 0;
  const library = createResidentAssetLibrary(THREE, { loadGLTF: () => ++requests === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(next) });
  const oldPromise = library.ensureLoaded('shopkeeper'); const rejected = assert.rejects(oldPromise, /superseded/);
  library.updateResidency(12); assert.equal(library.snapshot().roles.shopkeeper.pending, false);
  await library.ensureLoaded('shopkeeper'); finish(old); await rejected;
  assert.equal(library.snapshot().roles.shopkeeper.loaded, true); assert.equal(library.snapshot().roles.shopkeeper.requests, 2);
  const instance = library.acquire('shopkeeper'); assert.ok(instance); library.release(instance); library.dispose();
});

test('candidate actually wires shared library into player/peers/walkers/daily life while preserving gameplay and avoiding GPU queries', async () => {
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8'), city = await readFile(new URL('../src/city-exploration.js', import.meta.url), 'utf8'), library = await readFile(new URL('../src/resident-core-assets.js', import.meta.url), 'utf8');
  assert.match(main, /role:'commuter'.*nearPriority:1,presentationId:'local-player'/);
  assert.match(main, /firstPerson:settings.firstPerson,dead:sim.player.health<=0/);
  assert.match(main, /presentationId:'peer:'\+peer.id/); assert.match(main, /presentationId:'walker:'\+i/);
  assert.match(main, /residentAssets.updatePresentation\(camera,paused&&started\?0:dt\)/);
  assert.match(city, /assetLibrary: residentAssets/);
  assert.doesNotMatch(library, /setTimeout\(|setInterval\(|getContext\(|getParameter\(|readPixels\(|getError\(/);
});


test('actual legacy factory retains API and both held props through near FK, Low return, death and late leave', async () => {
  const { createCharacter } = await import('../src/models.js');
  const library = createResidentAssetLibrary(THREE, { managed: true, loadGLTF: loadGeometry });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const model = actor(library, 'commuter', { fallbackFactory: createCharacter, presentationId: 'actual-player' });
  scene.add(model); const limbs = Object.fromEntries(['leftArm', 'rightArm', 'leftElbow', 'rightElbow', 'leftLeg', 'rightLeg'].map(name => [name, model.userData[name]]));
  const gun = new THREE.Group(), parcel = new THREE.Group(); gun.position.set(.02, -.27, .07); parcel.position.set(-.02, -.27, .07);
  limbs.rightElbow.add(gun); limbs.leftElbow.add(parcel);
  const cargo = new THREE.Group(); cargo.position.set(0, .95, .43); cargo.scale.set(.8, .9, .85); model.add(cargo);
  model.userData.bindResidentHandProp(cargo, { side: 'left', position: [0, -.15, .09] });
  model.userData.setDetail(0); library.updatePresentation(camera, 0); await flush();
  assert.ok(model.userData.residentCoreActive()); assert.equal(model.userData.lod.visible, false);
  assert.equal(gun.parent, model.userData.rightHand); assert.equal(parcel.parent, model.userData.leftHand); assert.equal(cargo.parent, model.userData.leftHand);
  assert.ok(cargo.position.distanceTo(new THREE.Vector3(0, -.15, .09)) < 1e-9);
  for (const [name, limb] of Object.entries(limbs)) assert.equal(model.userData[name], limb);
  model.userData.leftLeg.rotation.x = .45; model.userData.rightElbow.rotation.x = -.9; library.updatePresentation(camera, 0);
  model.updateMatrixWorld(true); const near = model.getObjectByName('NH licensed near commuter · independent skeleton');
  assert.equal(near.getObjectByName('upperleg01_L').rotation.x, .45);
  assert.ok(gun.getWorldPosition(new THREE.Vector3()).distanceTo(near.getObjectByName('wrist_R').getWorldPosition(new THREE.Vector3())) < .12);
  assert.ok(parcel.getWorldPosition(new THREE.Vector3()).distanceTo(near.getObjectByName('wrist_L').getWorldPosition(new THREE.Vector3())) < .12);
  model.userData.setPresentation({ dead: true }); library.updatePresentation(camera, 0);
  assert.equal(model.visible, true, 'death visibility/pose remains caller-owned'); assert.equal(model.userData.residentCoreActive(), false);
  assert.equal(gun.parent, limbs.rightElbow); assert.equal(parcel.parent, limbs.leftElbow); assert.equal(cargo.parent, model);
  assert.ok(cargo.position.distanceTo(new THREE.Vector3(0, .95, .43)) < 1e-9);
  model.userData.setPresentation({ dead: false }); library.updatePresentation(camera, 0); await flush(); assert.ok(model.userData.residentCoreActive());
  library.setQuality('low'); assert.equal(model.userData.lod.visible, true); assert.equal(gun.parent, limbs.rightElbow);
  assert.ok(gun.position.distanceTo(new THREE.Vector3(.02, -.27, .07)) < 1e-9);
  assert.ok(parcel.position.distanceTo(new THREE.Vector3(-.02, -.27, .07)) < 1e-9);
  assert.equal(cargo.parent, model); assert.deepEqual(cargo.scale.toArray(), [.8, .9, .85]);
  model.userData.disposeInstance(); library.dispose();
});

test('managed role eviction and return never attach an old pending generation or resurrect a disposed actor', async () => {
  let completeOld; let requests = 0; const old = await loadGeometry(null, 'worker');
  const library = createResidentAssetLibrary(THREE, { managed: true, loadGLTF: (_url, role) => ++requests === 1 ? new Promise(resolve => { completeOld = resolve; }) : loadGeometry(null, role) });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), model = actor(library, 'worker'); scene.add(model);
  model.userData.setDetail(0); library.updatePresentation(camera, 0); assert.equal(library.snapshot().requests, 1);
  model.position.x = 100; library.updatePresentation(camera, 12); assert.equal(library.snapshot().roles.worker.pending, false);
  model.position.x = 0; library.updatePresentation(camera, 0); await flush(); assert.equal(library.snapshot().requests, 2);
  assert.equal(library.snapshot().instances, 1); completeOld(old); await flush(); assert.equal(library.snapshot().instances, 1);
  model.userData.disposeInstance(); library.updatePresentation(camera, 0); assert.equal(library.snapshot().instances, 0); assert.equal(library.snapshot().registered, 0); library.dispose();
});
