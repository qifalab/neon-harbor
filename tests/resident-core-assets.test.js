import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { createResidentAssetLibrary, createNearResident, RESIDENT_CORE_BUDGET } from '../src/resident-core-assets.js';
const dir = new URL('../art-source/near-resident/editable/', import.meta.url);
const runtime = new URL('../assets/resident/core-worker/', import.meta.url);
const gltf = JSON.parse(await readFile(new URL('worker.gltf', dir), 'utf8'));
const binary = await readFile(new URL('worker.bin', dir));
const manifest = JSON.parse(await readFile(new URL('manifest.json', runtime), 'utf8'));
const names = ['leftLeg', 'rightLeg', 'leftKnee', 'rightKnee', 'leftArm', 'rightArm', 'leftElbow', 'rightElbow'];
function accessor(i) {
  const a = gltf.accessors[i], v = gltf.bufferViews[a.bufferView];
  const type = a.componentType === 5126 ? Float32Array : Uint16Array;
  const count = a.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type]);
  const offset = binary.byteOffset + (v.byteOffset || 0) + (a.byteOffset || 0);
  return new type(binary.buffer, offset, count);
}
async function geometryTemplate() {
  // Full geometry/skin/animation parse; texture bytes are independently checked
  // below. Node has no ImageBitmap/DOM, and this test uses no GPU.
  const data = structuredClone(gltf); data.images = []; data.textures = [];
  for (const material of data.materials) {
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    delete material.normalTexture; delete material.occlusionTexture;
  }
  data.buffers = [{ uri: `data:application/octet-stream;base64,${binary.toString('base64')}`, byteLength: binary.length }];
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, options) { this.type = type; Object.assign(this, options); } };
  return new GLTFLoader().parseAsync(JSON.stringify(data), '');
}
function fallbackFactory(T, { style }) {
  const root = new T.Group(); root.userData.style = typeof style === 'string' ? style : 'courier';
  root.userData.lod = new T.Group(); root.add(root.userData.lod);
  for (const name of names) { const joint = new T.Group(); joint.name = name; root.userData[name] = joint; root.userData.lod.add(joint); }
  root.userData.setDetail = tier => { root.userData.oldDetail = tier; root.userData.lod.visible = true; };
  root.userData.updateLOD = () => {}; root.userData.disposeInstance = () => { root.userData.oldDisposed = true; };
  return root;
}
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };

