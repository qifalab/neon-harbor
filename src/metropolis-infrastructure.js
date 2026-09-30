import { METROPOLIS_ROADS } from './metropolis-catalog.js';
import { TRANSIT_STOPS } from './metropolis-transit.js';
import { createMetropolisMaterials } from './metropolis-materials.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const REACH = 0.7;

/** The two roads have an independent upper and lower level. The caller must
 * pass the previous supporting height, never the highest surface at x/z.
 * This also keeps a car's four wheels on the same road at an underpass. */
export const FLYOVERS = Object.freeze([
  Object.freeze({ id: 'west-link', name: '西堤高架路', axis: 'z', cross: -480,
    start: -1080, end: -600, ramp: 110, height: 8, width: 14,
    description: '双向双车道高架连接松岭与星汇，缓坡、伸缩缝、泄水口与桥墩沿线展开。' }),
  Object.freeze({ id: 'east-link', name: '榕荫东连接路', axis: 'x', cross: -980,
    start: -100, end: 620, ramp: 120, height: 9, width: 14,
    description: '东西向高架跨过三条城区大道，桥下道路保留独立通行净空。' }),
]);
export const FREIGHT_PORT = Object.freeze({ id: 'victoria-freight', name: '星湾货运码头',
  x: -540, z: -345, width: 180, depth: 74, y: 2.4,
  ramp: Object.freeze({ x: -620, start: -412, end: -377, riseEnd: -393, width: 12 }),
  description: '抬高的公共码头越过海堤连接货柜堆场，两座岸桥、装卸通道与防波堤围成港区。' });

export function flyoverHeight(road, along) {
  if (along < road.start || along > road.end) return null;
  return road.height * Math.min(smooth((along - road.start) / road.ramp), smooth((road.end - along) / road.ramp));
}
const roadPoint = (road, along, offset = 0, y = null) => road.axis === 'z'
  ? { x: road.cross + offset, z: along, y: y ?? flyoverHeight(road, along) }
  : { x: along, z: road.cross + offset, y: y ?? flyoverHeight(road, along) };

/** Return null when this layer offers no reachable support. In particular,
 * standing under a 9 m bridge must not teleport the player onto that bridge. */
export function infrastructureSupportAt(x, z, currentY = 0) {
  if (![x, z, currentY].every(Number.isFinite)) return null;
  const candidates = [];
  for (const road of FLYOVERS) {
    const across = road.axis === 'z' ? x : z, along = road.axis === 'z' ? z : x;
    if (Math.abs(across - road.cross) <= road.width / 2) {
      const y = flyoverHeight(road, along);
      if (y !== null) candidates.push({ height: y, id: road.id, kind: 'flyover' });
    }
  }
  const p = FREIGHT_PORT, r = p.ramp;
  if (Math.abs(x - p.x) <= p.width / 2 && Math.abs(z - p.z) <= p.depth / 2) candidates.push({ height: p.y, id: p.id, kind: 'freight-port' });
  if (Math.abs(x - r.x) <= r.width / 2 && z >= r.start && z <= r.end)
    candidates.push({ height: p.y * smooth((z - r.start) / (r.riseEnd - r.start)), id: p.id, kind: 'freight-port' });
  const reachable = candidates.filter(surface => Math.abs(surface.height - currentY) <= REACH + 1e-8);
  const nearest = reachable.length ? reachable.reduce((a, b) => Math.abs(a.height - currentY) < Math.abs(b.height - currentY) ? a : b) : null;
  return nearest ? { ...nearest, entrance: INFRASTRUCTURE_LANDMARKS.find(l => l.id === nearest.id).entrance } : null;
}
export const infrastructureGroundHeightAt = (x, z, currentY = 0) => infrastructureSupportAt(x, z, currentY)?.height ?? null;

export const INFRASTRUCTURE_LANDMARKS = Object.freeze([
  ...FLYOVERS.map(r => Object.freeze({ id: r.id, name: r.name, kind: 'infrastructure', description: r.description,
    entrance: Object.freeze({ ...roadPoint(r, r.start - 5, 2.8, 0), yaw: r.axis === 'z' ? 0 : Math.PI / 2 }) })),
  Object.freeze({ id: FREIGHT_PORT.id, name: FREIGHT_PORT.name, kind: 'infrastructure', description: FREIGHT_PORT.description,
    entrance: Object.freeze({ x: FREIGHT_PORT.ramp.x, z: FREIGHT_PORT.ramp.start - 3, y: 0, yaw: 0 }) }),
]);

