import { applySurfaceFinish } from './surface-finish.js';
import { createMetropolisMaterials } from './metropolis-materials.js';

// One reversible furniture pilot. The authored room/part/collision plan stays
// authoritative; these meshes replace only its visible desk and chair batches.
export const HARBOR_OFFICE_CRAFT_ROOM = 'east-012-lobby-0';
const boundsOf = parts => ({
  min: ['x', 'y', 'z'].map((axis, i) => Math.min(...parts.map(p => p[axis] - p[['sx', 'sy', 'sz'][i]] / 2))),
  max: ['x', 'y', 'z'].map((axis, i) => Math.max(...parts.map(p => p[axis] + p[['sx', 'sy', 'sz'][i]] / 2))),
});

export function planHarborOfficeCraft(building, floor, layout) {
  if (building?.id !== 'east-012' || floor?.id !== 'lobby') return null;
  const parts = layout.parts.filter(p => p.roomId === HARBOR_OFFICE_CRAFT_ROOM);
  const tables = parts.filter(p => p.kind === 'table' && p.material === 'timber' && p.sx === 2 && p.sz === .9);
  if (tables.length !== 2) throw new Error('Office craft requires the two unchanged pilot desks');
  const workstations = tables.map(table => {
    const start = parts.indexOf(table), sequence = parts.slice(start, start + 16);
    const chair = sequence.slice(9, 15), desk = [...sequence.slice(0, 9), sequence[15]];
    if (sequence.length !== 16 || chair[0]?.kind !== 'chair' || chair[1]?.kind !== 'chair' || sequence[15]?.material !== 'paper')
      throw new Error('Office craft requires the original desk/chair part order');
    const handle = parts.find(p => p.kind === 'cup-handle' && Math.abs(p.z - table.z) < .001 && Math.abs(p.x - table.x) < .12);
    const cup = handle ? parts.slice(parts.indexOf(handle) - 2, parts.indexOf(handle) + 1) : [];
    if (cup.length && (cup[0].material !== 'ceramic' || cup[1].material !== 'dark' || cup[0].geometry !== 'cylinder'))
      throw new Error('Office craft requires the unchanged existing ceramic cup');
    desk.push(...cup);
    return { id: table.id, x: table.x, z: table.z, chairX: chair[0].x, chairZ: chair[0].z,
      chairEnvelope: { id: chair[0].id, ...boundsOf(chair) }, deskEnvelope: { id: table.id, ...boundsOf(desk) },
      chairPartIds: chair.map(p => p.id), deskPartIds: desk.map(p => p.id), cup: cup.length > 0 };
  });
  return { roomId: HARBOR_OFFICE_CRAFT_ROOM, origin: { x: building.x, y: floor.y, z: building.z }, workstations,
    replacePartIds: workstations.flatMap(s => [...s.deskPartIds, ...s.chairPartIds]) };
}

