import { METROPOLIS_BUILDINGS } from './metropolis-catalog.js';
import { createMetropolisMaterials } from './metropolis-materials.js';
import { getRoomDesign } from './metropolis-room-designs.js';

const WALL = 0.3;
const CABIN = { width: 4.4, depth: 4.6, height: 3.25 };
const COLORS = {
  limestone: '#d1c8b7', plaster: '#e0dbcf', timber: '#896548', walnut: '#493b30',
  carpet: '#546b68', upholstery: '#ab7558', navy: '#334852', metal: '#627578',
  brass: '#b09b6e', white: '#ede6d7', dark: '#27373d', glass: '#9dc1c5',
  ceramic: '#d7c6ad', leaves: '#486d52', paper: '#d8bf96', teal: '#548f89',
  light: '#f6dfb1', red: '#965a4e', blue: '#62829a', food: '#bd9464',
};
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const isObservation = floor => /observation|observatory|terrace|rooftop|skydeck|观景|天台/i.test(`${floor.type} ${floor.label}`);
const isGround = (building, floor) => floor.id === building.floors[0].id;

/** Layout metadata is the single source of truth for rendered solids and collision.
 * Positions remain in city coordinates, including the actual elevation of each floor. */
export function createInteriorLayout(building, floor) {
  if (!building || !floor) throw new Error('An interior requires a building and a floor.');
  const width = building.width - 0.7, depth = building.depth - 0.7;
  const next = building.floors.find(candidate => candidate.y > floor.y);
  const height = next ? clamp(next.y - floor.y - 0.25, 3.2, 5.2) : 4.6;
  const parts = [], colliders = [], labels = [], lights = [], rooms = [];
  const design = getRoomDesign(building.id, floor.id);
  const origin = { x: building.x, z: building.z, y: floor.y };
  let serial = 0;
  const box = (material, x, y, z, sx, sy, sz, kind = 'detail', solid = false) => {
    const part = { id: `${building.id}:${floor.id}:${++serial}`, material, x: origin.x + x,
      y: origin.y + y, z: origin.z + z, sx, sy, sz, kind, geometry: 'box' };
    parts.push(part);
    if (solid) colliders.push({ id: part.id, kind: `interior-${kind}`, x: part.x, z: part.z,
      hx: sx / 2, hz: sz / 2, minY: part.y - sy / 2, maxY: part.y + sy / 2, physics: true, camera: true });
    return part;
  };
  const solid = (material, x, y, z, sx, sy, sz, kind = 'furniture') => box(material, x, y, z, sx, sy, sz, kind, true);
  // Geometry and collision share dimensions; soft shapes keep conservative AABBs.
  const shaped = (geometry, material, x, y, z, sx, sy, sz, kind = 'detail', collision = false) => {
    const part = box(material, x, y, z, sx, sy, sz, kind, collision); part.geometry = geometry; return part;
  };
  const round = (m, x, y, z, sx, sy, sz, kind = 'furniture', collision = true) => shaped('rounded', m, x, y, z, sx, sy, sz, kind, collision);
  const cylinder = (m, x, y, z, sx, sy, sz = sx, kind = 'detail', collision = false) => shaped('cylinder', m, x, y, z, sx, sy, sz, kind, collision);
  const sphere = (m, x, y, z, sx, sy = sx, sz = sx) => shaped('sphere', m, x, y, z, sx, sy, sz);
  const label = (text, x, y, z, sx = 4, sy = 0.7, color = '#e9dfc7', rotation = 0) => labels.push({ text,
    x: origin.x + x, y: origin.y + y, z: origin.z + z, width: sx, height: sy, color, rotation });
  const ground = isGround(building, floor), observation = isObservation(floor);
  const elevator = { x: origin.x, z: origin.z - depth / 2 + 3.7, y: floor.y,
    width: CABIN.width, depth: CABIN.depth, doorZ: origin.z - depth / 2 + 3.7 + CABIN.depth / 2 };
  const entrance = { x: origin.x, z: origin.z + depth / 2 - 2.8, yaw: Math.PI };
  const floorMaterial = design.floorFinish;
  box(floorMaterial, 0, -0.16, 0, width, 0.32, depth, 'floor');
  // Inlaid joints and perimeter bands give floors scale without texture shimmer.
  const jointSpacing = floorMaterial === 'limestone' ? 4.8 : 2.4;
  for (let x = -width / 2 + 2; x < width / 2; x += jointSpacing) box('limestone', x, 0.006, 0, 0.016, 0.009, depth - 0.3);
  for (let z = -depth / 2 + 2; z < depth / 2; z += jointSpacing) box('limestone', 0, 0.006, z, width - 0.3, 0.009, 0.016);
  box('brass', 0, 0.017, 0, 0.09, 0.015, depth - 5);
  if (!observation) {
    solid('plaster', 0, height + 0.12, 0, width, 0.24, depth, 'ceiling');
    // Shallow coffers and warm strips frame the ceiling and central route.
    for (const x of [-width / 2 + 0.7, -4.6, 4.6, width / 2 - 0.7]) {
      box('walnut', x, height - 0.12, 0, 0.18, 0.25, depth - 0.5);
      box('light', x + 0.13, height - 0.18, 0, 0.045, 0.07, depth - 1);
    }
  }
  // Windows are actual openings above a solid sill. The glass keeps collision
  // consistent while allowing the original city to remain visible outside.
  for (const side of [-1, 1]) {
    const x = side * width / 2;
    solid(observation ? 'metal' : 'plaster', x, 0.5, 0, WALL, 1, depth, 'wall');
    solid('glass', x, 1.75, 0, 0.12, 1.5, depth - 0.4, 'window');
    if (!observation) solid('plaster', x, (height + 2.5) / 2, 0, WALL, height - 2.5, depth, 'wall');
    for (let z = -depth / 2 + 1; z < depth / 2; z += 4.8) box('metal', x - side * 0.09, observation ? 1.2 : height / 2, z, 0.22, observation ? 1.4 : height, 0.15);
    box('walnut', x - side * 0.16, 0.15, 0, 0.1, 0.22, depth - 0.3);
  }
  solid(observation ? 'metal' : 'plaster', 0, observation ? 0.65 : height / 2, -depth / 2,
    width, observation ? 1.3 : height, WALL, 'wall');
  const frontSegment = (width - 4.4) / 2;
  for (const side of [-1, 1]) {
    const x = side * (2.2 + frontSegment / 2);
    solid('plaster', x, 0.5, depth / 2, frontSegment, 1, WALL, 'wall');
    solid('glass', x, 1.75, depth / 2, frontSegment, 1.5, 0.12, 'window');
    if (!observation) solid('plaster', x, (height + 2.5) / 2, depth / 2, frontSegment, height - 2.5, WALL, 'wall');
    box('metal', side * 2.25, 1.7, depth / 2, 0.12, 3.4, 0.3);
  }
  if (!ground) solid('glass', 0, 1.3, depth / 2, 4.4, 2.6, 0.12, 'window');
  else {
    box('dark', 0, 3.3, depth / 2, 4.6, 0.35, 0.4, 'door-frame');
    box('carpet', 0, 0.022, depth / 2 - 1.7, 4.1, 0.025, 2.6);
    label('EXIT · 街道', 2.8, 2.7, depth / 2 - 0.18, 1.1, 0.24, '#d0ebdc', Math.PI);
  }
  label(building.name, 0, Math.min(height - 0.45, 3.75), -depth / 2 + 0.19, Math.min(width - 4, 9), 0.72);
  label(`${design.name} · ${floor.label.split(' · ')[0]}`, 0, 2.95, -depth / 2 + 6.22, 6, 0.48);
  // The 8 m central aisle always remains clear from entrance to elevator.
  for (const z of [-depth / 4, depth / 4]) {
    box('brass', 0, 0.022, z, 0.65, 0.02, 0.12);
    if (!observation) lights.push({ x: origin.x, y: origin.y + height - 0.65, z: origin.z + z, intensity: 18, distance: Math.max(width, depth) * 0.85 });
  }
  const plant = (x, z, scale = 1) => {
    cylinder('ceramic', x, 0.38 * scale, z, 0.82 * scale, 0.76 * scale, 0.82 * scale, 'planter', true);
    cylinder('walnut', x, 0.78 * scale, z, 0.68 * scale, 0.025, 0.68 * scale);
    cylinder('walnut', x, 1.03 * scale, z, 0.095, 1.2 * scale, 0.095);
    for (const [dx, dz, dy] of [[0, 0, 1.78], [-0.33, 0.12, 1.43], [0.31, -0.16, 1.58], [-0.05, -0.28, 1.93]]) {
      sphere('leaves', x + dx * scale, dy * scale, z + dz * scale, 0.67 * scale, 0.78 * scale, 0.55 * scale);
    }
  };
  const chair = (x, z, facing = 1, color = 'upholstery', rise = 0) => {
    round(color, x, rise + 0.47, z, 0.65, 0.2, 0.68, 'chair');
    round(color, x, rise + 0.9, z - facing * 0.3, 0.65, 0.75, 0.15, 'chair');
    for (const dx of [-0.24, 0.24]) for (const dz of [-0.23, 0.23]) box('walnut', x + dx, rise + 0.23, z + dz, 0.075, 0.45, 0.075);
  };
  const table = (x, z, sx = 2.1, sz = 1.2, material = 'timber') => {
    round(material, x, 0.83, z, sx, 0.16, sz, 'table');
    for (const dx of [-sx / 2 + 0.18, sx / 2 - 0.18]) for (const dz of [-sz / 2 + 0.16, sz / 2 - 0.16]) box('metal', x + dx, 0.39, z + dz, 0.08, 0.78, 0.08);
  };
  const sofa = (x, z, sx = 3.6, facing = 1) => {
    round('upholstery', x, 0.4, z, sx, 0.68, 1.2, 'sofa');
    round('upholstery', x, 0.9, z - facing * 0.52, sx, 0.72, 0.23, 'sofa');
    for (const dx of [-sx / 2 + 0.18, sx / 2 - 0.18]) round('upholstery', x + dx, 0.61, z, 0.3, 0.72, 1.19, 'sofa');
    for (const dx of [-sx / 2 + 0.36, sx / 2 - 0.36]) for (const dz of [-0.42, 0.42]) cylinder('walnut', x + dx, 0.13, z + dz, 0.1, 0.22);
    for (let i = -sx / 2 + 0.55; i < sx / 2; i += 0.85) round('fabric', x + i, 0.78, z - facing * 0.28, 0.55, 0.36, 0.18, 'cushion', false);
  };
  const shelf = (x, z, sx = 3.4, type = 'books') => {
    solid('walnut', x, 1.25, z, sx, 2.5, 0.55, 'shelf');
    for (let row = 0; row < 4; row++) {
      box('timber', x, 0.35 + row * 0.55, z + 0.3, sx, 0.07, 0.68);
      for (let col = 0; col < 6; col++) {
        const color = ['teal', 'paper', 'red', 'blue'][(row + col) % 4];
        box(type === 'books' ? color : 'white', x - sx / 2 + 0.35 + col * (sx - 0.5) / 6,
          0.57 + row * 0.55, z + 0.37, type === 'books' ? 0.18 : 0.3, 0.32, 0.26);
      }
    }
  };
  const screen = (x, z, elevation = 1.2) => {
    box('metal', x, elevation - 0.17, z, 0.12, 0.28, 0.1);
    box('dark', x, elevation + 0.08, z, 0.76, 0.47, 0.08);
    box('blue', x, elevation + 0.08, z + 0.05, 0.67, 0.37, 0.012);
    box('white', x - 0.18, elevation + 0.1, z + 0.06, 0.19, 0.015, 0.014);
  };
  const desk = (x, z) => { table(x, z, 2, 0.9); screen(x + 0.3, z - 0.15); chair(x, z + 0.9, -1, 'navy'); box('paper', x - 0.5, 0.94, z + 0.1, 0.4, 0.06, 0.28); };
  const art = (x, z, hue = 'teal') => {
    solid('limestone', x, 0.48, z, 1.7, 0.96, 1.7, 'display');
    box('brass', x, 1.5, z, 0.42, 1.05, 0.42);
    box(hue, x, 2.04, z, 1.15, 0.32, 0.82);
    box(hue, x + 0.3, 2.39, z, 0.48, 0.6, 0.5);
    box('white', x, 1.02, z + 0.86, 0.8, 0.23, 0.035);
  };
  const bed = (x, z, sx = 2.3) => {
    solid('walnut', x, 0.3, z, sx + 0.15, 0.6, 3.25, 'bed');
    round('fabric', x, 0.71, z, sx, 0.35, 3.1, 'mattress', false);
    round('upholstery', x, 0.93, z + 0.7, sx + 0.03, 0.12, 1.55, 'blanket', false);
    solid('timber', x, 0.86, z - 1.6, sx + 0.4, 1.5, 0.14, 'bed');
    for (const dx of [-0.55, 0.55]) round('fabric', x + dx, 0.96, z - 0.95, 0.76, 0.22, 0.48, 'pillow', false);
    solid('timber', x + sx / 2 + 0.65, 0.38, z - 0.9, 0.7, 0.76, 0.65, 'cabinet');
    cylinder('light', x + sx / 2 + 0.65, 1.04, z - 0.9, 0.38, 0.5);
  };
  const kitchen = (x, z, sx = 5.5) => {
    solid('white', x, 0.53, z, sx, 1.06, 0.9, 'counter');
    box('dark', x, 1.1, z, sx + 0.05, 0.1, 1);
    for (let dx = -sx / 2 + 0.6; dx < sx / 2; dx += 1.05) {
      box('timber', x + dx, 0.5, z + 0.46, 0.9, 0.85, 0.035);
      box('brass', x + dx + 0.3, 0.67, z + 0.49, 0.06, 0.22, 0.03);
    }
    box('metal', x - sx / 4, 1.16, z, 0.8, 0.04, 0.6);
    box('metal', x - sx / 4, 1.4, z - 0.28, 0.09, 0.44, 0.09);
    for (const dx of [0.8, 1.4]) box('dark', x + dx, 1.16, z + 0.06, 0.35, 0.04, 0.35);
    box('white', x, 2.23, z - 0.2, sx, 0.8, 0.5);
  };
  const telescope = (x, z) => {
    cylinder('steel', x, 0.8, z, 0.32, 1.6, 0.32, 'telescope', true);
    round('navy', x, 1.72, z, 0.48, 0.42, 1.6, 'optical-tube', true);
    sphere('glass', x, 1.72, z - 0.81, 0.39, 0.33, 0.1);
    for (const dx of [-0.45, 0.45]) round('metal', x + dx, 0.1, z, 0.55, 0.2, 0.55, 'tripod');
  };
  const category = design.category;
  const zoneWidth = width / 2 - 7.2, zoneDepth = depth / 2 - 6.4;
  const cup = (x, z, y = 0.98, m = 'ceramic') => {
    cylinder(m, x, y, z, 0.16, 0.21); cylinder('dark', x, y + 0.109, z, 0.13, 0.012);
    round(m, x + 0.092, y, z, 0.065, 0.105, 0.075, 'cup-handle', false);
  };
  const book = (x, z, y = 0.95, m = 'red') => {
    round(m, x, y, z, 0.48, 0.07, 0.34, 'book', false);
    box('paper', x, y + 0.04, z, 0.44, 0.015, 0.3);
  };
  const lamp = (x, z, y = 0) => {
    cylinder('brass', x, y + 0.045, z, 0.45, 0.09);
    cylinder('brass', x, y + 0.72, z, 0.055, 1.4);
    cylinder('fabric', x, y + 1.48, z, 0.56, 0.44);
    cylinder('light', x, y + 1.25, z, 0.4, 0.015);
  };
  const roundTable = (x, z, diameter = 2, y = 0.82) => {
    cylinder('timber', x, y, z, diameter, 0.16, diameter, 'table', true);
    cylinder('metal', x, y / 2, z, 0.18, y, 0.18); cylinder('metal', x, 0.05, z, 0.9, 0.1);
  };
  const placeSetting = (x, z, y = 0.94) => {
    cylinder('white', x, y, z, 0.42, 0.035); cylinder('food', x, y + 0.04, z, 0.24, 0.055);
    box('steel', x + 0.28, y, z, 0.025, 0.018, 0.3); box('steel', x - 0.28, y, z, 0.025, 0.018, 0.3); cup(x + 0.36, z - 0.27, y + 0.08);
  };
  const bench = (x, z, size = 3.2) => {
    round('timber', x, 0.45, z, size, 0.16, 0.65, 'bench');
    round('timber', x, 0.87, z - 0.3, size, 0.55, 0.12, 'bench');
    for (const dx of [-size / 2 + 0.28, size / 2 - 0.28]) solid('metal', x + dx, 0.23, z, 0.12, 0.46, 0.5, 'bench-leg');
  };
  const cabinet = (x, z, sx = 3, height = 2.2, m = 'timber', kind = 'cabinet') => {
    round(m, x, height / 2, z, sx, height, 0.7, kind);
    for (let dx = -sx / 2 + 0.3; dx < sx / 2; dx += 0.62) {
      box('walnut', x + dx, height / 2, z + 0.36, 0.025, height - 0.14, 0.018);
      cylinder('brass', x + dx + 0.11, height * 0.55, z + 0.39, 0.07, 0.07, 0.07);
    }
  };
  const washbasin = (x, z) => {
    round('white', x, 0.75, z, 1.4, 0.24, 0.75, 'basin');
    round('steel', x, 0.882, z, 0.92, 0.035, 0.47, 'basin-bowl', false);
    cylinder('steel', x, 1.1, z - 0.25, 0.07, 0.45);
    round('steel', x, 1.32, z - 0.12, 0.07, 0.07, 0.33, 'tap', false);
    solid('timber', x, 0.34, z, 1.25, 0.68, 0.63, 'vanity');
    box('glass', x, 1.86, z - 0.42, 1.25, 1.18, 0.055);
    round('fabric', x + 0.5, 0.92, z + 0.16, 0.22, 0.06, 0.25, 'towel', false);
  };
  const piano = (x, z) => {
    // Rounded tail, keyboard, lid and pedals read as a grand piano at walking height.
    round('dark', x, 0.98, z, 2.55, 0.34, 2.35, 'piano');
    sphere('dark', x, 0.99, z - 0.8, 2.3, 0.32, 1.8);
    box('dark', x, 1.3, z - 0.25, 2.5, 0.09, 2.1);
    for (const dx of [-1, 1]) cylinder('dark', x + dx, 0.44, z + 0.72, 0.12, 0.88);
    cylinder('dark', x, 0.44, z - 1.25, 0.12, 0.88);
    for (let key = 0; key < 21; key++) {
      box('white', x - 1.04 + key * 0.1, 1.02, z + 1.25, 0.094, 0.07, 0.36);
      if (key % 7 !== 2 && key % 7 !== 6) box('dark', x - 0.99 + key * 0.1, 1.074, z + 1.15, 0.047, 0.05, 0.18);
    }
    round('leather', x, 0.47, z + 2.1, 1.2, 0.14, 0.56, 'piano-bench');
    cylinder('brass', x, 0.18, z + 0.4, 0.12, 0.1, 0.4); book(x, z, 1.38, 'paper');
  };
  const ship = (x, z, variant = 0) => {
    solid('limestone', x, 0.55, z, 5.8, 1.1, 2.7, 'ship-plinth');
    round('walnut', x, 1.3, z, 4.8, 0.55, 1.65, 'ship-hull', false);
    round('timber', x, 1.6, z, 4.5, 0.12, 1.45, 'ship-deck', false);
    for (const dx of [-1.2, 0.9]) {
      cylinder('walnut', x + dx, 2.25, z, 0.08, 1.55);
      box(variant % 2 ? 'navy' : 'fabric', x + dx, 2.35, z + 0.03, 1.12, 1.25, 0.04);
      box('brass', x + dx, 3, z, 1.25, 0.055, 0.055);
    }
    for (let dx = -1.7; dx < 2; dx += 0.42) for (const dz of [-0.7, 0.7]) cylinder('brass', x + dx, 1.82, z + dz, 0.035, 0.32);
    label('航船剖面 · 手工船模', x, 1.18, z + 1.37, 3.3, 0.28);
  };
  const gardenBed = (x, z, sx = 6, sz = 3) => {
    round('limestone', x, 0.32, z, sx, 0.64, sz, 'raised-planter');
    box('walnut', x, 0.652, z, sx - 0.3, 0.035, sz - 0.3);
    for (let dx = -sx / 2 + 0.7; dx < sx / 2 - 0.2; dx += 0.8) for (const dz of [-sz / 4, sz / 4]) {
      cylinder('leaves', x + dx, 0.89, z + dz, 0.035, 0.45);
      sphere('leaves', x + dx, 1.04, z + dz, 0.55, 0.5, 0.5);
      sphere(design.accent, x + dx, 1.22, z + dz, 0.14, 0.12, 0.14);
    }
  };
  const instrument = (x, z, variant = 'strings') => {
    if (variant === 'drums') {
      for (const [dx, dz, size, y] of [[0, 0, 1, 0.52], [-0.65, -0.4, 0.55, 1.05], [0.64, -0.35, 0.6, 1.02]]) {
        cylinder('red', x + dx, y, z + dz, size, 0.42, size, 'drum', true);
        cylinder('white', x + dx, y + 0.22, z + dz, size, 0.025);
      }
      for (const dx of [-1.3, 1.3]) { cylinder('metal', x + dx, 0.78, z, 0.045, 1.55); cylinder('brass', x + dx, 1.57, z, 0.8, 0.035); }
      chair(x, z + 1.3, 1, 'leather');
    } else {
      sphere('timber', x, 0.72, z, 0.85, 1.02, 0.3); sphere('timber', x, 1.26, z, 0.65, 0.67, 0.28);
      round('walnut', x, 1.81, z, 0.09, 1.1, 0.08, 'instrument-neck', false);
      for (const dx of [-0.027, 0, 0.027]) box('steel', x + dx, 1.44, z + 0.16, 0.007, 1.58, 0.007);
      cylinder('metal', x, 0.12, z, 0.035, 0.24); chair(x + 1.3, z + 0.3, 1, 'navy');
      cylinder('metal', x + 1.3, 0.62, z - 1.1, 0.04, 1.24); box('dark', x + 1.3, 1.34, z - 1.1, 0.65, 0.42, 0.04); book(x + 1.3, z - 1.05, 1.58, 'paper');
    }
  };
  const rail = (x, z, sx = 5) => { cylinder('steel', x - sx / 2, 0.58, z, 0.07, 1.16); cylinder('steel', x + sx / 2, 0.58, z, 0.07, 1.16); round('steel', x, 1.14, z, sx, 0.07, 0.07, 'handrail'); };
  const closedTypes = new Set(['living', 'bedroom', 'kitchen', 'bath', 'consult', 'ward', 'lab', 'pharmacy', 'changing', 'projection', 'control', 'study', 'classroom', 'strings', 'drums', 'office', 'archive', 'tailor']);
  const roomCenters = [-1, 1].flatMap(side => [-1, 1].map(end => ({
    x: side * (6.5 + zoneWidth / 2), z: end * (2.7 + zoneDepth / 2), side, end,
  })));
  roomCenters.forEach((room, index) => {
    const specification = design.rooms[index], { side, end, z } = room;
    const type = specification.type;
    // Primary furnishings stay near the entrance at human scale. Secondary wall
    // collections occupy the broad perimeter; none crosses the circulation spine.
    const community = floor.id === 'lobby' && type === 'living';
    const compact = !observation && ['living', 'bedroom', 'kitchen', 'bath'].includes(type) && (/residential|hotel/.test(category) || type === 'bedroom' || type === 'bath');
    const domesticSize = community ? [14, 14] : { living: [9, 10], bedroom: [8, 8], kitchen: [7, 8], bath: [5, 6] }[type];
    const roomWidth = compact ? domesticSize[0] : zoneWidth, roomDepth = compact ? domesticSize[1] : zoneDepth;
    const roomX = compact ? side * (5.5 + roomWidth / 2) : room.x;
    const x = compact ? roomX : side * (7.8 + Math.min(zoneWidth, 21) / 2);
    const span = Math.min(roomWidth - 3.5, 10.8), reach = Math.min(roomDepth / 2 - 2.4, 7.2);
    const entrance = { x: origin.x + side * 5.5, z: origin.z + z };
    rooms.push({ ...specification, x: origin.x + roomX, z: origin.z + z, width: roomWidth,
      depth: roomDepth, ceilingHeight: compact ? 2.98 : height, enclosed: !observation && closedTypes.has(type), entrance,
      arrival: { x: origin.x + side * 8.8, z: origin.z + z },
      bounds: { minX: origin.x + Math.min(side * 5.5, side * (5.5 + roomWidth)), maxX: origin.x + Math.max(side * 5.5, side * (5.5 + roomWidth)), minZ: origin.z + z - roomDepth / 2, maxZ: origin.z + z + roomDepth / 2 } });
    box(['kitchen', 'bath', 'fish', 'lab', 'pharmacy'].includes(type) ? 'ceramic' : compact ? 'timber' : observation ? 'limestone' : 'carpet', roomX, 0.024, z, roomWidth - 0.2, 0.026, roomDepth - 0.2);
    if (!observation && closedTypes.has(type)) {
      const innerX = side * 5.5, segment = (roomDepth - 3.2) / 2;
      for (const dz of [-1, 1]) solid('plaster', innerX, 1.48, z + dz * (1.6 + segment / 2), 0.2, 2.96, segment, 'partition');
      if (compact) {
        for (const dz of [-1, 1]) solid('plaster', roomX, 1.48, z + dz * roomDepth / 2, roomWidth, 2.96, 0.18, 'partition');
        solid('plaster', side * (5.5 + roomWidth), 1.48, z, 0.18, 2.96, roomDepth, 'partition');
        solid('plaster', roomX, 3.06, z, roomWidth, 0.16, roomDepth, 'ceiling');
        // The occupied apartment stops at these walls. Unopened perimeter areas
        // are not counted as extra rooms or left visible as empty public halls.
        for (const dz of [-1, 1]) box('timber', roomX, 0.13, z + dz * (roomDepth / 2 - 0.11), roomWidth - 0.2, 0.18, 0.055);
      } else solid('plaster', room.x, 1.48, end * 1.4, zoneWidth + 2, 2.96, 0.2, 'partition');
      box('timber', innerX, 2.99, z, 0.25, 0.2, 3.6, 'door-lintel');
      for (const dz of [-1.66, 1.66]) box('timber', innerX, 1.48, z + dz, 0.28, 2.96, 0.13, 'door-jamb');
    }
    // Signs sit beside doorways, not across the player's third-person camera.
    label(specification.name, side * 5.26, 2.18, z - 2.5, 2.75, 0.43, '#e9dfc7', -side * Math.PI / 2);
    if (!compact) label(specification.name, x, 2.86, z - reach - 2, Math.min(span, 7), 0.45);
    const v = specification.furnishingVariant;
    if (compact) {
      // Domestic rooms use real apartment dimensions, with usable furniture
      // against their own walls. u is distance inward from the corridor door.
      const px = u => side * (5.5 + u);
      if (type === 'living') {
        const extra = community ? 3 : 0;
        sofa(px(5.6 + extra), z - 3.6, community ? 4.3 : 3.6);
        table(px(5.6 + extra), z - 1.55, 2.15, 1.05); book(px(5.8 + extra), z - 1.5); cup(px(5.1 + extra), z - 1.5);
        chair(px(5 + extra), z + 1.5, -1, 'upholstery'); chair(px(7.1 + extra), z + 1.5, -1, 'upholstery');
        roundTable(px(6.1 + extra), z + 0.25, 0.85); cup(px(6.1 + extra), z + 0.25);
        cabinet(px(5.9 + extra), z + 4.05, 3.9, 0.76); box('dark', px(5.9 + extra), 1.53, z + 4.11, 2.2, 1.15, 0.09);
        desk(px(1.9), z + 2.7); shelf(px(5.3 + extra), z - (community ? 6.1 : 4.55), 4.1); lamp(px(7.9 + extra), z - 3.8); plant(px(7.6 + extra), z + 3.7, 0.85);
        box('carpet', px(5.7 + extra), 0.048, z - 0.6, 4.8, 0.022, 5.1);
        if (community) {
          sofa(px(4.6), z + 5.3, 3.6, -1); table(px(4.6), z + 3.8, 2.1, 0.85); book(px(4.6), z + 3.8);
          shelf(px(11.4), z + 5.9, 3.5); roundTable(px(2.4), z - 4.5, 1.35); chair(px(2.4), z - 5.7); chair(px(2.4), z - 3.25, -1); cup(px(2.4), z - 4.5);
        }
      } else if (type === 'bedroom') {
        bed(px(5.6), z - 1.7, 1.8); cabinet(px(5.6), z + 3.48, 3.8, 2.45); desk(px(2), z + 2.35);
        lamp(px(7.1), z - 2.7); round('fabric', px(5.6), 0.3, z + 0.85, 1.6, 0.46, 0.6, 'bedroom-ottoman');
        round('fabric', px(1.7), 0.4, z - 2.8, 0.66, 0.8, 0.66, 'laundry-basket');
        box('carpet', px(5.55), 0.047, z - 0.9, 3.6, 0.025, 4.7); plant(px(7.25), z + 2.2, 0.8);
        box('timber', px(5.6), 1.95, z - 3.72, 2.9, 1.2, 0.06); box('teal', px(5.6), 1.95, z - 3.68, 2.6, 0.93, 0.025);
      } else if (type === 'kitchen') {
        kitchen(px(3.5), z - 3.4, 5.4);
        solid('steel', px(6.25), 1.02, z - 1.5, 0.94, 2.04, 1, 'fridge'); box('dark', px(6.25), 1.18, z - 0.985, 0.83, 0.03, 0.02);
        solid('timber', px(4.85), 0.44, z + 1.35, 2.4, 0.88, 1.05, 'island-base'); round('limestone', px(4.85), 0.94, z + 1.35, 2.6, 0.13, 1.15, 'kitchen-island');
        cylinder('steel', px(5.2), 1.16, z + 1.35, 0.48, 0.28); box('timber', px(4.3), 1.03, z + 1.3, 0.6, 0.055, 0.4); sphere('food', px(4.3), 1.13, z + 1.3, 0.15);
        table(px(1.8), z + 2.4, 1.8, 1.05); chair(px(1.8), z + 3.35, -1); chair(px(1.8), z + 1.4); placeSetting(px(1.8), z + 2.4);
        cylinder('steel', px(6.15), 0.33, z + 3.15, 0.48, 0.66, 0.48, 'bin', true); plant(px(4.3), z + 3.4, 0.65);
        for (const dx of [-0.35, 0, 0.35]) cylinder('ceramic', px(2.7) + dx, 1.27, z - 3.37, 0.19, 0.23);
      } else {
        washbasin(px(1.3), z - 2.45);
        round('white', px(4), 0.35, z - 1.7, 1.45, 0.7, 2.1, 'bathtub'); round('blue', px(4), 0.713, z - 1.7, 1.13, 0.025, 1.82, 'bathwater', false);
        solid('glass', px(3.18), 1.3, z - 1.75, 0.07, 2.6, 2.2, 'shower-screen'); cylinder('steel', px(4.35), 1.43, z - 2.65, 0.05, 1.65); cylinder('steel', px(4.12), 2.28, z - 2.65, 0.4, 0.055);
        cylinder('white', px(1.6), 0.3, z + 1.9, 0.67, 0.6, 0.93, 'toilet', true); round('white', px(1.6), 0.72, z + 2.3, 0.68, 0.8, 0.3, 'cistern');
        cabinet(px(3.9), z + 2.38, 1.6, 1.2, 'white'); for (const dy of [0, 0.1, 0.2]) round('fabric', px(3.9), 1.27 + dy, z + 2.38, 0.6, 0.08, 0.4, 'folded-towel', false);
        box('carpet', px(2), 0.048, z - 1.25, 1.3, 0.02, 0.55);
      }
    } else if (['living', 'lounge'].includes(type)) {
      sofa(x, z - 1.6, 4.1); sofa(x + 4.7, z + 2, 3.1, -1); table(x, z + 0.45, 2.4, 1.25);
      cup(x - 0.5, z + 0.4); book(x + 0.48, z + 0.6, 0.95, design.accent); lamp(x - 2.8, z - 1.9);
      shelf(x, z - reach, 6); cabinet(x + side * 5.5, z - 2.7, 3.1, 0.75); plant(x + side * 5, z + reach - 1);
      if (type === 'living') { box('dark', x + side * 5.5, 1.6, z - 3.09, 2.45, 1.35, 0.1); table(x - 1, z + reach - 0.7, 2.4, 1.5); chair(x - 1, z + reach + 0.7, -1); }
      else { bench(x + 0.6, z + reach - 0.2, 4.1); roundTable(x - 4.2, z + 3, 1.1); cup(x - 4.2, z + 3); }
    } else if (type === 'bedroom') {
      bed(x - 1.3, z - 1.2); cabinet(x + 3.6, z - reach, 4.2, 2.7); desk(x + 4, z + 2);
      round('fabric', x - 1.3, 0.27, z + 2.3, 2.3, 0.4, 0.68, 'bedroom-ottoman'); lamp(x - 3.3, z - 2.2);
      cabinet(x - 1.3, z + reach - 0.4, 4.1, 0.85); box('glass', x - 1.3, 1.9, z + reach - 0.83, 1.8, 1.5, 0.05);
      plant(x + 5.2, z + reach - 0.2); cylinder('fabric', x + 3.8, 0.4, z + reach - 0.3, 0.65, 0.8, 0.65, 'laundry-basket', true);
    } else if (type === 'bath') {
      washbasin(x - 2.1, z - 2.5); washbasin(x - 0.3, z - 2.5);
      round('white', x + 3.5, 0.36, z - 1, 2.1, 0.72, 3.3, 'bathtub'); round('blue', x + 3.5, 0.74, z - 1, 1.6, 0.025, 2.75, 'bathwater', false);
      cylinder('white', x - 2.5, 0.3, z + 3.4, 0.7, 0.6, 1, 'toilet', true); round('white', x - 2.5, 0.64, z + 3.03, 0.7, 0.8, 0.3, 'cistern');
      solid('glass', x + 1.6, 1.3, z + 3.3, 0.1, 2.6, 3.1, 'shower-screen'); solid('metal', x + 3.4, 0.04, z + 3.3, 3.3, 0.08, 3.1, 'shower-tray');
      cylinder('steel', x + 4.4, 1.65, z + 2.1, 0.08, 1.75); cylinder('steel', x + 4.15, 2.51, z + 2.1, 0.65, 0.06);
      cabinet(x, z - reach, 2.4, 1.2, 'white'); for (let n = 0; n < 4; n++) round('fabric', x + (n % 2) * 0.5 - 0.25, 1.27 + Math.floor(n / 2) * 0.1, z - reach, 0.42, 0.08, 0.42, 'folded-towel', false);
      bench(x - 4.3, z + 0.7, 1.7); plant(x + 4.7, z - reach);
    } else if (type === 'kitchen') {
      kitchen(x, z - reach + 0.5, 8.6); kitchen(x + 4.4, z - 1.2, 3.1);
      solid('steel', x - 4.3, 1.14, z - reach + 0.3, 1.45, 2.28, 1.05, 'fridge');
      box('dark', x - 4.3, 1.36, z - reach + 0.85, 1.26, 0.045, 0.025);
      round('limestone', x, 1.01, z, 4.5, 0.18, 1.4, 'kitchen-island'); solid('timber', x, 0.48, z, 4.15, 0.96, 1.15, 'island-base');
      for (const dx of [-1.3, 0, 1.3]) { cylinder('steel', x + dx, 0.6, z - 0.3, 0.32, 0.36); cylinder('steel', x + dx, 1.15, z - 0.2, 0.5, 0.24); }
      box('timber', x - 1.2, 1.12, z + 0.2, 0.6, 0.04, 0.4); sphere('food', x - 1.22, 1.23, z + 0.2, 0.19);
      table(x, z + reach - 0.2, 3.3, 1.5); for (const dx of [-1.1, 1.1]) { chair(x + dx, z + reach - 1.45); chair(x + dx, z + reach + 1.05, -1); placeSetting(x + dx, z + reach - 0.15); }
      cylinder('steel', x + 4.4, 0.4, z + 3.1, 0.65, 0.8, 0.65, 'bin', true); plant(x - 4.5, z + reach);
    } else if (['dining', 'tea', 'cafe', 'booth', 'bar'].includes(type)) {
      if (type === 'booth') {
        for (const dx of [-3.2, 3.2]) { sofa(x + dx, z - 1.3, 2.7); sofa(x + dx, z + 1.3, 2.7, -1); table(x + dx, z, 2.15, 1.3); placeSetting(x + dx - 0.6, z); placeSetting(x + dx + 0.6, z); }
        kitchen(x, z - reach, 6.6);
      } else if (type === 'bar' || type === 'cafe') {
        round('timber', x, 0.65, z - 1.5, 7.2, 1.3, 1.4, 'bar'); round('limestone', x, 1.35, z - 1.5, 7.45, 0.12, 1.55, 'bar-top');
        for (const dx of [-2.5, -0.85, 0.85, 2.5]) { cylinder('leather', x + dx, 0.85, z + 0.3, 0.64, 0.16, 0.64, 'bar-stool', true); cylinder('steel', x + dx, 0.42, z + 0.3, 0.12, 0.84); cup(x + dx, z - 1.2, 1.52); }
        shelf(x, z - reach, 6.6, 'products'); round('steel', x - 1.8, 1.72, z - 1.5, 1.05, 0.6, 0.7, 'espresso-machine', false);
        for (const dx of [-3.1, 3.1]) { roundTable(x + dx, z + reach - 0.6, 1.35); chair(x + dx, z + reach + 0.6, -1); chair(x + dx, z + reach - 1.8); cup(x + dx, z + reach - 0.6); }
      } else {
        for (const dx of [-3.15, 3.15]) { roundTable(x + dx, z, type === 'tea' ? 1.8 : 2.8); for (const dz of [-1.95, 1.95]) chair(x + dx, z + dz, dz < 0 ? 1 : -1); for (const p of [-0.55, 0.55]) placeSetting(x + dx + p, z); }
        shelf(x, z - reach, 6.3, type === 'tea' ? 'medicine' : 'products');
        if (type === 'tea') { cylinder('ceramic', x, 0.98, z + reach - 0.7, 0.42, 0.36); table(x, z + reach - 0.7, 2.8, 0.8); cup(x - 0.55, z + reach - 0.7); cup(x + 0.55, z + reach - 0.7); }
        else sofa(x, z + reach - 0.3, 5.8, -1);
      }
      plant(x + side * 5.4, z + reach - 0.4); lamp(x - 5, z - 3.2);
    } else if (['reception', 'teller', 'ticket', 'post', 'mail'].includes(type)) {
      const low = type === 'mail';
      round('timber', x, low ? 0.5 : 0.6, z - 1.5, 7.2, low ? 1 : 1.2, 1.3, type === 'teller' ? 'teller-counter' : 'reception');
      for (const dx of [-2.4, 0, 2.4]) { screen(x + dx, z - 1.55, 1.53); chair(x + dx, z + 0.5, -1); book(x + dx + 0.4, z - 1.4, 1.27, 'paper'); }
      if (['post', 'mail'].includes(type)) {
        for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
          round('metal', x - 2.8 + col * 0.8, 0.42 + row * 0.55, z - reach, 0.7, 0.45, 0.62, 'mailbox');
          box('dark', x - 2.8 + col * 0.8, 0.48 + row * 0.55, z - reach + 0.32, 0.45, 0.04, 0.02);
        }
      } else { cabinet(x, z - reach, 6.4, 2.2); label(type === 'ticket' ? '实时交通请查看站外线路牌' : '服务时间 09:00–18:00', x, 2.9, z - reach + 0.42, 5.1, 0.35); }
      bench(x - 2.3, z + reach - 0.5, 3.4); bench(x + 2.3, z + reach - 0.5, 3.4); plant(x + 5.2, z + 0.7);
    } else if (['waiting', 'luggage', 'changing'].includes(type)) {
      for (const dx of [-3.1, 3.1]) { bench(x + dx, z - 1.2, 3.8); bench(x + dx, z + 2.1, 3.8); }
      if (type !== 'waiting') {
        cabinet(x, z - reach, 8, 2.4, 'metal', 'locker');
        for (let n = 0; n < 6; n++) { const px = x - 3.2 + n * 1.2; round(n % 2 ? 'navy' : 'red', px, 0.52, z + reach - 0.2, 0.72, 1.04, 0.55, 'suitcase'); box('metal', px, 1.12, z + reach - 0.2, 0.38, 0.15, 0.04); for (const dx of [-0.25, 0.25]) sphere('dark', px + dx, 0.09, z + reach, 0.16); }
      } else { shelf(x, z - reach, 5.5); table(x, z + reach - 0.5, 3.6, 0.9); book(x, z + reach - 0.5); }
      plant(x + 5.1, z + 1); lamp(x - 5.1, z - 1);
    } else if (['library', 'archive', 'bookshop', 'study'].includes(type)) {
      for (const dx of [-4.1, 4.1]) shelf(x + dx, z - reach, 5.3, type === 'archive' ? 'samples' : 'books');
      table(x, z, type === 'study' ? 4.2 : 6.8, 1.45);
      for (const dx of [-2.5, 0, 2.5]) { chair(x + dx, z + 1.4, -1); chair(x + dx, z - 1.4); book(x + dx, z, 0.95, design.accent); lamp(x + dx + 0.7, z - 0.1, 0.88); }
      if (type === 'archive') { for (const dx of [-3, 3]) cabinet(x + dx, z + reach - 0.3, 4.5, 2.6, 'metal', 'archive-cabinet'); }
      else { sofa(x, z + reach - 0.2, 4.7, -1); roundTable(x + 4.6, z + 3.4, 1.2); }
      plant(x - 5.6, z + 2.5);
    } else if (['office', 'cowork', 'control', 'trading', 'drafting'].includes(type)) {
      for (const dx of [-3.2, 3.2]) for (const dz of [-2.4, 2.4]) {
        desk(x + dx, z + dz);
        if (type === 'control' || type === 'trading') { screen(x + dx - 0.65, z + dz - 0.15); screen(x + dx + 0.9, z + dz - 0.15); }
        if (type === 'drafting') { box('paper', x + dx, 0.95, z + dz, 1.6, 0.025, 0.78); for (let n = 0; n < 4; n++) box('navy', x + dx - 0.4 + n * 0.28, 0.97, z + dz, 0.018, 0.009, 0.58); cylinder('paper', x + dx + 0.8, 1.05, z + dz, 0.14, 0.45); }
      }
      shelf(x, z - reach, 6); cabinet(x, z + reach - 0.3, 5.7, 0.9); plant(x + 5.4, z + reach - 0.3); cup(x, z + reach - 0.3, 1.02);
    } else if (type === 'conference') {
      table(x, z, 7.4, 2.2); for (const dx of [-2.8, -0.9, 0.9, 2.8]) { chair(x + dx, z - 1.9); chair(x + dx, z + 1.9, -1); cup(x + dx, z - 0.5); book(x + dx, z + 0.5, 0.95, 'paper'); }
      solid('dark', x, 1.8, z - reach, 4.5, 2.5, 0.15, 'presentation-screen'); box('blue', x, 1.8, z - reach + 0.09, 4.2, 2.2, 0.02);
      kitchen(x, z + reach, 5); plant(x + 5.4, z + 0.7);
    } else if (['auditorium', 'lecture', 'classroom', 'cinema'].includes(type)) {
      const screening = type === 'cinema' || (building.id === 'golden-cinema' && type === 'auditorium');
      for (let row = 0; row < 3; row++) {
        const rz = z + row * 1.8 - 1.1;
        solid('walnut', x, 0.06 + row * 0.14, rz, 9.2, 0.12 + row * 0.28, 1.6, 'audience-terrace');
        // Seats remain beside the central room entry aisle; terraces are low
        // display platforms rather than unmodeled traversable stair physics.
        for (const dx of [-3.3, -1.65, 1.65, 3.3]) { chair(x + dx, rz, 1, 'red', 0.12 + row * 0.28); if (type === 'classroom') table(x + dx, rz - 0.62, 1.15, 0.5); }
      }
      solid('timber', x, 0.24, z - reach, 8.8, 0.48, 2.5, 'stage');
      if (screening) { solid('dark', x, 2.02, z - reach - 0.9, 9, 3.7, 0.16, 'screen'); box('paper', x, 2.02, z - reach - 0.8, 8.45, 3.2, 0.025); }
      else { round('timber', x - 2.8, 0.95, z - reach, 0.95, 1.4, 0.7, 'lectern'); screen(x + 1.8, z - reach, 1.5); }
      for (const dx of [-5.1, 5.1]) solid('dark', x + dx, 1, z - reach, 0.7, 2, 0.75, 'speaker');
    } else if (['stage', 'piano', 'strings', 'drums', 'projection'].includes(type)) {
      if (type === 'piano') { piano(x - 1.8, z - 1.2); sofa(x + 3, z + 3, 3.5, -1); shelf(x, z - reach, 5.4); }
      else if (type === 'projection') {
        for (const dx of [-2.5, 2.5]) { solid('metal', x + dx, 0.55, z, 1.4, 1.1, 1.2, 'projector-base'); round('dark', x + dx, 1.32, z, 1.2, 0.7, 1.6, 'projector'); sphere('metal', x + dx - 0.35, 1.98, z - 0.2, 0.95, 0.95, 0.18); sphere('metal', x + dx + 0.4, 2, z + 0.1, 0.95, 0.95, 0.18); }
        shelf(x, z - reach, 6, 'products'); desk(x + 3.2, z + reach - 0.4);
      } else if (type === 'stage') {
        solid('timber', x, 0.24, z - 1.2, 9.4, 0.48, 5.4, 'stage'); piano(x - 2.6, z - 2.1); instrument(x + 2.9, z - 1.5, 'strings');
        for (const dx of [-3, 0, 3]) chair(x + dx, z + 4.1, 1, 'red');
      } else { for (const dx of [-3.2, 3.2]) instrument(x + dx, z, type); shelf(x, z - reach, 5.5); desk(x, z + reach - 0.4); }
      bench(x - 3.4, z + reach, 2.8); plant(x + 5.2, z + reach - 0.6);
    } else if (['consult', 'ward', 'pharmacy', 'rehab'].includes(type)) {
      if (type === 'consult' || type === 'ward') {
        bed(x - 2.6, z - 0.4, 1.1); cylinder('steel', x - 4, 1.15, z - 1.6, 0.045, 2.3); sphere('white', x - 4, 2, z - 1.6, 0.3, 0.52, 0.16);
        if (type === 'ward') { bed(x + 2.6, z - 0.4, 1.1); solid('fabric', x, 1.35, z - 1, 0.12, 2.7, 4.6, 'privacy-screen'); }
        else { desk(x + 2.5, z + 1.2); screen(x + 2.6, z - 3, 1.6); }
        washbasin(x + 3.8, z - reach); cabinet(x - 1.5, z - reach, 4, 1.7, 'white');
      } else if (type === 'pharmacy') { for (const dz of [-reach, -1, reach]) shelf(x, z + dz, 8, 'medicine'); table(x + 4, z + 2.5, 2.4, 1.1, 'white'); screen(x + 4, z + 2.4); }
      else {
        for (const dx of [-2.6, 2.6]) { rail(x + dx, z - 1.3, 3.3); rail(x + dx, z + 1.3, 3.3); box('carpet', x + dx, 0.06, z, 3.8, 0.04, 2.3); }
        for (const dx of [-3.8, 0, 3.8]) sphere('teal', x + dx, 0.5, z - reach + 0.3, 0.9);
        cabinet(x, z - reach, 5, 1.5, 'white'); bench(x, z + reach - 0.2, 5.8);
      }
      sofa(x + 0.6, z + reach - 0.2, 3.8, -1); plant(x + 5.3, z + 3);
    } else if (['lab', 'robot', 'aquarium'].includes(type)) {
      for (const dz of [-2.7, 2.7]) {
        table(x, z + dz, 7.3, 1.45, 'white');
        for (const dx of [-2.4, 0, 2.4]) {
          if (type === 'robot') { cylinder('metal', x + dx, 1.05, z + dz, 0.5, 0.25); round('white', x + dx, 1.47, z + dz, 0.2, 0.72, 0.2, 'robot-arm', false); sphere('teal', x + dx, 1.83, z + dz, 0.27); round('metal', x + dx + 0.22, 1.84, z + dz, 0.5, 0.12, 0.12, 'robot-gripper', false); }
          else if (type === 'aquarium') { round('glass', x + dx, 1.42, z + dz, 1.35, 0.94, 0.82, 'tank', false); box('blue', x + dx, 1.3, z + dz, 1.2, 0.65, 0.7); sphere('food', x + dx, 1.4, z + dz + 0.37, 0.38, 0.17, 0.12); }
          else { cylinder('glass', x + dx, 1.16, z + dz + 0.3, 0.22, 0.43); cylinder('teal', x + dx, 1.06, z + dz + 0.3, 0.18, 0.2); round('steel', x + dx, 1.1, z + dz - 0.3, 0.62, 0.32, 0.45, 'microscope-base', false); round('white', x + dx, 1.56, z + dz - 0.45, 0.12, 0.65, 0.15, 'microscope', false); }
          chair(x + dx, z + dz + 1.25, -1, 'navy');
        }
      }
      cabinet(x, z - reach, 7, 2.2, 'white'); washbasin(x + 5, z + reach - 0.2);
    } else if (['gallery', 'maritime', 'model', 'orrery'].includes(type)) {
      if (type === 'maritime') {
        ship(x, z - 0.9, v); telescope(x + 4.4, z + 3.9); cabinet(x, z - reach, 6.5, 0.95);
        for (let n = 0; n < 6; n++) cylinder('brass', x - 2.5 + n, 1.24, z - reach, 0.35, 0.47);
      } else if (type === 'model') {
        solid('limestone', x, 0.5, z, 7.4, 1, 4.6, 'model-table');
        for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) { const h = 0.3 + ((row * 5 + col * 3 + v) % 7) * 0.2; box(['white', 'teal', 'limestone'][(row + col) % 3], x - 2.8 + col * 0.93, 1.03 + h / 2, z - 1.45 + row * 0.98, 0.55, h, 0.61, 'scale-building'); }
        desk(x + 4.7, z + reach - 0.5); shelf(x, z - reach, 6);
      } else if (type === 'orrery') {
        cylinder('dark', x, 0.6, z, 5.5, 1.2, 5.5, 'orrery-base', true); sphere('brass', x, 1.8, z, 1.05);
        for (let n = 0; n < 7; n++) { const angle = n * 2.3 + v, radius = 1.15 + n * 0.17; const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius; cylinder('metal', px, 1.5, pz, 0.035, 0.68); sphere(['blue', 'red', 'ceramic'][n % 3], px, 1.92, pz, 0.22 + n * 0.045); }
        shelf(x, z - reach, 6); telescope(x + 4.5, z + 3.4);
      } else {
        for (const dx of [-3.2, 3.2]) { art(x + dx, z - 1.7, design.accent); cylinder('limestone', x + dx, 0.52, z + 3.2, 1.7, 1.04, 1.7, 'display', true); sphere(v % 2 ? 'brass' : 'ceramic', x + dx, 1.66, z + 3.2, 1.25, 1.2, 0.8); }
        for (const dx of [-3.5, 0, 3.5]) { box('walnut', x + dx, 1.8, z - reach, 2.75, 2.25, 0.18); box(['teal', 'paper', 'red'][v % 3], x + dx, 1.8, z - reach + 0.1, 2.47, 1.96, 0.025); for (let n = 0; n < 3; n++) box('brass', x + dx - 0.7 + n * 0.7, 1.9, z - reach + 0.125, 0.16, 1.3 - n * 0.25, 0.018); }
      }
      bench(x, z + reach + 0.1, 4.8); plant(x + 5.7, z - reach + 0.5);
    } else if (['produce', 'fish', 'market', 'fashion', 'tailor', 'ceramics', 'workshop', 'artroom'].includes(type)) {
      if (type === 'fashion' || type === 'tailor') {
        for (const dx of [-3.7, 3.7]) { rail(x + dx, z - 2.3, 2.8); for (let n = 0; n < 5; n++) round(['fabric', 'teal', 'red'][n % 3], x + dx - 1 + n * 0.5, 0.77, z - 2.3, 0.33, 0.7, 0.12, 'garment', false); }
        table(x, z + 2.3, 5, 2); round('white', x + 1, 1.2, z + 2.3, 0.66, 0.57, 0.32, 'sewing-machine', false); box('fabric', x - 1, 0.94, z + 2.3, 1.9, 0.05, 1.4); chair(x, z + 3.9, -1);
        cabinet(x, z - reach, 6, 2.3);
      } else {
        for (const dx of [-3.2, 3.2]) {
          table(x + dx, z, 2.7, 3.3, type === 'fish' ? 'steel' : 'timber');
          for (let n = 0; n < 6; n++) { const px = x + dx + (n % 2 ? 0.65 : -0.65), pz = z - 1 + Math.floor(n / 2); if (type === 'fish') { box('white', px, 0.98, pz, 0.99, 0.08, 0.65); sphere('metal', px, 1.12, pz, 0.67, 0.13, 0.26); sphere('dark', px - 0.22, 1.17, pz + 0.09, 0.03); } else if (type === 'ceramics') { cylinder(n % 2 ? 'teal' : 'ceramic', px, 1.12, pz, 0.48, 0.48); cylinder('dark', px, 1.37, pz, 0.36, 0.018); } else if (type === 'produce') { box('timber', px, 1.02, pz, 0.95, 0.25, 0.72); for (const j of [-0.25, 0, 0.25]) sphere(n % 2 ? 'food' : 'leaves', px + j, 1.27, pz, 0.22); } else { box('paper', px, 0.97, pz, 0.73, 0.08, 0.55); cylinder('steel', px + 0.16, 1.08, pz, 0.13, 0.2); box('brass', px - 0.14, 1.04, pz, 0.45, 0.055, 0.065); } }
        }
        shelf(x, z - reach, 7.4, 'products'); cabinet(x, z + reach - 0.2, 4.5, 0.95); chair(x - 3.1, z + 3.4, -1); chair(x + 3.1, z + 3.4, -1);
      }
      plant(x + 5.5, z + reach); cup(x, z + reach - 0.2, 1.1);
    } else if (['fitness', 'tabletennis', 'game', 'children'].includes(type)) {
      if (type === 'tabletennis') {
        for (const dx of [-3.3, 3.3]) { table(x + dx, z, 2.8, 5, 'teal'); box('white', x + dx, 0.92, z, 0.025, 0.018, 4.95); box('white', x + dx, 1.08, z, 2.8, 0.3, 0.025); cylinder('red', x + dx + 0.7, 0.96, z + 1.7, 0.3, 0.035); sphere('white', x + dx, 1.15, z + 0.6, 0.08); }
      } else if (type === 'fitness') {
        for (const dx of [-3.3, 3.3]) { round('metal', x + dx, 0.18, z, 1.5, 0.36, 3.2, 'treadmill'); box('dark', x + dx, 0.38, z, 1.2, 0.025, 2.7); rail(x + dx, z - 1.3, 1.45); screen(x + dx, z - 1.3, 1.5); }
        cabinet(x, z - reach, 6, 1); for (let n = 0; n < 6; n++) { const px = x - 2.4 + n; round('metal', px, 1.17, z - reach, 0.68, 0.055, 0.055, 'dumbbell', false); for (const dx of [-0.23, 0.23]) cylinder('dark', px + dx, 1.17, z - reach, 0.2, 0.2); }
      } else {
        for (const dx of [-3.1, 3.1]) { table(x + dx, z, 1.8, 1.8); for (const dz of [-1.5, 1.5]) chair(x + dx, z + dz, dz < 0 ? 1 : -1); box('paper', x + dx, 0.93, z, 1.25, 0.02, 1.25); for (let n = 0; n < 8; n++) cylinder(n % 2 ? 'red' : 'dark', x + dx - 0.43 + (n % 4) * 0.28, 0.976, z - 0.4 + Math.floor(n / 4) * 0.6, 0.12, 0.045); }
        shelf(x, z - reach, 6, type === 'children' ? 'products' : 'books'); if (type === 'children') for (let n = 0; n < 7; n++) round(['red', 'teal', 'paper'][n % 3], x - 2.5 + n * 0.8, 0.35, z + reach - 0.8, 0.55, 0.7, 0.55, 'play-block');
      }
      bench(x, z + reach + 0.2, 5.1); plant(x + 5.6, z + reach - 0.1);
    } else if (['garden', 'laundry', 'pool', 'lookout', 'telescope', 'weather'].includes(type)) {
      if (type === 'garden') { gardenBed(x - 3.5, z - 2.3, 4.8, 3.2); gardenBed(x + 3.5, z + 2.3, 4.8, 3.2); plant(x + 4.4, z - reach, 1.35); }
      else if (type === 'laundry') {
        for (const dx of [-3.4, 3.4]) { rail(x + dx, z, 4.1); for (let n = 0; n < 5; n++) { round(n % 2 ? 'fabric' : 'upholstery', x + dx - 1.4 + n * 0.7, 0.74, z, 0.54, 0.74, 0.035, 'drying-cloth', false); box('timber', x + dx - 1.4 + n * 0.7, 1.15, z, 0.08, 0.1, 0.055); } }
        washbasin(x, z - reach); for (const dx of [-3, 3]) cylinder('fabric', x + dx, 0.44, z + reach - 0.4, 0.8, 0.88, 0.8, 'laundry-basket', true);
      } else if (type === 'pool') {
        round('limestone', x, 0.34, z, 8.5, 0.68, 5.1, 'pool-edge'); box('blue', x, 0.69, z, 7.9, 0.025, 4.5); for (const dx of [-3.2, 3.2]) sofa(x + dx, z + reach, 2.5, -1); gardenBed(x, z - reach, 6.4, 2);
      } else if (type === 'weather') {
        cylinder('metal', x, 1.65, z, 0.13, 3.3, 0.13, 'weather-mast', true); box('metal', x, 3.08, z, 2.2, 0.08, 0.08); for (const dx of [-0.95, 0.95]) sphere('white', x + dx, 3.1, z, 0.38); cabinet(x + 3, z - 2, 2.1, 1.4, 'white'); desk(x - 3, z + 2); gardenBed(x, z - reach, 6, 2);
      } else { telescope(x - 3, z - 1.7); telescope(x + 3, z - 1.7); table(x, z + 2, 4, 1.3, 'limestone'); box('paper', x, 0.93, z + 2, 3.5, 0.03, 1.1); for (let n = 0; n < 7; n++) box('navy', x - 1.4 + n * 0.45, 0.956, z + 2, 0.09, 0.013, 0.8); gardenBed(x, z - reach, 7, 2.1); }
      bench(x - 3, z + reach - 0.1, 3.3); bench(x + 3, z + reach - 0.1, 3.3); plant(x + 5.6, z + 0.5); lamp(x - 5.6, z - 3);
    } else throw new Error(`Unfurnished room type ${type} in ${building.id}`);
    // Door-side coat hooks, a room directory and a planted threshold establish
    // scale immediately on entry. They remain outside the 3.2 m doorway.
    if (!observation) {
      if (!compact) plant(side * 8.1, z - 3, 0.9);
      if (!compact) { box('timber', side * 8.05, 1.8, z + 3.2, 1.35, 0.11, 0.11);
        for (const dx of [-0.4, 0, 0.4]) cylinder('brass', side * 8.05 + dx, 1.76, z + 3.24, 0.055, 0.13); }
      const lightY = compact ? 2.88 : height - 0.37;
      box('metal', x, lightY, z, compact ? 1.7 : 4.8, 0.1, 0.75); box('light', x, lightY - 0.07, z, compact ? 1.55 : 4.65, 0.06, 0.6);
      lights.push({ x: origin.x + x, y: origin.y + height - 0.6, z: origin.z + z, intensity: 10, distance: Math.max(zoneWidth, zoneDepth) * 1.4 });
    }
  });
  if (building.id === 'tide-museum' && ground) {
    // Museum orientation begins at the door. The paired maritime objects sit
    // outside the clear 8 m spine and before the more extensive side galleries.
    const displayZ = depth / 2 - 13.2;
    ship(-7.6, displayZ, 0);
    solid('limestone', 7.6, 0.38, displayZ, 3.5, 0.76, 2.5, 'anchor-plinth');
    round('metal', 7.6, 1.71, displayZ, 0.18, 1.82, 0.18, 'historic-anchor');
    round('metal', 7.6, 1.94, displayZ, 1.7, 0.16, 0.16, 'anchor-stock', false);
    round('metal', 7.6, 1, displayZ, 2.1, 0.18, 0.2, 'anchor-crown', false);
    for (const dx of [-0.94, 0.94]) round('metal', 7.6 + dx, 1.19, displayZ, 0.26, 0.54, 0.22, 'anchor-fluke', false);
    cylinder('metal', 7.6, 2.71, displayZ, 0.39, 0.15, 0.39);
    label('维澜旧港 · 系泊锚', 7.6, 0.81, displayZ + 1.28, 2.8, 0.27);
    label('潮汐海事博物馆 · 航船与港口记忆', 0, 3.4, displayZ - 5.9, 6.8, 0.45);
  }
  for (const side of [-1, 1]) { plant(side * 6.7, depth / 2 - 3.7, 1.1); plant(side * 6.7, -depth / 2 + 5.2); }
  label('LIFT · 电梯 ↑', 0, 2.75, elevator.doorZ - origin.z + 0.18, 3.9, 0.4);
  return { buildingId: building.id, floorId: floor.id, category, design, rooms, parts, colliders, labels, lights,
    width, depth, height, elevator, entrance, groundY: floor.y, observation };
}