/** Local instancing keeps nearby rivets/slats without paying their draw cost
 * from the other shore. Distant road decks and port cranes remain visible. */
export function createMetropolisInfrastructure(THREE, scene, { quality = 'high' } = {}) {
  const root = new THREE.Group(); root.name = 'Working harbour · layered infrastructure'; scene.add(root);
  const colliders = [], clusters = [], materials = new Map(), base = createMetropolisMaterials(THREE);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D();
  const geometries = new Set([boxGeometry]), disposable = new Set();
  const palette = { concrete: '#b7b4a5', asphalt: '#5a605a', stone: '#c3b8a0', metal: '#6d7e7c', wood: '#b2966c',
    dark: '#293f47', cream: '#e6d9b9', yellow: '#d4b36b', rust: '#9f654e', sea: '#507d83', red: '#a55249', green: '#719484' };
  function material(key) {
    if (materials.has(key)) return materials.get(key);
    const type = ['asphalt', 'stone', 'concrete', 'wood', 'metal', 'glass', 'light'].includes(key) ? key
      : ['yellow', 'rust', 'sea', 'red', 'green'].includes(key) ? 'roof' : key === 'dark' ? 'metal' : 'stone';
    const m = base[type].clone(); if (palette[key]) m.color.set(palette[key]);
    if (['yellow', 'rust', 'sea', 'red', 'green'].includes(key)) { m.metalness = .25; m.roughness = .76; }
    materials.set(key, m); return m;
  }
  function cluster(name, x, z, far = 780, near = 175) {
    const group = new THREE.Group(); group.name = name; root.add(group);
    const item = { name, x, z, far, near, group, pools: new Map(), detailMeshes: [] }; clusters.push(item); return item;
  }
  function box(c, key, x, y, z, w, h, d, { rx = 0, ry = 0, rz = 0, detail = false } = {}) {
    const bucket = `${key}:${detail ? 'detail' : 'form'}`;
    if (!c.pools.has(bucket)) c.pools.set(bucket, { key, detail, transforms: [] });
    c.pools.get(bucket).transforms.push([x, y, z, w, h, d, rx, ry, rz]);
  }
  function collider(id, kind, x, z, hx, hz, minY, maxY, physics = true) {
    const c = { id: `infrastructure-${id}`, kind, x, z, hx, hz, minY, maxY, physics, camera: true }; colliders.push(c); return c;
  }
  function solid(c, key, x, y, z, w, h, d, id, kind = 'infrastructure-furniture') {
    box(c, key, x, y, z, w, h, d); collider(id, kind, x, z, w / 2, d / 2, y - h / 2, y + h / 2);
  }
  function beam(c, key, a, b, thickness, detail = false) {
    const v = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z), o = new THREE.Object3D();
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
    box(c, key, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, thickness, v.length(), thickness,
      { rx: o.rotation.x, ry: o.rotation.y, rz: o.rotation.z, detail });
  }
  function sign(c, text, x, y, z, width, yaw = 0) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 192;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#203e43'; ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = '#d9b977'; ctx.fillRect(0, 0, 12, 192);
    ctx.fillStyle = '#f4efda'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '500 55px system-ui';
    const lines = text.split('\n'); lines.forEach((line, i) => ctx.fillText(line, 518, lines.length === 1 ? 99 : 62 + i * 75, 960));
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    // Text is printed on the front only. A real blank back plate prevents the
    // mirrored lettering that DoubleSide shows when approaching from behind.
    const mat = new THREE.MeshBasicMaterial({ map, side: THREE.FrontSide });
    const geo = new THREE.PlaneGeometry(width, width * 192 / 1024), mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z); mesh.rotation.y = yaw; mesh.name = text; c.group.add(mesh);
    const backing = new THREE.Mesh(boxGeometry, material('dark'));
    backing.name = `${text} · blank backing`; backing.position.z = -.065;
    backing.scale.set(width + .12, width * 192 / 1024 + .12, .1); mesh.add(backing);
    geometries.add(geo); disposable.add(map); disposable.add(mat);
    const q = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw)), height = width * 192 / 1024;
    collider(`${c.name}-sign-${colliders.length}`, 'infrastructure-sign', x, z, (width + .12) * q / 2 + .115 * s,
      (width + .12) * s / 2 + .115 * q, y - height / 2 - .06, y + height / 2 + .06, false);
  }
  function slattedBench(c, x, y, z, id) {
    collider(id, 'infrastructure-bench', x, z, 1.65, .42, y, y + 1.05);
    for (let i = -2; i <= 2; i++) {
      box(c, 'wood', x, y + .47, z + i * .15, 3.2, .065, .11, { detail: true });
      box(c, 'wood', x, y + .63 + (i + 2) * .085, z - .36, 3.2, .065, .08, { detail: true });
    }
    for (const dx of [-1.22, 1.22]) {
      box(c, 'metal', x + dx, y + .23, z, .09, .46, .65);
      box(c, 'metal', x + dx, y + .7, z - .35, .08, .7, .08);
    }
  }
  function railing(c, a, b, y, id, gap = false) {
    const horizontal = Math.abs(b.x - a.x) > Math.abs(b.z - a.z), length = Math.hypot(b.x - a.x, b.z - a.z);
    beam(c, 'metal', { ...a, y: y + 1.08 }, { ...b, y: y + 1.08 }, .09);
    beam(c, 'metal', { ...a, y: y + .54 }, { ...b, y: y + .54 }, .065, true);
    for (let s = 0; s <= length; s += 2.2) {
      const t = s / length; box(c, 'metal', a.x + (b.x - a.x) * t, y + .54, a.z + (b.z - a.z) * t, .085, 1.08, .085, { detail: true });
    }
    if (!gap) collider(id, 'infrastructure-railing', (a.x + b.x) / 2, (a.z + b.z) / 2, horizontal ? length / 2 : .09,
      horizontal ? .09 : length / 2, y, y + 1.15);
  }

  // Smooth support and tessellated visual deck share the very same profile.
  // Camera-only deck boxes are inset vertically so their seams cannot create
  // invisible bumps in a vehicle's swept collision hull.
  for (const road of FLYOVERS) {
    const midpoint = (road.start + road.end) / 2, p = roadPoint(road, midpoint);
    const c = cluster(road.name, p.x, p.z, 1100, (road.end - road.start) / 2 + 95), longitudinalZ = road.axis === 'z';
    const options = angle => longitudinalZ ? { rx: -angle } : { rz: angle };
    const stampRoad = (key, at, offset, y, width, thick, length, angle = 0, detail = false) => {
      const q = roadPoint(road, at, offset, y);
      box(c, key, q.x, q.y, q.z, longitudinalZ ? width : length, thick, longitudinalZ ? length : width, { ...options(angle), detail });
    };
    for (let start = road.start; start < road.end; start += 4) {
      const end = Math.min(start + 4, road.end), y0 = flyoverHeight(road, start), y1 = flyoverHeight(road, end);
      const at = (start + end) / 2, y = (y0 + y1) / 2, angle = Math.atan2(y1 - y0, end - start), len = Math.hypot(end - start, y1 - y0);
      stampRoad('asphalt', at, 0, y - .09, road.width, .18, len + .015, angle);
      stampRoad('concrete', at, 0, y - .38, road.width - .5, .42, len + .015, angle);
      const deck = roadPoint(road, at);
      if (Math.min(y0, y1) > 2.8) collider(`${road.id}-underside-${start}`, 'flyover-deck', deck.x, deck.z,
        longitudinalZ ? road.width / 2 : 2, longitudinalZ ? 2 : road.width / 2, Math.min(y0, y1) - .59, Math.max(y0, y1) - .02, false);
      for (const side of [-1, 1]) {
        stampRoad('concrete', at, side * (road.width / 2 - .18), y + .37, .35, .74, len + .025, angle);
        const rail = roadPoint(road, at, side * (road.width / 2 - .18));
        collider(`${road.id}-rail-${side}-${start}`, 'flyover-railing', rail.x, rail.z,
          longitudinalZ ? .18 : 2.02, longitudinalZ ? 2.02 : .18, Math.min(y0, y1) - .02, Math.max(y0, y1) + .79);
        stampRoad('cream', at, side * 5.8, y + .025, .12, .014, len, angle, true);
        if (start % 12 === 0) stampRoad('metal', at, side * 6.2, y + .03, .28, .025, .52, angle, true);
      }
      if (Math.floor((start - road.start) / 4) % 3 !== 0) stampRoad('yellow', at, 0, y + .026, .12, .015, len * .7, angle);
      if (Math.floor((start - road.start) / 4) % 11 === 0) stampRoad('dark', at, 0, y + .015, road.width - 1, .012, .035, angle, true);
    }
    for (let at = road.start + road.ramp; at < road.end - road.ramp; at += 38) {
      const crossing = longitudinalZ ? METROPOLIS_ROADS.horizontal : METROPOLIS_ROADS.vertical;
      if (crossing.some(v => Math.abs(v - at) < 21)) continue;
      for (const side of [-1, 1]) {
        const q = roadPoint(road, at, side * 15.3), height = q.y - .6;
        solid(c, 'concrete', q.x, height / 2, q.z, 1.05, height, 1.5, `${road.id}-pier-${side}-${at}`, 'flyover-pier');
        box(c, 'dark', q.x, .33, q.z, 1.35, .66, 1.8);
        for (let y = 1; y < height - 1; y += 1.4) box(c, 'rust', q.x + .53, y, q.z, .018, .09, 1.15, { detail: true });
      }
      stampRoad('concrete', at, 0, road.height - .85, 32, .5, 1.55);
    }
    for (let at = road.start + 25; at < road.end - 20; at += 52) {
      const side = Math.floor((at - road.start) / 52) % 2 ? -1 : 1, q = roadPoint(road, at, side * 6.35);
      box(c, 'metal', q.x, q.y + 3.1, q.z, .09, 6.2, .09);
      const head = roadPoint(road, at, side * 4.9, q.y + 6.15);
      beam(c, 'metal', { ...q, y: q.y + 6.15 }, head, .11);
      box(c, 'light', head.x, head.y - .08, head.z, longitudinalZ ? 1.1 : .35, .11, longitudinalZ ? .35 : 1.1);
    }
    const entry = roadPoint(road, road.start + 9, road.width / 2 + 1.1, 0);
    box(c, 'metal', entry.x, 2.2, entry.z, .13, 4.4, .13);
    sign(c, `${road.name}\n双向通行 · 40`, entry.x, 3.7, entry.z, 5, longitudinalZ ? Math.PI : -Math.PI / 2);
  }

  const p = FREIGHT_PORT, port = cluster(p.name, p.x, p.z, 1100, 280), r = p.ramp;
  box(port, 'concrete', p.x, p.y - .34, p.z, p.width, .68, p.depth);
  for (let x = p.x - 81; x <= p.x + 81; x += 27) for (const dz of [-31, 0, 31])
    box(port, 'concrete', x, .25, p.z + dz, 1.8, 4.3, 1.8);
  // Planar deck is safe for physical collision; slopes are sampled analytically.
  collider('freight-deck', 'freight-deck', p.x, p.z, p.width / 2, p.depth / 2, p.y - .68, p.y, false);
  for (let z = r.start; z < r.end; z += 1) {
    const a = p.y * smooth((z - r.start) / (r.riseEnd - r.start)), b = p.y * smooth((z + 1 - r.start) / (r.riseEnd - r.start));
    const angle = Math.atan2(b - a, 1), mid = (a + b) / 2;
    box(port, 'asphalt', r.x, mid - .08, z + .5, r.width, .16, Math.hypot(1, b - a) + .015, { rx: -angle });
    for (const side of [-1, 1]) {
      box(port, 'metal', r.x + side * (r.width / 2 - .1), mid + .55, z + .5, .12, 1.1, 1.025, { rx: -angle });
      collider(`freight-ramp-${side}-${z}`, 'infrastructure-railing', r.x + side * (r.width / 2 - .1), z + .5, .07, .52, Math.min(a, b), Math.max(a, b) + 1.1);
    }
  }
  const west = p.x - p.width / 2, east = p.x + p.width / 2, north = p.z - p.depth / 2, south = p.z + p.depth / 2;
  railing(port, { x: west, z: north }, { x: west, z: south }, p.y, 'port-west');
  railing(port, { x: west, z: south }, { x: east, z: south }, p.y, 'port-south');
  railing(port, { x: east, z: north }, { x: east, z: south }, p.y, 'port-east');
  railing(port, { x: west, z: north }, { x: r.x - r.width / 2, z: north }, p.y, 'port-north-left');
  railing(port, { x: r.x + r.width / 2, z: north }, { x: east, z: north }, p.y, 'port-north-right');
  for (let x = west + 5; x <= east - 4; x += 15) {
    box(port, 'yellow', x, p.y + .018, north + 2.4, 8, .02, .2, { detail: true });
    box(port, 'dark', x, .1, south + .18, 2, 3.3, 1.1);
    box(port, 'metal', x, p.y + .24, south - .8, .68, .48, .8);
  }
  function container(x, z, level, color, number) {
    const y = p.y + level * 2.7 + 1.3;
    solid(port, color, x, y, z, 12, 2.6, 2.45, `container-${number}`, 'freight-container');
    for (let dx = -5.7; dx < 6; dx += .53) for (const side of [-1, 1]) box(port, color, x + dx, y, z + side * 1.25, .07, 2.38, .07, { detail: true });
    for (const dx of [-5.7, 5.7]) for (const dz of [-1.08, 1.08]) box(port, 'metal', x + dx, y, z + dz, .12, 2.65, .12, { detail: true });
    for (const dz of [-.66, .66]) box(port, 'metal', x + 6.02, y, z + dz, .08, 2.2, .065, { detail: true });
    if (level === 0) box(port, 'cream', x, y + .3, z + 1.292, 2.8, .52, .03, { detail: true });
  }
  let count = 0;
  for (let row = 0; row < 3; row++) for (let column = 0; column < 7; column++) {
    const x = -599 + column * 19, z = -366 + row * 10, height = (row + column) % 3 === 0 ? 2 : 1;
    for (let layer = 0; layer < height; layer++) container(x, z, layer, ['rust', 'sea', 'green', 'yellow'][(row * 3 + column + layer) % 4], count++);
  }
  for (const [index, x] of [-586, -505].entries()) {
    const z = -325, top = 33 + index * 5;
    for (const dx of [-10, 10]) for (const dz of [-5, 5]) {
      solid(port, 'yellow', x + dx, p.y + 9, z + dz, 1.15, 18, 1.25, `crane-${index}-leg-${dx}-${dz}`, 'freight-crane');
      box(port, 'dark', x + dx, p.y + .9, z + dz, 2.1, 1.8, 2.5);
    }
    for (const dx of [-10, 10]) beam(port, 'yellow', { x: x + dx, y: p.y + 18, z }, { x: x + dx, y: top, z: z + 4 }, 1.3);
    box(port, 'yellow', x, top, z + 4, 25, 1.2, 2.2);
    box(port, 'yellow', x, p.y + 19.2, z - 2, 23, 1.25, 20);
    for (const dx of [-10, 10]) {
      beam(port, 'metal', { x: x + dx, y: top, z: z + 4 }, { x: x + dx, y: p.y + 19.5, z: z + 22 }, .13);
      beam(port, 'yellow', { x: x + dx, y: p.y + 19, z: z - 13 }, { x: x + dx, y: p.y + 19, z: z + 24 }, .65);
      for (let step = 0; step < 5; step++) beam(port, 'metal', { x: x + dx, y: p.y + 19, z: z - 12 + step * 7 }, { x: x + dx, y: p.y + 21, z: z - 8.5 + step * 7 }, .13, true);
    }
    box(port, 'sea', x, p.y + 18, z + 10, 3.8, 3, 4.6);
    box(port, 'glass', x, p.y + 18.1, z + 12.33, 3.3, 1.9, .05);
    for (const dx of [-2.5, 2.5]) beam(port, 'dark', { x: x + dx, y: p.y + 19, z: z + 3 }, { x: x + dx, y: p.y + 6, z: z + 3 }, .05);
    box(port, 'yellow', x, p.y + 6, z + 3, 7.1, .6, 2.7);
  }
  // Wave wall, observation benches and loading markings give the pier usable
  // public space, with its main lane clear between the ramp and south edge.
  for (const x of [-623, -461]) {
    slattedBench(port, x, p.y, -314, `port-bench-${x}`);
    box(port, 'metal', x, p.y + 4.5, -312, .16, 9, .16);
    box(port, 'light', x, p.y + 8.85, -312, 1.2, .15, .65);
  }
  for (let z = -374; z < -315; z += 8) box(port, 'yellow', -619, p.y + .02, z, .2, .025, 4.5);
  box(port, 'concrete', p.x, .4, -302, 180, 1.6, 5);
  for (let x = west; x <= east; x += 6) box(port, 'stone', x, -.05, -297, 4.8, 2.5, 4.8, { ry: .6 + x % 3 });
  sign(port, '星湾货运码头 / STAR BAY FREIGHT\n公共步道 ←   装卸区域 →', -605, 6.1, -380.5, 18, Math.PI);

  // Station equipment stays outside the entrance interaction radius and does
  // not alter any original platform, ferry berth or timetable coordinates.
  for (const stop of TRANSIT_STOPS) {
    const e = stop.entrance, c = cluster(`${stop.name} · 街道设施`, e.x, e.z, 240, 100);
    const sx = e.x - 7.4, sz = e.z - 7;
    solid(c, 'metal', sx, 1.08, sz, .9, 2.16, .6, `${stop.id}-ticket`);
    box(c, 'glass', sx, 1.46, sz + .315, .61, .65, .035);
    box(c, 'cream', sx, .77, sz + .326, .52, .055, .03, { detail: true });
    box(c, 'dark', sx, .4, sz + .326, .65, .22, .03, { detail: true });
    solid(c, 'green', sx - 1.8, .5, sz, .65, 1, .65, `${stop.id}-bin`);
    box(c, 'dark', sx - 1.8, .91, sz + .332, .45, .14, .025, { detail: true });
    slattedBench(c, e.x - 8, 0, e.z + 8, `${stop.id}-bench`);
    for (const dx of [-1.9, 1.9]) solid(c, 'metal', e.x - 8 + dx, 1.6, e.z + 7.4, .09, 3.2, .09, `${stop.id}-shelter-${dx}`);
    box(c, 'metal', e.x - 8, 3.24, e.z + 8, 4.6, .13, 2.6);
    box(c, 'glass', e.x - 8, 1.7, e.z + 7.35, 3.7, 2.15, .055);
    collider(`${stop.id}-shelter-roof`, 'infrastructure-canopy', e.x - 8, e.z + 8, 2.3, 1.3, 3.175, 3.305, false);
    collider(`${stop.id}-shelter-glass`, 'infrastructure-glass', e.x - 8, e.z + 7.35, 1.85, .03, .625, 2.775);
    for (let k = -2; k <= 2; k++) box(c, 'yellow', e.x + k * .19, .028, e.z - 4, .1, .025, 1.8, { detail: true });
    sign(c, `${stop.name}\n票务 · 路线图 · 无障碍入口`, sx, 2.8, sz, 5.5);
  }

  // Bus bays are explicitly parked street furniture in this release. Rail and
  // ferry are the four playable scheduled services; no fake boarding prompt.
  const busBays = [ { x: 645, z: -645, name: '2A 海滨 · 星汇', color: 'red' },
    { x: -645, z: -790, name: '8 榕树 · 文化馆', color: 'green' },
    { x: 645, z: -1045, name: '21 松岭 · 榕荫门', color: 'yellow' } ];
  for (const [index, bus] of busBays.entries()) {
    const side = Math.sign(bus.x), c = cluster(`巴士停靠湾 ${index + 1}`, bus.x, bus.z, 340, 120), x = bus.x, z = bus.z;
    solid(c, bus.color, x, 1.95, z, 2.6, 3.55, 10.8, `bus-${index}`, 'parked-bus');
    box(c, 'cream', x, 3.8, z, 2.6, .2, 10.8);
    box(c, 'dark', x, .48, z, 2.4, .48, 9.6);
    for (const sx of [-1, 1]) for (let dz = -4.5; dz <= 4.5; dz += 1.5) for (const y of [1.7, 3.0]) {
      box(c, 'glass', x + sx * 1.31, y, z + dz, .05, .9, 1.22);
      box(c, 'cream', x + sx * 1.315, 2.35, z + dz, .06, .15, 1.49, { detail: true });
    }
    for (const dz of [-5.43, 5.43]) {
      box(c, 'glass', x, 1.84, z + dz, 2.22, 1.1, .05);
      box(c, 'glass', x, 3.06, z + dz, 2.22, .91, .05);
      for (const dx of [-.85, .85]) box(c, 'light', x + dx, .84, z + dz, .34, .22, .06);
    }
    // Wheel faces use a shared round geometry, with chassis shadows giving
    // separate tire/body silhouettes at street viewing distance.
    const tyreGeo = new THREE.CylinderGeometry(.48, .48, .23, 16); geometries.add(tyreGeo);
    for (const sx of [-1, 1]) for (const dz of [-3.5, 3.5]) {
      const wheel = new THREE.Mesh(tyreGeo, material('dark')); wheel.rotation.z = Math.PI / 2; wheel.position.set(x + sx * 1.32, .49, z + dz); c.group.add(wheel);
    }
    const shelterX = x + side * 11;
    for (const dz of [-5.2, 5.2]) solid(c, 'metal', shelterX, 1.75, z + dz, .12, 3.5, .12, `bus-shelter-${index}-${dz}`);
    box(c, 'metal', shelterX, 3.53, z, 3.8, .14, 11.7);
    box(c, 'glass', shelterX + side * 1.6, 1.9, z, .06, 2.6, 10.7);
    collider(`bus-roof-${index}`, 'infrastructure-canopy', shelterX, z, 1.9, 5.85, 3.46, 3.6, false);
    collider(`bus-glass-${index}`, 'infrastructure-glass', shelterX + side * 1.6, z, .03, 5.35, .6, 3.2);
    for (const dz of [-3.8, 0, 3.8]) {
      box(c, 'wood', shelterX, .54, z + dz, 1.2, .15, 2.7);
      box(c, 'wood', shelterX + side * .55, .93, z + dz, .14, .79, 2.7);
    }
    sign(c, bus.name, x, 2.32, z + 5.49, 2.15);
    sign(c, `巴士站 / BUS\n${bus.name}`, shelterX, 3.9, z + 5.7, 6);
  }

  let instanceCount = 0, batchCount = 0;
  for (const c of clusters) for (const batch of c.pools.values()) {
    const mesh = new THREE.InstancedMesh(boxGeometry, material(batch.key), batch.transforms.length);
    mesh.name = `${c.name} · ${batch.key}${batch.detail ? ' · nearby' : ''}`;
    mesh.userData.noShadow = batch.detail || ['light', 'glass', 'cream'].includes(batch.key);
    mesh.castShadow = quality === 'high' && !mesh.userData.noShadow; mesh.receiveShadow = true;
    batch.transforms.forEach((t, i) => { dummy.position.set(t[0], t[1], t[2]); dummy.scale.set(t[3], t[4], t[5]); dummy.rotation.set(t[6], t[7], t[8]); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.computeBoundingSphere(); c.group.add(mesh); if (batch.detail) c.detailMeshes.push(mesh);
    instanceCount += batch.transforms.length; batchCount++;
  }
  const metadata = Object.freeze({ flyovers: FLYOVERS, port: FREIGHT_PORT, parkedBuses: busBays.length, stationEntrances: TRANSIT_STOPS.length,
    containerCount: count, instanceCount, batchCount, supportReach: REACH,
    streetLifeStops: busBays.map((bus, i) => ({ id: `bus-bay-${i + 1}`, x: Math.sign(bus.x) * 654.8, z: bus.z, name: bus.name,
      buildingId: ['lantern-tower', 'banyan-teahouse', 'lighthouse-residence'][i] })),
    routes: FLYOVERS.map(road => ({ id: road.id, name: road.name, entrance: INFRASTRUCTURE_LANDMARKS.find(l => l.id === road.id).entrance,
      width: road.width, points: Array.from({ length: 61 }, (_, i) => roadPoint(road, road.start + (road.end - road.start) * i / 60)) })),
    paths: [...FLYOVERS.map(road => ({ id: road.id, name: road.name, from: roadPoint(road, road.start, 2.8),
      to: roadPoint(road, road.end, 2.8), crest: roadPoint(road, (road.start + road.end) / 2, 2.8), axis: road.axis })),
      { id: p.id, from: { x: r.x, z: r.start, y: 0 }, to: { x: r.x, z: -320, y: p.y }, axis: 'z' }] });
  return { root, colliders, metadata, landmarks: INFRASTRUCTURE_LANDMARKS, groundHeightAt: infrastructureGroundHeightAt, supportAt: infrastructureSupportAt,
    update(viewer) { const v = viewer?.position || viewer; if (!v) return;
      for (const c of clusters) { const d = Math.hypot(v.x - c.x, v.z - c.z); c.group.visible = d < c.far; for (const mesh of c.detailMeshes) mesh.visible = d < c.near; } },
    setQuality(value) { root.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = value === 'high' && !mesh.userData.noShadow; }); },
    dispose() { root.removeFromParent(); root.traverse(mesh => { if (mesh.isInstancedMesh) mesh.dispose(); });
      for (const g of geometries) g.dispose(); for (const m of materials.values()) m.dispose(); for (const d of disposable) d.dispose(); },
  };
}
