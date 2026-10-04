/** Isolated art pilot: two real CC0 assets at one existing harbour workshop.
 * Collision and furnishing metadata keep world metres, and loaders are local.
 * This module never changes programmes, residents, vehicles or structural routes.
 */
export const WORKSHOP_PILOT = Object.freeze({
  buildingId: 'south-086', floorId: 'lobby', nearDistance: 24, farDistance: 32,
  assets: Object.freeze(['bench_vice_01', 'metal_tool_chest']),
  // CPU bounds of the unchanged official glTF default pose, including skin.
  chestBounds: Object.freeze({ min: [-.3694364447146654, .0008090436458587646, -.19742248207330704],
    max: [.3159519713371992, .6526446044445038, .20973077788949013] }),
});

export function planHarborWorkshopPilot(building, floor, layout) {
  if (building?.id !== WORKSHOP_PILOT.buildingId || floor?.id !== WORKSHOP_PILOT.floorId) return null;
  const room = layout.rooms.find(item => item.type === 'workshop');
  if (!room) throw new Error('south-086 pilot requires the existing workshop programme');
  const parts = layout.parts.filter(item => item.roomId === room.id);
  const top = parts.find(item => item.kind === 'workbench-top');
  const vice = parts.find(item => item.kind === 'bench-vice');
  const crate = parts.filter(item => item.kind === 'freight-crate').sort((a, b) => a.x - b.x)[0];
  if (!top || !vice || !crate) throw new Error('Workshop owner furniture is missing');
  const scale = .9, native = WORKSHOP_PILOT.chestBounds;
  const size = native.max.map((value, axis) => (value - native.min[axis]) * scale);
  if (size[0] > crate.sx || size[2] > crate.sz) throw new Error('Tool chest crosses the original crate footprint');
  const baseY = crate.y + crate.sy / 2;
  const chest = { id: 'metal_tool_chest', position: {
    x: crate.x - (native.min[0] + native.max[0]) / 2 * scale,
    y: baseY - native.min[1] * scale,
    z: crate.z - (native.min[2] + native.max[2]) / 2 * scale }, scale, rotationY: 0,
    purpose: 'Portable shared tool chest staged on the existing cargo crate for workshop repairs',
    ownerPartId: crate.id };
  const placements = [{ id: 'bench_vice_01', position: { x: vice.x, y: top.y + top.sy / 2, z: vice.z },
    scale: 1, rotationY: Math.PI / 2, purpose: 'Existing repair bench vise, jaws and handle facing the room', ownerPartId: top.id }, chest];
  const collider = { id: 'south-086:lobby:cc0-tool-chest', kind: 'interior-workshop-asset', x: crate.x, z: crate.z,
    hx: size[0] / 2, hz: size[2] / 2, minY: baseY, maxY: baseY + size[1], physics: true, camera: true };
  const chestProxy = { id: collider.id + ':fallback', kind: 'tool-chest-fallback', geometry: 'box', material: 'metal',
    roomId: room.id, x: crate.x, y: (collider.minY + collider.maxY) / 2, z: crate.z,
    sx: size[0], sy: size[1], sz: size[2] };
  return { roomId: room.id, placements, colliders: [collider], fallbackParts: [vice, chestProxy],
    replacePartIds: [vice.id], centre: { x: (vice.x + crate.x) / 2, y: floor.y, z: (vice.z + crate.z) / 2 } };
}