/** Build one occupied floor at a time. The elevator cabin is retained while the
 * destination floor is assembled, so a ride has continuous world-space motion. */
export function createInteriorSystem(THREE, scene, { buildings = METROPOLIS_BUILDINGS, materials = createMetropolisMaterials(THREE) } = {}) {
  const root = new THREE.Group(); root.name = 'Metropolis · occupied interior'; root.visible = false; scene.add(root);
  const floorRoot = new THREE.Group(), cabinRoot = new THREE.Group(); root.add(floorRoot, cabinRoot);
  // Three includes the number of visible point lights in every material's shader
  // key. Keep a fixed budget in the scene from startup: entering a room must not
  // recompile the entire streamed city. Zero intensity leaves daylight intact.
  const interiorLights = [0, 1].map(index => {
    const light = new THREE.PointLight(0xffddb0, 0, 100, 1.6);
    light.name = `Metropolis · permanent interior light ${index + 1}`;
    light.visible = true; scene.add(light); return light;
  });
  const geometry = new THREE.BoxGeometry(1, 1, 1), localMaterials = new Map(), ownedTextures = new Set();
  // Unit meshes keep furniture batches independent of dimensions. Beveled boxes
  // soften fabric/wood edges without one geometry allocation per chair or pillow.
  const rounded = new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), vertices = rounded.attributes.position;
  for (let index = 0; index < vertices.count; index++) {
    const point = new THREE.Vector3().fromBufferAttribute(vertices, index);
    const center = new THREE.Vector3(clamp(point.x, -0.41, 0.41), clamp(point.y, -0.41, 0.41), clamp(point.z, -0.41, 0.41));
    point.sub(center).normalize().multiplyScalar(0.09).add(center); vertices.setXYZ(index, point.x, point.y, point.z);
  }
  rounded.computeVertexNormals();
  const geometries = { box: geometry, rounded, cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 12), sphere: new THREE.SphereGeometry(0.5, 12, 8) };
  const state = { activeBuilding: null, buildingId: null, floor: null, moving: false, version: 0,
    elevator: { phase: 'idle', y: 0, targetFloorId: null, elapsed: 0, duration: 0, doorOpen: 1 } };
  let layout = null, floorColliders = [], cabinColliders = [], colliders = [], playerRef = null, journey = null;
  let leftDoor = null, rightDoor = null, doorCollider = null;
  const material = key => {
    // Exterior glazing is opaque for stable instancing. Occupied windows need a
    // transparent clone so observation floors retain their actual city views.
    if (key === 'glass' && materials.glass?.isMaterial && !localMaterials.has(key)) {
      const instance = materials.glass.clone(); instance.transparent = true; instance.opacity = 0.15;
      instance.depthWrite = false; instance.color.set(COLORS.glass); localMaterials.set(key, instance);
    }
    if (key !== 'glass' && materials[key]?.isMaterial) return materials[key];
    const alias = { limestone: 'stone', timber: 'wood', walnut: 'wood', ceramic: 'tile', white: 'plaster', carpet: 'plaster', upholstery: 'plaster' }[key];
    if (!localMaterials.has(key) && alias && materials[alias]?.isMaterial) {
      const instance = materials[alias].clone(); instance.color.set(COLORS[key]); localMaterials.set(key, instance);
    }
    if (!localMaterials.has(key)) localMaterials.set(key, new THREE.MeshStandardMaterial({ color: COLORS[key] || key,
      roughness: ['glass', 'metal', 'brass'].includes(key) ? 0.3 : 0.82,
      metalness: ['metal', 'brass'].includes(key) ? 0.65 : 0.05,
      ...(key === 'glass' ? { transparent: true, opacity: 0.19, depthWrite: false } : {}),
      ...(key === 'light' ? { emissive: COLORS.light, emissiveIntensity: 0.7 } : {}) }));
    return localMaterials.get(key);
  };
  function mesh(group, key, x, y, z, sx, sy, sz) {
    const object = new THREE.Mesh(geometry, material(key)); object.position.set(x, y, z); object.scale.set(sx, sy, sz);
    object.castShadow = key !== 'light' && key !== 'glass'; object.receiveShadow = key !== 'light'; group.add(object); return object;
  }
  function clearFloor() {
    for (const light of interiorLights) light.intensity = 0;
    floorRoot.traverse(object => { if (object.isInstancedMesh) object.dispose(); if (object.userData.ownedMaterial) { object.material.map?.dispose(); ownedTextures.delete(object.material.map); object.material.dispose(); } });
    floorRoot.clear();
  }
  function sign(data) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 192;
    const context = canvas.getContext('2d'); if (!context) return;
    context.fillStyle = '#263a3e'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#b8a572'; context.lineWidth = 5; context.strokeRect(12, 12, 1000, 168);
    context.fillStyle = data.color; context.font = '500 58px "Noto Sans SC", "PingFang SC", sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(data.text, 512, 96, 950);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; ownedTextures.add(texture);
    const signMaterial = new THREE.MeshBasicMaterial({ map: texture });
    const object = new THREE.Mesh(geometry, signMaterial); object.position.set(data.x, data.y, data.z); object.rotation.y = data.rotation;
    object.scale.set(data.width, data.height, 0.04); object.userData.ownedMaterial = true; floorRoot.add(object);
  }
  function assembleFloor(floor) {
    clearFloor(); state.floor = floor; layout = createInteriorLayout(state.activeBuilding, floor);
    // Instancing shares geometry and batches the hundreds of furniture details.
    const batches = new Map(), matrix = new THREE.Object3D();
    for (const part of layout.parts) {
      const batchKey = `${part.material}:${part.geometry}`;
      if (!batches.has(batchKey)) batches.set(batchKey, []); batches.get(batchKey).push(part);
    }
    for (const [batchKey, parts] of batches) {
      const key = parts[0].material, shape = parts[0].geometry;
      const batch = new THREE.InstancedMesh(geometries[shape], material(key), parts.length); batch.name = `interior · ${batchKey}`;
      parts.forEach((part, index) => { matrix.position.set(part.x, part.y, part.z); matrix.scale.set(part.sx, part.sy, part.sz); matrix.updateMatrix(); batch.setMatrixAt(index, matrix.matrix); });
      batch.castShadow = key !== 'glass' && key !== 'light'; batch.receiveShadow = true; floorRoot.add(batch);
    }
    layout.labels.forEach(sign);
    interiorLights.forEach((light, index) => {
      light.position.set(state.activeBuilding.x + (index ? 1 : -1) * layout.width * 0.23,
        floor.y + layout.height - 0.7, state.activeBuilding.z);
      light.distance = Math.max(layout.width, layout.depth) * 1.25;
      light.intensity = layout.observation ? 0 : 28;
    });
    floorColliders = layout.colliders; state.version++; combineColliders(); floorRoot.visible = true;
  }
  function cabin() {
    cabinRoot.clear(); cabinColliders = [];
    const { x, z } = layout.elevator;
    cabinRoot.position.set(x, state.elevator.y, z);
    const add = (key, dx, y, dz, sx, sy, sz, kind, solid = true) => {
      const object = mesh(cabinRoot, key, dx, y, dz, sx, sy, sz);
      if (solid) cabinColliders.push({ id: `elevator-${kind}-${cabinColliders.length}`, kind: `interior-elevator-${kind}`,
        x: x + dx, z: z + dz, hx: sx / 2, hz: sz / 2, relativeMinY: y - sy / 2, relativeMaxY: y + sy / 2,
        minY: state.elevator.y + y - sy / 2, maxY: state.elevator.y + y + sy / 2, physics: true, camera: true });
      return object;
    };
    add('walnut', 0, -0.1, 0, CABIN.width, 0.2, CABIN.depth, 'floor', false);
    add('metal', 0, CABIN.height, 0, CABIN.width, 0.18, CABIN.depth, 'ceiling');
    for (const side of [-1, 1]) {
      add('metal', side * CABIN.width / 2, CABIN.height / 2, 0, 0.18, CABIN.height, CABIN.depth, 'wall');
      add('brass', side * (CABIN.width / 2 - 0.16), 1, 0, 0.09, 0.1, CABIN.depth - 0.7, 'rail', false);
      add('light', side * (CABIN.width / 2 - 0.14), 2.93, 0, 0.08, 0.1, CABIN.depth - 0.4, 'light', false);
    }
    add('metal', 0, CABIN.height / 2, -CABIN.depth / 2, CABIN.width, CABIN.height, 0.18, 'wall');
    add('glass', 0, 1.9, -CABIN.depth / 2 + 0.12, CABIN.width - 0.55, 1.8, 0.05, 'mirror', false);
    leftDoor = add('metal', -CABIN.width / 4, 1.55, CABIN.depth / 2, CABIN.width / 2, 3.1, 0.13, 'door', false);
    rightDoor = add('metal', CABIN.width / 4, 1.55, CABIN.depth / 2, CABIN.width / 2, 3.1, 0.13, 'door', false);
    doorCollider = { id: 'elevator-safety-door', kind: 'interior-elevator-door', x, z: z + CABIN.depth / 2,
      hx: CABIN.width / 2, hz: 0.09, relativeMinY: 0, relativeMaxY: 3.1, minY: state.elevator.y,
      maxY: state.elevator.y + 3.1, physics: false, camera: false };
    cabinColliders.push(doorCollider);
    add('dark', CABIN.width / 2 - 0.15, 1.55, 0.8, 0.12, 0.85, 0.4, 'panel', false);
    for (let n = 0; n < 4; n++) add('light', CABIN.width / 2 - 0.23, 1.35 + n * 0.15, 0.8, 0.04, 0.05, 0.08, 'button', false);
    combineColliders(); updateCabin();
  }
  function combineColliders() { colliders = [...floorColliders, ...cabinColliders]; }
  function updateCabin() {
    cabinRoot.position.y = state.elevator.y;
    if (state.elevator.phase === 'moving' && layout) {
      interiorLights[0].position.set(layout.elevator.x, state.elevator.y + CABIN.height - 0.3, layout.elevator.z);
      interiorLights[0].distance = 8; interiorLights[0].intensity = 12; interiorLights[1].intensity = 0;
    }
    for (const obstacle of cabinColliders) { obstacle.minY = state.elevator.y + obstacle.relativeMinY; obstacle.maxY = state.elevator.y + obstacle.relativeMaxY; }
    if (leftDoor) leftDoor.position.x = -CABIN.width / 4 - state.elevator.doorOpen * CABIN.width / 2;
    if (rightDoor) rightDoor.position.x = CABIN.width / 4 + state.elevator.doorOpen * CABIN.width / 2;
    if (doorCollider) doorCollider.physics = state.elevator.phase !== 'idle';
  }
  function inCabin(player, margin = 0.48) {
    return layout && player && Math.abs(player.x - layout.elevator.x) < CABIN.width / 2 - margin && Math.abs(player.z - layout.elevator.z) < CABIN.depth / 2 - margin;
  }
  const groundHeightAt = (x, z) => {
    if (!layout) return 0;
    return Math.abs(x - layout.elevator.x) <= CABIN.width / 2 + 0.1 && Math.abs(z - layout.elevator.z) <= CABIN.depth / 2 + 0.12 ? state.elevator.y : state.floor.y;
  };
  function collisionContext() { if (!state.activeBuilding || !layout) return null; return { colliders, groundY: state.floor?.y || 0, groundHeightAt, version: state.version }; }
  function transition(position) { return { position: { ...position }, ...collisionContext() }; }
  function enter(buildingId) {
    const building = buildings.find(candidate => candidate.id === buildingId);
    if (!building || !building.floors?.length || state.moving) return null;
    state.activeBuilding = building; state.buildingId = building.id; state.floor = building.floors[0]; state.moving = false;
    state.elevator = { phase: 'idle', y: state.floor.y, targetFloorId: state.floor.id, elapsed: 0, duration: 0, doorOpen: 1 };
    journey = null; playerRef = null; assembleFloor(state.floor); cabin(); root.visible = true;
    return transition(layout.entrance);
  }
  function exit({ force = false } = {}) {
    if (!state.activeBuilding || (!force && (state.moving || !isGround(state.activeBuilding, state.floor)))) return null;
    const building = state.activeBuilding, position = { x: building.entrance.x, z: building.entrance.z + 3.2, yaw: 0 };
    clearFloor(); cabinRoot.clear(); root.visible = false; layout = null; floorColliders = []; cabinColliders = []; colliders = [];
    state.activeBuilding = null; state.buildingId = null; state.floor = null; state.moving = false; state.version++;
    state.elevator = { phase: 'idle', y: 0, targetFloorId: null, elapsed: 0, duration: 0, doorOpen: 1 };
    journey = null; playerRef = null;
    return { position, groundY: building.entrance.y || 0, colliders: null, groundHeightAt: null, outside: true, version: state.version };
  }
  function getPrompt(player) {
    if (!player || state.moving) return null;
    if (!state.activeBuilding) {
      let nearest = null, gap = 5.4;
      for (const building of buildings) { const distance = Math.hypot(player.x - building.entrance.x, player.z - building.entrance.z);
        if (distance < gap) { gap = distance; nearest = building; } }
      return nearest ? { kind: 'enter', label: `进入 ${nearest.name}`, buildingId: nearest.id } : null;
    }
    if (inCabin(player)) return { kind: 'elevator', label: '选择电梯楼层', buildingId: state.buildingId };
    if (isGround(state.activeBuilding, state.floor) && Math.abs(player.x - layout.entrance.x) < 2.4 && Math.abs(player.z - (state.activeBuilding.z + layout.depth / 2)) < 4.1)
      return { kind: 'exit', label: '返回街道', buildingId: state.buildingId };
    return null;
  }
  function interact(player) {
    const prompt = getPrompt(player); if (!prompt) return { handled: false };
    if (prompt.kind === 'enter') return { handled: true, transition: enter(prompt.buildingId) };
    if (prompt.kind === 'exit') return { handled: true, transition: exit() };
    playerRef = player;
    return { handled: true, elevator: { buildingId: state.buildingId, currentFloorId: state.floor.id, floors: state.activeBuilding.floors } };
  }
  function selectFloor(floorId) {
    if (!state.activeBuilding || state.moving || !inCabin(playerRef)) return null;
    const floor = state.activeBuilding.floors.find(candidate => candidate.id === floorId);
    if (!floor || floor.id === state.floor.id) return null;
    journey = { fromY: state.elevator.y, target: floor, duration: Math.max(2.2, Math.abs(floor.y - state.elevator.y) / 9 + 1.2) };
    state.moving = true; state.elevator.phase = 'closing'; state.elevator.targetFloorId = floor.id;
    state.elevator.elapsed = 0; state.elevator.duration = journey.duration;
    state.elevator.anchor = { x: playerRef.x, z: playerRef.z }; updateCabin();
    return transition({ x: playerRef.x, z: playerRef.z, yaw: playerRef.yaw || 0 });
  }
  function update(dt, player) {
    // Integrations may provide snapshots instead of a mutable simulation player.
    // Refresh the cabin-presence check before accepting a menu selection.
    if (player && state.activeBuilding) playerRef = player;
    if (!state.moving || !journey || !Number.isFinite(dt) || dt <= 0) return null;
    let remaining = Math.min(dt, 0.25), result = null;
    // Consume time at phase boundaries so closing, travel, and opening are all
    // observable even at low frame rates. Motion follows a smooth easing curve.
    while (remaining > 1e-7 && state.moving) {
      const phaseDuration = state.elevator.phase === 'moving' ? journey.duration : 0.7;
      const step = Math.min(remaining, phaseDuration - state.elevator.elapsed);
      state.elevator.elapsed += step; remaining -= step;
      const progress = clamp(state.elevator.elapsed / phaseDuration, 0, 1);
      if (state.elevator.phase === 'closing') state.elevator.doorOpen = 1 - progress;
      if (state.elevator.phase === 'moving') {
        const eased = progress * progress * (3 - 2 * progress);
        state.elevator.y = journey.fromY + (journey.target.y - journey.fromY) * eased;
      }
      if (state.elevator.phase === 'opening') state.elevator.doorOpen = progress;
      if (progress >= 1) {
        if (state.elevator.phase === 'closing') { state.elevator.phase = 'moving'; floorRoot.visible = false; }
        else if (state.elevator.phase === 'moving') {
          state.elevator.y = journey.target.y; assembleFloor(journey.target); state.elevator.phase = 'opening';
          result = transition({ x: playerRef?.x ?? layout.elevator.x, z: playerRef?.z ?? layout.elevator.z, yaw: playerRef?.yaw || 0 });
        } else { state.elevator.phase = 'idle'; state.moving = false; journey = null; }
        state.elevator.elapsed = 0;
      }
    }
    updateCabin(); return result;
  }
  function snapshot() {
    const currentRoom = layout && playerRef ? layout.rooms.find(room => playerRef.x >= room.bounds.minX && playerRef.x <= room.bounds.maxX && playerRef.z >= room.bounds.minZ && playerRef.z <= room.bounds.maxZ) : null;
    return { buildingId: state.buildingId, buildingName: state.activeBuilding?.name || null,
    floorId: state.floor?.id || null, floorLabel: state.floor?.label || null, floorName: layout?.design.name || null, floorType: layout?.category || null,
    design: layout?.design || null, rooms: layout?.rooms || [], roomCount: layout?.rooms.length || 0,
    currentRoomId: currentRoom?.id || null, currentRoomName: currentRoom?.name || null,
    moving: state.moving, elevator: { ...state.elevator }, colliderCount: colliders.length,
    furnitureCount: floorColliders.filter(c => !/wall|window|partition/.test(c.kind)).length,
    entrance: layout?.entrance || null, cabin: layout ? { ...layout.elevator, y: state.elevator.y } : null,
    activeFloors: state.activeBuilding ? 1 : 0, version: state.version }; }
  function dispose() { clearFloor(); cabinRoot.clear(); root.removeFromParent(); for (const light of interiorLights) light.removeFromParent(); for (const shape of Object.values(geometries)) shape.dispose();
    for (const item of localMaterials.values()) item.dispose(); for (const texture of ownedTextures) texture.dispose(); ownedTextures.clear(); }
  return { root, state, getPrompt, enter, exit, interact, selectFloor, update, snapshot, collisionContext, dispose };
}