test('licensed core GLB preserves source geometry, budgets, sole height, UVs, normalized normals and four skin influences', async () => {
  assert.equal(manifest.triangles, 32372); assert.equal(manifest.materials, 4); assert.equal(manifest.bones, 71);
  assert.ok(manifest.maskedBodyTriangles > 15000, 'anatomical surface cannot be replaced by old primitives');
  assert.equal(gltf.skins[0].joints.length, 71); assert.equal(gltf.meshes.length, 4);
  assert.ok(gltf.nodes.some(n => n.name === 'finger5-3_L') && gltf.nodes.some(n => n.name === 'finger1-3_R'));
  const bounds = { minY: Infinity, maxY: -Infinity };
  for (const mesh of gltf.meshes) {
    const p = mesh.primitives[0], a = p.attributes, position = accessor(a.POSITION), indices = accessor(p.indices),
      normals = accessor(a.NORMAL), uv = accessor(a.TEXCOORD_0), weights = accessor(a.WEIGHTS_0), joints = accessor(a.JOINTS_0);
    assert.equal(indices.length % 3, 0); assert.ok(Math.max(...indices) < position.length / 3);
    for (let i = 0; i < position.length; i += 3) {
      assert.ok(Number.isFinite(position[i]) && Number.isFinite(position[i + 1]) && Number.isFinite(position[i + 2]));
      bounds.minY = Math.min(bounds.minY, position[i + 1]); bounds.maxY = Math.max(bounds.maxY, position[i + 1]);
      assert.ok(Math.abs(Math.hypot(...normals.slice(i, i + 3)) - 1) < 1e-5, `${mesh.name} normal is not unit length`);
    }
    assert.ok([...uv].every(v => Number.isFinite(v) && v >= -.001 && v <= 1.001));
    for (let i = 0; i < weights.length; i += 4) {
      assert.ok(Math.abs(weights[i] + weights[i + 1] + weights[i + 2] + weights[i + 3] - 1) < 1e-5);
      assert.ok([...weights.slice(i, i + 4)].every(w => w >= 0 && w <= 1));
      assert.ok([...joints.slice(i, i + 4)].every(j => j < 71));
    }
  }
  assert.ok(Math.abs(bounds.minY) < 1e-6 && Math.abs(bounds.maxY - 1.78) < 1e-6);
  for (const file of manifest.files) {
    const bytes = await readFile(new URL(`../${file.path}`, import.meta.url));
    assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  const glb = await readFile(new URL('worker.glb', runtime));
  assert.equal(glb.toString('ascii', 0, 4), 'glTF'); assert.equal(glb.readUInt32LE(4), 2); assert.equal(glb.readUInt32LE(8), glb.length);
  const jsonLength = glb.readUInt32LE(12), packed = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
  assert.deepEqual(packed.meshes, gltf.meshes); assert.deepEqual(packed.skins, gltf.skins);
  const binStart = 20 + jsonLength + 8;
  assert.equal(glb.subarray(binStart, binStart + binary.length).equals(binary), true);
  for (let i = 0; i < packed.images.length; i++) {
    const image = packed.images[i], view = packed.bufferViews[image.bufferView];
    const bytes = glb.subarray(binStart + view.byteOffset, binStart + view.byteOffset + view.byteLength);
    assert.equal(bytes.equals(await readFile(new URL(gltf.images[i].uri, dir))), true);
    assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
  }
});

test('actual 71-bone GLTF parses, inverse binds preserve standing geometry, and original FK walk/stair clips deform real limbs', async () => {
  const data = await geometryTemplate(); data.scene.updateMatrixWorld(true);
  const skins = []; data.scene.traverse(m => { if (m.isSkinnedMesh) skins.push(m); });
  assert.equal(skins.length, 4); assert.equal(data.animations.length, 3);
  const skeleton = skins[0].skeleton; assert.equal(skeleton.bones.length, 71);
  skeleton.update();
  const matrices = skeleton.boneMatrices;
  for (let i = 0; i < skeleton.bones.length; i++) for (let k = 0; k < 16; k++) {
    assert.ok(Math.abs(matrices[i * 16 + k] - ([0, 5, 10, 15].includes(k) ? 1 : 0)) < 1e-5,
      `${skeleton.bones[i].name}: standing bind transform changed geometry`);
  }
  for (const clipName of ['NH walk FK', 'NH stair FK']) {
    const clip = THREE.AnimationClip.findByName(data.animations, clipName), mixer = new THREE.AnimationMixer(data.scene);
    const action = mixer.clipAction(clip); action.play(); mixer.setTime(clip.duration / 4); data.scene.updateMatrixWorld(true); skeleton.update();
    assert.ok(Math.abs(data.scene.getObjectByName('upperleg01_L').rotation.x) > .3);
    assert.ok([...skeleton.boneMatrices].every(Number.isFinite));
    let changed = false;
    for (const mesh of skins) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i += 137) {
        const before = new THREE.Vector3().fromBufferAttribute(positions, i), after = before.clone(); mesh.applyBoneTransform(i, after);
        assert.ok([after.x, after.y, after.z].every(Number.isFinite));
        assert.ok(Math.abs(after.x) < .8 && after.y > -.25 && after.y < 2.1 && Math.abs(after.z) < .8);
        if (after.distanceTo(before) > .05) changed = true;
      }
    }
    assert.ok(changed, `${clipName} must move actual skinned vertices`);
    action.stop(); mixer.uncacheRoot(data.scene);
  }
});

