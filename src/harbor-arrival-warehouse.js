import { applySurfaceFinish } from './surface-finish.js';

/** A single existing warehouse on the real bus/tram approach. All dimensions
 * are metres; the original shell, doorway, paving and service remain owners. */
export const ARRIVAL_WAREHOUSE_LIMITS = Object.freeze({ buildingId: 'south-085', near: 72, far: 96, maxDrawCalls: 12, maxTriangles: 25000, maxOwnedTextures: 2 });
// These are actual existing first-floor window axes from world.js's 3.3 m
// bay spacing. Keeping the old outer steel rim aligned avoids crossed skins.
const NORTH_BAYS = Object.freeze([-12.4, 14]);
const CANOPY_WIDTH = 10.2, CANOPY_DEPTH = 1.8, CANOPY_THICKNESS = .045;
const roofY = t => 3.96 - .11 * t - .19 * t * t;

function addTriangle(out, a, b, c) { out.push(...a, ...c, ...b); }
/** Closed thin sheet with a genuinely curved top and underside, not a box. */
export function createArrivalCanopyGeometry(THREE, width = CANOPY_WIDTH, depth = CANOPY_DEPTH) {
  const p = [], steps = 18;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps;
    for (const [offset, reverse] of [[0, false], [-CANOPY_THICKNESS, true]]) {
      const a = [-width / 2, roofY(t0) + offset, t0 * depth], b = [width / 2, roofY(t0) + offset, t0 * depth];
      const c = [width / 2, roofY(t1) + offset, t1 * depth], d = [-width / 2, roofY(t1) + offset, t1 * depth];
      if (reverse) { addTriangle(p, a, c, b); addTriangle(p, a, d, c); }
      else { addTriangle(p, a, b, c); addTriangle(p, a, c, d); }
    }
    for (const side of [-1, 1]) {
      const x = side * width / 2, a = [x, roofY(t0), t0 * depth], b = [x, roofY(t1), t1 * depth];
      const c = [x, roofY(t1) - CANOPY_THICKNESS, t1 * depth], d = [x, roofY(t0) - CANOPY_THICKNESS, t0 * depth];
      if (side < 0) { addTriangle(p, a, b, c); addTriangle(p, a, c, d); }
      else { addTriangle(p, a, c, b); addTriangle(p, a, d, c); }
    }
  }
  for (const t of [0, 1]) {
    const a = [-width / 2, roofY(t), t * depth], b = [width / 2, roofY(t), t * depth];
    const c = [width / 2, roofY(t) - CANOPY_THICKNESS, t * depth], d = [-width / 2, roofY(t) - CANOPY_THICKNESS, t * depth];
    if (t) { addTriangle(p, a, b, c); addTriangle(p, a, c, d); }
    else { addTriangle(p, a, c, b); addTriangle(p, a, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}

function mergeParts(THREE, parts) {
  const positions = [], normals = [], uv = [];
  for (const { geometry, matrix } of parts) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(); g.applyMatrix4(matrix);
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), t = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i)); normals.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(t?.getX(i) ?? 0, t?.getY(i) ?? 0);
    }
    g.dispose();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}

function warehouseLettering(THREE) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const context = canvas.getContext('2d'); if (!context) return null;
  context.fillStyle = '#e0d6bf'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#334744'; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.font = '500 48px system-ui, sans-serif'; context.fillText('仓街修缮 · 货运档案', 512, 43);
  context.font = '400 25px system-ui, sans-serif'; context.fillText('QUAY WORKS  /  FREIGHT RECORDS', 512, 95);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

