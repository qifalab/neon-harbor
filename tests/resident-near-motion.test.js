import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { createResidentNearMotion } from '../src/resident-near-motion.js';
import { createResidentAssetLibrary, createNearResident } from '../src/resident-core-assets.js';

globalThis.ProgressEvent ||= class { constructor(type, props) { Object.assign(this, props); } };
async function actualGeometry(role) {
  const bytes = await readFile(new URL(`../assets/resident/core-${role}/${role}.glb`, import.meta.url));
  const length = bytes.readUInt32LE(12), data = JSON.parse(bytes.subarray(20, 20 + length));
  const binary = bytes.subarray(28 + length); data.images = []; data.textures = [];
  for (const mat of data.materials) {
    delete mat.pbrMetallicRoughness.baseColorTexture; delete mat.pbrMetallicRoughness.metallicRoughnessTexture;
    delete mat.normalTexture; delete mat.occlusionTexture;
  }
  data.buffers = [{ uri: `data:application/octet-stream;base64,${binary.toString('base64')}`, byteLength: binary.length }];
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(data), '');
  const actor = new THREE.Group(); actor.add(gltf.scene); actor.updateMatrixWorld(true);
  return { actor, scene: gltf.scene, pose: createResidentNearMotion(THREE, gltf.scene), gltf };
}
const at = (scene, name) => scene.getObjectByName(name).getWorldPosition(new THREE.Vector3());
function legacy(scene, phase = 0) {
  for (const side of ['L', 'R']) {
    scene.getObjectByName(`upperleg01_${side}`).rotation.set(Math.sin(phase) * (side === 'L' ? .42 : -.42), 0, 0);
    scene.getObjectByName(`lowerleg01_${side}`).rotation.set(Math.max(0, Math.sin(phase) * (side === 'L' ? 1 : -1)) * .45, 0, 0);
    scene.getObjectByName(`upperarm01_${side}`).rotation.set(0, 0, 0);
    scene.getObjectByName(`lowerarm01_${side}`).rotation.set(-.12, 0, 0);
  }
}
function feetAndSoles(scene) {
  scene.updateMatrixWorld(true);
  let minimum = Infinity, maximum = -Infinity;
  scene.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, i);
      if (point.y > .14) continue;
      mesh.applyBoneTransform(i, point); point.applyMatrix4(mesh.matrixWorld);
      minimum = Math.min(minimum, point.y); maximum = Math.max(maximum, point.y);
    }
  });
  return { minimum, maximum };
}
for (const role of ['worker', 'commuter', 'shopkeeper']) {
  test(`actual ${role} idle supports both soles while breathing and weight shift preserve the actor transform`, async () => {
    const { actor, scene, pose } = await actualGeometry(role);
    const original = { p: actor.position.toArray(), q: actor.quaternion.toArray(), s: actor.scale.toArray() };
    const feet = ['foot_L', 'foot_R'].map(name => at(scene, name)); const spines = [], heads = [];
    for (let frame = 0; frame < 90; frame++) {
      legacy(scene); pose.update(actor, { time: frame / 30, walking: false }); scene.updateMatrixWorld(true);
      for (let side = 0; side < 2; side++) assert.ok(at(scene, ['foot_L', 'foot_R'][side]).distanceTo(feet[side]) < .001, 'idle ankle must stay supported');
      assert.ok(pose.snapshot().contacts.every(contact => contact.reachable));
      spines.push(scene.getObjectByName('spine03').rotation.x); heads.push(scene.getObjectByName('head').rotation.x);
    }
    assert.ok(Math.max(...spines) - Math.min(...spines) > .005, 'real spine breath must animate');
    assert.ok(Math.max(...heads) - Math.min(...heads) > .005, 'head relaxation must animate');
    const soles = feetAndSoles(scene); assert.ok(soles.minimum > -.02 && soles.minimum < .025, `sole support ${JSON.stringify(soles)}`);
    assert.deepEqual({ p: actor.position.toArray(), q: actor.quaternion.toArray(), s: actor.scale.toArray() }, original);
  });
  test(`actual ${role} level walk plants real ankles, lifts swing feet, and keeps skin finite without world edits`, async () => {
    const { actor, scene, pose } = await actualGeometry(role); let previous = null, supportedFrames = 0, liftedFrames = 0;
    for (let frame = 0; frame < 120; frame++) {
      const time = frame / 30; actor.position.z = time * 1.2; legacy(scene, time * 8);
      const expected = actor.position.toArray(); pose.update(actor, { time, walking: true }); scene.updateMatrixWorld(true);
      const snapshot = pose.snapshot();
      for (const contact of snapshot.contacts) {
        const ankle = at(scene, contact.side === 'left' ? 'foot_L' : 'foot_R');
        assert.ok(ankle.distanceTo(new THREE.Vector3(...contact.ankleTarget)) < .003, 'real ankle reaches the authored support target');
        assert.ok(contact.reachable, 'leg target must fit real bone lengths');
        if (contact.stance && previous?.[contact.side]?.stance) {
          assert.ok(ankle.distanceTo(previous[contact.side].ankle) < .003, 'successive support frames must plant actual ankle in world'); supportedFrames++;
        } else if (!contact.stance && ankle.y > .12) liftedFrames++;
      }
      previous = Object.fromEntries(snapshot.contacts.map(contact => [contact.side, { stance: contact.stance, ankle: at(scene, contact.side === 'left' ? 'foot_L' : 'foot_R') }]));
      assert.deepEqual(actor.position.toArray(), expected);
    }
    assert.ok(supportedFrames > 70); assert.ok(liftedFrames > 15); assert.equal(pose.snapshot().resetCount, 0, 'straight walking must not silently reset support');
    const soles = feetAndSoles(scene); assert.ok(Number.isFinite(soles.minimum) && soles.minimum > -.035, `deformed sole floor ${JSON.stringify(soles)}`);
  });
}
test('the actual working reach raises a bent forearm; repeated presentation synchronization does not accumulate offsets', async () => {
  const { actor, scene, pose } = await actualGeometry('shopkeeper');
  legacy(scene); pose.update(actor, { time: 0, walking: false }); const idle = at(scene, 'wrist_R');
  legacy(scene); const sample = { time: .1, walking: false, activity: 'working' }; pose.update(actor, sample); scene.updateMatrixWorld(true);
  const hand = at(scene, 'wrist_R'); assert.ok(hand.z > idle.z + .10 && hand.y > idle.y + .035, 'real forearm reaches forward and upwards');
  assert.ok(hand.x < -.16 && hand.y < 1.45 && hand.z < .45, 'working hand remains outside the body and below the face');
  const bones = []; scene.traverse(node => { if (node.isBone) bones.push(node); });
  const before = bones.map(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()]);
  for (let i = 0; i < 8; i++) { legacy(scene); pose.update(actor, sample); }
  assert.deepEqual(bones.map(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()]), before);
});
test('stairs, high speed and discontinuous arrivals preserve original caller limb rotations and never move the actor', async () => {
  const { actor, scene, pose } = await actualGeometry('worker');
  legacy(scene); pose.update(actor, { time: 0, walking: false });
  for (const [time, y, z] of [[.1, .05, .08], [.2, .05, .64], [2, 4.2, 45]]) {
    actor.position.set(0, y, z); legacy(scene, .8); const hip = scene.getObjectByName('upperleg01_L').quaternion.toArray(); const actual = actor.position.toArray();
    pose.update(actor, { time, walking: true }); assert.equal(pose.snapshot().mode, 'legacy');
    assert.deepEqual(scene.getObjectByName('upperleg01_L').quaternion.toArray(), hip); assert.deepEqual(actor.position.toArray(), actual);
  }
});
test('actual scaled citizen builds and ordinary curved movement support real ankles without distorting actor scale', async () => {
  const { actor, scene, pose } = await actualGeometry('commuter'); actor.scale.set(1.13 * .97, .97, .97 * ( .94 + 1.13 * .06));
  for (let frame = 0; frame < 90; frame++) {
    const time = frame / 30, yaw = time * .08; actor.position.set(15 * (1 - Math.cos(yaw)), 0, 15 * Math.sin(yaw)); actor.rotation.y = yaw;
    legacy(scene, time * 8); const transform = [...actor.position.toArray(), ...actor.quaternion.toArray(), ...actor.scale.toArray()];
    pose.update(actor, { time, walking: true }); scene.updateMatrixWorld(true);
    for (const contact of pose.snapshot().contacts) assert.ok(at(scene, contact.side === 'left' ? 'foot_L' : 'foot_R').distanceTo(new THREE.Vector3(...contact.ankleTarget)) < .004, 'scaled live citizen support');
    assert.deepEqual([...actor.position.toArray(), ...actor.quaternion.toArray(), ...actor.scale.toArray()], transform);
  }
});
test('the real near factory presents the new pose through existing LOD synchronization and releases its original skeleton once', async () => {
  const { gltf } = await actualGeometry('worker'); const library = createResidentAssetLibrary(THREE, { loadGLTF: async () => gltf });
  const actor = createNearResident(THREE, { role: 'worker', assetLibrary: library, allowHeadlessAssetLoad: true });
  actor.userData.setDetail(0); await library.ensureLoaded('worker'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(actor.userData.residentCoreActive(), true);
  for (let frame = 0; frame < 4; frame++) {
    actor.position.z = frame * .04; actor.userData.setResidentMotion({ time: frame / 30, walking: true }); actor.userData.setDetail(0);
    const sample = actor.userData.residentCoreReview();
    if (frame > 0) assert.equal(sample.motion.mode, 'supported-level-walk');
    assert.ok(sample.poseBones.foot_L.worldPosition && sample.poseBones.foot_R.worldPosition);
    const before = actor.userData.residentCoreReview(); actor.userData.setDetail(0); assert.deepEqual(actor.userData.residentCoreReview().motion, before.motion);
  }
  actor.userData.setDetail(2); assert.equal(library.snapshot().instances, 0);
  assert.equal(library.snapshot({ includeReview: true }).review.disposeCalls.instanceSkeletons, 1);
  actor.userData.disposeInstance(); library.dispose();
});
test('stopping ordinary level walking keeps real foot positions and settles the lifted sole instead of snapping to bind pose', async () => {
  const { actor, scene, pose } = await actualGeometry('worker');
  let feet;
  for (let frame = 0; frame < 20; frame++) {
    const time = frame / 30; actor.position.z = time * 1.2; legacy(scene, time * 8); pose.update(actor, { time, walking: true }); scene.updateMatrixWorld(true);
    feet = ['foot_L', 'foot_R'].map(name => at(scene, name));
  }
  for (let frame = 20; frame < 35; frame++) {
    legacy(scene); pose.update(actor, { time: frame / 30, walking: false }); scene.updateMatrixWorld(true);
    const next = ['foot_L', 'foot_R'].map(name => at(scene, name));
    for (let side = 0; side < 2; side++) {
      assert.ok(Math.hypot(next[side].x - feet[side].x, next[side].z - feet[side].z) < .003, 'stopping feet keep horizontal placement');
      assert.ok(Math.abs(next[side].y - feet[side].y) < .035, 'lifted sole settles continuously');
    }
    assert.ok(pose.snapshot().contacts.every(contact => contact.reachable)); feet = next;
  }
  assert.ok(pose.snapshot().contacts.every(contact => contact.stance), 'settled feet support idle');
});
test('the original presentation bob does not count as stairs, while a real grounded rise still retains legacy animation', async () => {
  const { actor, scene, pose } = await actualGeometry('commuter');
  for (let frame = 0; frame < 24; frame++) {
    const time = frame / 20; actor.position.set(0, Math.sin(time * 16) * .005, time * 1.2); legacy(scene, time * 8);
    const original = actor.position.toArray(); pose.update(actor, { time, walking: true, groundY: 0 });
    if (frame > 0) assert.equal(pose.snapshot().mode, 'supported-level-walk');
    assert.deepEqual(actor.position.toArray(), original);
  }
  actor.position.y = .12; legacy(scene, .8); const original = actor.position.toArray();
  pose.update(actor, { time: 1.2, walking: true, groundY: .12 }); assert.equal(pose.snapshot().mode, 'legacy'); assert.deepEqual(actor.position.toArray(), original);
});
