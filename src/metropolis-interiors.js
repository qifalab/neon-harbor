import { METROPOLIS_BUILDINGS } from './metropolis-catalog.js';
import { createMetropolisMaterials } from './metropolis-materials.js';

const WALL = 0.3;
const CABIN = { width: 4.4, depth: 4.6, height: 3.25 };
const COLORS = {
  limestone: '#d1c8b7', plaster: '#e0dbcf', timber: '#896548', walnut: '#493b30',
  carpet: '#546b68', upholstery: '#ab7558', navy: '#334852', metal: '#627578',
  brass: '#b09b6e', white: '#ede6d7', dark: '#27373d', glass: '#9dc1c5',
  ceramic: '#d7c6ad', leaves: '#486d52', paper: '#d8bf96', teal: '#548f89',
  light: '#f6dfb1', red: '#965a4e', blue: '#62829a', food: '#bd9464',
};
// Ground and upper floors follow the programme of each named address.
const PROGRAMMES = {
  'tide-museum': ['gallery', 'gallery'], 'harbor-market': ['retail', 'restaurant'],
  'ferry-house': ['station', 'restaurant'], 'meridian-hotel': ['hotel', 'hotel'],
  'pearl-convention': ['gallery', 'office'], 'sail-club': ['restaurant', 'gallery'],
  'wave-theatre': ['theatre', 'gallery'], 'east-quay-hotel': ['hotel', 'restaurant'],
  'jade-bank': ['bank', 'office'], 'exchange-hall': ['bank', 'office'],
  'apex-tower': ['office', 'gallery'], 'twin-pines': ['office', 'office'],
  'crown-plaza': ['retail', 'restaurant'], 'axis-house': ['office', 'office'],
  'silver-terrace': ['office', 'restaurant'], 'lantern-tower': ['restaurant', 'gallery'],
  'banyan-teahouse': ['restaurant', 'restaurant'], 'red-brick-post': ['bank', 'gallery'],
  'kowloon-arcade': ['retail', 'residential'], 'golden-cinema': ['theatre', 'theatre'],
  'lotus-market': ['retail', 'restaurant'], 'blue-house': ['residential', 'gallery'],
  'temple-court': ['gallery', 'library'], 'victoria-library': ['library', 'library'],
  'westbank-gallery': ['gallery', 'gallery'], 'music-conservatory': ['theatre', 'office'],
  'cloud-library': ['library', 'library'], 'science-forum': ['gallery', 'lab'],
  'design-foundry': ['office', 'gallery'], 'jade-opera': ['theatre', 'theatre'],
  'city-archive': ['gallery', 'library'], 'observatory-house': ['lab', 'gallery'],
  'camellia-court': ['residential', 'residential'], 'pine-residence': ['residential', 'residential'],
  'sky-garden': ['retail', 'residential'], 'garden-hospital': ['clinic', 'clinic'],
  'hill-school': ['library', 'office'], 'cedar-villa': ['residential', 'residential'],
  'terrace-gardens': ['restaurant', 'residential'], 'lighthouse-residence': ['retail', 'residential'],
  'gateway-station': ['station', 'office'], 'innovation-hub': ['gallery', 'office'],
  'freight-exchange': ['station', 'gallery'], 'north-star': ['office', 'restaurant'],
  'civic-hall': ['bank', 'gallery'], 'sports-pavilion': ['station', 'gallery'],
  'mountain-hotel': ['hotel', 'restaurant'], 'harbour-labs': ['lab', 'lab'],
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
  const parts = [], colliders = [], labels = [], lights = [];
  const origin = { x: building.x, z: building.z, y: floor.y };
  let serial = 0;
  const box = (material, x, y, z, sx, sy, sz, kind = 'detail', solid = false) => {
    const part = { id: `${building.id}:${floor.id}:${++serial}`, material, x: origin.x + x,
      y: origin.y + y, z: origin.z + z, sx, sy, sz, kind };
    parts.push(part);
    if (solid) colliders.push({ id: part.id, kind: `interior-${kind}`, x: part.x, z: part.z,
      hx: sx / 2, hz: sz / 2, minY: part.y - sy / 2, maxY: part.y + sy / 2, physics: true, camera: true });
    return part;
  };
  const solid = (material, x, y, z, sx, sy, sz, kind = 'furniture') => box(material, x, y, z, sx, sy, sz, kind, true);
  const label = (text, x, y, z, sx = 4, sy = 0.7, color = '#e9dfc7', rotation = 0) => labels.push({ text,
    x: origin.x + x, y: origin.y + y, z: origin.z + z, width: sx, height: sy, color, rotation });
  const ground = isGround(building, floor), observation = isObservation(floor);
  const elevator = { x: origin.x, z: origin.z - depth / 2 + 3.7, y: floor.y,
    width: CABIN.width, depth: CABIN.depth, doorZ: origin.z - depth / 2 + 3.7 + CABIN.depth / 2 };
  const entrance = { x: origin.x, z: origin.z + depth / 2 - 2.8, yaw: Math.PI };
  const floorMaterial = /residential|apartment|hotel|suite|tea|restaurant|cafe/i.test(floor.type) ? 'timber' : observation ? 'limestone' : 'ceramic';
  box(floorMaterial, 0, -0.16, 0, width, 0.32, depth, 'floor');
  // Inlaid joints and perimeter bands give floors scale without texture shimmer.
  for (let x = -width / 2 + 2; x < width / 2; x += 2.4) box('limestone', x, 0.006, 0, 0.016, 0.009, depth - 0.3);
  for (let z = -depth / 2 + 2; z < depth / 2; z += 2.4) box('limestone', 0, 0.006, z, width - 0.3, 0.009, 0.016);
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
    label('EXIT · 返回街道', 0, 2.7, depth / 2 - 0.18, 3.5, 0.45, '#d0ebdc', Math.PI);
  }
  label(building.name, 0, Math.min(height - 0.45, 3.75), -depth / 2 + 0.19, Math.min(width - 4, 9), 0.72);
  label(`${floor.label} · ${building.englishName || building.id}`, 0, 2.95, -depth / 2 + 6.22, 6, 0.48);
  // The 8 m central aisle always remains clear from entrance to elevator.
  for (const z of [-depth / 4, depth / 4]) {
    box('brass', 0, 0.022, z, 0.65, 0.02, 0.12);
    if (!observation) lights.push({ x: origin.x, y: origin.y + height - 0.65, z: origin.z + z, intensity: 18, distance: Math.max(width, depth) * 0.85 });
  }
  const plant = (x, z, scale = 1) => {
    solid('ceramic', x, 0.38 * scale, z, 0.7 * scale, 0.76 * scale, 0.7 * scale, 'planter');
    box('walnut', x, 0.95 * scale, z, 0.13, 1.15 * scale, 0.13);
    for (const [dx, dz, dy] of [[0, 0, 1.65], [-0.3, 0.1, 1.4], [0.29, -0.08, 1.52]]) box('leaves', x + dx * scale, dy * scale, z + dz * scale, 0.75 * scale, 0.6 * scale, 0.65 * scale);
  };
  const chair = (x, z, facing = 1, color = 'upholstery') => {
    solid(color, x, 0.47, z, 0.65, 0.2, 0.68, 'chair');
    solid(color, x, 0.9, z - facing * 0.3, 0.65, 0.75, 0.12, 'chair');
    for (const dx of [-0.24, 0.24]) for (const dz of [-0.23, 0.23]) box('walnut', x + dx, 0.23, z + dz, 0.075, 0.45, 0.075);
  };
  const table = (x, z, sx = 2.1, sz = 1.2, material = 'timber') => {
    solid(material, x, 0.83, z, sx, 0.16, sz, 'table');
    for (const dx of [-sx / 2 + 0.18, sx / 2 - 0.18]) for (const dz of [-sz / 2 + 0.16, sz / 2 - 0.16]) box('metal', x + dx, 0.39, z + dz, 0.08, 0.78, 0.08);
  };
  const sofa = (x, z, sx = 3.6, facing = 1) => {
    solid('upholstery', x, 0.4, z, sx, 0.68, 1.2, 'sofa');
    solid('upholstery', x, 0.9, z - facing * 0.52, sx, 0.72, 0.23, 'sofa');
    for (const dx of [-sx / 2 + 0.15, sx / 2 - 0.15]) solid('walnut', x + dx, 0.6, z, 0.2, 0.8, 1.2, 'sofa');
    for (let i = -sx / 2 + 0.55; i < sx / 2; i += 0.85) box('paper', x + i, 0.78, z - facing * 0.28, 0.55, 0.36, 0.18);
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
    box('white', x, 0.71, z, sx, 0.35, 3.1);
    box('teal', x, 0.93, z + 0.7, sx + 0.03, 0.12, 1.55);
    solid('timber', x, 0.86, z - 1.6, sx + 0.4, 1.5, 0.14, 'bed');
    for (const dx of [-0.55, 0.55]) box('paper', x + dx, 0.96, z - 0.95, 0.76, 0.22, 0.48);
    solid('timber', x + sx / 2 + 0.65, 0.38, z - 0.9, 0.7, 0.76, 0.65, 'cabinet');
    box('light', x + sx / 2 + 0.65, 1.04, z - 0.9, 0.36, 0.5, 0.36);
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
    solid('metal', x, 0.8, z, 0.45, 1.6, 0.45, 'telescope');
    box('navy', x, 1.72, z, 0.48, 0.42, 1.4);
    box('glass', x, 1.72, z - 0.73, 0.4, 0.34, 0.08);
    for (const dx of [-0.45, 0.45]) box('metal', x + dx, 0.1, z, 0.5, 0.2, 0.5);
  };
  const authoredProgramme = PROGRAMMES[building.id]?.[ground ? 0 : 1];
  let program = `${authoredProgramme || floor.type || ''} ${authoredProgramme ? '' : floor.label || ''}`.toLowerCase();
  let category = observation ? 'observation' : /tea|cafe|restaurant|dining|food|餐|茶/.test(program) ? 'restaurant'
    : /residential|apartment|residence|住宅|居住/.test(program) ? 'residential'
    : /hotel|guest|suite|旅馆|酒店|客房/.test(program) ? 'hotel'
    : /bank|finance|银行/.test(program) ? 'bank'
    : /gallery|museum|exhibit|art|展览|展厅|博物/.test(program) ? 'gallery'
    : /station|terminal|concourse|platform|transport|候车|候船|站厅/.test(program) ? 'station'
    : /library|reading|书|阅读/.test(program) ? 'library'
    : /clinic|hospital|medical|诊/.test(program) ? 'clinic'
    : /lab|research|实验|研究/.test(program) ? 'lab'
    : /shop|retail|market|商店|商场|商铺/.test(program) ? 'retail'
    : /theat|concert|auditorium|剧院|剧场/.test(program) ? 'theatre' : 'office';
  const zoneWidth = width / 2 - 7.2, zoneDepth = depth / 2 - 6.4;
  const roomCenters = [-1, 1].flatMap(side => [-1, 1].map(end => ({
    x: side * (6.5 + zoneWidth / 2), z: end * (2.7 + zoneDepth / 2), side, end,
  })));
  roomCenters.forEach((room, index) => {
    const { x, z, side, end } = room;
    const span = Math.min(zoneWidth - 2, 9), reach = Math.min(zoneDepth / 2 - 1.6, 5);
    box(category === 'restaurant' ? 'ceramic' : 'carpet', x, 0.024, z, Math.max(3, zoneWidth - 0.8), 0.025, Math.max(3, zoneDepth - 0.8));
    // Suites have walls with an actual 2.8 m doorway facing the main aisle.
    if (['hotel', 'residential', 'clinic', 'lab'].includes(category)) {
      const innerX = side * 5.5, segment = Math.max(1, (zoneDepth - 2.8) / 2);
      for (const dz of [-1, 1]) solid('plaster', innerX, 1.45, z + dz * (1.4 + segment / 2), 0.18, 2.9, segment, 'partition');
      solid('plaster', x, 1.45, end * 1.4, zoneWidth + 2, 2.9, 0.18, 'partition');
      label(`${String(index + 1).padStart(2, '0')} · ${category === 'hotel' ? 'SUITE' : category.toUpperCase()}`, innerX - side * 0.14, 2.45, z, 2.1, 0.34, '#e6d3a9', -side * Math.PI / 2);
    }
    if (category === 'restaurant') {
      for (const dx of [-span / 3, span / 3]) for (const dz of [-reach / 2, reach / 2]) {
        table(x + dx, z + dz, 1.65, 1.25, 'ceramic');
        chair(x + dx, z + dz - 1.05); chair(x + dx, z + dz + 1.05, -1);
        for (const px of [-0.42, 0.42]) { box('white', x + dx + px, 0.94, z + dz, 0.38, 0.045, 0.38); box('food', x + dx + px, 0.985, z + dz, 0.23, 0.05, 0.2); }
        box('teal', x + dx, 1.02, z + dz - 0.28, 0.16, 0.2, 0.16);
      }
      if (index === 0) { kitchen(x, z - reach - 1.1, span); label('茶餐廳 · MILK TEA / DAILY MENU', x, 2.6, z - reach - 1.2, span, 0.64); }
      else { sofa(x, z - reach - 1, span, 1); plant(x + side * (span / 2 + 0.6), z + reach); }
    } else if (category === 'hotel' || category === 'residential') {
      if (index === 0 && ground) {
        solid('timber', x, 0.62, z, span, 1.24, 1.2, 'reception');
        screen(x - 1.2, z, 1.6); label('CONCIERGE · 接待处', x, 2.35, z - 1, span, 0.6);
        sofa(x, z + reach - 0.4, span, 1); table(x, z + reach - 2, 2, 0.9); shelf(x, z - reach);
      } else {
        bed(x - span / 4, z - Math.min(1.8, reach / 2));
        sofa(x, z + reach - 0.2, span - 0.5, -1);
        table(x, z + reach - 1.7, 2.1, 0.9);
        kitchen(x, z - reach - 1.5, span - 0.5);
        plant(x + span / 2, z + 0.3);
      }
    } else if (category === 'bank') {
      if (index < 2) {
        solid('timber', x, 0.67, z - 1, span, 1.34, 1.2, 'teller-counter');
        for (const dx of [-span / 3, 0, span / 3]) {
          box('glass', x + dx, 1.95, z - 0.9, span / 3 - 0.15, 1.2, 0.06); screen(x + dx, z - 1.2, 1.6);
          chair(x + dx, z + 0.8, -1); label(`${index * 3 + Math.round(dx / (span / 3)) + 2}`, x + dx, 2.6, z - 0.85, 0.5, 0.35);
        }
        label('PERSONAL BANKING · 个人业务', x, 3.1, z - 1, span, 0.5);
      } else { sofa(x, z - 2, span); sofa(x, z + 2, span, -1); table(x, z, 2.3, 1.2); plant(x + side * span / 2, z); }
    } else if (category === 'gallery') {
      for (const dx of [-span / 3, span / 3]) { art(x + dx, z, index % 2 ? 'red' : 'teal'); art(x + dx, z - reach, 'brass'); }
      sofa(x, z + reach, Math.min(span, 5));
      label(['HARBOUR MEMORY', 'CRAFT / MATERIAL', 'LIGHT & WATER', 'CITY TOMORROW'][index], x, 3.2, z - reach - 1, span, 0.6);
    } else if (category === 'station') {
      for (const dz of [-reach / 2, reach / 2]) { sofa(x, z + dz, span, 1); sofa(x, z + dz - 1.4, span, -1); }
      solid('metal', x + side * span / 2, 1.05, z - reach - 0.8, 1.2, 2.1, 0.7, 'ticket-machine');
      box('blue', x + side * span / 2, 1.45, z - reach - 0.4, 0.86, 0.6, 0.04);
      label(index % 2 ? 'DEPARTURES · 出发 / 08:45 / 09:10' : 'ARRIVALS · 到达 / 08:50 / 09:20', x, 3.2, z - reach - 1, span, 0.7, '#dbd7a5');
      plant(x - side * span / 2, z + reach + 0.4);
    } else if (category === 'library') {
      for (const dz of [-reach, reach]) shelf(x, z + dz, span);
      table(x, z, span - 1, 1.4);
      for (const dx of [-span / 3, 0, span / 3]) { chair(x + dx, z - 1.3); chair(x + dx, z + 1.3, -1); box('paper', x + dx, 0.95, z, 0.6, 0.05, 0.43); }
      label(['HISTORY · 历史', 'DESIGN · 设计', 'SCIENCE · 科学', 'LITERATURE · 文学'][index], x, 3.1, z - reach - 0.4, span, 0.5);
    } else if (category === 'clinic') {
      bed(x - span / 4, z, 1.2); desk(x + span / 3, z + 1);
      shelf(x, z - reach - 0.8, span - 1, 'medicine');
      label('CONSULTATION · 诊室', x, 3, z - reach - 1, span, 0.5);
    } else if (category === 'lab') {
      for (const dz of [-reach / 2, reach / 2]) {
        table(x, z + dz, span - 1, 1.2, 'white');
        for (const dx of [-span / 3, span / 3]) { box('metal', x + dx, 1.15, z + dz, 0.48, 0.55, 0.38); box('dark', x + dx, 1.52, z + dz, 0.65, 0.2, 0.3); chair(x + dx, z + dz + 1.1, -1, 'navy'); }
      }
      shelf(x, z - reach - 1, span, 'samples'); label('RESEARCH · 实验工作区', x, 3, z - reach - 1, span, 0.5);
    } else if (category === 'retail') {
      for (const dx of [-span / 3, span / 3]) {
        shelf(x + dx, z - reach, span / 2 - 0.5, 'products');
        solid('timber', x + dx, 0.5, z, 2.1, 1, 2.6, 'display');
        for (const dz of [-0.8, 0, 0.8]) box(['red', 'teal', 'paper'][index % 3], x + dx, 1.2, z + dz, 1.1, 0.4, 0.5);
      }
      label(['LOCAL GOODS', 'DESIGN OBJECTS', 'HARBOUR MARKET', 'BOOKS & PRINTS'][index], x, 3.1, z - reach - 0.5, span, 0.6);
    } else if (category === 'theatre') {
      solid('walnut', x, 0.22, z - reach, span, 0.44, 2.2, 'stage');
      box('red', x, 2, z - reach - 0.9, span, 3.5, 0.14);
      for (let row = 0; row < 3; row++) for (const dx of [-span / 3, 0, span / 3]) chair(x + dx, z + row * 1.4, 1, 'red');
    } else if (category === 'observation') {
      for (const dx of [-span / 3, span / 3]) telescope(x + dx, z - reach);
      sofa(x, z + 1.5, span, -1); table(x, z, 2.2, 1.1);
      plant(x + side * span / 2, z + reach + 0.2, 1.3);
      label(['HARBOUR VIEW · 港湾', 'ISLAND VIEW · 离岛', 'CENTRAL SKYLINE · 中环', 'MOUNTAIN VIEW · 山景'][index], x, 1.2, z - reach - 1, span, 0.42);
    } else {
      for (const dx of [-span / 3, span / 3]) for (const dz of [-reach / 2, reach / 2]) desk(x + dx, z + dz);
      shelf(x, z - reach - 1.2, span); plant(x + side * span / 2, z + reach + 0.3);
      label(['STUDIO · 创作', 'WORKSPACE · 办公', 'MEETING · 会客', 'PROJECT ROOM · 研讨'][index], x, 3.1, z - reach - 1.4, span, 0.5);
    }
    if (!observation) {
      box('metal', x, height - 0.37, z, Math.min(span, 5), 0.1, 0.75);
      box('light', x, height - 0.44, z, Math.min(span - 0.15, 4.85), 0.06, 0.6);
      lights.push({ x: origin.x + x, y: origin.y + height - 0.6, z: origin.z + z, intensity: 10, distance: Math.max(zoneWidth, zoneDepth) * 1.4 });
    }
  });
  for (const side of [-1, 1]) { plant(side * 3.8, depth / 2 - 3.7, 1.25); plant(side * 4.1, -depth / 2 + 5.2); }
  label('LIFT · 电梯 ↑', 0, 2.75, elevator.doorZ - origin.z + 0.18, 3.9, 0.4);
  return { buildingId: building.id, floorId: floor.id, category, parts, colliders, labels, lights,
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
    for (const part of layout.parts) { if (!batches.has(part.material)) batches.set(part.material, []); batches.get(part.material).push(part); }
    for (const [key, parts] of batches) {
      const batch = new THREE.InstancedMesh(geometry, material(key), parts.length); batch.name = `interior · ${key}`;
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
  function snapshot() { return { buildingId: state.buildingId, buildingName: state.activeBuilding?.name || null,
    floorId: state.floor?.id || null, floorLabel: state.floor?.label || null, floorType: layout?.category || null,
    moving: state.moving, elevator: { ...state.elevator }, colliderCount: colliders.length,
    furnitureCount: floorColliders.filter(c => !/wall|window|partition/.test(c.kind)).length,
    entrance: layout?.entrance || null, cabin: layout ? { ...layout.elevator, y: state.elevator.y } : null,
    activeFloors: state.activeBuilding ? 1 : 0, version: state.version }; }
  function dispose() { clearFloor(); cabinRoot.clear(); root.removeFromParent(); for (const light of interiorLights) light.removeFromParent(); geometry.dispose();
    for (const item of localMaterials.values()) item.dispose(); for (const texture of ownedTextures) texture.dispose(); ownedTextures.clear(); }
  return { root, state, getPrompt, enter, exit, interact, selectFloor, update, snapshot, collisionContext, dispose };
}
