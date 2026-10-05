/** Same-origin assets for one authored home; independent floor owner and
 * three distance tiers. Resource audit reports actual decoder information. */
import {AUTHORED_HOME, HOME_MODELS} from './harbor-home-authored.js';
import {disposeWorkshopAsset} from './harbor-workshop-pilot.js';
export async function loadHomeAsset(id,{signal}={}) {
  if(!Object.hasOwn(HOME_MODELS,id))throw new Error('Home asset is outside the four-model allowlist');
  const {GLTFLoader}=await import('../vendor/three/addons/loaders/GLTFLoader.js');
  const response=await fetch(new URL(`../assets/harbor/home/${id}.glb`,import.meta.url),{signal});
  if(!response.ok)throw new Error(`Home ${id}: HTTP ${response.status}`);
  const bytes=await response.arrayBuffer();if(signal?.aborted)throw new DOMException('Asset request aborted','AbortError');
  return new GLTFLoader().parseAsync(bytes,'');
}
function homeResourceState(asset) {
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

export function createHarborHomeAssets(THREE, { building, floor, layout, fallbackGroup,
  loadAsset = loadHomeAsset, enabled = typeof document !== 'undefined', onAudit = () => {},
  readRendererMemory = () => null } = {}) {
  const plan = layout?.homeAuthored || null;
  const group = new THREE.Group(); group.name = 'Authored two-floor home · south-079';
  if (fallbackGroup) group.add(fallbackGroup);
  const loaded = [], errors = []; let cachedBounds = [], cachedResources = [], cachedSkeletons = [];
  const decodedResourceCache = new WeakMap();
  let disposed = false, wanted = false, generation = 0, controller = null, pending = null;
  let status = plan ? 'fallback' : 'inapplicable', releasedAssets = 0;
  let lodTier = 2, nearestViewDistance = Infinity;
  const applyLod = () => {
    if(!plan?.authored){for(const asset of loaded)asset.scene.visible=true;if(fallbackGroup)fallbackGroup.visible=status!=='ready';return;}
    for (const asset of loaded) {
      const fittings = HOME_MODELS[asset.scene.userData.homeAssetId]?.original;
      asset.scene.visible = fittings || lodTier < 2;
      if (fittings) {
        for (const [name,visible] of [['core',lodTier<2],['near',lodTier===0],['far',lodTier===2]]) {
          const node=asset.scene.getObjectByName(`home-tier-${name}`); if(node)node.visible=visible;
        }
      }
    }
    if(fallbackGroup){fallbackGroup.visible=status!=='ready';for(const part of fallbackGroup.children)part.visible=true;}
  };
  const audit = (kind, detail = {}) => onAudit({ kind, buildingId: building?.id, floorId: floor?.id,
    generation, disposed, wanted, status, loadedAssets: loaded.length, releasedAssets, ...detail });
  // Read exactly two scalar counter pairs in this synchronous release. No
  // render/update, GL call, async yield or snapshot occurs between the reads.
  // Unattached decoded assets may correctly report zero GPU objects released.
  const memoryCounters = (stage, readErrors) => {
    try {
      const value = readRendererMemory();
      if (value && Number.isInteger(value.geometries) && value.geometries >= 0 &&
        Number.isInteger(value.textures) && value.textures >= 0)
        return { geometries: value.geometries, textures: value.textures };
      readErrors.push({ stage, message: 'Renderer memory counters unavailable or invalid' });
    } catch (error) {
      readErrors.push({ stage, message: String(error?.message || error) });
    }
    return null;
  };
  const release = asset => {
    const attachedAtRelease = asset.scene?.parent === group;
    const readErrors = [];
    const before = memoryCounters('before', readErrors);
    const resourceRelease = disposeWorkshopAsset(asset);
    const after = memoryCounters('after', readErrors);
    const rendererRelease = { scope: 'single synchronous asset disposal', attachedAtRelease,
      available: !!(before && after), readErrors, before, after,
      difference: before && after ? { geometries: before.geometries - after.geometries,
        textures: before.textures - after.textures } : null };
    releasedAssets++;
    audit('asset-released', { assetId: asset.scene?.userData.homeAssetId, resourceRelease, rendererRelease });
  };
  function unload() {
    generation++; controller?.abort(); controller = null;
    for (const asset of loaded.splice(0)) release(asset);
    cachedBounds = []; cachedResources = []; cachedSkeletons = [];
    if (fallbackGroup) fallbackGroup.visible = true;
    status = plan ? 'fallback' : 'inapplicable';
    applyLod();
    audit('unloaded');
  }
  function request() {
    const ticket = ++generation; controller = new AbortController();
    const signal = controller.signal; status = 'loading'; audit('load-requested');
    pending = Promise.allSettled(plan.placements.map(placement => loadAsset(placement.id, { signal }).then(asset => {
      if (asset.scene?.userData) asset.scene.userData.homeAssetId = placement.id;
      const decoded = asset.scene?.isObject3D ? homeResourceState(asset) : null;
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
          applyLod();
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
              if (HOME_MODELS[placement.id].textured && (!material.map || !material.normalMap || !material.metalnessMap || !material.roughnessMap))
                throw new Error('Home PBR texture decoding did not complete');
          });
          if (meshes !== HOME_MODELS[placement.id].meshes) throw new Error('Authored home mesh set is incomplete');
          scene.position.set(placement.position.x, placement.position.y, placement.position.z);
          scene.scale.setScalar(placement.scale); scene.rotation.y = placement.rotationY;
          scene.userData.homeAssetId = placement.id;
          scene.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
          scene.updateMatrixWorld(true); group.add(scene);
        });
        cachedBounds = assets.map(asset => { const box = new THREE.Box3().setFromObject(asset.scene, true);
          return { id: asset.scene.userData.homeAssetId, min: box.min.toArray(), max: box.max.toArray() }; });
        const resources = assets.map(asset => decodedResourceCache.get(asset));
        cachedResources = resources.map((item, index) => ({ assetId: plan.placements[index].id, ...item.summary,
          instanceCount:plan.placements[index].instances?.length||1,
          visibleSourceMeshes:item.summary.meshes*(plan.placements[index].instances?.length||1),
          visibleSourceTriangles:item.summary.triangles*(plan.placements[index].instances?.length||1) }));
        cachedSkeletons = [...new Set(resources.flatMap(item => [...item.skeletons]))];
        loaded.push(...assets); status = 'ready'; applyLod();
        audit('ready');
      } catch (error) {
        for (const asset of assets) release(asset);
        status = 'failed'; errors.push(String(error.message));
        applyLod();
        audit('fallback', { requestGeneration: ticket, reason: errors.at(-1) });
      }
    }).finally(() => { if (ticket === generation) { pending = null; controller = null; } });
  }
  function update(player, { active = true } = {}) {
    if (!plan || disposed) return;
    const eligible = enabled && active && player && Number.isFinite(player.x) && Number.isFinite(player.z) &&
      Math.abs((player.groundY ?? floor.y) - floor.y) < 1.8;
    const distance = eligible ? Math.hypot(player.x - plan.centre.x, player.z - plan.centre.z) : Infinity;
    nearestViewDistance = eligible ? Math.min(...(plan.viewCentres || [plan.centre]).map(p=>Math.hypot(player.x-p.x,player.z-p.z))) : Infinity;
    if(plan.authored){const {near,middle,hysteresis}=plan.lod;
      if(lodTier===0&&nearestViewDistance>near+hysteresis)lodTier=nearestViewDistance>middle+hysteresis?2:1;
      else if(lodTier===1){if(nearestViewDistance<near-hysteresis)lodTier=0;else if(nearestViewDistance>middle+hysteresis)lodTier=2;}
      else if(lodTier===2&&nearestViewDistance<middle-hysteresis)lodTier=nearestViewDistance<near-hysteresis?0:1;
      applyLod();}
    const next = eligible && distance <= (wanted ? AUTHORED_HOME.farDistance : AUTHORED_HOME.nearDistance);
    if (next === wanted) return;
    wanted = next;
    if (!wanted) unload(); else request();
  }
  function snapshot() {
    return { enabled, status, wanted, assetCount: loaded.length, pending: status === 'loading', releasedAssets,
      fallbackVisible: fallbackGroup?.visible ?? null,
      authored: !!plan?.authored, lodTier, nearestViewDistance,
      bounds: cachedBounds.map(box => ({ id: box.id, min: [...box.min], max: [...box.max] })),
      resources: cachedResources.map(resource => ({ ...resource, images: resource.images.map(image => ({ ...image })) })),
      boneTextureCount: cachedSkeletons.filter(skeleton => skeleton.boneTexture).length,
      errors: [...errors], placementPlan: plan };
  }
  function dispose() { if (disposed) return; disposed = true; wanted = false; unload(); group.removeFromParent(); audit('disposed'); }
  return { group, plan, colliders: plan?.colliders || [], update, snapshot, dispose,
    whenSettled: () => pending || Promise.resolve() };
}
