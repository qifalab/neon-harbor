import { getRoomDesign } from './metropolis-room-designs.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const CABIN = { width: 4.4, depth: 4.6 };
const footprint = building => ({ width: building.width - 0.7, depth: building.depth - 0.7 });

/** The narrow old-quarter shells have their own circulation core. The stair
 * landing finishes ahead of the rear lift, leaving a full walking-width bypass. */
export function createCompactInteriorStairs(building) {
  const { depth } = footprint(building), x = building.x + 2.3;
  const cabinFront = building.z - depth / 2 + 5.05;
  const startZ = building.z + depth / 2 - 2.2;
  const endZ = cabinFront + 2.1, run = startZ - endZ;
  const floors = building.floors.filter(floor => floor.stairs);
  return floors.slice(0, -1).map((floor, index) => {
    const next = floors[index + 1], rise = next.y - floor.y;
    const bottom = { x, z: startZ + 1.05, y: floor.y };
    const top = { x, z: endZ - 1.05, y: next.y };
    return { id: `${building.id}-${floor.id}-stairs`, fromFloorId: floor.id, toFloorId: next.id,
      x, startZ, endZ, run, rise, width: 1.6, treadCount: Math.max(24, Math.ceil(rise / 0.18)),
      fromY: floor.y, toY: next.y, bottom, top, waypoints: [bottom, top],
      bypass: [{ x: building.x, z: top.z, y: next.y }, { x: building.x, z: bottom.z, y: next.y }],
      hole: { minX: x - 1.02, maxX: x + 1.02, minZ: endZ - 0.9, maxZ: startZ + 0.35 } };
  });
}

/** Two furnished rooms, an unobstructed shared passage and independent lift /
 * stairs fit the smallest 13 by 15 metre exterior. Metadata remains world-space. */
