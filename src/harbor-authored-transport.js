/** Original transport visual candidate. Only an explicit near-use update starts I/O.
 * The original fleet Group, layout/collision references and physical service stay authoritative.
 * CPU lifecycle checks are not native art/resource/performance acceptance.
 */
import { AUTHORED_TRANSPORT_ASSETS } from './harbor-authored-transport-assets.js';
const clamp = n => Math.max(0, Math.min(1, n));
const WHEEL_NAMES = ['wheel-front--1', 'wheel-front-1', 'wheel-rear--1', 'wheel-rear-1'];
const METHOD_NAMES = ['setDoorOpenness', 'setDoorsOpen', 'setNight', 'setCabinLightingEnabled', 'setDetail', 'updateLOD', 'update', 'disposeInstance'];
const FIELD_NAMES = ['lod', 'materials', 'cabinLights', 'wheels', 'manifest'];
let controllerSerial = 0;
const freezeData = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freezeData); Object.freeze(value); }
  return value;
};
function resourceSets(gltfs) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  for (const gltf of gltfs) gltf.scene.traverse(n => {
    if (!n.isMesh) return; geometries.add(n.geometry);
    for (const m of Array.isArray(n.material) ? n.material : [n.material]) {
      materials.add(m);
      for (const v of Object.values(m)) if (v?.isTexture) {
        textures.add(v); const data = v.source?.data;
        for (const image of Array.isArray(data) ? data : [data]) if (image) images.add(image);
      }
    }
  }); return { geometries, materials, textures, images };
}
function releaseShared(gltfs, describeImage) {
  const r = resourceSets(gltfs);
  r.geometries.forEach(v => v.dispose()); r.materials.forEach(v => v.dispose()); r.textures.forEach(v => v.dispose());
  const images = [];
  r.images.forEach(v => {
    const before = describeImage(v), closeCalled = typeof v.close === 'function';
    if (closeCalled) v.close();
    images.push({ ...before, closeCalled, widthAfter: Number.isFinite(v.width) ? v.width : null, heightAfter: Number.isFinite(v.height) ? v.height : null });
  }); return images;
}
function measureModel(root) {
  let triangles = 0, drawCalls = 0, geometryBytes = 0; const seen = new Set();
  root.traverse(n => { if (!n.isMesh) return; drawCalls++; triangles += (n.geometry.index?.count ?? n.geometry.attributes.position.count) / 3;
    if (!seen.has(n.geometry)) { seen.add(n.geometry); for (const a of Object.values(n.geometry.attributes)) geometryBytes += a.array.byteLength; geometryBytes += n.geometry.index?.array.byteLength || 0; }
  }); return { triangles, drawCalls, geometryBytes };
}
async function defaultLoad({ url, sha256, signal }) {
  const response = await fetch(url, { signal }); if (!response.ok) throw new Error(`Authored transport HTTP ${response.status}: ${url}`);
  const bytes = await response.arrayBuffer();
  if (signal.aborted) throw new DOMException('Transport fetch aborted', 'AbortError');
  const actual = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  if (actual !== sha256) throw new Error(`Authored transport SHA mismatch: ${url}`);
  // Existing repository loader. No loader import, texture request or GLB download during module import.
  const { GLTFLoader } = await import('../vendor/three/addons/loaders/GLTFLoader.js');
  if (signal.aborted) throw new DOMException('Transport decode cancelled', 'AbortError');
  return new GLTFLoader().parseAsync(bytes, '');
}
function validateLayout(asset, original) {
  const { dimensions: spec, layout } = original;
  for (const key of ['width', 'length', 'height', 'halfWidth', 'halfLength', 'minY', 'maxY'])
    if (spec[key] !== asset.engineeringSpec[key]) throw new Error(`Unchanged ${asset.kind} dimension required: ${key}`);
  if (layout.kind !== asset.kind || layout.passengerRadius !== asset.engineeringSpec.passengerRadius
      || layout.deckLevels.some((v, i) => v !== asset.engineeringSpec.floors[i])) throw new Error('Unchanged original transport layout required.');
}
function bindVisual(THREE, entry, record) {
  const asset = entry.asset, original = record.original; validateLayout(asset, original);
  const group = new THREE.Group(), lod = new THREE.LOD(); group.name = `${asset.name} · authored visual candidate`;
  lod.name = `${asset.kind}-controlled-lod`; lod.autoUpdate = false; group.add(lod);
  const clones = new Map(), doorsByTier = [], wheelsByTier = [], fixtures = [], glass = [];
  let disposed = false;
  try {
    for (let tier = 0; tier < 3; tier++) {
      const source = entry.gltfs[tier].scene.getObjectByName(`${asset.kind}-detail-${tier}`);
      if (!source) throw new Error(`Missing authored ${asset.kind} LOD ${tier}`);
      const model = source.clone(true);
      model.traverse(n => { if (!n.isMesh) return;
        const sourceMaterials = Array.isArray(n.material) ? n.material : [n.material];
        const materials = sourceMaterials.map(m => {
          if (!clones.has(m)) {
            const copy = m.clone(); clones.set(m, copy);
            if (copy.name.startsWith('harbor-paint')) {
              copy.color.set(record.color); if (copy.map) { const mean = new THREE.Color(asset.coatMean); copy.color.r /= mean.r; copy.color.g /= mean.g; copy.color.b /= mean.b; }
            }
            if (copy.name === 'harbor-glass') { copy.transparent = tier < 2; copy.opacity = tier < 2 ? .26 : 1; copy.depthWrite = tier === 2; glass.push(copy); }
            if (copy.name === 'harbor-cabin-light') fixtures.push(copy);
          } return clones.get(m);
        }); n.material = Array.isArray(n.material) ? materials : materials[0];
        n.castShadow = record.quality === 'high' && !materials.some(m => m.transparent); n.receiveShadow = true;
      });
      doorsByTier.push(original.layout.doors.map(d => {
        const node = model.getObjectByName(d.id);
        if (!node || node.children.length !== 2 || node.children.some(leaf => !Number.isFinite(leaf.userData.closedZ) || !Number.isFinite(leaf.userData.slide))) throw new Error(`Invalid authored door ${d.id}`);
        return node;
      }));
      wheelsByTier.push(asset.kind === 'ferry' ? [] : WHEEL_NAMES.map(name => {
        const node = model.getObjectByName(name); if (!node) throw new Error(`Missing authored wheel ${name}`); return node;
      }));
      lod.addLevel(model, asset.distances[tier], .12);
    }
    const cabinLights = original.layout.decks.map(deck => {
      const light = new THREE.PointLight('#ffe5b3', 0, asset.kind === 'ferry' ? 13 : 7.5, 2);
      light.name = `${asset.kind}-${deck.id}-cabin-light`; light.position.set(0, deck.y + 1.43, 0); light.castShadow = false; lod.levels[0].object.add(light); return light;
    });
    let selected = 0, lighting = -1, allowed = true, cabinAllowed = true;
    const syncLights = () => cabinLights.forEach(l => { l.visible = !disposed && lighting > 0 && selected === 0 && allowed && cabinAllowed; });
    const setDoorOpenness = amount => { const v = clamp(amount); doorsByTier.flat().forEach(d => d.children.forEach(leaf => { leaf.position.z = leaf.userData.closedZ + leaf.userData.slide * v; })); group.userData.doorOpenness = v; };
    const setNight = amount => { const v = clamp(amount); if (v === lighting) return; lighting = v;
      fixtures.forEach(m => { m.emissiveIntensity = .08 + v * 1.2; }); glass.forEach(m => { m.emissiveIntensity = 0; });
      cabinLights.forEach(l => { l.intensity = v * (asset.kind === 'ferry' ? 15 : 5); }); group.userData.night = v; syncLights(); };
    const setDetail = tier => { selected = Math.max(0, Math.min(2, Math.round(tier))); lod.levels.forEach((l, i) => { l.object.visible = selected === i; }); allowed = selected === 0; syncLights(); };
    const wp = new THREE.Vector3(), cp = new THREE.Vector3();
    const updateLOD = camera => { group.updateWorldMatrix(true, false); lod.updateWorldMatrix(false, false); lod.update(camera); selected = lod.getCurrentLevel();
      allowed = group.getWorldPosition(wp).distanceTo(camera.getWorldPosition(cp)) <= (asset.kind === 'ferry' ? 26 : 18); syncLights(); };
    Object.assign(group.userData, { kind: asset.kind, dimensions: original.dimensions, layout: original.layout, collision: original.collision,
      doors: original.doors, deckLevels: original.deckLevels, stairs: original.stairs, lod, materials: [...clones.values()], cabinLights, wheels: wheelsByTier[0],
      manifest: { id: asset.id, version: 1, units: 'metres', axis: '+Z forward',
        provenance: { authoring: asset.authoring, externalAssets: [], license: 'Original creative assets CC0-1.0; source code MIT; rasterised DejaVu glyphs under included font notice', realBrands: false },
        productionStatus: 'Original authored asset candidate; native art, interaction, resource and hardware review pending', nativeValidated: false,
        lodCount: 3, tiers: entry.stats, textureBytes: asset.encodedImageBytes, textureBytesMeaning: 'Encoded embedded image bytes; not driver VRAM',
        materialSlots: clones.size, nearCabinLights: cabinLights.length, collision: original.manifest.collision,
        budget: { nearTriangles: 120000, nearDrawCalls: 48, middleTriangles: 24000, farTriangles: 8000 },
        assetSha256: asset.files.map(v => v.sha256), totalGlbBytes: asset.totalGlbBytes },
      setDoorOpenness, setDoorsOpen: open => setDoorOpenness(open ? 1 : 0), setNight, setDetail, updateLOD,
      setCabinLightingEnabled: enabled => { cabinAllowed = Boolean(enabled); syncLights(); },
      update: (deltaOrState = 0, state = {}) => { const input = typeof deltaOrState === 'object' ? deltaOrState : state;
        if (input.night !== undefined) setNight(input.night); else if (input.timeOfDay !== undefined) setNight(input.timeOfDay < 6 || input.timeOfDay >= 18 ? 1 : 0);
        if (input.doorOpenness !== undefined) setDoorOpenness(input.doorOpenness); else if (input.doorsOpen !== undefined) setDoorOpenness(input.doorsOpen ? 1 : 0);
        if (input.camera) updateLOD(input.camera);
        const distance = Number.isFinite(input.distanceTravelled) ? input.distanceTravelled : 0; wheelsByTier.flat().forEach(w => { w.rotation.x = distance / .43; });
      },
      setVisualQuality: quality => { group.traverse(n => { if (n.isMesh) n.castShadow = quality === 'high' && !(Array.isArray(n.material) ? n.material : [n.material]).some(m => m.transparent); }); },
      disposeInstance: () => { if (disposed) return; disposed = true; syncLights(); clones.forEach(m => m.dispose()); group.removeFromParent(); },
    }); setDetail(0); setDoorOpenness(record.state.doorOpenness); setNight(record.state.night); return group;
  } catch (error) { clones.forEach(m => m.dispose()); group.removeFromParent(); throw error; }
}
/** Renderer-owned controller. Existing mesh identity and all physics/save data are retained. */
export function createAuthoredTransportController(THREE, { load = defaultLoad, onError = () => {}, readRendererMemory = () => null } = {}) {
  const records = new Map(), entries = new Map(), pending = new Map(), wp = new THREE.Vector3(), cp = new THREE.Vector3(); let disposed = false;
  const controllerId = `authored-transport-${++controllerSerial}`, events = [], imageIds = new WeakMap();
  let poolGeneration = 0, instanceGeneration = 0, imageSerial = 0, eventSequence = 0, eventsDropped = 0;
  function audit(type, detail = {}) {
    const event = freezeData({ sequence: ++eventSequence, type, controllerId, utcMilliseconds: Date.now(),
      monotonicMilliseconds: typeof performance !== 'undefined' ? performance.now() : null, ...detail });
    events.push(event); if (events.length > 64) { events.shift(); eventsDropped++; }
  }
  function describeImage(image) {
    if (!imageIds.has(image)) imageIds.set(image, `${controllerId}-image-${++imageSerial}`);
    return { id: imageIds.get(image), width: Number.isFinite(image.width) ? image.width : null, height: Number.isFinite(image.height) ? image.height : null,
      actualImageBitmap: typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap, cpuPlaceholder: image.cpuPlaceholderImage === true,
      hasClose: typeof image.close === 'function' };
  }
  function describeOwnership(gltfs) {
    const r = resourceSets(gltfs); let geometryAttributeViewBytes = 0;
    for (const geometry of r.geometries) { const views = new Set();
      for (const attribute of Object.values(geometry.attributes)) views.add(attribute.array || attribute.data?.array);
      if (geometry.index) views.add(geometry.index.array); for (const view of views) geometryAttributeViewBytes += view?.byteLength || 0;
    }
    return freezeData({ geometryCount: r.geometries.size, geometryUUIDs: [...r.geometries].map(v => v.uuid),
      templateMaterialCount: r.materials.size, templateMaterialUUIDs: [...r.materials].map(v => v.uuid), textureCount: r.textures.size,
      textureUUIDs: [...r.textures].map(v => v.uuid), textureSourceUUIDs: [...new Set([...r.textures].map(v => v.source?.uuid).filter(Boolean))],
      imageCount: r.images.size, images: [...r.images].map(describeImage), geometryAttributeViewBytes,
      geometryBytesMeaning: 'CPU attribute views, not driver allocation', gpuUploadStateKnown: false });
  }
  function memoryCounters(stage, readErrors) {
    try { const value = readRendererMemory();
      if (value && Number.isInteger(value.geometries) && value.geometries >= 0 && Number.isInteger(value.textures) && value.textures >= 0)
        return { geometries: value.geometries, textures: value.textures };
      readErrors.push({ stage, message: 'Renderer memory counters unavailable or invalid' });
    } catch (error) { readErrors.push({ stage, message: String(error?.message || error) }); } return null;
  }
  function releaseTemplates(entry, gltfs, reason) {
    const owned = describeOwnership(gltfs), activeInstances = [...entry.users].filter(v => v.visual && v.entry === entry).length;
    const readErrors = [];
    // Only the two scalar counter pairs surround this single synchronous disposal.
    // No render/update, GL query, async yield or diagnostic snapshot occurs between them.
    const before = memoryCounters('before', readErrors);
    const imageRelease = releaseShared(gltfs, describeImage);
    const after = memoryCounters('after', readErrors);
    entry.resourceStats = null;
    audit('shared-released', { kind: entry.asset.kind, poolGeneration: entry.generation, reason, activeInstancesAtRelease: activeInstances,
      allAuthoredInstancesDetached: activeInstances === 0, owned, imageRelease,
      rendererRelease: { scope: 'single synchronous authored pool disposal', available: !!(before && after), readErrors, before, after,
        difference: before && after ? { geometries: before.geometries - after.geometries, textures: before.textures - after.textures } : null,
        interpretation: 'Actual counter pair only; CPU owned counts do not assert upload or city leak status' } });
  }
  function reportError(error, id) { try { onError(error, id); } catch { /* Reporting cannot suppress fallback or resource release. */ } }
  function restore(record) { for (const name of FIELD_NAMES) record.mesh.userData[name] = record.original[name]; }
  function detach(record) {
    if (record.visual) {
      record.visual.userData.disposeInstance(); record.visual = null;
      audit('instance-released', { id: record.id, kind: record.asset.kind, poolGeneration: record.entry?.generation ?? null,
        instanceGeneration: record.instanceGeneration, instanceOwned: record.instanceResourceStats });
      record.instanceResourceStats = null;
    }
    record.original.lod.visible = true; restore(record);
  }
  function closeEntry(entry) {
    if (entry.closed) return; entry.closed = true; entry.abort.abort();
    audit('pool-close-requested', { kind: entry.asset.kind, poolGeneration: entry.generation, settled: entry.settled, owned: entry.resourceStats });
    if (entry.gltfs) { releaseTemplates(entry, entry.gltfs, 'cold-last-user-or-controller'); entry.gltfs = null; }
    if (entries.get(entry.asset.kind) === entry) entries.delete(entry.asset.kind);
  }
  function cancel(record) {
    record.wanted = false; detach(record);
    if (record.entry) { const entry = record.entry; entry.users.delete(record); record.entry = null; if (!entry.users.size) closeEntry(entry); }
  }
  function attach(record, entry) {
    let visual = null;
    if (disposed || entry.closed || !record.wanted || record.disposed || record.entry !== entry || record.visual) return;
    try {
      visual = bindVisual(THREE, entry, record);
      // Prepare the complete replacement while detached. Commit one visible body synchronously.
      record.mesh.add(visual); visual.userData.update(record.state); visual.userData.setCabinLightingEnabled(record.state.cabinLighting);
      if (record.state.riding) visual.userData.setDetail(0); else if (!record.state.camera) visual.userData.setDetail(record.state.detail);
      record.visual = visual; record.failure = null; record.original.lod.visible = false;
      record.instanceGeneration = ++instanceGeneration;
      record.instanceResourceStats = freezeData({ materialCount: visual.userData.materials.length, materialUUIDs: visual.userData.materials.map(v => v.uuid),
        geometryAndTexturesOwnedByPoolGeneration: entry.generation });
      audit('instance-attached', { id: record.id, kind: record.asset.kind, poolGeneration: entry.generation,
        instanceGeneration: record.instanceGeneration, instanceOwned: record.instanceResourceStats });
      for (const name of FIELD_NAMES) record.mesh.userData[name] = visual.userData[name];
    } catch (error) { if (visual && record.visual !== visual) visual.userData.disposeInstance(); detach(record); record.failure = String(error); reportError(error, record.id); }
  }
  function request(record) {
    let entry = entries.get(record.asset.kind);
    if (!entry) {
      entry = { asset: record.asset, generation: ++poolGeneration, users: new Set(), abort: new AbortController(), closed: false, gltfs: null, failure: null, resourceStats: null, settled: false };
      entries.set(record.asset.kind, entry); pending.set(entry.generation, entry);
      audit('pool-requested', { kind: entry.asset.kind, poolGeneration: entry.generation, assetId: entry.asset.id,
        files: entry.asset.files.map(v => ({ file: v.file, sha256: v.sha256, bytes: v.bytes })) });
      entry.promise = (async () => {
        const loaded = [];
        try {
          for (const file of entry.asset.files) {
            const url = new URL(`../assets/harbor/transport/${entry.asset.kind}/${file.file}`, import.meta.url).href;
            const gltf = await load({ url, sha256: file.sha256, signal: entry.abort.signal, kind: entry.asset.kind, tier: file.tier }); loaded.push(gltf);
            entry.resourceStats = describeOwnership(loaded);
            audit('pool-lod-decoded', { kind: entry.asset.kind, poolGeneration: entry.generation, tier: file.tier, closed: entry.closed, owned: entry.resourceStats });
            if (entry.closed || entry.abort.signal.aborted) throw new DOMException('Late authored decode', 'AbortError');
          }
          entry.gltfs = loaded; entry.stats = loaded.map((g, tier) => {
            const root = g.scene.getObjectByName(`${entry.asset.kind}-detail-${tier}`); if (!root) throw new Error('Missing authored LOD root'); return measureModel(root);
          });
          audit('pool-ready', { kind: entry.asset.kind, poolGeneration: entry.generation, owned: entry.resourceStats });
          for (const user of entry.users) attach(user, entry);
        } catch (error) {
          // The whole request owns partial templates until committed; a stale decode cannot attach.
          if (entry.gltfs === loaded) entry.gltfs = null; releaseTemplates(entry, loaded, entry.closed ? 'late-after-cold-or-dispose' : 'partial-load-failure');
          if (!entry.closed) { entry.failure = String(error); audit('pool-load-failed', { kind: entry.asset.kind, poolGeneration: entry.generation, message: entry.failure }); reportError(error, entry.asset.kind); }
        } finally {
          entry.settled = true; pending.delete(entry.generation);
          audit('pool-settled', { kind: entry.asset.kind, poolGeneration: entry.generation, closed: entry.closed, failed: Boolean(entry.failure) });
        }
      })();
    }
    entry.users.add(record); record.entry = entry; record.wanted = true;
    if (entry.gltfs) attach(record, entry);
  }
  function register(mesh, { id, color }) {
    if (disposed || records.has(id)) throw new Error('Unique live fleet registration required.');
    const original = { ...mesh.userData }, asset = AUTHORED_TRANSPORT_ASSETS[original.kind];
    if (!asset) throw new Error(`No authored candidate for ${original.kind}`); validateLayout(asset, original);
    const record = { mesh, id, color, original, asset, quality: 'high', wanted: false, disposed: false, visual: null, entry: null,
      instanceGeneration: null, instanceResourceStats: null,
      state: { doorOpenness: original.doorOpenness ?? 0, night: original.night ?? 0, distanceTravelled: 0, detail: 0, cabinLighting: true, camera: null, riding: false } };
    for (const name of METHOD_NAMES) if (typeof original[name] !== 'function') throw new Error(`Missing original public API ${name}`);
    for (const name of METHOD_NAMES.filter(v => v !== 'disposeInstance')) mesh.userData[name] = (...args) => {
      if (record.disposed) return;
      if (name === 'setDoorOpenness') record.state.doorOpenness = clamp(args[0]);
      if (name === 'setDoorsOpen') record.state.doorOpenness = args[0] ? 1 : 0;
      if (name === 'setNight') record.state.night = clamp(args[0]);
      if (name === 'setCabinLightingEnabled') record.state.cabinLighting = Boolean(args[0]);
      if (name === 'setDetail') record.state.detail = args[0];
      if (name === 'updateLOD') record.state.camera = args[0];
      if (name === 'update') { const input = typeof args[0] === 'object' ? args[0] : args[1] || {};
        if (input.doorOpenness !== undefined) record.state.doorOpenness = clamp(input.doorOpenness); else if (input.doorsOpen !== undefined) record.state.doorOpenness = input.doorsOpen ? 1 : 0;
        if (input.night !== undefined) record.state.night = clamp(input.night); else if (input.timeOfDay !== undefined) record.state.night = input.timeOfDay < 6 || input.timeOfDay >= 18 ? 1 : 0;
        if (Number.isFinite(input.distanceTravelled)) record.state.distanceTravelled = input.distanceTravelled;
        if (input.camera) record.state.camera = input.camera;
      }
      original[name](...args); record.visual?.userData[name](...args);
    };
    mesh.userData.disposeInstance = () => { if (record.disposed) return; record.disposed = true; cancel(record); original.disposeInstance(); records.delete(id); };
    records.set(id, record);
  }
  function update(camera, quality = 'high', ridingId = null) {
    if (disposed) return;
    if (camera) camera.getWorldPosition(cp);
    for (const record of records.values()) {
      const riding = record.id === ridingId; record.state.riding = riding; record.state.camera = camera;
      if (record.quality !== quality) { record.quality = quality; record.visual?.userData.setVisualQuality(quality); }
      const distance = camera ? record.mesh.getWorldPosition(wp).distanceTo(cp) : Infinity;
      const allowed = (quality === 'high' || quality === 'balanced') && (riding || distance <= (record.wanted ? record.asset.releaseDistance : record.asset.loadDistance));
      if (allowed) { if (!record.wanted) request(record); if (record.visual && riding) record.visual.userData.setDetail(0); }
      else if (record.wanted) cancel(record);
    }
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const record of [...records.values()]) { cancel(record); for (const name of METHOD_NAMES) record.mesh.userData[name] = record.original[name]; }
    records.clear(); for (const entry of [...entries.values()]) closeEntry(entry); audit('controller-disposed');
  }
  function poolSnapshot(entry) { return { kind: entry.asset.kind, generation: entry.generation, assetId: entry.asset.id,
    users: entry.users.size, loaded: Boolean(entry.gltfs), failed: Boolean(entry.failure), failure: entry.failure, closed: entry.closed,
    settled: entry.settled, resourceStats: entry.resourceStats }; }
  function snapshot() {
    // Scalar/immutable-cache reads only; model/resource traversal is lifecycle-only.
    return { status: 'AUTHORED_CANDIDATE_NATIVE_PENDING', controllerId, disposed, loadSource: load === defaultLoad ? 'default-same-origin-sha256' : 'injected-loader',
      pools: [...entries.values()].map(poolSnapshot), pending: [...pending.values()].filter(entry => entries.get(entry.asset.kind) !== entry).map(poolSnapshot),
      fleet: [...records.values()].map(r => ({ id: r.id, kind: r.asset.kind, wanted: r.wanted, authored: Boolean(r.visual), quality: r.quality,
        failed: Boolean(r.failure), failure: r.failure || null, poolGeneration: r.entry?.generation ?? null, instanceGeneration: r.instanceGeneration,
        visibleLod: r.visual ? r.visual.userData.lod.levels.findIndex(l => l.object.visible) : null, instanceResourceStats: r.instanceResourceStats })),
      audit: { eventLimit: 64, lastSequence: eventSequence, eventsDropped, events: events.slice() } };
  }
  return { register, update, dispose, snapshot };
}
