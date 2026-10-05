import { createCharacter } from './models.js';
import { clone as cloneSkeleton } from '../vendor/three/addons/utils/SkeletonUtils.js';
import { createResidentNearMotion } from './resident-near-motion.js';

export const RESIDENT_CORE_BUDGET = Object.freeze({ triangles: 35000, materials: 4, bones: 72,
  maximumInstances: 12, nearDistance: 18, height: 1.78 });
export const RESIDENT_CORE_ROLES = Object.freeze({
  worker: Object.freeze({ url: new URL('../assets/resident/core-worker/worker.glb', import.meta.url), triangles: 32372, wardrobe: 'male_worksuit01' }),
  commuter: Object.freeze({ url: new URL('../assets/resident/core-commuter/commuter.glb', import.meta.url), triangles: 29074, wardrobe: 'male_casualsuit03' }),
  shopkeeper: Object.freeze({ url: new URL('../assets/resident/core-shopkeeper/shopkeeper.glb', import.meta.url), triangles: 28112, wardrobe: 'female_elegantsuit01' })
});
const defaults = new WeakMap();
const joints = Object.freeze({ leftLeg: 'upperleg01_L', rightLeg: 'upperleg01_R',
  leftKnee: 'lowerleg01_L', rightKnee: 'lowerleg01_R', leftArm: 'upperarm01_L', rightArm: 'upperarm01_R',
  leftElbow: 'lowerarm01_L', rightElbow: 'lowerarm01_R' });
const pilotStyles = new Set(['courier', 'chef']);
const validQuality = value => ['high', 'balanced', 'low'].includes(value) ? value : 'high';

/** Three independently authored core wardrobes; one lazy template per role.
 * All player, peer, walker and daily-life instances share the twelve-person cap.
 * Templates share textures/geometry; each live instance has its own 71 bones.
 * No animation, collision, time, inventory or network state is owned here.
 */