export function createCompactInteriorLayout(building, floor) {
  const { width, depth } = footprint(building), origin = { x: building.x, z: building.z, y: floor.y };
  const next = building.floors.find(candidate => candidate.y > floor.y);
  const height = next ? clamp(next.y - floor.y - 0.42, 2.8, 5.2) : 3.8;
  const sourceDesign = getRoomDesign(building.id, floor.id), observation = floor.id === 'observation';
  const floorIndex = building.floors.findIndex(item => item.id === floor.id);
  const roomOffset = observation ? 0 : (floorIndex % 2) * 2;
  const selectedRooms = sourceDesign.rooms.length === 2 ? sourceDesign.rooms : sourceDesign.rooms.slice(roomOffset, roomOffset + 2);
  const design = { ...sourceDesign, rooms: selectedRooms };
  const parts = [], colliders = [], labels = [], lights = [], rooms = [];
  const stairs = createCompactInteriorStairs(building);
  const outgoing = stairs.find(flight => flight.fromFloorId === floor.id), incoming = stairs.find(flight => flight.toFloorId === floor.id);
  let serial = 0, roomId = null;
  const box = (material, x, y, z, sx, sy, sz, kind = 'detail', solid = false, geometry = 'box') => {
    if (Math.min(sx, sy, sz) <= 0) throw new Error(`Invalid compact interior dimensions: ${building.id}/${floor.id}/${kind}`);
    const part = { id: `${building.id}:${floor.id}:${++serial}`, material, x: origin.x + x, y: origin.y + y,
      z: origin.z + z, sx, sy, sz, kind, geometry, ...(roomId ? { roomId } : {}) };
    parts.push(part);
    if (solid) colliders.push({ id: part.id, kind: `interior-${kind}`, x: part.x, z: part.z,
      hx: sx / 2, hz: sz / 2, minY: part.y - sy / 2, maxY: part.y + sy / 2, physics: true, camera: true });
    return part;
  };
  const solid = (m, x, y, z, sx, sy, sz, kind = 'furniture') => box(m, x, y, z, sx, sy, sz, kind, true);
  const round = (m, x, y, z, sx, sy, sz, kind = 'furniture', collision = true) =>
    box(m, x, y, z, sx, sy, sz, kind, collision, /fabric|upholstery/.test(m) ? 'soft' : 'rounded');
  const cylinder = (m, x, y, z, sx, sy, sz = sx, kind = 'detail', collision = false) => box(m, x, y, z, sx, sy, sz, kind, collision, 'cylinder');
  const label = (text, x, y, z, w = 2.5, h = 0.3, rotation = 0) => labels.push({ text, x: origin.x + x,
    y: origin.y + y, z: origin.z + z, width: w, height: h, color: '#e8e0cf', rotation });
  const slab = (finish, y, thickness, kind, hole, collision = false) => {
    if (!hole) { box(finish, 0, y, 0, width, thickness, depth, kind, collision); return; }
    const x0 = hole.minX - origin.x, x1 = hole.maxX - origin.x, z0 = hole.minZ - origin.z, z1 = hole.maxZ - origin.z;
    box(finish, (-width / 2 + x0) / 2, y, 0, x0 + width / 2, thickness, depth, kind, collision);
    box(finish, (x1 + width / 2) / 2, y, 0, width / 2 - x1, thickness, depth, kind, collision);
    box(finish, (x0 + x1) / 2, y, (-depth / 2 + z0) / 2, x1 - x0, thickness, z0 + depth / 2, kind, collision);
    box(finish, (x0 + x1) / 2, y, (z1 + depth / 2) / 2, x1 - x0, thickness, depth / 2 - z1, kind, collision);
  };
  slab('interiorStone', -0.16, 0.32, 'floor', incoming?.hole);
  slab('interiorCeiling', height + 0.12, 0.24, 'ceiling', outgoing?.hole, true);
  const wallFinish = 'heritagePaint';
  for (const side of [-1, 1]) {
    solid(wallFinish, side * width / 2, 0.48, 0, 0.24, 0.96, depth, 'wall');
    solid('glass', side * width / 2, 1.76, 0, 0.1, 1.6, depth - 0.3, 'window');
    solid(wallFinish, side * width / 2, (height + 2.56) / 2, 0, 0.24, height - 2.56, depth, 'wall');
    for (let z = -depth / 2 + 0.8; z < depth / 2; z += 2.4) box('timber', side * (width / 2 - 0.04), 1.78, z, 0.13, 1.65, 0.095);
    box('walnut', side * (width / 2 - 0.13), 0.12, 0, 0.05, 0.16, depth - 0.3);
  }
  solid(wallFinish, 0, height / 2, -depth / 2, width, height, 0.24, 'wall');
  const entryWidth = 2.6, frontSegment = (width - entryWidth) / 2;
  for (const side of [-1, 1]) {
    const x = side * (entryWidth / 2 + frontSegment / 2);
    solid(wallFinish, x, 0.48, depth / 2, frontSegment, 0.96, 0.24, 'wall');
    solid('glass', x, 1.76, depth / 2, frontSegment, 1.6, 0.1, 'window');
    solid(wallFinish, x, (height + 2.56) / 2, depth / 2, frontSegment, height - 2.56, 0.24, 'wall');
  }
  if (floorIndex > 0) solid('glass', 0, 1.35, depth / 2, entryWidth, 2.7, 0.1, 'window');
  box('timber', 0, 2.88, depth / 2, entryWidth + 0.16, 0.2, 0.28, 'door-frame');
  const elevator = { x: origin.x - 1.6, z: origin.z - depth / 2 + 2.75, y: floor.y,
    width: CABIN.width, depth: CABIN.depth, doorZ: origin.z - depth / 2 + 5.05 };
  const entrance = { x: origin.x, z: origin.z + depth / 2 - 1.25, yaw: Math.PI };
  label('LIFT · 电梯 ↑', -1.6, 2.84, elevator.doorZ - origin.z + 0.15, 3.2, 0.34);
  label(`${building.name} · ${floor.label.split(' · ')[0]}`, -1.6, Math.min(height - 0.15, 3.42), elevator.doorZ - origin.z + 0.16, 3.7, 0.3);
  label(floorIndex ? '楼梯 ↓ · 电梯' : 'EXIT · 街道', 0, 2.65, depth / 2 - 0.2, 2.3, 0.25, Math.PI);
  for (const z of [-depth / 2 + 6.2, depth / 2 - 2.3]) {
    box('light', 0, height - 0.05, z, 0.7, 0.05, 0.18);
    lights.push({ x: origin.x, y: origin.y + height - 0.2, z: origin.z + z, intensity: 14, distance: 10 });
  }
  // Stair-side collision follows the same risers used by groundHeightAt.
  if (outgoing) {
    const cx = outgoing.x - origin.x, start = outgoing.startZ - origin.z;
    const tread = outgoing.run / outgoing.treadCount, rise = outgoing.rise / outgoing.treadCount;
    box('interiorStone', cx, outgoing.rise - 0.12, outgoing.endZ - origin.z - 0.55, outgoing.width, 0.24, 1.1, 'stair-landing');
    for (let index = 0; index < outgoing.treadCount; index++) {
      const top = (index + 1) * rise, z = start - (index + 0.5) * tread;
      box('interiorStone', cx, top - 0.08, z, outgoing.width, 0.16, tread + 0.012, 'stair-tread');
      box('brass', cx, top + 0.006, z + tread / 2 - 0.02, outgoing.width, 0.012, 0.035, 'stair-nosing');
      for (const side of [-1, 1]) {
        solid('timber', cx + side * 0.91, top / 2, z, 0.08, top, tread + 0.01, 'stair-stringer');
        solid('glass', cx + side * 0.91, top + 0.55, z, 0.06, 1.1, tread + 0.01, 'stair-guard');
      }
    }
    for (const side of [-1, 1]) {
      const rail = round('timber', cx + side * 0.91, outgoing.rise / 2 + 1.03, start - outgoing.run / 2,
        0.075, 0.09, Math.hypot(outgoing.run, outgoing.rise), 'stair-handrail', false);
      rail.rotationX = Math.atan(outgoing.rise / outgoing.run);
    }
  }
  if (incoming && !outgoing) {
    const cx = incoming.x - origin.x, centerZ = (incoming.startZ + incoming.endZ) / 2 - origin.z;
    solid('glass', cx, 0.55, incoming.startZ - origin.z + 0.35, incoming.width + 0.25, 1.1, 0.06, 'stair-end-guard');
    for (const side of [-1, 1]) {
      solid('glass', cx + side * 0.91, 0.55, centerZ, 0.06, 1.1, incoming.run, 'stair-guard');
      round('timber', cx + side * 0.91, 1.13, centerZ, 0.075, 0.08, incoming.run, 'stair-handrail', false);
    }
  }
  const plant = (x, z) => {
    cylinder('ceramic', x, 0.22, z, 0.35, 0.44, 0.35, 'planter', true);
    cylinder('walnut', x, 0.57, z, 0.035, 0.8);
    for (const [dx, dy, dz] of [[0, 0.93, 0], [-0.13, 0.79, 0.07], [0.12, 1.02, -0.08]])
      box('leaves', x + dx, dy, z + dz, 0.32, 0.4, 0.27, 'foliage', false, 'sphere');
  };
  const innerX = -1.3, outerX = -width / 2 + 0.3, roomWidth = innerX - outerX;
  const rearRoomZ = elevator.doorZ - origin.z + 1.85, frontRoomZ = depth / 2 - 0.4;
  const roomDepth = (frontRoomZ - rearRoomZ) / 2, roomX = (innerX + outerX) / 2;
  selectedRooms.forEach((specification, index) => {
    roomId = specification.id;
    const z = rearRoomZ + roomDepth * (index + 0.5), type = specification.type;
    const ceilingHeight = Math.min(height - 0.16, 2.98), doorway = 2, segment = (roomDepth - doorway) / 2;
    const arrivalX = innerX - 0.9;
    rooms.push({ ...specification, x: origin.x + roomX, z: origin.z + z, width: roomWidth, depth: roomDepth,
      ceilingHeight, enclosed: true, entrance: { x: origin.x + innerX, z: origin.z + z },
      arrival: { x: origin.x + arrivalX, z: origin.z + z },
      bounds: { minX: origin.x + outerX, maxX: origin.x + innerX, minZ: origin.z + z - roomDepth / 2, maxZ: origin.z + z + roomDepth / 2 } });
    box(['bath', 'kitchen', 'workshop', 'archive', 'maritime'].includes(type) ? 'interiorTerrazzo' : 'timber', roomX, 0.025, z, roomWidth - 0.14, 0.03, roomDepth - 0.14);
    for (const side of [-1, 1]) {
      solid('domesticPaint', innerX, ceilingHeight / 2, z + side * (doorway / 2 + segment / 2), 0.16, ceilingHeight, segment, 'partition');
      solid('domesticPaint', roomX, ceilingHeight / 2, z + side * roomDepth / 2, roomWidth, ceilingHeight, 0.16, 'partition');
      box('timber', roomX, 0.13, z + side * (roomDepth / 2 - 0.1), roomWidth - 0.2, 0.18, 0.045);
      box('timber', innerX, 1.28, z + side * (doorway / 2 + 0.04), 0.23, 2.56, 0.08, 'door-jamb');
    }
    box('timber', innerX, 2.65, z, 0.23, 0.18, doorway + 0.16, 'door-lintel');
    solid('interiorCeiling', roomX, ceilingHeight + 0.07, z, roomWidth, 0.14, roomDepth, 'ceiling');
    label(specification.name, innerX + 0.1, 2.3, z + doorway / 2 + 0.4, Math.min(roomDepth / 2, 1.6), 0.25, Math.PI / 2);
    const furnitureX = outerX + 1.25;
    if (['office', 'conference'].includes(type)) {
      // Keep desks and chairs against the window side. The last two metres
      // before the inner wall remain a continuous arrival/return passage.
      const chair = (x, cz) => {
        round('navy', x, .47, cz, .43, .12, .43, 'office-chair');
        solid('metal', x, .23, cz, .1, .46, .1, 'chair-leg');
        round('navy', x + .18, .79, cz, .065, .58, .43, 'chair-back');
      };
      if (type === 'office') {
        solid('timber', furnitureX, .43, z, 1.6, .86, .76, 'office-desk');
        round('walnut', furnitureX, .90, z, 1.68, .08, .82, 'desktop', false);
        chair(furnitureX + 1.05, z);
        round('navy', furnitureX - .12, 1.15, z - .16, .07, .4, .48, 'office-monitor', false);
        box('paper', furnitureX + .26, .96, z + .15, .44, .025, .30, 'work-papers');
        solid('walnut', furnitureX, .69, z - roomDepth / 2 + .38, 1.84, 1.38, .48, 'filing-cabinet');
      } else {
        solid('timber', furnitureX, .74, z, 1.65, .13, 1.9, 'conference-table');
        solid('metal', furnitureX, .34, z, .17, .68, .17, 'table-leg');
        for (const dz of [-.61, .61]) chair(furnitureX + 1.04, z + dz);
        for (const dz of [-.48, .48]) {
          box('paper', furnitureX, .83, z + dz, .38, .025, .29, 'meeting-papers');
          cylinder('ceramic', furnitureX + .35, .91, z + dz, .13, .16);
        }
      }
    } else if (['library', 'archive'].includes(type)) {
      const back = z - roomDepth / 2 + .36, shelfKind = type === 'archive' ? 'archive-shelf' : 'library-shelf';
      for (const side of [-1, 1]) solid('timber', furnitureX + side * .87, .98, back, .11, 1.96, .43, shelfKind);
      for (const y of [.28, .79, 1.30, 1.81]) {
        solid('timber', furnitureX, y, back, 1.82, .07, .45, shelfKind);
        if (type === 'archive') for (const dx of [-.58, 0, .58]) {
          box('paper', furnitureX + dx, y + .21, back, .46, .35, .33, 'archive-box');
          box('white', furnitureX + dx, y + .22, back + .173, .25, .10, .012, 'archive-label');
        } else for (let book = 0; book < 10; book++) box(['navy', 'paper', 'teal'][book % 3],
          furnitureX - .70 + book * .15, y + .19, back, .12, .31, .28, 'library-book');
      }
      solid('timber', furnitureX, .73, z + .55, 1.72, .12, .72, 'reading-table');
      for (const dx of [-.65, .65]) solid('walnut', furnitureX + dx, .34, z + .55, .09, .68, .48, 'table-leg');
      box('paper', furnitureX, .83, z + .55, .53, .035, .35, 'reference-ledger');
    } else if (type === 'workshop') {
      const back = z - roomDepth / 2 + .22;
      solid('walnut', furnitureX, .43, z + .42, 1.75, .86, .76, 'workbench');
      round('timber', furnitureX, .91, z + .42, 1.83, .1, .84, 'workbench-top', false);
      box('metal', furnitureX - .55, 1.05, z + .42, .28, .20, .24, 'bench-vice');
      solid('timber', furnitureX, 1.7, back, 1.85, 1.12, .12, 'tool-board');
      for (const dx of [-.60, -.20, .20, .60]) {
        box('steel', furnitureX + dx, 1.74, back + .08, .045, .32, .035, 'workshop-tool');
        box('metal', furnitureX + dx, 1.88, back + .08, .19, .05, .045, 'workshop-tool');
      }
      for (const dx of [-.45, .45]) solid('timber', furnitureX + dx, .34,
        z - roomDepth / 2 + .73, .62, .68, .66, 'freight-crate');
    } else if (type === 'maritime') {
      solid('walnut', furnitureX, .47, z, 1.8, .94, .85, 'maritime-case');
      round('navy', furnitureX, 1.09, z, 1.32, .24, .42, 'ship-model', false);
      cylinder('brass', furnitureX, 1.55, z, .04, .75, .04, 'ship-mast');
      box('paper', furnitureX + .19, 1.58, z, .35, .52, .025, 'ship-sail');
      box('paper', furnitureX, 2.05, z - roomDepth / 2 + .13, 1.6, .65, .025, 'cargo-route-chart');
    } else if (['cafe', 'dining', 'tea'].includes(type)) {
      round('timber', furnitureX, .78, z, 1.25, .12, .75, 'cafe-table');
      cylinder('metal', furnitureX, .38, z, .13, .75);
      for (const side of [-1, 1]) {
        cylinder('walnut', furnitureX + side * .85, .24, z, .075, .48);
        round('upholstery', furnitureX + side * .85, .49, z, .42, .12, .48, 'cafe-chair');
        round('walnut', furnitureX + side * 1.02, .82, z, .07, .65, .46, 'cafe-chair');
      }
      for (const dx of [-.36, .36]) cylinder('ceramic', furnitureX + dx, .92, z, .13, .16);
      round('ceramic', furnitureX, .92, z + .18, .27, .18, .20, 'teapot', false);
      plant(furnitureX, z - roomDepth / 2 + .46);
      // Authored storefront rooms leave a continuous 2 m approach along the
      // inner wall, with window seating and two smaller tables to its left.
      if (roomWidth >= 6.8 && roomDepth >= 4.5) for (const side of [-1, 1]) {
        const tx = outerX + 4.25, tz = z + side * Math.min(1.45, roomDepth / 2 - 1.14);
        round('timber', tx, .78, tz, 1.05, .10, .72, 'cafe-table');
        cylinder('metal', tx, .38, tz, .12, .73);
        for (const chair of [-1, 1]) {
          round('upholstery', tx, .48, tz + chair * .79, .43, .10, .43, 'cafe-chair');
          solid('walnut', tx, .23, tz + chair * .79, .12, .46, .12, 'chair-leg');
          round('walnut', tx, .81, tz + chair * .98, .44, .66, .065, 'chair-back');
        }
        cylinder('brass', tx, Math.min(ceilingHeight - .30, 2.62), tz, .38, .22, .38, 'pendant-shade');
        cylinder('light', tx, Math.min(ceilingHeight - .43, 2.49), tz, .29, .035);
        cylinder('metal', tx, ceilingHeight - .15, tz, .018, .22);
      }
    } else if (['produce', 'market', 'bakery'].includes(type)) {
      round('timber', furnitureX, .68, z, 1.7, 1.2, .70, 'shop-counter');
      round('walnut', furnitureX, 1.30, z, 1.8, .07, .76, 'countertop', false);
      for (const dx of [-.54, 0, .54]) {
        box('timber', furnitureX + dx, 1.37, z, .48, .10, .53, 'produce-crate');
        for (const dz of [-.15, .13]) cylinder(type === 'bakery' ? '#cba67b' : '#c49a4d', furnitureX + dx, 1.46, z + dz,
          .18, .16, .16, 'shop-goods');
      }
      label(type === 'bakery' ? 'DAILY BAKES · 每日烘焙' : 'FRESH · 时令果蔬', furnitureX, 2.15, z - roomDepth / 2 + .12, 1.8, .32);
      if (roomWidth >= 6.8) {
        const cx = outerX + 4.1, cz = z - roomDepth / 2 + .58;
        solid('walnut', cx, .59, cz, 1.7, 1.18, .75, 'shop-counter');
        round('interiorStone', cx, 1.20, cz, 1.77, .07, .79, 'countertop', false);
        round('navy', cx + .48, 1.38, cz, .35, .24, .31, 'till', false);
        label('街坊柜台 · PAY HERE', cx, 1.78, z - roomDepth / 2 + .12, 1.8, .22);
      }
    } else if (['bookshop', 'ceramics'].includes(type)) {
      const back = z - roomDepth / 2 + .36;
      for (const side of [-1, 1]) solid('timber', furnitureX + side * .87, .91, back, .11, 1.78, .43, 'display-shelf');
      for (const y of [.34, .86, 1.38]) {
        solid('timber', furnitureX, y, back, 1.82, .07, .45, 'display-shelf');
        if (type === 'bookshop') for (let book = 0; book < 11; book++) box(['navy', 'paper', 'teal', 'walnut'][book % 4],
          furnitureX - .74 + book * .145, y + .20, back, .12, .33, .29, 'book');
        else for (const dx of [-.55, 0, .55]) cylinder('ceramic', furnitureX + dx, y + .19, back, .24, .32, .24, 'ceramic-vase');
      }
      round('timber', furnitureX, .76, z + .65, 1.30, .10, .64, 'shop-counter');
      for (const dx of [-.49, .49]) solid('walnut', furnitureX + dx, .37, z + .65, .09, .72, .45, 'counter-leg');
      if (roomWidth >= 6.8) {
        const sx = outerX + 4.15;
        for (const side of [-1, 1]) solid('timber', sx + side * .88, .98, back, .09, 1.91, .40, 'display-shelf');
        for (const y of [.34, .84, 1.34, 1.84]) {
          solid('timber', sx, y, back, 1.83, .065, .42, 'display-shelf');
          if (type === 'bookshop') for (let book = 0; book < 10; book++) box(['paper', 'navy', 'teal'][book % 3], sx - .73 + book * .16, y + .17, back, .13, .27, .28, 'book');
          else for (const dx of [-.52, 0, .52]) cylinder('ceramic', sx + dx, y + .15, back, .21, .25, .21, 'ceramic-vase');
        }
      }
    } else if (type === 'bedroom') {
      round('walnut', furnitureX, 0.28, z, 1.75, 0.5, 2.65, 'bed');
      round('fabric', furnitureX, 0.6, z, 1.68, 0.25, 2.58, 'mattress', false);
      round('upholstery', furnitureX, 0.75, z + 0.5, 1.7, 0.12, 1.5, 'blanket', false);
      round('fabric', furnitureX, 0.8, z - 0.83, 1.12, 0.2, 0.48, 'pillow', false);
      solid('timber', furnitureX, 0.71, z - 1.32, 1.84, 1.25, 0.12, 'headboard');
      cylinder('ceramic', furnitureX + 1.2, 0.33, z - 1.05, 0.42, 0.66, 0.42, 'bedside-table', true);
      cylinder('light', furnitureX + 1.2, 0.93, z - 1.05, 0.26, 0.4);
    } else if (type === 'kitchen') {
      solid('white', furnitureX, 0.5, z - roomDepth / 2 + 0.6, 2.25, 1, 0.85, 'counter');
      round('interiorStone', furnitureX, 1.04, z - roomDepth / 2 + 0.6, 2.3, 0.08, 0.92, 'countertop', false);
      box('metal', furnitureX - 0.6, 1.1, z - roomDepth / 2 + 0.6, 0.58, 0.03, 0.48);
      cylinder('metal', furnitureX - 0.6, 1.25, z - roomDepth / 2 + 0.86, 0.04, 0.33);
      for (const dx of [0.35, 0.86]) cylinder('dark', furnitureX + dx, 1.11, z - roomDepth / 2 + 0.6, 0.31, 0.02);
      for (const dx of [-0.74, 0, 0.74]) {
        box('timber', furnitureX + dx, 0.49, z - roomDepth / 2 + 1.04, 0.68, 0.84, 0.025);
        box('brass', furnitureX + dx, 0.79, z - roomDepth / 2 + 1.065, 0.19, 0.025, 0.025);
      }
      round('timber', furnitureX, 0.78, z + 0.8, 1.25, 0.12, 0.75, 'dining-table');
      cylinder('metal', furnitureX, 0.38, z + 0.8, 0.15, 0.75);
      cylinder('ceramic', furnitureX, 0.94, z + 0.8, 0.15, 0.19);
    } else if (type === 'bath') {
      round('ceramic', furnitureX, 0.35, z - 0.35, 1.35, 0.65, 2.1, 'bath');
      round('white', furnitureX, 0.64, z - 0.35, 1.06, 0.08, 1.76, 'bath-rim', false);
      round('navy', furnitureX, 0.67, z - 0.35, 0.84, 0.025, 1.46, 'bath-water', false);
      cylinder('metal', furnitureX, 1.02, z - 1.25, 0.045, 0.72);
      round('ceramic', furnitureX + 0.2, 0.91, z + 1.32, 1.25, 0.18, 0.52, 'basin');
      box('glass', furnitureX + 0.2, 1.68, z + roomDepth / 2 - 0.13, 1.15, 1, 0.025);
    } else if (type === 'lookout') {
      cylinder('steel', furnitureX, 0.67, z, 0.2, 1.34, 0.2, 'telescope', true);
      round('navy', furnitureX, 1.5, z, 0.32, 0.34, 1.2, 'telescope', false);
      cylinder('metal', furnitureX, 0.08, z, 0.85, 0.12, 0.65, 'telescope-base', true);
      plant(furnitureX, z + 1.3);
    } else {
      round('upholstery', furnitureX, 0.4, z - 0.55, 2.1, 0.64, 0.88, 'sofa');
      round('upholstery', furnitureX, 0.88, z - 0.92, 2.1, 0.69, 0.19, 'sofa');
      for (const dx of [-0.94, 0.94]) round('upholstery', furnitureX + dx, 0.64, z - 0.55, 0.22, 0.6, 0.92, 'sofa');
      for (const dx of [-0.48, 0.48]) round('fabric', furnitureX + dx, 0.85, z - 0.75, 0.53, 0.32, 0.2, 'cushion', false);
      round('timber', furnitureX, 0.44, z + 0.72, 1.5, 0.12, 0.65, 'coffee-table');
      for (const dx of [-0.59, 0.59]) cylinder('walnut', furnitureX + dx, 0.23, z + 0.72, 0.075, 0.4);
      box('paper', furnitureX - 0.33, 0.54, z + 0.68, 0.39, 0.07, 0.27);
      cylinder('ceramic', furnitureX + 0.42, 0.6, z + 0.7, 0.16, 0.2);
      plant(furnitureX + 1.45, z - 1.13);
    }
    box('light', roomX, ceilingHeight - 0.07, z, 0.48, 0.06, 0.38);
    labels.push({ graphic: 'artwork', text: specification.name, roomId, variant: (building.index || 0) + index,
      x: origin.x + furnitureX, y: origin.y + 1.99, z: origin.z + z - roomDepth / 2 + 0.1,
      width: 1.35, height: 0.75, rotation: 0, color: '#557b72' });
  });
  roomId = null;
  return { buildingId: building.id, floorId: floor.id, category: design.category, design, rooms, parts, colliders, labels, lights,
    width, depth, height, elevator, entrance, stairs, groundY: floor.y, observation, compact: true };
}