export function createArrivalWarehouseOwner(THREE, parent, { buildings = [], quality = 'high' } = {}) {
  const shell = buildings.find(b => b.id === ARRIVAL_WAREHOUSE_LIMITS.buildingId);
  const colliders = [], anchor = shell ? { x: shell.x, y: shell.baseY ?? 0, z: shell.z + shell.depth / 2 } : null;
  let live = null, interiorId = null, currentQuality = quality, disposed = false, loads = 0, releases = 0;
  // The upper-volume colliders stay resident while visual detail unloads.
  // Six conservative pieces follow each sheet's curve; they never reach the
  // walking body or its support plane. Nothing occupies the central doorway.
  if (anchor) for (const bay of NORTH_BAYS) for (let i = 0; i < 6; i++) {
    const t0 = i / 6, t1 = (i + 1) / 6;
    colliders.push({ id: `south-085-arrival-canopy-${bay}-${i}`, kind: 'harbor-arrival-canopy', buildingId: shell.id,
      x: anchor.x + bay, z: anchor.z + CANOPY_DEPTH * (t0 + t1) / 2, hx: CANOPY_WIDTH / 2 + .01, hz: CANOPY_DEPTH / 12 + .03,
      minY: anchor.y + roofY(t1) - CANOPY_THICKNESS - .065, maxY: anchor.y + roofY(t0) + .005, physics: true, camera: true });
  }
  if (anchor) for (const bay of NORTH_BAYS) for (const offset of [-3.9, 3.9]) {
    colliders.push({ id: `south-085-arrival-brace-${bay}-${offset}`, kind: 'harbor-arrival-canopy', buildingId: shell.id,
      x: anchor.x + bay + offset, z: anchor.z + .66, hx: .028, hz: .72,
      minY: anchor.y + 3.45, maxY: anchor.y + 3.87, physics: true, camera: true });
  }

  function release() {
    if (!live) return;
    live.group.removeFromParent();
    for (const mesh of live.meshes) mesh.geometry.dispose();
    for (const material of live.materials) material.dispose();
    for (const texture of live.textures) texture.dispose();
    live.group.clear(); live = null; releases++;
  }
  function load() {
    const group = new THREE.Group(); group.name = 'south-085 · authored warehouse arrival'; group.userData.shellId = shell.id;
    group.position.set(anchor.x, anchor.y, anchor.z);
    const materials = [], textures = [], buckets = new Map(), geometries = new Set(), transform = new THREE.Object3D();
    const material = (name, color, roughness, metalness = 0, finish = 'mineral') => {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness }); m.name = name;
      applySurfaceFinish(m, finish, { strength: finish === 'metal' ? .34 : .24 }); materials.push(m); return m;
    };
    const stone = material('Arrival · weathered stone reveal', '#9f9f8e', .92);
    const metal = material('Arrival · patinated steel joinery', '#425953', .66, .65, 'metal');
    const zinc = material('Arrival · folded zinc sheet', '#90958a', .58, .68, 'metal');
    const wood = material('Arrival · oiled workshop timber', '#856e50', .84);
    const paint = material('Arrival · matte mineral fascia', '#b6b69f', .91);
    const glass = material('Arrival · muted window glazing', '#385454', .31, .10);
    const dark = material('Arrival · interior window reveal', '#1c2d2b', .95);
    const paper = material('Arrival · paper records', '#cbbd96', .96);
    const brass = material('Arrival · worn brass handles', '#ae9870', .46, .65, 'metal');
    const box = new THREE.BoxGeometry(1, 1, 1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
    geometries.add(box); geometries.add(cylinder);
    const add = (m, g, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
      geometries.add(g); transform.position.set(x, y, z); transform.rotation.set(rx, ry, rz); transform.scale.set(sx, sy, sz); transform.updateMatrix();
      if (!buckets.has(m)) buckets.set(m, []); buckets.get(m).push({ geometry: g, matrix: transform.matrix.clone() });
    };
    const b = (m, x, y, z, sx, sy, sz) => add(m, box, x, y, z, sx, sy, sz);
    const tube = (m, x, y, z, radius, length, rx = 0) => add(m, cylinder, x, y, z, radius, length, radius, rx);
    const canopy = createArrivalCanopyGeometry(THREE); geometries.add(canopy);
    for (const bay of NORTH_BAYS) {
      add(zinc, canopy, bay, 0, 0);
      // Folded front return and half-round gutter give the sheet a fine edge.
      b(zinc, bay, 3.665, 1.80, CANOPY_WIDTH, .10, .045);
      add(zinc, cylinder, bay, 3.65, 1.76, .045, CANOPY_WIDTH, .045, 0, 0, Math.PI / 2);
      for (const offset of [-3.9, 3.9]) {
        // A thin wall-fixed diagonal brace, always above the pedestrian head.
        add(metal, box, bay + offset, 3.66, .66, .045, .045, 1.45, -.25);
        b(metal, bay + offset, 3.72, .09, .13, .43, .14);
      }
      b(stone, bay, .37, .075, 10.55, .62, .12);
      b(paint, bay, 3.12, .075, 10.55, .47, .12);
      // Three separate recessed service windows, fitted over existing bays.
      for (const offset of [-3.3, 0, 3.3]) {
        const x = bay + offset, width = 2.84;
        b(dark, x, 1.78, .086, width + .26, 2.27, .06);
        b(glass, x, 1.82, .122, width - .18, 1.99, .028);
        for (const side of [-1, 1]) {
          b(stone, x + side * (width / 2 + .04), 1.80, .10, .15, 2.31, .18);
          b(metal, x + side * 1.34, 1.82, .174, .065, 2.06, .052);
        }
        b(stone, x, .655, .09, width + .30, .105, .18);
        b(stone, x, 2.96, .09, width + .30, .105, .18);
        b(wood, x, .77, .15, width + .05, .13, .095);
        b(metal, x, 2.25, .167, width - .20, .06, .06);
        b(metal, x - .32, 1.74, .174, .055, 1.80, .052);
        tube(brass, x + .26, 1.48, .18, .018, .31);
        // Existing warehouse use: a shallow paperwork/service display. These
        // surfaces remain inside the shell's 0.25 m collision skin.
        for (let n = 0; n < 3; n++) {
          b(paper, x - .75 + n * .54, 1.14 + n * .025, .145, .39, .28, .024);
          b(metal, x - .75 + n * .54, 1.33 + n * .025, .155, .39, .025, .03);
        }
      }
    }
    // North return downpipe is wall-attached; no imaginary ground pedestal.
    for (const x of [-19.35, 19.35]) {
      tube(zinc, x, 1.91, .12, .048, 3.47);
      for (const y of [.72, 2.92]) b(metal, x, y, .10, .14, .10, .17);
      b(metal, x + .43, 1.23, .10, .48, .63, .16);
    }
    // East service opening and shallow louvre. They are inside the original
    // shell's eastern skin, not objects in the passing pedestrian strip.
    const east = shell.width / 2;
    for (const z of [-9.5, -16]) {
      b(dark, east + .065, 1.83, z, .09, 2.22, 4.25);
      b(glass, east + .118, 1.87, z, .03, 1.94, 3.97);
      for (const side of [-1, 1]) b(metal, east + .165, 1.86, z + side * 1.98, .06, 2.06, .065);
      b(wood, east + .14, .77, z, .10, .13, 4.22);
      b(stone, east + .10, 2.99, z, .18, .13, 4.40);
      for (const offset of [-1, 0, 1]) b(metal, east + .165, 1.86, z + offset * .93, .06, 1.97, .046);
    }
    for (let i = 0; i < 7; i++) b(metal, east + .17, 2.21 + i * .085, -23.4, .06, .042, 2.30);
    const lettering = warehouseLettering(THREE);
    if (lettering) {
      textures.push(lettering); const m = new THREE.MeshStandardMaterial({ map: lettering, color: '#ffffff', roughness: .85, metalness: 0 });
      m.name = 'Arrival · original painted warehouse lettering'; materials.push(m);
      const plane = new THREE.PlaneGeometry(10.1, .42); geometries.add(plane);
      for (const bay of NORTH_BAYS) add(m, plane, bay, 3.12, .141);
    }
    const meshes = [];
    for (const [m, parts] of buckets) {
      const mesh = new THREE.Mesh(mergeParts(THREE, parts), m); mesh.name = m.name; mesh.receiveShadow = true;
      mesh.castShadow = currentQuality === 'high'; mesh.userData.harborArrivalWarehouse = true; group.add(mesh); meshes.push(mesh);
    }
    for (const g of geometries) g.dispose();
    group.visible = interiorId !== shell.id; parent.add(group); live = { group, meshes, materials, textures }; loads++;
  }
  return {
    colliders,
    update(position) {
      if (disposed || !anchor || !position || ![position.x, position.z].every(Number.isFinite)) return;
      const distance = Math.hypot(position.x - anchor.x, position.z - anchor.z);
      if (live ? distance > ARRIVAL_WAREHOUSE_LIMITS.far : distance < ARRIVAL_WAREHOUSE_LIMITS.near) { if (live) release(); else load(); }
    },
    setInteriorBuilding(id) { interiorId = id; if (live) live.group.visible = id !== shell.id; },
    setQuality(value) { currentQuality = value; if (live) for (const mesh of live.meshes) mesh.castShadow = value === 'high'; },
    snapshot() { return { enabled: !!shell, buildingId: shell?.id ?? null, anchor, resident: !!live, visible: !!live?.group.visible,
      near: 72, far: 96, quality: currentQuality, loads, releases, disposed, colliders: colliders.length,
      drawCalls: live?.meshes.length ?? 0, triangles: live?.meshes.reduce((sum, m) => sum + m.geometry.getAttribute('position').count / 3, 0) ?? 0,
      ownedTextures: live?.textures.length ?? 0, minCanopyY: anchor ? anchor.y + roofY(1) - CANOPY_THICKNESS : null };
    },
    dispose() { if (disposed) return; release(); disposed = true; },
  };
}