test('near factory requests once at near tier, clones isolated bones, keeps far LOD and handles disposal and load failure', async () => {
  const template = await geometryTemplate(); let requests = 0;
  const library = createResidentAssetLibrary(THREE, { loadGLTF: async () => { requests++; return template; } });
  const a = createNearResident(THREE, { style: 'courier', fallbackFactory, allowHeadlessAssetLoad: true, assetLibrary: library });
  const b = createNearResident(THREE, { style: 'chef', fallbackFactory, allowHeadlessAssetLoad: true, assetLibrary: library });
  a.userData.setDetail(2); b.userData.setDetail(1); await flush(); assert.equal(requests, 0);
  a.userData.setDetail(0); b.userData.setDetail(0); await flush();
  assert.equal(requests, 1); assert.equal(library.snapshot().instances, 2);
  assert.equal(a.userData.residentCoreSnapshot().visible, true); assert.equal(a.userData.lod.visible, false);
  const skinA = a.getObjectByName('NH licensed near worker · independent skeleton');
  const skinB = b.getObjectByName('NH licensed near worker · independent skeleton');
  assert.notEqual(skinA.getObjectByName('upperleg01_L'), skinB.getObjectByName('upperleg01_L'));
  a.userData.leftLeg.rotation.x = .4; a.userData.setDetail(0); b.userData.setDetail(0);
  assert.ok(Math.abs(skinA.getObjectByName('upperleg01_L').rotation.x - .4) < 1e-9);
  assert.equal(skinB.getObjectByName('upperleg01_L').rotation.x, 0);
  a.position.set(10, 3, 20); a.rotation.y = .7; a.userData.setDetail(0);
  assert.deepEqual(a.position.toArray(), [10, 3, 20]); assert.equal(a.rotation.y, .7);
  a.userData.setDetail(2); assert.equal(skinA.visible, false); assert.equal(a.userData.lod.visible, true);
  assert.equal(a.userData.oldDetail, 2);
  a.userData.disposeInstance(); a.userData.disposeInstance(); assert.equal(library.snapshot().instances, 1); assert.equal(a.userData.oldDisposed, true);
  b.userData.disposeInstance(); library.dispose(); assert.equal(library.snapshot().instances, 0); assert.equal(library.snapshot().disposed, true);
  const broken = createResidentAssetLibrary(THREE, { loadGLTF: async () => { throw new Error('missing local asset'); } });
  const c = createNearResident(THREE, { style: 'courier', fallbackFactory, allowHeadlessAssetLoad: true, assetLibrary: broken });
  c.userData.setDetail(0); await flush(); assert.equal(c.userData.residentCore.status, 'failed'); assert.equal(c.userData.lod.visible, true);
  c.userData.setDetail(0); await flush(); assert.equal(broken.snapshot().requests, 1); c.userData.disposeInstance(); broken.dispose();
});

test('late loading cannot resurrect released residents and shared cache is bounded to twelve', async () => {
  const template = await geometryTemplate(); let finish;
  const library = createResidentAssetLibrary(THREE, { loadGLTF: () => new Promise(resolve => { finish = resolve; }) });
  const a = createNearResident(THREE, { style: 'courier', fallbackFactory, allowHeadlessAssetLoad: true, assetLibrary: library });
  a.userData.setDetail(0); a.userData.disposeInstance(); finish(template); await flush();
  assert.equal(a.userData.residentCore.status, 'disposed'); assert.equal(library.snapshot().instances, 0);
  const instances = Array.from({ length: 12 }, () => library.acquire()); assert.ok(instances.every(Boolean));
  assert.equal(library.acquire(), null); assert.equal(library.snapshot().instances, RESIDENT_CORE_BUDGET.maximumInstances);
  for (const instance of instances) library.release(instance); assert.equal(library.snapshot().instances, 0); library.dispose();
});