export function createHarborOfficeCraft(THREE, plan, {
  timberMaterial = createMetropolisMaterials(THREE).timber,
  ceramicMaterial = createMetropolisMaterials(THREE).ceramic,
} = {}) {
  const group = new THREE.Group(); group.name = 'Office · project studio furniture pilot';
  group.position.set(plan.origin.x, plan.origin.y, plan.origin.z);
  const materials = [
    { name: 'Office · original timber desktop', color: '#c8a17f', roughness: .70, metalness: 0, source: timberMaterial },
    { name: 'Office · woven blue seat', color: '#465a61', roughness: .94, metalness: 0, finish: 'cloth' },
    { name: 'Office · graphite shell and edge', color: '#303d40', roughness: .74, metalness: .04 },
    { name: 'Office · satin metal', color: '#738185', roughness: .43, metalness: .77, finish: 'metal' },
    { name: 'Office · rubber and cable', color: '#202b2c', roughness: .91, metalness: 0, finish: 'rubber' },
    { name: 'Office · muted display', color: '#73979f', roughness: .48, metalness: 0 },
    { name: 'Office · paper and keycaps', color: '#d4d5ca', roughness: .86, metalness: 0 },
    { name: 'Office · ceramic cup', color: '#d2c2a9', roughness: .36, metalness: 0, source: ceramicMaterial },
  ].map(({ finish, source, ...settings }) => {
    // Metropolis surface clones retain the metre projection and asynchronous
    // map subscription. Own the clone; the original surface owns its texture.
    const material = source ? source.clone() : new THREE.MeshStandardMaterial(settings);
    if (source) {
      material.name = settings.name; material.color.set(settings.color); material.roughness = settings.roughness;
      material.metalness = settings.metalness; material.onBeforeCompile = source.onBeforeCompile;
      material.customProgramCacheKey = source.customProgramCacheKey;
    }
    if (finish) applySurfaceFinish(material, finish);
    return material;
  });
  const buckets = new Map(), records = [], matrix = new THREE.Object3D();
  const origin = [plan.origin.x, plan.origin.y, plan.origin.z];
  let disposed = false;
  const add = (geometry, index, envelope, x, y, z, name, rotation = [0, 0, 0]) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(); geometry.dispose();
    matrix.position.set(x, y, z); matrix.rotation.set(...rotation); matrix.updateMatrix(); g.applyMatrix4(matrix.matrix);
    g.computeBoundingBox();
    const min = g.boundingBox.min.toArray(), max = g.boundingBox.max.toArray();
    for (let axis = 0; axis < 3; axis++) if (min[axis] < envelope.min[axis] - origin[axis] - 1e-5 || max[axis] > envelope.max[axis] - origin[axis] + 1e-5) {
      g.dispose(); throw new Error(`Office ${name} exceeds original ${envelope.id} axis ${axis}`);
    }
    if (!buckets.has(index)) buckets.set(index, []); buckets.get(index).push(g);
    records.push({ name, envelope: envelope.id, min, max, triangles: g.attributes.position.count / 3 });
  };
  const rounded = (sx, sy, sz, radius = .012, segments = 4) => {
    const g = new THREE.BoxGeometry(sx, sy, sz, segments, segments, segments), p = g.attributes.position;
    const v = new THREE.Vector3(), center = new THREE.Vector3();
    radius = Math.min(radius, sx / 2, sy / 2, sz / 2);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); center.set(Math.max(-sx / 2 + radius, Math.min(sx / 2 - radius, v.x)),
        Math.max(-sy / 2 + radius, Math.min(sy / 2 - radius, v.y)), Math.max(-sz / 2 + radius, Math.min(sz / 2 - radius, v.z)));
      v.sub(center).normalize().multiplyScalar(radius).add(center); p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  };
  const box = (m, e, x, y, z, sx, sy, sz, name, r = .01) => add(rounded(sx, sy, sz, r), m, e, x, y, z, name);
  const cylinder = (m, e, x, y, z, r, h, name, rotation = [0, 0, 0]) => add(new THREE.CylinderGeometry(r, r, h, 12), m, e, x, y, z, name, rotation);
  const path = (m, e, points, radius, name, segments = 12) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), segments, radius, 6, false), m, e, 0, 0, 0, name);
  const back = (width, height, thickness, padding = false) => {
    // A closed curved shell: the sides wrap toward the sitter, with a gentle
    // lumbar bow and rearward rake. Padding follows the same surface.
    const positions = [], indices = [], nx = 12, ny = 12;
    for (let side = 0; side < 2; side++) for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx * 2 - 1, t = j / ny;
      const x = u * width / 2 * (1 - .07 * Math.pow(2 * t - 1, 2));
      const y = t * height;
      const z = .19 + .075 * t - .048 * u * u - .035 * Math.sin(Math.PI * t) + (side ? thickness : 0) - (padding ? .019 : 0);
      positions.push(x, y, z);
    }
    const stride = nx + 1, layer = stride * (ny + 1);
    const quad = (a, b, c, d) => indices.push(a, b, d, b, c, d);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const n = j * stride + i; quad(n, n + stride, n + stride + 1, n + 1);
      quad(n + layer, n + layer + 1, n + layer + stride + 1, n + layer + stride);
    }
    for (let i = 0; i < nx; i++) { quad(i, i + 1, i + 1 + layer, i + layer); const n = ny * stride + i; quad(n, n + layer, n + layer + 1, n + 1); }
    for (let j = 0; j < ny; j++) { const n = j * stride; quad(n, n + layer, n + layer + stride, n + stride); const k = n + nx; quad(k, k + stride, k + stride + layer, k + layer); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); g.setIndex(indices); g.computeVertexNormals(); return g;
  };
  try {
    for (const s of plan.workstations) {
      const x = s.x - plan.origin.x, z = s.z - plan.origin.z, cx = s.chairX - plan.origin.x, cz = s.chairZ - plan.origin.z;
      const c = s.chairEnvelope, d = s.deskEnvelope;
      box(2, c, cx, .392, cz, .58, .043, .59, 'rounded seat shell', .019);
      const cushion = rounded(.568, .086, .57, .036, 6), cushionVertices = cushion.attributes.position;
      for (let i = 0; i < cushionVertices.count; i++) if (cushionVertices.getY(i) > .02) {
        const pressure = Math.max(0, 1 - (cushionVertices.getX(i) / .284) ** 2) * Math.max(0, 1 - (cushionVertices.getZ(i) / .285) ** 2);
        cushionVertices.setY(i, cushionVertices.getY(i) - pressure * .006);
      }
      cushion.computeVertexNormals(); add(cushion, 1, c, cx, .438, cz - .006, 'compressed seat cushion');
      // 481 mm seat / 768.5 mm desktop: a 287.5 mm working-height gap.
      add(back(.55, .56, .025), 2, c, cx, .53, cz, 'curved closed back shell');
      add(back(.505, .495, .014, true), 1, c, cx, .557, cz, 'lumbar back padding');
      path(3, c, [[cx, .205, cz + .02], [cx, .35, cz + .10], [cx, .57, cz + .20]], .019, 'curved back support');
      cylinder(3, c, cx, .262, cz, .029, .224, 'gas lift');
      cylinder(2, c, cx, .19, cz, .045, .105, 'lift sleeve');
      box(2, c, cx, .367, cz, .24, .035, .23, 'seat adjustment housing');
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5, dx = Math.cos(angle), dz = Math.sin(angle), wx = cx + dx * .245, wz = cz + dz * .245;
        path(3, c, [[cx, .165, cz], [cx + dx * .12, .14, cz + dz * .12], [wx, .093, wz]], .016, 'five-spoke base');
        cylinder(3, c, wx, .095, wz, .014, .035, 'caster swivel');
        for (const side of [-1, 1]) cylinder(4, c, wx + side * .019, .051, wz, .037, .024, 'paired caster wheel', [0, 0, Math.PI / 2]);
      }
      // A 33 mm desktop, restrained edge band and slender metal legs replace
      // the 160 mm plank. Desk props move with the actual visible top.
      box(2, d, x, .744, z, 1.985, .021, .885, 'thin desktop edge band', .009);
      box(0, d, x, .752, z, 1.97, .033, .87, 'rounded timber desktop', .01);
      for (const dx of [-.82, .82]) for (const dz of [-.29, .29]) {
        path(3, d, [[x + dx, .022, z + dz], [x + dx * .94, .37, z + dz], [x + dx * .93, .723, z + dz]], .019, 'slender desk support');
        box(4, d, x + dx, .013, z + dz, .05, .016, .05, 'desk glide', .006);
      }
      box(3, d, x, .695, z - .31, 1.64, .038, .027, 'rear desk frame');
      box(2, d, x + .30, .601, z - .29, .49, .022, .18, 'under-desk cable tray');
      path(4, d, [[x + .30, .771, z - .19], [x + .33, .696, z - .24], [x + .25, .626, z - .25], [x + .45, .619, z - .28]], .006, 'display cable');
      box(2, d, x + .30, .780, z - .15, .26, .023, .18, 'display foot');
      box(3, d, x + .30, .887, z - .16, .035, .20, .033, 'thin display stand');
      box(2, d, x + .30, 1.123, z - .16, .75, .438, .039, 'display frame', .012);
      box(5, d, x + .30, 1.129, z - .137, .704, .392, .008, 'display face', .004);
      box(6, d, x + .08, 1.247, z - .131, .20, .009, .002, 'display heading', .0005);
      for (const yy of [1.207, 1.182, 1.157]) box(6, d, x + .17, yy, z - .131, .36, .004, .002, 'display document line', .0005);
      box(2, d, x + .22, .784, z + .20, .43, .029, .145, 'low keyboard body', .006);
      for (let row = 0; row < 3; row++) for (let key = 0; key < 10; key++) add(new THREE.BoxGeometry(.027, .005, .024), 6, d,
        x + .045 + key * .035, .802, z + .158 + row * .033, 'keyboard key');
      box(6, d, x - .50, .775, z + .10, .40, .012, .28, 'paper on desktop', .003);
      if (s.cup) {
        const profile = [[.055, 0], [.071, .016], [.074, .166], [.068, .179], [.063, .173], [.059, .026], [0, .026], [0, 0], [.055, 0]].map(p => new THREE.Vector2(...p));
        add(new THREE.LatheGeometry(profile, 16), 7, d, x, .769, z, 'hollow ceramic cup');
        cylinder(4, d, x, .934, z, .061, .005, 'coffee surface');
        add(new THREE.TorusGeometry(.040, .009, 6, 16), 7, d, x + .088, .862, z, 'cup handle', [0, Math.PI / 2, 0]);
      }
    }
    for (const [index, geometries] of buckets) {
      const merged = new THREE.BufferGeometry();
      for (const name of ['position', 'normal']) {
        const data = new Float32Array(geometries.reduce((n, g) => n + g.attributes[name].array.length, 0));
        let offset = 0; for (const g of geometries) { data.set(g.attributes[name].array, offset); offset += g.attributes[name].array.length; }
        merged.setAttribute(name, new THREE.BufferAttribute(data, 3));
      }
      merged.computeBoundingBox(); merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, materials[index]); mesh.name = materials[index].name;
      mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    }
  } catch (error) { for (const mesh of group.children) mesh.geometry.dispose(); for (const material of materials) material.dispose(); throw error;
  } finally { for (const geometries of buckets.values()) for (const g of geometries) g.dispose(); }
  const summary = { roomId: plan.roomId, chairs: 2, desks: 2, meshes: group.children.length,
    triangles: records.reduce((n, r) => n + r.triangles, 0), ownedTextures: 0,
    sharedTextures: new Set(materials.map(m => m.map).filter(Boolean)).size, desktopTop: .7685, seatTop: .481 };
  return { group, records, summary, dispose() {
    if (disposed) return; disposed = true; for (const mesh of group.children) mesh.geometry.dispose();
    for (const material of materials) material.dispose(); group.removeFromParent(); group.clear();
  } };
}
