import { HarborTransitService, HARBOR_PIER_SEGMENTS } from './harbor-transit.js';
import { createHarborVehicle } from './harbor-vehicle-models.js';

/** Five live vehicles, ordinary curb stops and two walkable shore piers. */
export function createHarborTransitSystem(THREE, scene, options = {}) {
  const service = new HarborTransitService(options), root = new THREE.Group();
  root.name = 'Harbor sample · street bus, at-grade tram and ferry'; scene.add(root);
  const fleet = new Map(), resources = new Set(), labels = [], pendingStatic = [], staticBatches = [], staticParts = new Map();
  const palette = {};
  for (const [key, color] of Object.entries({ steel: '#7e8985', cream: '#e8debf', wood: '#ac936c', rail: '#9da69e', wire: '#74634e', bus: '#356b68', tram: '#ad684b', ferry: '#405b56', dark: '#2e4243' })) {
    palette[key] = new THREE.MeshStandardMaterial({ color, roughness: key === 'rail' ? .4 : .78, metalness: key === 'rail' || key === 'steel' ? .65 : .08 }); resources.add(palette[key]);
  }
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1); resources.add(boxGeometry);
  function box(name, material, x, y, z, width, height, depth, yaw = 0, zone = 'street') {
    const mesh = new THREE.Mesh(boxGeometry, palette[material]); mesh.name = name; mesh.position.set(x, y, z); mesh.scale.set(width, height, depth); mesh.rotation.y = yaw;
    mesh.castShadow = height > .1; mesh.receiveShadow = true; root.add(mesh);
    if (zone) pendingStatic.push({ mesh, material, zone }); return mesh;
  }
  function sign(stop) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 192;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
    const geometry = new THREE.PlaneGeometry(2.75, 1.03), mesh = new THREE.Mesh(geometry, material);
    const portal = stop.portal, outward = { x: stop.board.x - portal.x, z: stop.board.z - portal.z }, length = Math.hypot(outward.x, outward.z) || 1;
    mesh.position.set(stop.board.x + outward.x / length * 1.0, stop.board.y + 2.85, stop.board.z + outward.z / length * 1.0);
    mesh.rotation.y = stop.berth.yaw + Math.PI / 2; mesh.name = `${stop.id}-real-stop-sign`; root.add(mesh);
    resources.add(texture); resources.add(material); resources.add(geometry); labels.push({ stop, canvas, texture, last: '' });
  }
  for (const stop of service.stops) {
    const zone = stop.kind === 'ferry' ? stop.id.endsWith('north') ? 'north-pier' : 'south-pier' : 'street';
    const outward = { x: stop.board.x - stop.portal.x, z: stop.board.z - stop.portal.z }, length = Math.hypot(outward.x, outward.z) || 1;
    const px = stop.kind === 'ferry' ? stop.board.x + 2.2 : stop.board.x + outward.x / length * 1.9;
    const pz = stop.board.z + outward.z / length * 1.9;
    box(`${stop.id}-pole`, 'steel', px, stop.board.y + 1.6, pz, .11, 3.2, .11, 0, zone);
    box(`${stop.id}-route-plate`, stop.kind, px, stop.board.y + 2.55, pz, .5, .64, .09, stop.berth.yaw, zone);
    service.colliders.push({ id: `${stop.id}-pole`, kind: 'harbor-stop', x: px, z: pz, hx: .055, hz: .055, minY: stop.board.y, maxY: stop.board.y + 3.2, physics: true, camera: true });
    // Low footprint markings are visible in normal third-person play without
    // adding an artificial platform in the street tram's roadway.
    if (stop.kind !== 'ferry') box(`${stop.id}-boarding-marker`, stop.kind, stop.board.x, stop.board.y + .016, stop.board.z, .10, .018, 2.3, stop.berth.yaw);
    sign(stop);
  }
  const tram = service.route('harbor-tram'), rails = [];
  for (let i = 0; i < tram.path.length; i++) {
    const a = tram.path[i], b = tram.path[(i + 1) % tram.path.length], length = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z);
    if (length < .001) continue;
    for (const side of [-1, 1]) rails.push({ x: (a.x + b.x) / 2 + Math.cos(yaw) * side * .72,
      z: (a.z + b.z) / 2 - Math.sin(yaw) * side * .72, yaw, length });
  }
  const railMesh = new THREE.InstancedMesh(boxGeometry, palette.rail, rails.length), dummy = new THREE.Object3D();
  railMesh.name = 'Lantern street tram · flush road rails';
  rails.forEach((r, i) => { dummy.position.set(r.x, .017, r.z); dummy.rotation.set(0, r.yaw, 0); dummy.scale.set(.062, .03, r.length + .016); dummy.updateMatrix(); railMesh.setMatrixAt(i, dummy.matrix); });
  railMesh.instanceMatrix.needsUpdate = true; railMesh.computeBoundingBox(); railMesh.computeBoundingSphere(); root.add(railMesh);
  resources.add(railMesh);
  // The visible diamond collector actually meets a contact wire. This is
  // ordinary road-height track, with a small bounded set of roadside supports.
  const wireSegments = rails.filter((_, index) => index % 2 === 0).map(r => ({ ...r,
    x: r.x + Math.cos(r.yaw) * .72, z: r.z - Math.sin(r.yaw) * .72 }));
  const wireMesh = new THREE.InstancedMesh(boxGeometry, palette.wire, wireSegments.length);
  wireMesh.name = 'Lantern tram · overhead contact wire at collector height';
  wireSegments.forEach((r, i) => { dummy.position.set(r.x, 4.68, r.z); dummy.rotation.set(0, r.yaw, 0); dummy.scale.set(.024, .024, r.length + .016); dummy.updateMatrix(); wireMesh.setMatrixAt(i, dummy.matrix); });
  wireMesh.instanceMatrix.needsUpdate = true; wireMesh.computeBoundingBox(); wireMesh.computeBoundingSphere(); root.add(wireMesh);
  resources.add(wireMesh);
  for (const z of [-204, -124, -4, 76, 136]) {
    const x = 256.4, ground = options.groundHeightAt?.(x, z) || 0;
    box(`tram-wire-pole-${z}`, 'steel', x, ground + 2.7, z, .13, 5.4, .13);
    box(`tram-wire-crossarm-${z}`, 'steel', 244.2, 5.23, z, 24.5, .09, .09);
    for (const trackX of [232, 248]) box(`tram-wire-dropper-${trackX}-${z}`, 'steel', trackX, 4.94, z, .024, .52, .024);
    service.colliders.push({ id: `tram-wire-pole-${z}`, kind: 'street-tram-pole', x, z, hx: .065, hz: .065, minY: ground, maxY: ground + 5.4, physics: true, camera: true });
  }
  for (const north of [false, true]) {
    const id = north ? 'north' : 'south', zone = `${id}-pier`, start = north ? -400 : -280, end = north ? -379.7 : -304.8;
    for (const [index, segment] of HARBOR_PIER_SEGMENTS.filter(s => s.bank === id).entries()) {
      const delta = segment.endZ - segment.startZ, rise = segment.toY - segment.fromY, angle = -Math.atan(rise / delta);
      const ramp = box(`harbor-${id}-pier-support-${index}`, 'wood', 220, (segment.fromY + segment.toY) / 2 - .055 / Math.cos(angle),
        (segment.startZ + segment.endZ) / 2, 6.6, .11, Math.hypot(delta, rise), 0, zone); ramp.rotation.x = angle;
      for (const side of [-1, 1]) {
        const rail = box(`harbor-${id}-pier-rail-${side}-${index}`, 'steel', 220 + side * 3.35,
          (segment.fromY + segment.toY) / 2 + .9, (segment.startZ + segment.endZ) / 2, .08, .08, Math.hypot(delta, rise), 0, zone); rail.rotation.x = angle;
      }
    }
    for (const side of [-1, 1]) {
      const x = 220 + side * 3.35, middle = (start + end) / 2;
      for (let z = Math.min(start, end) + 1; z < Math.max(start, end); z += 3) {
        const y = service.groundHeightAt(220, z) || 0;
        box(`harbor-${id}-pier-post-${side}-${z}`, 'steel', x, y + .45, z, .08, .9, .08, 0, zone);
      }
      service.colliders.push({ id: `harbor-${id}-pier-edge-${side}`, kind: 'pier-rail', x, z: middle, hx: .055, hz: Math.abs(end - start) / 2,
        minY: -.1, maxY: north ? 3.05 : 2.25, physics: true, camera: true });
    }
    box(`harbor-${id}-pier-berth-line`, 'cream', 220, 1.318, end, 2.0, .02, .16, 0, zone);
  }
  const gangways = new Map();
  for (const stop of service.stops.filter(s => s.kind === 'ferry')) {
    const center = { x: (stop.board.x + stop.portal.x) / 2, z: (stop.board.z + stop.portal.z) / 2 }, length = Math.hypot(stop.board.x - stop.portal.x, stop.board.z - stop.portal.z);
    const mesh = box(`${stop.id}-open-gangway`, 'cream', center.x, 1.265, center.z, 1.5, .07, length + .5,
      Math.atan2(stop.portal.x - stop.board.x, stop.portal.z - stop.board.z), null); mesh.visible = false; gangways.set(stop.id, mesh);
  }
  // Collect final authored matrices after the piers have received their slope
  // rotations. Independent banks keep their own frustum and shadow bounds.
  const batches = new Map();
  for (const part of pendingStatic) {
    const key = `${part.zone}:${part.material}:${part.mesh.castShadow}:${part.mesh.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, []); batches.get(key).push(part);
  }
  for (const [key, parts] of batches) {
    const { zone, material, mesh: first } = parts[0], batch = new THREE.InstancedMesh(boxGeometry, first.material, parts.length);
    batch.name = `Harbor static · ${key}`; batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow;
    batch.userData.harborStaticBatch = { zone, material }; batch.userData.parts = [];
    parts.forEach(({ mesh }, instanceId) => {
      mesh.updateMatrix(); batch.setMatrixAt(instanceId, mesh.matrix);
      const record = Object.freeze({ name: mesh.name, zone, material, batchName: batch.name, instanceId,
        castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow,
        matrix: Object.freeze(Array.from(new Float32Array(mesh.matrix.elements))) });
      batch.userData.parts.push(record); staticParts.set(record.name, record); root.remove(mesh);
    });
    batch.instanceMatrix.needsUpdate = true; batch.computeBoundingBox(); batch.computeBoundingSphere();
    root.add(batch); staticBatches.push(batch); resources.add(batch);
  }
  pendingStatic.length = 0;
  for (const vehicle of service.vehicles) {
    const mesh = createHarborVehicle(THREE, vehicle.kind, { color: service.route(vehicle.routeId).color });
    mesh.name = `${vehicle.id} · ${mesh.name}`; mesh.userData.vehicleId = vehicle.id; root.add(mesh); fleet.set(vehicle.id, mesh);
  }
  function render(camera = null, hour = 12) {
    for (const v of service.vehicles) {
      const mesh = fleet.get(v.id); mesh.position.set(v.pose.x, v.pose.y, v.pose.z); mesh.rotation.y = v.pose.yaw;
      mesh.userData.update({ doorsOpen: v.pose.doorsOpen, distanceTravelled: v.distanceTravelled, timeOfDay: hour, camera });
      if (v.id === service.ridingVehicleId) mesh.userData.setDetail(0);
      else if (!camera) mesh.userData.setDetail(1);
    }
    for (const [id, mesh] of gangways) mesh.visible = service.vehicles.some(v => v.pose.stopId === id);
    for (const label of labels) {
      const seconds = Math.ceil(service.nextArrival(label.stop.id)), text = `${seconds === 0 ? '停靠中 / BOARDING' : `下一班约 ${seconds} 秒`}`;
      if (text === label.last) continue; label.last = text;
      const ctx = label.canvas.getContext('2d'); if (!ctx) continue;
      ctx.fillStyle = service.route(label.stop.routeId).color; ctx.fillRect(0, 0, 512, 192);
      ctx.fillStyle = '#fff4d7'; ctx.font = 'bold 42px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(label.stop.name, 22, 55);
      ctx.font = '27px sans-serif'; ctx.fillText(service.route(label.stop.routeId).name, 22, 107); ctx.font = '25px sans-serif'; ctx.fillText(text, 22, 159); label.texture.needsUpdate = true;
    }
  }
  service.root = root; service.fleet = fleet; service.updateRender = render; service.railMesh = railMesh; service.wireMesh = wireMesh;
  service.staticBatches = staticBatches; service.staticParts = staticParts;
  let disposed = false;
  service.dispose = () => { if (disposed) return; disposed = true; for (const mesh of fleet.values()) mesh.userData.disposeInstance(); resources.forEach(r => r.dispose()); root.removeFromParent(); };
  render(); return service;
}