test('selected original assets and licences are inspectable, hash verified, and eye alpha is preserved', async () => {
  const source = new URL('../art-source/near-resident/source/', import.meta.url);
  const bodySource = JSON.parse(await readFile(new URL('download-manifest.json', source), 'utf8'));
  const pack = JSON.parse(await readFile(new URL('official-core-download-manifest.json', source), 'utf8'));
  assert.match(bodySource.repoCommit, /^[a-f0-9]{40}$/); assert.match(pack.url, /makehuman_system_assets_cc0\.zip$/);
  for (const file of bodySource.files) {
    const bytes = await readFile(new URL(file.path, source));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  for (const file of pack.files) {
    const bytes = await readFile(new URL(`core-pack/${file.path}`, source));
    assert.equal(bytes.length, file.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    if (/\.mhclo$/.test(file.path)) assert.match(bytes.toString(), /explicitly released as CC0 in september 2020/);
  }
  const license = await readFile(new URL('../art-source/near-resident/licenses/LICENSE.md', import.meta.url), 'utf8');
  assert.match(license, /source.*released under AGPL/s); assert.match(license, /assets.*released under CC0 1\.0 Universal/s);
  const eyes = await readFile(new URL('eyes-basecolor.png', dir));
  assert.equal(eyes[25], 6, 'RGBA PNG must retain the core eye material transparent cornea region');
  assert.equal(gltf.materials[3].alphaMode, 'MASK');
});

test('High/Balanced share the formal asset while Low disposes shared data and late generations cannot restore it', async () => {
  let finish; let requests = 0;
  const first = await geometryTemplate(), second = await geometryTemplate();
  const library = createResidentAssetLibrary(THREE, { loadGLTF: () => { requests++; return requests === 1 ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(second); } });
  const actor = createNearResident(THREE, { style: 'courier', fallbackFactory, assetLibrary: library, allowHeadlessAssetLoad: true });
  actor.userData.setDetail(0); assert.equal(library.snapshot().pending, true);
  library.setQuality('low'); actor.userData.setPresentation({ quality: 'low' });
  finish(first); await flush(); assert.equal(library.snapshot().loaded, false); assert.equal(library.snapshot().instances, 0);
  assert.equal(actor.userData.residentCore.status, 'disabled-low'); assert.equal(actor.userData.oldDetail, 1);
  library.setQuality('high'); actor.userData.setPresentation({ quality: 'high' }); await flush();
  assert.equal(requests, 2); assert.equal(actor.userData.residentCoreSnapshot().visible, true);
  const owned = []; second.scene.traverse(object => { if (object.isMesh) owned.push(object.geometry, object.material); });
  const disposed = new Map(); for (const resource of owned) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) || 0) + 1));
  const beforeBalanced = actor.getObjectByName('NH licensed near worker · independent skeleton');
  library.setQuality('balanced'); actor.userData.setPresentation({ quality: 'balanced' }); await flush();
  assert.equal(actor.getObjectByName('NH licensed near worker · independent skeleton'), beforeBalanced);
  assert.equal(requests, 2); assert.equal(library.snapshot().loaded, true); assert.equal(library.snapshot().instances, 1);
  assert.ok([...actor.children].filter(c => c.name === 'NH licensed near worker · independent skeleton').every(c => { let valid = true; c.traverse(m => { if (m.isMesh && m.castShadow) valid = false; }); return valid; }));
  library.setQuality('low'); actor.userData.setPresentation({ quality: 'low' });
  assert.equal(library.snapshot().loaded, false); assert.equal(library.snapshot().instances, 0);
  assert.ok(owned.every(resource => disposed.get(resource) === 1));
  actor.userData.disposeInstance(); library.dispose(); assert.ok(owned.every(resource => disposed.get(resource) === 1));
});