/** Every fetch is same-origin at runtime. Embedded JPEGs require no extra URLs. */
export async function loadWorkshopAsset(id, { signal } = {}) {
  if (!WORKSHOP_PILOT.assets.includes(id)) throw new Error('Asset is outside the two-model pilot allowlist');
  const { GLTFLoader } = await import('../vendor/three/addons/loaders/GLTFLoader.js');
  const response = await fetch(new URL(`../assets/harbor/workshop/${id}.glb`, import.meta.url), { signal });
  if (!response.ok) throw new Error(`Workshop ${id}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (signal?.aborted) throw new DOMException('Asset request aborted', 'AbortError');
  return new GLTFLoader().parseAsync(bytes, '');
}

/** Cold-load diagnostic only. Image width/height come from the real decoder,
 * not declared glTF dimensions. This never forces a render or allocates a GPU. */
function workshopResourceState(asset) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  let meshes = 0, triangles = 0, skinnedMeshes = 0;
  asset.scene.traverse(object => {
    if (!object.isMesh) return;
    meshes++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    geometries.add(object.geometry); if (object.skeleton) { skinnedMeshes++; skeletons.add(object.skeleton); }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  const images = [...textures].map(texture => { const image = texture.source?.data;
    return { width: image?.width || image?.naturalWidth || 0, height: image?.height || image?.naturalHeight || 0,
      decoderObject: image?.constructor?.name || null, closable: typeof image?.close === 'function',
      decoded: !!((image?.width || image?.naturalWidth) && (image?.height || image?.naturalHeight) && image?.complete !== false),
      colourSpace: texture.colorSpace }; });
  return { summary: { meshes, triangles, skinnedMeshes, geometries: geometries.size,
    materials: materials.size, textures: textures.size, decodedTextures: images.filter(image => image.decoded).length, images }, skeletons };
}

/** GLTFLoader may share geometry, materials and JPEG bitmap instances. Dispose
 * each once, including skin bone textures and ImageBitmap CPU allocations. */
export function disposeWorkshopAsset(asset) {
  if (!asset) return;
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set(), skeletons = new Set();
  const scenes = asset.scenes || [asset.scene || asset];
  for (const scene of scenes) scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.skeleton) skeletons.add(object.skeleton);
    for (const material of object.material ? Array.isArray(object.material) ? object.material : [object.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) {
        textures.add(value); if (value.source?.data?.close) images.add(value.source.data);
      }
    }
  });
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
  for (const image of images) image.close();
  for (const scene of scenes) scene.removeFromParent();
  return { geometries: geometries.size, materials: materials.size, textures: textures.size,
    skeletons: skeletons.size, closedImages: images.size };
}

export function createHarborWorkshopPilot(THREE, { building, floor, layout, fallbackGroup,
  loadAsset = loadWorkshopAsset, enabled = typeof document !== 'undefined', onAudit = () => {} } = {}) {
  const plan = planHarborWorkshopPilot(building, floor, layout);
  const group = new THREE.Group(); group.name = 'CC0 workshop asset pilot · south-086';
  if (fallbackGroup) group.add(fallbackGroup);
  const loaded = [], errors = []; let cachedBounds = [], cachedResources = [], cachedSkeletons = [];
  const decodedResourceCache = new WeakMap();
  let disposed = false, wanted = false, generation = 0, controller = null, pending = null;
  let status = plan ? 'fallback' : 'inapplicable', releasedAssets = 0;
  const audit = (kind, detail = {}) => onAudit({ kind, buildingId: building?.id, floorId: floor?.id,
    generation, disposed, wanted, status, loadedAssets: loaded.length, releasedAssets, ...detail });
  const release = asset => { const resourceRelease = disposeWorkshopAsset(asset); releasedAssets++;
    audit('asset-released', { assetId: asset.scene?.userData.workshopAssetId, resourceRelease }); };
  function unload() {
    generation++; controller?.abort(); controller = null;
    for (const asset of loaded.splice(0)) release(asset);
    cachedBounds = []; cachedResources = []; cachedSkeletons = [];
    if (fallbackGroup) fallbackGroup.visible = true;
    status = plan ? 'fallback' : 'inapplicable';
    audit('unloaded');
  }
  function request() {
    const ticket = ++generation; controller = new AbortController();
    const signal = controller.signal; status = 'loading'; audit('load-requested');
    pending = Promise.allSettled(plan.placements.map(placement => loadAsset(placement.id, { signal }).then(asset => {
      if (asset.scene?.userData) asset.scene.userData.workshopAssetId = placement.id;
      const decoded = asset.scene?.isObject3D ? workshopResourceState(asset) : null;
      if (decoded) decodedResourceCache.set(asset, decoded);
      audit('asset-decoded', { assetId: placement.id, requestGeneration: ticket, resources: decoded?.summary || null }); return asset;
    }))).then(results => {
      const assets = results.filter(result => result.status === 'fulfilled').map(result => result.value);
      const failure = results.find(result => result.status === 'rejected');
      if (disposed || !wanted || ticket !== generation || failure) {
        for (const asset of assets) release(asset);
        if (!disposed && wanted && ticket === generation && failure) {
          status = 'failed'; errors.push(String(failure.reason?.message || failure.reason));
          if (fallbackGroup) fallbackGroup.visible = true;
          audit('fallback', { requestGeneration: ticket, reason: errors.at(-1) });
        }
        if (disposed || ticket !== generation) audit('stale-result-released', { requestGeneration: ticket, count: assets.length });
        return;
      }
      try {
        assets.forEach((asset, index) => {
          const placement = plan.placements[index], scene = asset.scene;
          if (!scene?.isObject3D) throw new Error('A real GLTF scene is required');
          let meshes = 0;
          scene.traverse(object => {
            if (!object.isMesh) return;
            meshes++;
            for (const material of Array.isArray(object.material) ? object.material : [object.material])
              if (!material.map || !material.normalMap || !material.metalnessMap || !material.roughnessMap)
                throw new Error('Workshop PBR texture decoding did not complete');
          });
          if (meshes !== (placement.id === 'bench_vice_01' ? 4 : 7)) throw new Error('Original workshop mesh set is incomplete');
          scene.position.set(placement.position.x, placement.position.y, placement.position.z);
          scene.scale.setScalar(placement.scale); scene.rotation.y = placement.rotationY;
          scene.userData.workshopAssetId = placement.id;
          scene.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
          scene.updateMatrixWorld(true); group.add(scene);
        });
        cachedBounds = assets.map(asset => { const box = new THREE.Box3().setFromObject(asset.scene, true);
          return { id: asset.scene.userData.workshopAssetId, min: box.min.toArray(), max: box.max.toArray() }; });
        const resources = assets.map(asset => decodedResourceCache.get(asset));
        cachedResources = resources.map((item, index) => ({ assetId: plan.placements[index].id, ...item.summary }));
        cachedSkeletons = [...new Set(resources.flatMap(item => [...item.skeletons]))];
        loaded.push(...assets); status = 'ready'; if (fallbackGroup) fallbackGroup.visible = false;
        audit('ready');
      } catch (error) {
        for (const asset of assets) release(asset);
        status = 'failed'; errors.push(String(error.message));
        audit('fallback', { requestGeneration: ticket, reason: errors.at(-1) });
      }
    }).finally(() => { if (ticket === generation) { pending = null; controller = null; } });
  }
  function update(player, { active = true } = {}) {
    if (!plan || disposed) return;
    const eligible = enabled && active && player && Number.isFinite(player.x) && Number.isFinite(player.z) &&
      Math.abs((player.groundY ?? floor.y) - floor.y) < 1.8;
    const distance = eligible ? Math.hypot(player.x - plan.centre.x, player.z - plan.centre.z) : Infinity;
    const next = eligible && distance <= (wanted ? WORKSHOP_PILOT.farDistance : WORKSHOP_PILOT.nearDistance);
    if (next === wanted) return;
    wanted = next;
    if (!wanted) unload(); else request();
  }
  function snapshot() {
    return { enabled, status, wanted, assetCount: loaded.length, pending: status === 'loading', releasedAssets,
      fallbackVisible: fallbackGroup?.visible ?? null,
      bounds: cachedBounds.map(box => ({ id: box.id, min: [...box.min], max: [...box.max] })),
      resources: cachedResources.map(resource => ({ ...resource, images: resource.images.map(image => ({ ...image })) })),
      boneTextureCount: cachedSkeletons.filter(skeleton => skeleton.boneTexture).length,
      errors: [...errors], placementPlan: plan };
  }
  function dispose() { if (disposed) return; disposed = true; wanted = false; unload(); group.removeFromParent(); audit('disposed'); }
  return { group, plan, colliders: plan?.colliders || [], update, snapshot, dispose,
    whenSettled: () => pending || Promise.resolve() };
}