export function createResidentAssetLibrary(THREE, { loadGLTF, clone = cloneSkeleton, quality: initialQuality = 'high', managed = false, residencyCooldown = 12 } = {}) {
  let disposed = false, requests = 0, generation = 0, serial = 0;
  let quality = validQuality(initialQuality);
  const caches = new Map(), instances = new Set(), actors = new Set();
  const cameraPosition = new THREE.Vector3(), actorPosition = new THREE.Vector3();
  let selectedIds = [];
  function cacheFor(role) {
    if (!RESIDENT_CORE_ROLES[role]) throw new Error('Unknown licensed resident role');
    if (!caches.has(role)) caches.set(role, { promise: null, template: null, error: null, requests: 0, generation: 0, idleSeconds: 0 });
    return caches.get(role);
  }
  const cleanedTemplates = new WeakSet();
  const disposeCalls = { templates: 0, geometries: 0, materials: 0, textures: 0, skeletons: 0, imageBitmapCloseCalls: 0, instanceSkeletons: 0, discardedCloneSkeletons: 0 };
  function templateOwners(gltf) {
    const owners = { geometries: new Set(), materials: new Set(), textures: new Set(), skeletons: new Set(), images: new Set(), imageBitmaps: new Set(), bones: new Set() };
    gltf?.scene?.traverse(object => {
      if (!object.isMesh) return;
      owners.geometries.add(object.geometry);
      if (object.skeleton) { owners.skeletons.add(object.skeleton); for (const bone of object.skeleton.bones) owners.bones.add(bone); }
      for (const material of [object.material].flat()) {
        owners.materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) owners.textures.add(value);
      }
    });
    for (const texture of owners.textures) if (texture.source?.data) {
      owners.images.add(texture.source.data);
      if (typeof texture.source.data.close === 'function') owners.imageBitmaps.add(texture.source.data);
    }
    return owners;
  }
  const ownerCounts = owners => Object.fromEntries(Object.entries(owners).map(([name, values]) => [name, values.size]));
  function releaseGLTF(gltf) {
    if (!gltf || cleanedTemplates.has(gltf)) return;
    cleanedTemplates.add(gltf); disposeCalls.templates++;
    const owners = templateOwners(gltf);
    for (const skeleton of owners.skeletons) { skeleton.dispose(); disposeCalls.skeletons++; }
    for (const texture of owners.textures) { texture.dispose(); disposeCalls.textures++; }
    for (const image of owners.imageBitmaps) { image.close(); disposeCalls.imageBitmapCloseCalls++; }
    for (const material of owners.materials) { material.dispose(); disposeCalls.materials++; }
    for (const geometry of owners.geometries) { geometry.dispose(); disposeCalls.geometries++; }
  }
  function residencyReview() {
    const union = templateOwners(null), roles = {};
    for (const [role, cache] of caches) {
      const owners = templateOwners(cache.template); roles[role] = ownerCounts(owners);
      for (const name of Object.keys(union)) for (const owner of owners[name]) union[name].add(owner);
    }
    const liveSkeletons = new Set([...instances].map(instance => instance.skeleton).filter(Boolean));
    const liveBones = new Set([...liveSkeletons].flatMap(skeleton => skeleton.bones));
    return { templateOwners: ownerCounts(union), roles, instanceOwners: { skeletons: liveSkeletons.size,
      bones: liveBones.size, boneTextures: new Set([...liveSkeletons].map(skeleton => skeleton.boneTexture).filter(Boolean)).size },
      disposeCalls: { ...disposeCalls }, countsAreCPUReferences: true, measuredDriverVRAM: false,
      actors: [...actors].map(record => ({ id: record.actor.userData.harborResidentId || record.actor.userData.residentId || record.id,
        registeredId: record.id, priority: record.priority, ...record.actor.userData.residentCoreReview?.() })) };
  }
  async function ensureLoaded(role = 'worker') {
    if (disposed || quality === 'low') throw new Error('Resident core unavailable in this presentation generation');
    const cache = cacheFor(role);
    if (!cache.promise) {
      requests++; cache.requests++; cache.idleSeconds = 0; const epoch = generation, roleEpoch = cache.generation;
      cache.promise = (async () => {
        const assetURL = RESIDENT_CORE_ROLES[role].url;
        const gltf = loadGLTF ? await loadGLTF(assetURL, role) : await (async () => {
          const { GLTFLoader } = await import('../vendor/three/addons/loaders/GLTFLoader.js');
          return new GLTFLoader().loadAsync(assetURL.href);
        })();
        if (disposed || quality === 'low' || epoch !== generation || roleEpoch !== cache.generation) {
          releaseGLTF(gltf); throw new Error('Resident core load superseded');
        }
        try {
          let triangles = 0; const materials = new Set(), skeletons = new Set();
          gltf.scene.traverse(object => {
            if (!object.isMesh) return;
            if (!object.isSkinnedMesh) throw new Error('Resident core has an unskinned primitive');
            triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
            for (const material of [object.material].flat()) materials.add(material);
            skeletons.add(object.skeleton); object.castShadow = quality === 'high'; object.receiveShadow = true;
            // Animated limbs are not culled against a stale standing-pose box.
            object.frustumCulled = false;
          });
          const names = new Set([...skeletons].flatMap(s => s.bones.map(b => b.name)));
          if (triangles < 25000 || triangles > 35000 || materials.size > 4 || names.size > 72 ||
            Object.values(joints).some(name => !names.has(name))) throw new Error('Resident core asset budget or rig mismatch');
        } catch (problem) { releaseGLTF(gltf); throw problem; }
        cache.template = gltf; return gltf;
      })().catch(problem => {
        if (!disposed && epoch === generation && roleEpoch === cache.generation && quality !== 'low') cache.error = String(problem.message || problem);
        throw problem;
      });
    }
    return cache.promise;
  }
  function acquire(role = 'worker') {
    const template = caches.get(role)?.template;
    if (!template || disposed || quality === 'low' || instances.size >= RESIDENT_CORE_BUDGET.maximumInstances) return null;
    const scene = clone(template.scene); scene.name = `NH licensed near ${role} · independent skeleton`;
    const rig = Object.fromEntries(Object.entries(joints).map(([api, name]) => [api, scene.getObjectByName(name)]));
    let sharedSkeleton;
    scene.traverse(object => {
      if (!object.isSkinnedMesh) return;
      object.castShadow = quality === 'high';
      if (!sharedSkeleton) sharedSkeleton = object.skeleton;
      else if (object.skeleton !== sharedSkeleton) { object.skeleton.dispose(); disposeCalls.discardedCloneSkeletons++; object.skeleton = sharedSkeleton; }
    });
    const instance = { scene, rig, role, skeleton: sharedSkeleton, released: false, generation, motion: createResidentNearMotion(THREE, scene) };
    instances.add(instance); caches.get(role).idleSeconds = 0; return instance;
  }
  function release(instance) {
    if (!instance || instance.released) return;
    instance.released = true; instance.scene.visible = false; instance.scene.removeFromParent(); instance.scene.clear(); instance.skeleton?.dispose(); if (instance.skeleton) disposeCalls.instanceSkeletons++;
    instances.delete(instance); const cache = caches.get(instance.role); if (cache) cache.idleSeconds = 0;
  }
  function register(actor, { priority = 0, id } = {}) {
    const record = { actor, priority, id: id ?? `presentation-${serial + 1}`, serial: ++serial };
    actors.add(record); return () => actors.delete(record);
  }
  function updatePresentation(camera, dt = 0) {
    if (!managed || disposed) return;
    camera.updateWorldMatrix(true, false); cameraPosition.setFromMatrixPosition(camera.matrixWorld);
    const ranked = [];
    for (const record of actors) {
      const actor = record.actor;
      let visible = !!actor.parent;
      for (let parent = actor; parent && visible; parent = parent.parent) if (!parent.visible) visible = false;
      if (!visible || !actor.userData.residentCoreCanRequest?.()) continue;
      actor.updateWorldMatrix(true, false); actorPosition.setFromMatrixPosition(actor.matrixWorld);
      const distance = actorPosition.distanceTo(cameraPosition);
      if (distance >= (actor.userData.residentCoreActive?.() ? 21 : 18)) continue;
      ranked.push({ ...record, distance });
    }
    ranked.sort((a, b) => b.priority - a.priority || a.distance - b.distance || a.serial - b.serial);
    const selected = ranked.slice(0, RESIDENT_CORE_BUDGET.maximumInstances), allowed = new Set(selected.map(r => r.actor));
    // Return all old instances before requesting new winners, including role changes.
    for (const { actor } of actors) if (!allowed.has(actor)) actor.userData.setPresentation?.({ selectedForNear: false });
    for (const { actor } of selected) actor.userData.setPresentation?.({ selectedForNear: true });
    selectedIds = selected.map(r => r.actor.userData.harborResidentId || r.actor.userData.residentId || r.id);
    updateResidency(dt);
  }
  function evictRole(cache) {
    cache.generation++; releaseGLTF(cache.template);
    cache.template = null; cache.promise = null; cache.error = null; cache.idleSeconds = 0;
  }
  function updateResidency(dt = 0) {
    if (disposed || quality === 'low') return;
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    for (const [role, cache] of caches) {
      const used = [...instances].some(i => i.role === role) || [...actors].some(({ actor }) => {
        return actor.userData.residentCore?.role === role && actor.userData.residentCoreResidencyDemand?.();
      });
      if (used) cache.idleSeconds = 0;
      else if (cache.promise || cache.template) {
        cache.idleSeconds += elapsed;
        if (cache.idleSeconds >= Math.max(0, residencyCooldown)) evictRole(cache);
      }
    }
  }
  function setQuality(value) {
    const next = validQuality(value);
    if (next === quality || disposed) return;
    quality = next;
    if (quality === 'low') {
      generation++;
      for (const { actor } of actors) actor.userData.setPresentation?.({ ...(managed ? { selectedForNear: false } : {}), quality });
      for (const instance of [...instances]) release(instance);
      for (const cache of caches.values()) evictRole(cache);
      selectedIds = [];
    } else {
      const updateShadow = scene => scene?.traverse(object => { if (object.isMesh) object.castShadow = quality === 'high'; });
      for (const cache of caches.values()) updateShadow(cache.template?.scene);
      for (const instance of instances) updateShadow(instance.scene);
      for (const { actor } of actors) actor.userData.setPresentation?.({ quality });
    }
  }
  function dispose() {
    if (disposed) return;
    generation++;
    for (const { actor } of actors) actor.userData.setPresentation?.({ selectedForNear: false, quality: 'low' });
    disposed = true;
    for (const instance of [...instances]) release(instance);
    for (const cache of caches.values()) evictRole(cache);
    actors.clear(); selectedIds = [];
  }
  function snapshot({ includeReview = false } = {}) {
    const roles = Object.fromEntries([...caches].map(([role, c]) => [role, { loaded: !!c.template,
      pending: !!c.promise && !c.template && !c.error, requests: c.requests, error: c.error,
      instances: [...instances].filter(i => i.role === role).length, idleSeconds: c.idleSeconds, generation: c.generation }]));
    const loaded = Object.values(roles).filter(r => r.loaded).length;
    return { loaded: loaded > 0, pending: Object.values(roles).some(r => r.pending), quality, generation, requests,
      instances: instances.size, maximumInstances: 12, error: Object.values(roles).find(r => r.error)?.error || null,
      ...(includeReview ? { review: residencyReview() } : {}),
      roles, residencyCooldown, registered: actors.size, selected: [...selectedIds], managed, disposed,
      textureEstimate: { decodedRGBABytes: loaded * 30 * 1024 * 1024,
        withFullMipBytes: loaded * 40 * 1024 * 1024, measuredDriverVRAM: false } };
  }
  return { managed, ensureLoaded, acquire, release, register, updatePresentation, updateResidency, setQuality, dispose, snapshot };
}
/** Keeps the existing group/limb/LOD/attachment API. A selected licensed role
 * replaces only near presentation; gameplay and distant wardrobes stay owned
 * by the original factory and its callers. */
