import { CHARACTER_STYLES } from './models.js';
import { createNearResident as createCharacter, createResidentAssetLibrary } from './resident-core-assets.js';

/** Presentation only: no elapsed world time or economic mutation lives here.
 * Twenty logical residents share a bounded set of cached wardrobe instances. */
export function createHarborLifeRenderer(THREE, scene, life, { groundHeightAt = () => .18, quality: initialQuality = 'high', assetLibrary, characterFactory = createCharacter } = {}) {
  const root = new THREE.Group(); root.name = 'Harbor daily life · actual residents and stock'; scene.add(root);
  let quality = initialQuality;
  const residentAssets = assetLibrary || createResidentAssetLibrary(THREE, { quality });
  const ownsResidentAssets = !assetLibrary;
  const models = new Map(), pool = [], labels = [], materials = [], geometries = [];
  const proxyGeometry = new THREE.BoxGeometry(.48, 1.6, .34); geometries.push(proxyGeometry);
  const proxyMaterial = new THREE.MeshStandardMaterial({ color: '#a69d87', roughness: .93 }); materials.push(proxyMaterial);
  const proxies = new THREE.InstancedMesh(proxyGeometry, proxyMaterial, life.agents.length); proxies.count = 0; proxies.frustumCulled = false;
  proxies.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(proxies);
  const marker = new THREE.Object3D(), crateGeometry = new THREE.BoxGeometry(.58, .38, .44); geometries.push(crateGeometry);
  const crateMaterial = new THREE.MeshStandardMaterial({ color: '#8b7857', roughness: .87 }); materials.push(crateMaterial);
  const supplyCrates = new THREE.InstancedMesh(crateGeometry, crateMaterial, 12); supplyCrates.count = 0; root.add(supplyCrates);
  const shopCrates = new THREE.InstancedMesh(crateGeometry, crateMaterial, 12); shopCrates.count = 0; root.add(shopCrates);
  let lastRevision = -1, disposed = false, lastInterior = null, presentationTime = 0;
  const role = a => a.index < 6 ? 'shopkeeper' : a.index < 12 ? 'worker' : 'commuter';
  const style = a => a.index < 6 ? 7 : a.index < 12 ? 0 : 1 + a.index % 6;
  function release(id) {
    const model = models.get(id); if (!model) return;
    model.visible = false; model.userData.setDetail?.(2);
    model.removeFromParent(); models.delete(id);
    if (pool.length < 12) pool.push(model); else model.userData.disposeInstance?.();
  }
  function acquire(agent) {
    const requested = style(agent), styleId = CHARACTER_STYLES[requested].id;
    const index = pool.findIndex(m => m.userData.style === styleId && m.userData.residentCore?.role === role(agent));
    if (index < 0 && models.size + pool.length >= 12 && pool.length) pool.pop().userData.disposeInstance?.();
    const model = index >= 0 ? pool.splice(index, 1)[0] : characterFactory(THREE, { style: requested, role: role(agent), quality, assetLibrary: residentAssets, presentationId: agent.id });
    model.name = `${agent.name} · ${agent.role}`; model.userData.harborResidentId = agent.id; model.visible = true;
    if (!model.userData.harborCargo) {
      const cargo = new THREE.Mesh(crateGeometry, crateMaterial); cargo.position.set(0, .95, .43); cargo.scale.set(.8, .9, .85); cargo.name = 'Actual delivery cargo'; model.add(cargo); model.userData.harborCargo = cargo;
      model.userData.bindResidentHandProp?.(cargo, { side: 'left', position: [0, -.15, .09] });
    }
    root.add(model); models.set(agent.id, model); return model;
  }
  function labelAt(anchor, offset, text) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const geometry = new THREE.PlaneGeometry(2.6, .65), mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(anchor.x + offset.x, anchor.y + 1.75, anchor.z + offset.z); mesh.rotation.y = offset.yaw;
    mesh.name = 'Live inventory ledger · on resource changes'; root.add(mesh);
    const item = { canvas, ctx, texture, material, geometry, mesh, text: '' }; labels.push(item);
    drawLabel(item, text); return item;
  }
  function drawLabel(item, text) {
    if (!item || item.text === text) return;
    item.text = text; const ctx = item.ctx; ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(27, 42, 37, .94)'; ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = '#c4b58f'; ctx.lineWidth = 3; ctx.strokeRect(5, 5, 502, 118);
    ctx.fillStyle = '#e9dfc5'; ctx.font = '500 29px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = text.split('\n'); lines.forEach((line, i) => ctx.fillText(line, 256, 40 + i * 48)); item.texture.needsUpdate = true;
  }
  // Public aprons remain clear: these are narrow stock stacks beside a facade,
  // not an extra counter in the entrance or the surrounding pavement lane.
  const supplyLabel = labelAt(life.supply.anchor, { x: -3.5, z: -1.7, yaw: 0 }, '');
  const shopLabels = life.shops.map(s => labelAt(s.displayAnchor || s.anchor, s.frontage === 'east' ? { x: -1.4, z: -4.55, yaw: Math.PI / 2 } : { x: -4.55, z: -1.4, yaw: 0 }, ''));
  function stock(viewer) {
    let count = 0;
    const supply = life.supply;
    if (Math.hypot(viewer.x - supply.anchor.x, viewer.z - supply.anchor.z) < 170) {
      // One visible crate represents 24 depot portions, rounded up. The exact
      // count is always printed; inventory is never inferred from decoration.
      const portions = Object.values(supply.stock).reduce((a, b) => a + b, 0), crates = Math.min(12, Math.ceil(portions / 24));
      for (let i = 0; i < crates; i++) { marker.position.set(supply.anchor.x - 3.5 + (i % 3) * .64, supply.anchor.y + .21 + Math.floor(i / 6) * .40, supply.anchor.z - 2 + Math.floor(i % 6 / 3) * .5); marker.rotation.set(0, 0, 0); marker.updateMatrix(); supplyCrates.setMatrixAt(count++, marker.matrix); }
    }
    supplyCrates.count = count; supplyCrates.instanceMatrix.needsUpdate = true; count = 0;
    life.shops.forEach((s, index) => {
      const display = s.displayAnchor || s.anchor;
      const close = Math.hypot(viewer.x - s.anchor.x, viewer.z - s.anchor.z) < 170;
      if (close) for (let i = 0; i < Math.min(4, Math.ceil(s.stock / 4)); i++) {
        marker.position.set(display.x - (s.frontage === 'east' ? 1.1 : 4.6) + (s.frontage === 'east' ? 0 : (i % 2) * .64), s.anchor.y + .21 + Math.floor(i / 2) * .4,
          display.z - (s.frontage === 'east' ? 4.55 : 1.1) + (s.frontage === 'east' ? (i % 2) * .5 : 0));
        marker.rotation.set(0, 0, 0); marker.updateMatrix(); shopCrates.setMatrixAt(count++, marker.matrix);
      }
      if (shopLabels[index]) shopLabels[index].mesh.visible = close && !lastInterior;
    });
    shopCrates.count = count; shopCrates.instanceMatrix.needsUpdate = true;
    if (supplyLabel) supplyLabel.mesh.visible = Math.hypot(viewer.x - supply.anchor.x, viewer.z - supply.anchor.z) < 170 && !lastInterior;
    supplyCrates.visible = shopCrates.visible = !lastInterior;
    const statuses = life.shopStatuses;
    const stamp = `${life.revision}:${statuses.map(s => `${s.open}/${s.staff}`).join(',')}`;
    if (lastRevision !== stamp) {
      drawLabel(supplyLabel, `${supply.name} · 现有 ${Object.values(supply.stock).reduce((a, b) => a + b, 0)} 份\n补货单 ${life.availableJobs.length} · 柜台领货`);
      statuses.forEach((s, i) => drawLabel(shopLabels[i], `${s.productName} $${s.price} · 现货 ${s.stock}\n已售 ${s.sold} · ${s.open && s.staff ? '营业中' : '等店员到岗'}`));
      lastRevision = stamp;
    }
  }
  function update(view = {}, dt = 0) {
    if (disposed) return;
    presentationTime += Math.max(0, Math.min(.3, dt));
    const viewer = view.viewerPosition || view.position || view, interior = view.interior?.buildingId || view.buildingId || null;
    if (!Number.isFinite(viewer.x) || !Number.isFinite(viewer.z)) return;
    lastInterior = interior;
    const visible = life.agents.filter(a => interior ? a.insideBuildingId === interior &&
      (!view.interior?.floorId || a.floorId === view.interior.floorId) &&
      (!(life.residentLoop?.owns(a) || life.roleRoutines?.owns(a)) || a.roomId === (view.interior?.currentRoomId || null)) : !a.insideBuildingId);
    const ranked = visible.map(a => ({ agent: a, distance: Math.hypot(a.x - viewer.x, (a.y || 0) - (viewer.y || 0), a.z - viewer.z) })).sort((a, b) => a.distance - b.distance || a.agent.index - b.agent.index);
    const near = ranked.filter(item => item.distance <= (models.has(item.agent.id) ? 145 : 125)).slice(0, 12), active = new Set(near.map(item => item.agent.id));
    for (const id of [...models.keys()]) if (!active.has(id)) release(id);
    for (const { agent: a, distance } of near) {
      const model = models.get(a.id) || acquire(a), walking = ['walking', 'boarding', 'alighting', 'entering-home', 'leaving-home'].includes(a.phase);
      model.userData.setResidentMotion?.({ time: presentationTime, walking, activity: a.phase, groundY: Number.isFinite(a.y) ? a.y : groundHeightAt(a.x, a.z) });
      const swing = walking ? Math.sin(a.gait) * .42 : 0, joints = model.userData;
      joints.leftLeg.rotation.x = swing; joints.rightLeg.rotation.x = -swing;
      joints.leftKnee.rotation.x = Math.max(0, swing) * .9; joints.rightKnee.rotation.x = Math.max(0, -swing) * .9;
      joints.leftArm.rotation.x = -swing * .65; joints.rightArm.rotation.x = swing * .65;
      joints.leftElbow.rotation.x = a.cargoJobId ? -1 : -.12; joints.rightElbow.rotation.x = a.phase === 'working' ? -.5 : -.12;
      if (life.residentLoop?.owns(a) && life.residentLoop.state.stage === 'working') {
        const motion = Math.sin((life.residentLoop.state.activeJob?.validTicks || 0) * .38);
        joints.leftArm.rotation.x = -.48; joints.leftElbow.rotation.x = -.72;
        joints.rightArm.rotation.x = -.78 + motion * .09; joints.rightElbow.rotation.x = -.8 + motion * .16;
      }
      const routine = life.roleRoutines?.owns(a) && life.roleRoutines.role(a.id);
      if (routine && ['working-counter', 'loading', 'unloading'].includes(routine.stage)) {
        const motion = Math.sin((routine.stage === 'working-counter' ? routine.workTicks : routine.serviceTicks) * .3);
        joints.leftArm.rotation.x = -.5 + motion * .08; joints.leftElbow.rotation.x = -.7;
        joints.rightArm.rotation.x = -.6 - motion * .08; joints.rightElbow.rotation.x = -.8;
      }
      model.position.set(a.x, Number.isFinite(a.y) ? a.y : groundHeightAt(a.x, a.z), a.z); model.rotation.y = a.yaw;
      model.userData.harborCargo.visible = !!a.cargoJobId;
      model.userData.setDetail(distance < (model.userData.residentCoreActive?.() ? 21 : 18) ? 0 : distance < 52 ? 1 : 2);
    }
    let count = 0;
    for (const { agent: a, distance } of ranked) if (!active.has(a.id) && distance <= 320) {
      marker.position.set(a.x, a.y + .8, a.z); marker.rotation.set(0, a.yaw, 0); marker.updateMatrix(); proxies.setMatrixAt(count++, marker.matrix);
    }
    proxies.count = count; proxies.instanceMatrix.needsUpdate = true; stock(viewer);
    if (ownsResidentAssets) residentAssets.updateResidency(dt);
  }
  function snapshot() {
    const cores = [...models.entries()].filter(([, model]) => model.userData.residentCore)
      .map(([id, model]) => ({ id, ...model.userData.residentCoreSnapshot() }));
    return { detailed: models.size, pooled: pool.length, distant: proxies.count, maximumDetailed: 12,
      logical: life.agents.length, supplyCrates: supplyCrates.count, shopCrates: shopCrates.count,
      quality, nearAssetLibrary: residentAssets.snapshot(),
      residentCore: { prototype: 'Three CC0 core roles; shared city near cap', nearDistance: 18, maximumInstances: 12,
        active: cores.filter(core => core.visible).length, states: cores } };
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const model of [...models.values(), ...pool]) model.userData.disposeInstance?.();
    if (ownsResidentAssets) residentAssets.dispose();
    models.clear(); pool.length = 0; root.removeFromParent(); root.clear(); proxies.dispose(); supplyCrates.dispose(); shopCrates.dispose();
    for (const item of labels) { item.texture.dispose(); item.material.dispose(); item.geometry.dispose(); }
    for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose();
  }
  function setQuality(value) {
    quality = ['high', 'balanced', 'low'].includes(value) ? value : 'high';
    residentAssets.setQuality(quality);
    for (const model of [...models.values(), ...pool]) model.userData.setPresentation?.({ quality });
  }
  return { root, update, setQuality, snapshot, dispose };
}