test('hidden or first-person/dead player cannot request a near asset and legacy held props follow the real new hand', async () => {
  const template = await geometryTemplate(); let requests = 0;
  const library = createResidentAssetLibrary(THREE, { loadGLTF: async () => { requests++; return template; } });
  const actor = createNearResident(THREE, { style: 'courier', firstPerson: true, fallbackFactory, assetLibrary: library, allowHeadlessAssetLoad: true });
  const elbow = actor.userData.rightElbow, limb = actor.userData.rightArm;
  const gun = new THREE.Group(); gun.name = 'Existing held tool'; gun.position.set(.02, -.27, .07); elbow.add(gun);
  actor.userData.setDetail(0); await flush(); assert.equal(requests, 0);
  actor.userData.setPresentation({ firstPerson: false, dead: true }); await flush(); assert.equal(requests, 0);
  actor.visible = false; actor.userData.setPresentation({ dead: false }); await flush(); assert.equal(requests, 0);
  actor.visible = true; actor.position.set(14, 2, -17); actor.rotation.y = .4;
  actor.userData.setDetail(0); await flush();
  assert.equal(requests, 1); assert.equal(actor.userData.rightElbow, elbow); assert.equal(actor.userData.rightArm, limb);
  assert.equal(gun.parent, actor.userData.rightHand); assert.equal(actor.userData.lod.visible, false);
  actor.updateMatrixWorld(true);
  const core = actor.getObjectByName('NH licensed near worker · independent skeleton'), wrist = core.getObjectByName('wrist_R');
  assert.ok(gun.getWorldPosition(new THREE.Vector3()).distanceTo(wrist.getWorldPosition(new THREE.Vector3())) < .12);
  assert.ok(gun.parent.visible && actor.visible, 'prop must be outside the now-hidden legacy LOD');
  actor.userData.rightElbow.rotation.x = -.9; actor.userData.setDetail(0); actor.updateMatrixWorld(true);
  assert.ok(Math.abs(core.getObjectByName('lowerarm01_R').rotation.x + .9) < 1e-9);
  assert.equal(gun.parent, actor.userData.rightHand);
  actor.userData.setPresentation({ quality: 'low' }); assert.equal(gun.parent, elbow);
  assert.ok(gun.position.distanceTo(new THREE.Vector3(.02, -.27, .07)) < 1e-9);
  actor.userData.disposeInstance(); library.dispose();
});

test('daily renderer selects at most twelve by viewer WORLD position, exposes only CPU asset stats, and disposes its presentation', async () => {
  const { createHarborLifeRenderer } = await import('../src/harbor-life-renderer.js');
  const { CHARACTER_STYLES } = await import('../src/models.js');
  const life = { agents: Array.from({ length: 20 }, (_, index) => ({ id: `a-${index}`, index, name: `Resident ${index}`, role: 'test',
    x: index * 2, y: .18, z: 0, insideBuildingId: null, gait: 0, phase: 'idle' })),
    supply: { anchor: { x: 0, y: .18, z: 10 }, stock: { tea: 1 }, name: 'test' }, shops: [], shopStatuses: [], availableJobs: [], revision: 0 };
  const created = [];
  const renderer = createHarborLifeRenderer(THREE, new THREE.Scene(), life, { characterFactory: (T, settings) => {
    const model = fallbackFactory(T, { style: CHARACTER_STYLES[settings.style].id }); created.push(model); return model;
  } });
  renderer.update({ position: { x: 0, y: 1.8, z: 0 }, viewerPosition: { x: 38, y: 1.8, z: 0 } }, 0);
  assert.equal(renderer.snapshot().detailed, 12); assert.equal(renderer.snapshot().maximumDetailed, 12);
  const actual = new Set(created.filter(m => m.parent).map(m => m.userData.harborResidentId));
  assert.deepEqual(actual, new Set(Array.from({ length: 12 }, (_, i) => `a-${i + 8}`)));
  assert.equal(renderer.snapshot().nearAssetLibrary.requests, 0, 'old-only test actors must not trigger any asset request');
  renderer.setQuality('low'); assert.equal(renderer.snapshot().quality, 'low');
  assert.equal(renderer.snapshot().nearAssetLibrary.loaded, false);
  renderer.dispose(); renderer.dispose(); assert.equal(renderer.snapshot().nearAssetLibrary.disposed, true);
  const code = await readFile(new URL('../src/resident-core-assets.js', import.meta.url), 'utf8');
  assert.doesNotMatch(code, /getContext\(|getParameter\(|readPixels\(|getError\(/, 'asset diagnostics cannot query GPU state');
});