export function createNearResident(THREE, options = {}) {
  const requested = typeof options === 'number' ? options : options.style ?? 0;
  const settings = typeof options === 'number' ? { style: options } : options;
  const fallback = (settings.fallbackFactory || createCharacter)(THREE, { style: requested });
  const styleId = fallback.userData.style;
  const role = RESIDENT_CORE_ROLES[settings.role] ? settings.role : 'worker';
  if (!pilotStyles.has(styleId) && !settings.forceCore && !settings.role) return fallback;
  let library = settings.assetLibrary || defaults.get(THREE);
  if (!library || library.snapshot().disposed) {
    library = createResidentAssetLibrary(THREE, { quality: settings.quality });
    if (!settings.assetLibrary) defaults.set(THREE, library);
  }
  const originalDetail = fallback.userData.setDetail, originalLOD = fallback.userData.updateLOD,
    originalDispose = fallback.userData.disposeInstance;
  let selectedForNear = !library.managed;
  let selected = 0, instance = null, pending = false, disposed = false, failure = null, generation = 0;
  let quality = settings.quality || 'high', firstPerson = !!settings.firstPerson, dead = !!settings.dead;
  const handAnchors = {}, legacyProps = new Map(), explicitProps = new Map();
  const baselineChildren = Object.fromEntries(['left', 'right'].map(side => [side, new Set(fallback.userData[`${side}Elbow`]?.children || [])]));
  for (const side of ['left', 'right']) {
    const name = `${side}Hand`;
    if (fallback.userData[name]) continue;
    const anchor = new THREE.Object3D(); anchor.name = `${name} · stable attachment`;
    fallback.add(anchor); fallback.userData[name] = anchor; handAnchors[side] = anchor;
  }
  const inverseRoot = new THREE.Matrix4(), matrix = new THREE.Matrix4(), offset = new THREE.Matrix4();
  fallback.userData.residentCore = { status: 'unrequested', style: styleId, source: 'MakeHuman core CC0',
    role, prototype: `Licensed ${role} core wardrobe`, triangles: RESIDENT_CORE_ROLES[role].triangles, materials: 4, bones: 71 };
  const canRequest = () => quality !== 'low' && fallback.visible && !firstPerson && !dead && !disposed;
  const eligible = () => selectedForNear && selected === 0 && canRequest();
  function sync() {
    const active = !!instance && !instance.released && eligible();
    for (const side of ['left', 'right']) {
      const joint = fallback.userData[`${side}Elbow`], anchor = handAnchors[side];
      if (!joint || !anchor) continue;
      if (active) for (const child of [...joint.children]) {
        if (baselineChildren[side].has(child)) continue;
        child.updateMatrix(); offset.makeTranslation(0, -.27, .02).invert();
        matrix.copy(offset).multiply(child.matrix); anchor.add(child); matrix.decompose(child.position, child.quaternion, child.scale);
        legacyProps.set(child, { joint, side });
      }
      if (!active) for (const [child, record] of [...legacyProps]) {
        if (record.side !== side) continue;
        child.updateMatrix(); offset.makeTranslation(0, -.27, .02);
        matrix.copy(offset).multiply(child.matrix); record.joint.add(child); matrix.decompose(child.position, child.quaternion, child.scale);
        legacyProps.delete(child);
      }
    }
    for (const [prop, record] of explicitProps) {
      const parent = active ? handAnchors[record.side] : record.parent;
      if (!parent) continue;
      parent.add(prop);
      (active ? record.near : record.legacy).decompose(prop.position, prop.quaternion, prop.scale);
    }
    if (instance?.released) instance = null;
    if (instance && !disposed) for (const [api, bone] of Object.entries(instance.rig)) bone.rotation.copy(fallback.userData[api].rotation);
    if (instance && !disposed) instance.motion?.update(fallback, fallback.userData.residentMotion);
    // Hand props have stable anchors outside both LODs. Existing callbacks and
    // userData limb controls retain their original object identities.
    fallback.updateWorldMatrix(true, true); inverseRoot.copy(fallback.matrixWorld).invert();
    for (const [side, anchor] of Object.entries(handAnchors)) {
      const core = instance?.scene.getObjectByName(`wrist_${side === 'left' ? 'L' : 'R'}`);
      const joint = core || fallback.userData[`${side}Elbow`];
      if (!joint) continue;
      offset.makeTranslation(0, core ? -.035 : -.27, core ? .008 : .02);
      matrix.copy(inverseRoot).multiply(joint.matrixWorld).multiply(offset);
      matrix.decompose(anchor.position, anchor.quaternion, anchor.scale);
    }
  }
  function releaseNear() {
    library.release(instance); instance = null;
    if (fallback.userData.lod) fallback.userData.lod.visible = true;
  }
  function invalidate() { generation++; pending = false; failure = null; delete fallback.userData.residentCore.error; releaseNear(); }
  function present() {
    originalDetail?.(quality === 'low' ? Math.max(1, selected) : selected);
    if (instance?.released) instance = null;
    if (instance && !eligible()) releaseNear();
    if (instance) {
      instance.scene.visible = true;
      if (fallback.userData.lod) fallback.userData.lod.visible = false;
    }
    sync();
  }
  function request() {
    if (pending || instance || failure || !eligible()) return;
    if (typeof document === 'undefined' && !settings.allowHeadlessAssetLoad) { fallback.userData.residentCore.status = 'awaiting-browser'; return; }
    pending = true; const epoch = generation; fallback.userData.residentCore.status = 'loading';
    library.ensureLoaded(role).then(() => {
      if (disposed || epoch !== generation) return;
      pending = false;
      if (!eligible()) { fallback.userData.residentCore.status = 'ready'; return; }
      instance = library.acquire(role);
      if (!instance) { fallback.userData.residentCore.status = 'capacity'; return; }
      fallback.add(instance.scene); fallback.userData.residentCore.status = 'active'; present();
    }).catch(problem => {
      if (disposed || epoch !== generation) return;
      pending = false; failure = String(problem.message || problem);
      fallback.userData.residentCore.status = 'failed'; fallback.userData.residentCore.error = failure;
    });
  }
  fallback.userData.setPresentation = state => {
    if (disposed) return;
    const nextQuality = state.quality ?? quality, nextFirst = state.firstPerson ?? firstPerson, nextDead = state.dead ?? dead, nextSelected = state.selectedForNear ?? selectedForNear;
    if (nextSelected !== selectedForNear) { if (!nextSelected) invalidate(); selectedForNear = nextSelected; }
    if (nextQuality !== quality || nextFirst !== firstPerson || nextDead !== dead) {
      if (nextQuality === 'low' || quality === 'low' || nextFirst !== firstPerson || nextDead !== dead) invalidate();
      failure = null; delete fallback.userData.residentCore.error;
      quality = nextQuality; firstPerson = nextFirst; dead = nextDead;
      fallback.userData.residentCore.status = quality === 'low' ? 'disabled-low' : firstPerson ? 'hidden-first-person' : dead ? 'dead' : 'unrequested';
    }
    present(); if (eligible()) request();
  };
  fallback.userData.setDetail = tier => {
    if (disposed) return;
    const next = Math.max(0, Math.min(2, Math.floor(tier)));
    if (next !== selected && next !== 0) invalidate();
    selected = next; present(); if (eligible()) request();
  };
  fallback.userData.updateLOD = camera => {
    if (disposed) return;
    originalLOD?.(camera); fallback.updateWorldMatrix(true, false);
    const distance = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
      .distanceTo(new THREE.Vector3().setFromMatrixPosition(fallback.matrixWorld));
    fallback.userData.setDetail(distance < (instance ? 21 : 18) ? 0 : distance < 52 ? 1 : 2);
  };
  fallback.userData.disposeInstance = () => {
    if (disposed) return; invalidate(); present(); disposed = true;
    unregister();
    for (const anchor of Object.values(handAnchors)) anchor.removeFromParent();
    fallback.userData.residentCore.status = 'disposed'; originalDispose?.();
  };
  fallback.userData.residentCoreActive = () => !!instance?.scene.visible;
  fallback.userData.setResidentMotion = motion => { fallback.userData.residentMotion = { ...motion }; };
  fallback.userData.residentCoreSnapshot = () => ({ ...fallback.userData.residentCore,
    visible: !!instance?.scene.visible, selected, selectedForNear, quality, firstPerson, dead, generation, library: library.snapshot() });
  /** Only reads cached matrices from the most recent real presentation frame. */
  fallback.userData.residentCoreReview = () => {
    const point = object => object ? { x: object.matrixWorld.elements[12], y: object.matrixWorld.elements[13], z: object.matrixWorld.elements[14] } : null;
    const effectivelyVisible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return !!object; };
    const props = new Set([...legacyProps.keys(), ...explicitProps.keys()]);
    for (const side of ['left', 'right']) for (const child of fallback.userData[`${side}Elbow`]?.children || []) {
      if (!baselineChildren[side].has(child)) props.add(child);
    }
    fallback.userData.lod?.traverse(object => { if (/^Citizen (?:book|phone|cup|parcel|toolbag|camera)$/.test(object.name)) props.add(object); });
    return { role, status: fallback.userData.residentCore.status, active: !!instance?.scene.visible,
      visible: effectivelyVisible(fallback), quality, firstPerson, dead, selected, selectedForNear, generation,
      worldPosition: point(fallback), legacyLODVisible: !!fallback.userData.lod?.visible,
      coreVisible: !!instance && effectivelyVisible(instance.scene), bones: instance?.skeleton?.bones.length || 0,
      instanceSkeletonUUID: instance?.skeleton?.uuid || null, coreSceneUUID: instance?.scene.uuid || null,
      motion: instance?.motion?.snapshot() || null,
      poseBones: instance ? Object.fromEntries(['root', 'spine03', 'head', 'foot_L', 'foot_R'].map(name => {
        const bone = instance.scene.getObjectByName(name);
        return [name, bone ? { worldPosition: point(bone), quaternion: bone.quaternion.toArray() } : null];
      })) : null,
      joints: Object.fromEntries(Object.keys(joints).map(name => [name, { x: fallback.userData[name].rotation.x,
        y: fallback.userData[name].rotation.y, z: fallback.userData[name].rotation.z }])),
      hands: Object.fromEntries(['left', 'right'].map(side => [side, { anchor: point(handAnchors[side]),
        wrist: point(instance?.scene.getObjectByName(`wrist_${side === 'left' ? 'L' : 'R'}`)) }])),
      props: [...props].map(prop => ({ uuid: prop.uuid, name: prop.name, visible: prop.visible,
        effectivelyVisible: effectivelyVisible(prop), parentName: prop.parent?.name || null, position: point(prop),
        hand: Object.entries(handAnchors).find(([,anchor]) => prop.parent === anchor)?.[0] || null,
        source: explicitProps.has(prop) ? 'explicit-original-cargo' : prop.name.startsWith('Citizen ') ? 'original-citizen-prop' : 'original-post-body-attachment' })),
      matrixBasis: 'Cached matrixWorld from real presentation; this read does not update transforms' };
  };
  fallback.userData.bindResidentHandProp = (prop, { side = 'left', position = [0, -.15, .09] } = {}) => {
    if (disposed || !handAnchors[side] || !prop.parent) return () => {};
    prop.updateMatrix();
    const near = new THREE.Matrix4().compose(new THREE.Vector3(...position), prop.quaternion.clone(), prop.scale.clone());
    explicitProps.set(prop, { side, parent: prop.parent, legacy: prop.matrix.clone(), near });
    sync();
    return () => {
      const record = explicitProps.get(prop); if (!record) return;
      record.parent.add(prop); record.legacy.decompose(prop.position, prop.quaternion, prop.scale); explicitProps.delete(prop);
    };
  };
  fallback.userData.residentCoreCanRequest = canRequest;
  fallback.userData.residentCoreResidencyDemand = eligible;
  const unregister = library.register(fallback, { priority: settings.nearPriority || 0, id: settings.presentationId });
  return fallback;
}
