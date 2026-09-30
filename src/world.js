import { intersectionSignal } from './traffic.js';
import { WORLD_BOUNDS, ROAD_CENTERS, VEHICLE_DIMENSIONS, PLAYER_DIMENSIONS } from './world-config.js';
import { DistrictStreamer, validateCityChunk } from './city-streaming.js';
import { METRO_STAIR_OPENINGS } from './metropolis-transit.js';
import { subtractGroundRect, cutGroundGeometry } from './terrain-openings.js';
import { createHarborWaterMaterial, updateHarborWaterMaterial } from './harbor-water.js';

/**
 * The city is entirely original procedural art. Static details are batched by
 * material, so thousands of windows/road marks cost a few dozen draw calls.
 * Every solid inside the driving area also emits an axis-aligned collider.
 */
export function createWorld(THREE, scene, { quality = 'high', streaming = typeof window !== 'undefined', openNorth = false, assetBase = new URL('../assets/city/chunks/', import.meta.url).href } = {}) {
  const root = new THREE.Group();
  root.name = 'Neon Harbor · city';
  scene.add(root);
  const colliders = [];
  const chunkMetadata = new Map();
  const proxyBuildings = [];
  const chunkSize = 80;
  const chunkIdAt = (x, z) => `${Math.floor((x + 320) / chunkSize)}_${Math.floor((z + 320) / chunkSize)}`;
  function chunkAt(x, z) {
    const id = chunkIdAt(x, z);
    if (!chunkMetadata.has(id)) {
      const [cx, cz] = id.split('_').map(Number);
      chunkMetadata.set(id, { id, x: cx * 80 - 280, z: cz * 80 - 280, hx: 40, hz: 40, file: `${id}.json` });
    }
    return chunkMetadata.get(id);
  }
  const isGlobal = (kind, key, x, z, sx, sz) => kind.startsWith('surface-') ||
    ['sand', 'asphalt', 'marking', 'white'].includes(key) || Math.abs(x) > 295 || Math.abs(z) > 295 || sx > 75 || sz > 75;
  const surfaces = [];
  const terrainBuckets = new Map();
  const terrainCell = 32;
  const roadSurfaces = [];
  const renderObstacles = [];
  const surfaceGeometries = new Map();
  let colliderSerial = 0;
  function groundHeightAt(x, z) {
    let height = -0.03;
    for (const surface of terrainBuckets.get(`${Math.floor(x / terrainCell)},${Math.floor(z / terrainCell)}`) || []) {
      const inset = Math.min(surface.hx - Math.abs(x - surface.x), surface.hz - Math.abs(z - surface.z));
      if (inset < -1e-8) continue;
      const weight = surface.rampWidth ? Math.min(1, Math.max(0, inset) / surface.rampWidth) : 1;
      height = Math.max(height, surface.baseY + (surface.y - surface.baseY) * weight);
    }
    return height;
  }
  const palettes = {
    asphalt: '#626669', sidewalk: '#d1c8b8', curbs: '#ded5c4', median: '#526558',
    marking: '#f0dfaa', white: '#dae0d5', park: '#52694a', path: '#c2ac88',
    sand: '#c9b797', roof: '#56616a', equipment: '#829392', dark: '#223943',
    glass: '#688c99', glassDark: '#3b505f', glassLight: '#8bafb1', shopGlass: '#38545b', frame: '#323b3e',
    awning: '#d1c3a3', brass: '#baa16d', brickwork: '#bda492', roofTile: '#696e6d', signalRed: '#552727', signalAmber: '#5e4b20', signalGreen: '#7bd8a7',
    light: '#eccf96', teal: '#72bfb2', coral: '#bd8c73', cream: '#d1cab7',
    pink: '#caa696', stone: '#89908b', navy: '#43546a', brick: '#a77f65',
    leaves: '#4a7464', trunk: '#987e60', metal: '#536775', boardwalk: '#9f8671',
  };
  const materials = {};
  const pool = new Map();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const architectureGeo = beveledArchitectureGeometry(THREE);
  const textureCache = new Map();
  const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
  const leafGeo = palmFrondGeometry(THREE);
  const treeGeo = canopyClusterGeometry(THREE);
  const temp = new THREE.Object3D();
  const rng = seededRandom(749213);
  let sharedEmissive = [];

  function mat(key) {
    if (!materials[key]) {
      const emissive = ['light', 'teal'].includes(key);
      const glass = key.toLowerCase().includes('glass');
      const Constructor = glass ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
      materials[key] = new Constructor({
        color: key.startsWith('shop-sign-') || key.startsWith('street-sign-') ? '#ffffff' : palettes[key] || key,
        roughness: glass ? 0.17 : key === 'frame' ? 0.38 : 0.87,
        metalness: glass ? 0.3 : key === 'frame' || key === 'brass' ? 0.55 : 0.025,
        ...(glass ? { clearcoat: 0.7, clearcoatRoughness: 0.15 } : {}),
        ...(key === 'leaves' ? { side: THREE.DoubleSide } : {}),
        ...(emissive ? { emissive: palettes[key], emissiveIntensity: 0.5 } : {}),
        ...(['marking', 'white'].includes(key) ? { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 } : {}),
      });
      if (emissive) sharedEmissive.push(materials[key]);
      if (typeof document !== 'undefined' && ['asphalt', 'sidewalk', 'cream', 'stone', 'brick', 'coral', 'roof', 'brickwork'].includes(key)) {
        const textureKind = key === 'asphalt' ? 'asphalt' : key === 'sidewalk' ? 'pavement' : key === 'brickwork' || key === 'brick' ? 'brick' : 'plaster';
        if (!textureCache.has(textureKind)) textureCache.set(textureKind, proceduralMaterialTexture(THREE, textureKind));
        materials[key].map = textureCache.get(textureKind);
        if (!['asphalt', 'sidewalk'].includes(key)) useWorldScaleTexture(materials[key], textureKind);
      }
      if (key.startsWith('street-sign-')) { materials[key].color.set('#ffffff'); materials[key].map = streetSignTexture(THREE, Number(key.slice(12))); }
      if (key === 'signalGreen') { materials[key].emissive.set('#57d09d'); materials[key].emissiveIntensity = 0.6; }
      if (key.startsWith('shop-sign-')) {
        materials[key].color.set('#ffffff');
        materials[key].map = shopSignTexture(THREE, Number(key.slice(10)));
        materials[key].roughness = 0.5;
        materials[key].emissive.set('#ead4a2'); materials[key].emissiveIntensity = 0.08;
      }
    }
    return materials[key];
  }
  function stamp(kind, key, x, y, z, sx, sy, sz, ry = 0, rz = 0, rx = 0) {
    const id = `${kind}:${key}`;
    const global = isGlobal(kind, key, x, z, sx, sz);
    if (!global) chunkAt(x, z);
    // In the browser, high-detail transforms come only from the streamed JSON.
    // Keep just lightweight physics metadata and global surfaces at startup.
    if (streaming && !global) return { batch: id, index: -1 };
    if (!pool.has(id)) pool.set(id, { kind, key, material: mat(key), transforms: [] });
    const batch = pool.get(id);
    batch.transforms.push([x, y, z, sx, sy, sz, rx, ry, rz]);
    return { batch: id, index: batch.transforms.length - 1 };
  }
  const box = (key, x, y, z, sx, sy, sz, ry = 0) => stamp('box', key, x, y, z, sx, sy, sz, ry);
  function solid(x, z, hx, hz, minY, maxY, { kind = 'solid', physics = true, camera = true, render = null } = {}) {
    const collider = { id: `${kind}-${++colliderSerial}`, kind, x, z, hx, hz, minY, maxY, physics, camera };
    colliders.push(collider);
    if (render) renderObstacles.push({ ...render, colliderId: collider.id });
    return collider;
  }
  function block(key, x, y, z, sx, sy, sz, options = {}) {
    const rotation = options.rotation || 0;
    const render = options.kind === 'building' ? stamp('architecture', key, x, y, z, sx, sy, sz, rotation) : box(key, x, y, z, sx, sy, sz, rotation);
    const c = Math.abs(Math.cos(rotation)), q = Math.abs(Math.sin(rotation));
    return solid(x, z, (sx * c + sz * q) / 2, (sx * q + sz * c) / 2,
      y - sy / 2, y + sy / 2, { ...options, render });
  }
  function cylinder(key, x, y, z, radius, height, options = {}) {
    const render = stamp('cylinder', key, x, y, z, radius, height, radius);
    return solid(x, z, radius, radius, y - height / 2, y + height / 2, { ...options, render });
  }
  function surface(key, x, z, width, depth, y, { baseY = 0, rampWidth = 0, kind = key } = {}) {
    const data = { id: `surface-${surfaces.length}`, kind, x, z, hx: width / 2, hz: depth / 2, y, baseY, rampWidth };
    surfaces.push(data);
    for (let cx = Math.floor((x - width / 2) / terrainCell); cx <= Math.floor((x + width / 2) / terrainCell); cx++)
      for (let cz = Math.floor((z - depth / 2) / terrainCell); cz <= Math.floor((z + depth / 2) / terrainCell); cz++) {
        const key = `${cx},${cz}`; if (!terrainBuckets.has(key)) terrainBuckets.set(key, []); terrainBuckets.get(key).push(data);
      }
    const hasOpening = METRO_STAIR_OPENINGS.some(h => h.minX < x+width/2 && h.maxX > x-width/2 && h.minZ < z+depth/2 && h.maxZ > z-depth/2);
    const geometryKey = `surface-${width}-${depth}-${y}-${baseY}-${rampWidth}${hasOpening?`-opening-${x}-${z}`:''}`;
    if (!surfaceGeometries.has(geometryKey)) surfaceGeometries.set(geometryKey,
      cutGroundGeometry(THREE, makeSurfaceGeometry(THREE, width, depth, y, baseY, rampWidth), x, z, METRO_STAIR_OPENINGS));
    stamp(geometryKey, key, x, 0, z, 1, 1, 1);
    return data;
  }
  function mesh(geometry, material, x, y, z) {
    const obj = new THREE.Mesh(geometry, material);
    obj.position.set(x, y, z);
    obj.receiveShadow = true;
    root.add(obj);
    return obj;
  }

  // Asphalt rectangles share a single height and never overlap. Layering two
  // crossing strips only millimetres apart caused distant intersections to shimmer.
  for (const p of subtractGroundRect({minX:-299,maxX:299,minZ:-299,maxZ:299},METRO_STAIR_OPENINGS))
    box('sand',(p.minX+p.maxX)/2,-0.28,(p.minZ+p.maxZ)/2,p.maxX-p.minX,.5,p.maxZ-p.minZ);
  const roads = ROAD_CENTERS;
  for (const lane of roads) roadSurfaces.push(surface('asphalt', lane, 0, 22, 590, 0, { kind: 'road' }));
  const gaps = [];
  let edge = -295;
  for (const lane of roads) { gaps.push([edge, lane - 11]); edge = lane + 11; }
  gaps.push([edge, 295]);
  for (const lane of roads) for (const [left, right] of gaps)
    roadSurfaces.push(surface('asphalt', (left + right) / 2, lane, right - left, 22, 0, { kind: 'road' }));
  for (const lane of roads) {
    for (let segment = -286; segment < 289; segment += 12) {
      if (roads.some(v => Math.abs(segment - v) < 16)) continue;
      // Flat painted decals use polygon offset; they have no collision thickness.
      box('marking', lane - 0.22, 0.004, segment, 0.13, 0.002, 5.2);
      box('marking', lane + 0.22, 0.004, segment, 0.13, 0.002, 5.2);
      box('marking', segment, 0.004, lane - 0.22, 5.2, 0.002, 0.13);
      box('marking', segment, 0.004, lane + 0.22, 5.2, 0.002, 0.13);
    }
  }
  for (const x of roads) for (const z of roads) {
    for (let i = -8; i <= 8; i += 2.6) {
      box('white', x + i, 0.004, z - 13.1, 1.3, 0.002, 3.6);
      box('white', x + i, 0.004, z + 13.1, 1.3, 0.002, 3.6);
      box('white', x - 13.1, 0.004, z + i, 3.6, 0.002, 1.3);
      box('white', x + 13.1, 0.004, z + i, 3.6, 0.002, 1.3);
    }
  }

  function palm(x, z, height = 8) {
    const base = groundHeightAt(x, z);
    cylinder('trunk', x, base + height / 2, z, 0.28, height, { kind: 'palm-trunk' });
    const fronds = [];
    const crownBounds = new THREE.Box3();
    leafGeo.computeBoundingBox();
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9;
      const fx = x + Math.sin(angle) * 1.5, fz = z + Math.cos(angle) * 1.5;
      fronds.push(stamp('leaf', 'leaves', fx, base + height + 0.1, fz, 1.4, 5, 0.24, angle, Math.PI / 2.5, 0));
      temp.position.set(fx, base + height + 0.1, fz); temp.rotation.set(0, angle, Math.PI / 2.5); temp.scale.set(1.4, 5, 0.24); temp.updateMatrix();
      crownBounds.union(leafGeo.boundingBox.clone().applyMatrix4(temp.matrix));
    }
    cylinder('trunk', x, base + height - 0.1, z, 0.57, 0.6, { kind: 'palm-crown' });
    // Flexible foliage does not stop pedestrians; its height-aware camera volume
    // prevents the follow camera entering opaque crowns above the pavement.
    const crown = solid((crownBounds.min.x + crownBounds.max.x) / 2, (crownBounds.min.z + crownBounds.max.z) / 2,
      (crownBounds.max.x - crownBounds.min.x) / 2, (crownBounds.max.z - crownBounds.min.z) / 2,
      crownBounds.min.y, crownBounds.max.y, { kind: 'palm-foliage', physics: false });
    for (const render of fronds) renderObstacles.push({ ...render, colliderId: crown.id });
  }
  function tree(x, z) {
    const base = groundHeightAt(x, z);
    cylinder('trunk', x, base + 1.6, z, 0.4, 3.2, { kind: 'tree-trunk' });
    const crown = solid(x, z, 3.2, 3.2, base + 1.75, base + 7.25, { kind: 'tree-foliage', physics: false });
    const clusters = [[0, 4.7, 0, 2.1, 2.5, 2.1], [-1.3, 3.8, 0.3, 1.9, 1.9, 1.9], [1.2, 4.2, -0.4, 2, 2.1, 2]];
    for (const [dx, y, dz, sx, sy, sz] of clusters) {
      const render = stamp('tree-crown', 'leaves', x + dx, base + y, z + dz, sx, sy, sz);
      renderObstacles.push({ ...render, colliderId: crown.id });
    }
  }
  function lamp(x, z, axis = 0) {
    const base = groundHeightAt(x, z);
    const dx = axis === 0 ? 2.5 : 0, dz = axis === 0 ? 0 : 2.5;
    cylinder('metal', x, base + 3.7, z, 0.1, 7.4, { kind: 'lamp-post' });
    block('metal', x + dx / 2, base + 7.35, z + dz / 2, axis === 0 ? 2.8 : 0.13, 0.15, axis === 0 ? 0.13 : 2.8, { kind: 'lamp-arm' });
    block('light', x + dx, base + 7.3, z + dz, axis === 0 ? 1.1 : 0.6, 0.1, axis === 0 ? 0.6 : 1.1, { kind: 'lamp-light' });
  }
  function bench(x, z, rotation = 0) {
    const base = groundHeightAt(x, z);
    const options = { rotation, kind: 'bench' };
    block('boardwalk', x, base + 0.65, z, 2.8, 0.2, 0.75, options);
    block('boardwalk', x + Math.sin(rotation) * 0.35, base + 1.05, z + Math.cos(rotation) * 0.35, 2.8, 0.7, 0.13, options);
    block('metal', x - Math.cos(rotation), base + 0.3, z + Math.sin(rotation), 0.2, 0.6, 0.6, options);
    block('metal', x + Math.cos(rotation), base + 0.3, z - Math.sin(rotation), 0.2, 0.6, 0.6, options);
  }
  // A face-local frame puts identical construction details on street-facing
  // north/south/east/west elevations. Side walls no longer lose their shopfronts.
  function faceBox(key, x, z, side, along, y, outward, width, height, thickness, detail = true) {
    const angle = side * Math.PI / 2, c = Math.cos(angle), q = Math.sin(angle);
    stamp(detail ? 'detail-box' : 'box', key, x + along * c + outward * q, y, z - along * q + outward * c, width, height, thickness, angle);
  }
  function windows(x, z, width, depth, height, glass, style = 0) {
    const floors = Math.max(1, Math.floor((height - 3.3) / 3.6));
    const base = groundHeightAt(x, z);
    for (let side = 0; side < 4; side++) {
      const span = side % 2 ? depth : width, out = (side % 2 ? width : depth) / 2;
      for (let floor = 0; floor < floors; floor++) {
        const y = base + 4.1 + floor * 3.6;
        const lit = floor % 5 === 1 && rng() > 0.72;
        const key = lit ? 'light' : glass;
        const ww = style ? 2.72 : 1.48 + ((Math.round(Math.abs(x + z)) + floor) % 3) * 0.12;
        const wh = style ? 2.55 : 1.8;
        for (let offset = -span / 2 + 2; offset < span / 2 - ww / 2 - 0.25; offset += 3.4) {
          // Dark reveals sit behind slightly projecting frames and a recessed pane.
          faceBox('frame', x, z, side, offset, y, out + 0.045, ww + 0.25, wh + 0.23, 0.085);
          faceBox(key, x, z, side, offset, y, out + 0.095, ww, wh, 0.035, false);
          const frame = style ? 'metal' : 'awning';
          for (const sign of [-1, 1]) {
            faceBox(frame, x, z, side, offset + sign * (ww / 2 + 0.065), y, out + 0.135, 0.08, wh + 0.21, 0.12);
            faceBox(frame, x, z, side, offset, y + sign * (wh / 2 + 0.055), out + 0.135, ww + 0.21, 0.08, 0.12);
          }
          if (!style) faceBox('frame', x, z, side, offset, y, out + 0.13, 0.045, wh, 0.045);
          faceBox('stone', x, z, side, offset, y - wh / 2 - 0.09, out + 0.16, ww + 0.35, 0.1, 0.16);
        }
      }
    }
  }
  function facadeDetails(x, z, width, depth, height, base, style) {
    for (let side = 0; side < 4; side++) {
      const span = side % 2 ? depth : width, out = (side % 2 ? width : depth) / 2;
      faceBox('stone', x, z, side, 0, base + 0.22, out + 0.07, span, 0.44, 0.14);
      faceBox('awning', x, z, side, 0, base + 3.38, out + 0.09, span + 0.04, 0.16, 0.18);
      for (let offset = -span / 2 + 2; offset < span / 2 - 1.6; offset += 3.3) {
        faceBox('frame', x, z, side, offset, base + 1.55, out + 0.04, 2.92, 2.75, 0.08);
        faceBox('shopGlass', x, z, side, offset, base + 1.55, out + 0.1, 2.63, 2.4, 0.055);
        for (const sign of [-1, 1]) faceBox('metal', x, z, side, offset + sign * 1.34, base + 1.55, out + 0.15, 0.075, 2.64, 0.12);
        faceBox('frame', x, z, side, offset, base + 2.55, out + 0.15, 2.67, 0.075, 0.12);
        faceBox('frame', x, z, side, offset - 0.32, base + 1.55, out + 0.15, 0.055, 2.4, 0.1);
        faceBox('brass', x, z, side, offset - 0.15, base + 1.22, out + 0.205, 0.055, 0.42, 0.035);
      }
      const brand = Math.abs(Math.round(x * 17 + z * 11 + side)) % 6;
      faceBox(`shop-sign-${brand}`, x, z, side, 0, base + 3.02, out + 0.13, Math.min(span - 1.2, 13), 0.54, 0.15);
      if (style) {
        for (let offset = -span / 2 + 0.45; offset < span / 2; offset += 3.4)
          faceBox('metal', x, z, side, offset, base + height / 2, out + 0.11, 0.11, height - 0.4, 0.15);
      } else {
        for (const sign of [-1, 1]) faceBox('stone', x, z, side, sign * (span / 2 - 0.35), base + height / 2, out + 0.08, 0.4, height, 0.18);
        for (let y = 6.05; y < height - 1; y += 7.2)
          faceBox('stone', x, z, side, 0, base + y, out + 0.075, span, 0.13, 0.15);
      }
    }
    for (const sign of [-1, 1]) {
      block('roof', x, base + height + 0.6, z + sign * (depth / 2 - 0.2), width, 0.6, 0.35, { kind: 'parapet' });
      block('roof', x + sign * (width / 2 - 0.2), base + height + 0.6, z, 0.35, 0.6, depth, { kind: 'parapet' });
    }
  }
  function building(x, z, width, depth, height, key = 'cream', style = 0) {
    const base = groundHeightAt(x, z);
    const wall = block(key, x, height / 2 + base, z, width, height, depth, { kind: 'building' });
    // Glazing protrudes by at most 7cm beyond the shell; include the facade skin.
    wall.hx += 0.25; wall.hz += 0.25;
    proxyBuildings.push({ x, z, y: base + height / 2, width, depth, height, color: palettes[key], chunkId: chunkIdAt(x, z) });
    block('roof', x, base + height + 0.2, z, width + 0.45, 0.4, depth + 0.45, { kind: 'roof' });
    box('dark', x, base + 0.72, z + depth / 2 + 0.045, width - 0.9, 1.4, 0.08);
    windows(x, z, width, depth, height, style ? 'glass' : 'glassDark', style);
    facadeDetails(x, z, width, depth, height, base, style);
    block('equipment', x + width * 0.18, base + height + 1, z - depth * 0.18, 2.7, 1.2, 2.2, { kind: 'roof-equipment' });
    block('roof', x - width * 0.24, base + height + 0.575, z + depth * 0.2, 2.8, 0.35, 3.6, { kind: 'roof-equipment' });
    if (height > 45) {
      block('teal', x, base + height + 0.4, z + depth / 2 + 0.3, width + 0.7, 0.18, 0.17, { kind: 'roof-trim' });
      block('metal', x, base + height + 3.9, z, 0.25, 7, 0.25, { kind: 'antenna' });
      block('light', x, base + height + 7.6, z, 0.4, 0.4, 0.4, { kind: 'antenna-light' });
    }
  }
  function billboard(text, sub, color, x, y, z, width = 15, height = 5, rotation = 0) {
    const halfX = Math.abs(Math.cos(rotation)) * width / 2 + 0.04;
    const halfZ = Math.abs(Math.sin(rotation)) * width / 2 + 0.04;
    solid(x, z, halfX, halfZ, y - height / 2, y + height / 2, { kind: 'billboard' });
    block('frame', x - Math.sin(rotation) * 0.07, y, z - Math.cos(rotation) * 0.07, width + 0.12, height + 0.12, 0.12, { kind: 'billboard-frame', rotation });
    for (const sign of [-1, 1]) {
      const px = x + Math.cos(rotation) * width * 0.34 * sign;
      const pz = z - Math.sin(rotation) * width * 0.34 * sign;
      let support = groundHeightAt(px, pz);
      for (const roof of colliders) if (roof.kind === 'roof' && Math.abs(roof.x - px) <= roof.hx && Math.abs(roof.z - pz) <= roof.hz)
        support = Math.max(support, roof.maxY);
      const top = y - height / 2; support = Math.min(top - 0.4, support);
      block('metal', px, (support + top) / 2, pz, 0.23, top - support, 0.23, { kind: 'billboard-support' });
    }
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 384;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#142833'; ctx.fillRect(0, 0, 1024, 384);
    ctx.fillStyle = color; ctx.fillRect(30, 32, 9, 310);
    ctx.font = 'bold 102px system-ui, sans-serif'; ctx.fillText(text, 76, 180, 890);
    ctx.fillStyle = '#efe7d7'; ctx.font = '30px system-ui, sans-serif'; ctx.fillText(sub, 80, 260, 870);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, toneMapped: false });
    const sign = mesh(new THREE.PlaneGeometry(width, height), material, x, y, z);
    sign.rotation.y = rotation;

  }

  const centers = [-200, -120, -40, 40, 120, 200];
  const facadeKeys = ['cream', 'pink', 'stone', 'coral', 'brick', 'navy'];
  for (let ix = 0; ix < centers.length; ix++) for (let iz = 0; iz < centers.length; iz++) {
    const x = centers[ix], z = centers[iz];
    surface('sidewalk', x, z, 57.4, 57.4, 0.18, { rampWidth: 0.75 });

    const parkBlock = (x === 120 && z === -120) || (x === -40 && z === 120);
    const plazaBlock = x === 40 && z === 40;
    const warehouse = x === 200 && z <= 40;
    if (parkBlock) {
      surface('park', x, z, 47, 47, 0.27, { baseY: 0.18, rampWidth: 0.6 });
      // The cross is split at its centre so two path surfaces never overlap.
      surface('path', x, z, 5, 47, 0.3, { baseY: 0.27, rampWidth: 0.3 });
      for (const sign of [-1, 1]) surface('path', x + sign * 13, z, 21, 5, 0.3, { baseY: 0.27, rampWidth: 0.3 });
      for (const dx of [-16, 16]) for (const dz of [-16, 16]) {
        palm(x + dx, z + dz, 8 + rng() * 3);
        tree(x + dx, z + dz * 0.45);
      }
      bench(x - 7, z + 8); bench(x + 7, z - 8);
      block('cream', x + 11, 0.82, z + 11, 5, 1.1, 5, { kind: 'planter' });
      block('teal', x + 11, 1.445, z + 11, 4.5, 0.15, 4.5, { kind: 'planter' });
    } else if (plazaBlock) {
      surface('path', x, z, 48, 48, 0.28, { baseY: 0.18, rampWidth: 0.6 });
      cylinder('cream', x, 0.83, z, 7, 1.1, { kind: 'fountain' });
      cylinder('teal', x, 1.44, z, 6.1, 0.12, { kind: 'fountain' });
      const sculpture = mesh(new THREE.TorusKnotGeometry(2.5, 0.48, 56, 6), mat('teal'), x, 4.2, z);
      sculpture.castShadow = true;
      sculpture.geometry.computeBoundingBox();
      const sculptureBounds = sculpture.geometry.boundingBox;
      solid(x, z, Math.max(-sculptureBounds.min.x, sculptureBounds.max.x), Math.max(-sculptureBounds.min.z, sculptureBounds.max.z), 4.2 + sculptureBounds.min.y, 4.2 + sculptureBounds.max.y, { kind: 'sculpture' });
      for (const dx of [-19, 19]) for (const dz of [-19, 19]) palm(x + dx, z + dz, 9);
      bench(x - 12, z + 2, Math.PI / 2); bench(x + 12, z + 2, Math.PI / 2);
    } else if (warehouse) {
      building(x, z + 7, 42, 29, 10 + rng() * 3, 'stone');
      for (let c = 0; c < 3; c++) {
        const cx = x - 14 + c * 14;
        const container = block(c % 2 ? 'coral' : 'glass', cx, 1.68, z - 16, 11, 3, 5.2, { kind: 'container' });
        container.hz += 0.1; // Include the visible corrugated front ribs.
        for (let rib = 0; rib < 8; rib++) box('metal', cx - 4.8 + rib * 1.3, 1.7, z - 18.67, 0.08, 2.7, 0.06);
      }
    } else {
      const tower = (z < 0 && Math.abs(x) < 135) || (x === -40 && z === 40);
      if (tower) {
        const height = 35 + rng() * 38 + (x === 40 && z === -40 ? 24 : 0);
        const width = 22 + rng() * 7;
        const depth = 23 + rng() * 7;
        building(x - 6, z - 3, width, depth, height, rng() > 0.5 ? 'navy' : 'stone', 1);
        building(x + 16, z + 15, 13, 15, 12 + rng() * 12, 'cream');
        block('roof', x - 6, 1.18, z - 3, width + 5, 2, depth + 5, { kind: 'podium' });
      } else {
        for (const dx of [-13, 13]) for (const dz of [-13, 13]) {
          const h = 10 + rng() * 19;
          const width = 17 + rng() * 4, depth = 17 + rng() * 4;
          building(x + dx, z + dz, width, depth, h,
            facadeKeys[Math.floor(rng() * facadeKeys.length)], 0);
          // Canopies attach to the actual frontage; their high collider does not
          // behave like an invisible wall extending down to the pavement.
          block(rng() > 0.5 ? 'teal' : 'coral', x + dx, 2.38, z + dz + depth / 2 + 0.5, 12, 0.28, 1.2, { kind: 'canopy' });
        }
      }
      palm(x - 24, z + 23, 7.5 + rng() * 3);
      palm(x + 24, z - 23, 7 + rng() * 3);
    }
    lamp(x - 25.5, z - 25.5);
    lamp(x + 25.5, z + 25.5, 1);
    const streetY = groundHeightAt(x + 24, z + 5);
    cylinder('frame', x + 24, streetY + 0.5, z + 5, 0.38, 1, { kind: 'street-bin' });
    cylinder('metal', x + 24, streetY + 1.03, z + 5, 0.42, 0.08, { kind: 'street-bin' });
    block('brass', x + 23.5, streetY + 1.08, z - 6, 0.08, 2.16, 0.08, { kind: 'parking-meter' });
    block('frame', x + 23.5, streetY + 1.9, z - 6, 0.38, 0.58, 0.25, { kind: 'parking-meter' });
  }

  const signalHeads=[];
  for (const [ix, rx] of roads.entries()) for (const [iz, rz] of roads.entries()) {
    if (Math.abs(rx) > 160 || Math.abs(rz) > 160) continue;
    const px = rx + 15.5, pz = rz + 18, base = groundHeightAt(px, pz);
    cylinder('metal', px, base + 2.3, pz, 0.1, 4.6, { kind: 'traffic-post' });
    block('metal', px - 4, base + 4.5, pz, 8, 0.11, 0.11, { kind: 'traffic-arm' });
    block('frame', px - 7.8, base + 4.06, pz, 0.48, 1.3, 0.37, { kind: 'traffic-signal' });
    signalHeads.push({x:rx,z:rz,px:px-7.8,pz:pz+.2,y:base+4.45,axis:'z'});
    block(`street-sign-${ix}`, px + 0.7, base + 2.8, pz, 1.6, 0.28, 0.07, { kind: 'street-sign' });
  }

  // Visible boundary walls match the playable extent. The promenade rail is
  // represented by its real posts/rails, not one oversized invisible slab.
  surface('boardwalk', 283, 0, 20, 589, 0.18, { rampWidth: 0.75 });
  block('curbs', 294, 0.4, 0, 1.2, 0.8, 594, { kind: 'seawall' });
  block('curbs', -290, 0.42, 0, 0.6, 0.9, 580, { kind: 'boundary' });
  block('curbs', 0, 0.42, 290, 580, 0.9, 0.6, { kind: 'boundary' });
  if (openNorth) {
    // The bridge and ferry are real openings, shared by visuals and collision.
    for (const [left, right] of [[-290, -169], [-151, -18], [18, 290]])
      block('curbs', (left + right) / 2, 0.42, -290, right - left, 0.9, 0.6, { kind: 'boundary' });
  } else block('curbs', 0, 0.42, -290, 580, 0.9, 0.6, { kind: 'boundary' });
  for (let z = -278; z <= 278; z += 28) {
    palm(282, z, 9 + rng() * 2);
    block('metal', 290, 0.93, z, 0.2, 1.5, 0.2, { kind: 'railing-post' });
    block('metal', 290, 1.33, z + 14, 0.12, 0.12, 28, { kind: 'railing' });
    bench(276, z + 5, Math.PI / 2);
  }
  for (let x = -276; x < 277; x += 32) {
    if (!roads.some(v => Math.abs(x - v) < 15)) {
      palm(x, 280, 8.5 + rng() * 2);
      palm(x, -280, 8.5 + rng() * 2);
    }
  }

  const oceanMaterial = createHarborWaterMaterial(THREE);
  const ocean = mesh(new THREE.PlaneGeometry(2200, 3200, 1, 1), oceanMaterial, 1397, -0.3, 0);
  ocean.rotation.x = -Math.PI / 2;
  box('sand', 304, -0.05, 0, 17, 0.25, 640);
  const waveMaterial = new THREE.MeshBasicMaterial({ color: '#a6d3c7', transparent: true, opacity: 0.28, depthWrite: false });
  const waves = [];
  for (let i = 0; i < 18; i++) {
    const wave = mesh(new THREE.PlaneGeometry(0.25 + rng() * 0.4, 35 + rng() * 60), waveMaterial,
      315 + i * 19, -0.16, -275 + rng() * 550);
    wave.rotation.x = -Math.PI / 2;
    waves.push({ wave, x: wave.position.x, phase: rng() * Math.PI * 2 });
  }
  // Harbor silhouettes sit beyond world bounds, so no inaccessible mission spawns.
  for (const z of [-175, -35, 105]) {
    box('boardwalk', 343, 0.05, z, 88, 0.7, 11);
    for (let x = 305; x <= 380; x += 12) stamp('cylinder', 'metal', x, -1.1, z, 0.7, 2.3, 0.7);
    box('cream', 354, 1.3, z + 12, 26, 1.4, 7);
    box('glassDark', 354, 2.65, z + 12, 10, 1.3, 6);
    box('white', 354, 3.45, z + 12, 12, 0.3, 7.2);
  }
  // A pair of port cranes reinforces the coastline at long viewing distances.
  for (const z of [-224, 199]) {
    for (const x of [306, 326]) box('coral', x, 14, z, 1.5, 28, 1.5);
    box('coral', 324, 28, z, 56, 1.6, 2);
    box('metal', 346, 17, z, 0.2, 21, 0.2);
    box('dark', 345.5, 6.8, z, 2, 0.9, 1.5);
  }
  billboard('NEON HARBOR', 'AFTER HOURS  /  THE CITY IS YOURS', '#53d6c4', -38, 31, 134, 22, 7);
  billboard('SUNSET CLUB', 'MUSIC · NIGHT DRIVES · GOOD COMPANY', '#f5aa87', -121, 24, 212, 19, 6);
  billboard('EAST BAY', 'PORT AUTHORITY  /  EST. 1986', '#79d1c6', 199, 16, 59, 18, 5);
  billboard('PALM STUDIOS', 'EVERY STREET HAS A STORY', '#e8bf86', -112, 28, 135, 20, 5);
  billboard('OPEN LATE', 'COFFEE  •  TACOS  •  RECORDS', '#ffac83', -201, 18, -108, 14, 4.5);

  const geometryFor = kind => surfaceGeometries.get(kind) || (kind === 'box' || kind === 'detail-box' ? boxGeo : kind === 'architecture' ? architectureGeo : kind === 'leaf' ? leafGeo : kind === 'tree-crown' ? treeGeo : kind === 'cylinder' ? cylinderGeo : null);
  function makeBatch(kind, key, transforms) {
    const geometry = geometryFor(kind);
    if (!geometry) throw new Error(`Unsupported city geometry ${kind}`);
    const material = mat(key);
    const instanced = new THREE.InstancedMesh(geometry, material, transforms.length);
    transforms.forEach(([x, y, z, sx, sy, sz, rx, ry, rz], index) => {
      temp.position.set(x, y, z); temp.scale.set(sx, sy, sz); temp.rotation.set(rx, ry, rz);
      temp.updateMatrix(); instanced.setMatrixAt(index, temp.matrix);
    });
    instanced.castShadow = quality === 'high'; instanced.receiveShadow = true;
    instanced.userData.batchId = `${kind}:${key}`;
    instanced.userData.nearDetail = kind === 'detail-box';
    instanced.userData.noShadow = kind.startsWith('surface-') || ['sand', 'marking', 'white'].includes(key);
    if (instanced.userData.noShadow) instanced.castShadow = false;
    instanced.computeBoundingSphere(); return instanced;
  }
  for (const { kind, key, transforms } of pool.values()) root.add(makeBatch(kind, key, transforms));
  const chunkPayloads = new Map();
  if (!streaming) for (const { kind, key, transforms } of pool.values()) {
    for (const transform of transforms) {
      const [x, , z, sx, , sz] = transform;
      if (isGlobal(kind, key, x, z, sx, sz)) continue;
      const id = chunkIdAt(x, z);
      if (!chunkPayloads.has(id)) chunkPayloads.set(id, new Map());
      const batches = chunkPayloads.get(id), batchId = `${kind}:${key}`;
      if (!batches.has(batchId)) batches.set(batchId, { kind, material: key, transforms: [] });
      batches.get(batchId).transforms.push(transform.map(n => Math.round(n * 1e6) / 1e6));
    }
  }
  let streamer = null;
  if (streaming) {
    // A missing district must never turn resident physical obstacles invisible.
    // Cheap silhouettes cover every streamed solid until its real mesh attaches.
    for (const obstacle of colliders) {
      if (!obstacle.physics || ['building', 'sculpture', 'billboard'].includes(obstacle.kind) ||
        Math.abs(obstacle.x) > 295 || Math.abs(obstacle.z) > 295 || obstacle.hx > 37.5 || obstacle.hz > 37.5) continue;
      const color = obstacle.kind.includes('trunk') || obstacle.kind === 'bench' ? '#89775c' :
        obstacle.kind === 'container' ? '#778b88' : obstacle.kind.includes('roof') || obstacle.kind === 'parapet' ? '#69777b' : '#586563';
      proxyBuildings.push({ x: obstacle.x, z: obstacle.z, y: (obstacle.minY + obstacle.maxY) / 2,
        width: obstacle.hx * 2, depth: obstacle.hz * 2, height: obstacle.maxY - obstacle.minY,
        color, chunkId: chunkIdAt(obstacle.x, obstacle.z) });
    }
    // The skyline proxy preserves genuine district silhouettes while their richer
    // geometry streams. Each loaded district hides only its own proxy instances.
    const proxyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.83, metalness: 0.04 });
    const proxy = new THREE.InstancedMesh(boxGeo, proxyMaterial, proxyBuildings.length);
    proxy.name = 'Distant city silhouette'; proxy.userData.noShadow = true;
    const proxyMatrices = [], proxyIndices = new Map();
    proxyBuildings.forEach((building, i) => {
      temp.position.set(building.x, building.y, building.z); temp.rotation.set(0, 0, 0); temp.scale.set(building.width, building.height, building.depth); temp.updateMatrix();
      proxyMatrices.push(temp.matrix.clone()); proxy.setMatrixAt(i, temp.matrix); proxy.setColorAt(i, new THREE.Color(building.color));
      if (!proxyIndices.has(building.chunkId)) proxyIndices.set(building.chunkId, []);
      proxyIndices.get(building.chunkId).push(i);
    });
    proxy.computeBoundingSphere(); root.add(proxy);
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const proxyVisible = (id, visible) => {
      for (const index of proxyIndices.get(id) || []) proxy.setMatrixAt(index, visible ? proxyMatrices[index] : hidden);
      proxy.instanceMatrix.needsUpdate = true;
    };
    streamer = new DistrictStreamer({ chunks: [...chunkMetadata.values()],
      load: async (meta, signal) => {
        if (signal.aborted) throw new Error('District load cancelled');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
        try {
          const response = await fetch(new URL(meta.file, assetBase), { signal: controller.signal, cache: 'no-cache' });
          if (!response.ok) throw new Error(`District ${meta.id}: HTTP ${response.status}`);
          const source = await response.text();
          const data = validateCityChunk(JSON.parse(source), meta.id);
          const group = new THREE.Group(); group.name = `City district ${meta.id}`;
          for (const batch of data.batches) group.add(makeBatch(batch.kind, batch.material, batch.transforms));
          return { node: group, bytes: new TextEncoder().encode(source).length,
            instances: data.batches.reduce((sum, batch) => sum + batch.transforms.length, 0), meshes: group.children.length };
        } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
      },
      attach: (group, meta) => {
        group.userData.cityChunk = meta;
        const distance = streamer?.distance(meta, streamer.position) || 0;
        for (const mesh of group.children) if (mesh.userData.nearDetail) mesh.visible = distance <= 100;
        root.add(group); proxyVisible(meta.id, false);
      },
      detach: (group, meta) => {
        root.remove(group); let disposed = 0;
        group.traverse(mesh => { if (mesh.isInstancedMesh) { mesh.dispose(); disposed += mesh.count; } });
        group.clear(); proxyVisible(meta.id, true); return disposed;
      },
    });
  }

  const landmarks = [
    { id: 'civic', name: '中央广场', x: 0, z: 80, color: '#62dec9' },
    { id: 'harbor', name: '东湾码头', x: 160, z: 0, color: '#6bc9ec' },
    { id: 'market', name: '霞光集市', x: -160, z: -160, color: '#ffb48b' },
    { id: 'studio', name: '海风影城', x: -80, z: 160, color: '#d49fea' },
    { id: 'gardens', name: '棕榈公园', x: 80, z: -160, color: '#a5d481' },
    { id: 'skyline', name: '星港金融区', x: 0, z: -80, color: '#f2d18a' },
  ];
  // Sidewalk circuits are data owned by the world, not unchecked renderer math.
  const walkerRoutes = Array.from({ length: 9 }, (_, i) => {
    const dx = (i % 3 - 1) * 80, dz = (Math.floor(i / 3) - 1) * 80;
    return [{ x: 13 + dx, z: 93 + dz }, { x: 67 + dx, z: 93 + dz },
      { x: 67 + dx, z: 147 + dz }, { x: 13 + dx, z: 147 + dz }];
  });
  const signalGeometry=new THREE.BoxGeometry(.23,.24,.045),signalMaterial=new THREE.MeshBasicMaterial({color:'#ffffff'});
  const signalMesh=new THREE.InstancedMesh(signalGeometry,signalMaterial,signalHeads.length*3),signalTransform=new THREE.Object3D();
  signalMesh.userData.noShadow=true;signalMesh.name='Traffic signals · live phases';
  for(const [i,head] of signalHeads.entries())for(let bulb=0;bulb<3;bulb++){signalTransform.position.set(head.px,head.y-bulb*.39,head.pz);signalTransform.updateMatrix();signalMesh.setMatrixAt(i*3+bulb,signalTransform.matrix);signalMesh.setColorAt(i*3+bulb,new THREE.Color('#19302f'));}
  signalMesh.computeBoundingSphere();root.add(signalMesh);
  let signalClock=-1;
  function updateSignals(time){
    const tick=Math.floor(time*5);if(tick===signalClock)return;signalClock=tick;
    const colors={red:'#ed695c',amber:'#e6b65d',green:'#7bd8a7'};
    for(const [i,head] of signalHeads.entries()){const phase=intersectionSignal(time,head.x,head.z,head.axis);for(const [bulb,label] of ['red','amber','green'].entries())signalMesh.setColorAt(i*3+bulb,new THREE.Color(phase===label?colors[label]:'#152723'));}
    signalMesh.instanceColor.needsUpdate=true;
  }
  updateSignals(0);
  let elapsed = 0, detailClock = 0;
  return {
    root, colliders, surfaces, roadSurfaces, renderObstacles, groundHeightAt, walkerRoutes, landmarks,
    get streamingStats() { return streamer ? streamer.stats : { ready: true, loaded: chunkMetadata.size, pending: 0, failed: 0, activeChunks: [...chunkMetadata.keys()] }; },
    prepare: position => streamer ? streamer.prepare(position) : Promise.resolve({ ready: true, loaded: chunkMetadata.size, failed: [] }),
    retry: position => streamer ? streamer.retry(position) : Promise.resolve({ ready: true, failed: [] }),
    streamAt: (position, velocity, dt = 0) => streamer?.update(position, velocity, dt),
    setQuality(value) { quality = value; root.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = value === 'high' && !mesh.userData.noShadow; }); },
    exportCity() { return { version: 1, chunkSize, chunks: [...chunkMetadata.values()], payloads: [...chunkPayloads].map(([id, batches]) => ({ version: 1, id, batches: [...batches.values()] })) }; },
    bounds: WORLD_BOUNDS, spawn: { x: 8, z: 174, yaw: Math.PI },
    districtAt(x, z) {
      if (x > 170) return '东湾港区';
      if (z > 100) return '海风大道';
      if (x < -120 && z < -75) return '霞光老城';
      if (x > 50 && z < -85) return '棕榈花园';
      if (z < 20 && Math.abs(x) < 145) return '星港金融区';
      return '中央城区';
    },
    update(dt, timeOfDay, view = null) {
      elapsed += dt;updateSignals(view?.trafficTime??elapsed);
      if (view?.position) {
        streamer?.update(view.position, view.velocity, dt);
        detailClock += dt;
        if (detailClock > 0.2) {
          detailClock = 0;
          for (const group of root.children) if (group.userData.cityChunk) {
            const distance = streamer.distance(group.userData.cityChunk, view.position);
            for (const mesh of group.children) if (mesh.userData.nearDetail) {
              if (distance > 100) mesh.visible = false;
              else if (distance < 80) mesh.visible = true;
            }
          }
        }
      }
      // Works with either a normalized day fraction or an hour-based clock.
      const hour = Number.isFinite(timeOfDay) ? (timeOfDay <= 1 ? timeOfDay * 24 : timeOfDay) % 24 : 18;
      const daylight = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
      for (const material of sharedEmissive) material.emissiveIntensity = 0.06 + (1 - daylight) * 0.65;
      updateHarborWaterMaterial(oceanMaterial,elapsed,hour);
      for (const { wave } of waves) wave.visible=false;
    },
  };
}

export { createCar, createCharacter } from './models.js';

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

/** A raised walkable rectangle with a matching four-sided bevel/ramp. */
function makeSurfaceGeometry(THREE, width, depth, y, baseY, rampWidth) {
  const hx = width / 2, hz = depth / 2;
  const ramp = Math.min(rampWidth, hx, hz);
  const outer = [[-hx, baseY, -hz], [hx, baseY, -hz], [hx, baseY, hz], [-hx, baseY, hz]];
  const inner = [[-hx + ramp, y, -hz + ramp], [hx - ramp, y, -hz + ramp],
    [hx - ramp, y, hz - ramp], [-hx + ramp, y, hz - ramp]];
  const positions = [];
  const quad = (a, b, c, d) => { for (const point of [a, c, b, a, d, c]) positions.push(...point); };
  quad(...inner);
  if (ramp > 0) for (let n = 0; n < 4; n++) quad(outer[n], outer[(n + 1) % 4], inner[(n + 1) % 4], inner[n]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv = []; for (let i = 0; i < positions.length; i += 3) uv.push(positions[i] / 6, positions[i + 2] / 6);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function beveledArchitectureGeometry(THREE) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.475, -0.475); shape.lineTo(0.475, -0.475); shape.lineTo(0.475, 0.475); shape.lineTo(-0.475, 0.475); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.95, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, steps: 1 });
  geometry.translate(0, 0, -0.475); return geometry;
}

/** Small deterministic PBR surface maps, generated locally without CDN fonts/assets. */
function proceduralMaterialTexture(THREE, kind) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'); if (!ctx?.createImageData) return null;
  const pixels = ctx.createImageData(256, 256), random = seededRandom(4217 + kind.length);
  for (let p = 0; p < pixels.data.length; p += 4) {
    const value = Math.round(237 + (random() - 0.5) * (kind === 'asphalt' ? 36 : 15));
    pixels.data[p] = pixels.data[p + 1] = pixels.data[p + 2] = value; pixels.data[p + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  if (kind === 'pavement') {
    ctx.strokeStyle = 'rgba(76,72,64,.25)'; ctx.lineWidth = 1;
    for (let n = 0; n <= 256; n += 32) { ctx.beginPath(); ctx.moveTo(n, 0); ctx.lineTo(n, 256); ctx.moveTo(0, n); ctx.lineTo(256, n); ctx.stroke(); }
  } else if (kind === 'brick') {
    ctx.strokeStyle = 'rgba(94,77,66,.25)'; ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
      for (let x = (y / 24 % 2) * 24; x < 256; x += 48) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 24); ctx.stroke(); }
    }
  } else if (kind === 'asphalt') {
    ctx.strokeStyle = 'rgba(26,29,31,.09)'; ctx.lineWidth = 0.7;
    for (let n = 0; n < 9; n++) { ctx.beginPath(); let x = random() * 256, y = random() * 256; ctx.moveTo(x, y); for (let k = 0; k < 5; k++) { x += random() * 14; y += (random() - 0.5) * 14; ctx.lineTo(x, y); } ctx.stroke(); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8; return texture;
}

function shopSignTexture(THREE, index) {
  if (typeof document === 'undefined') return null;
  const labels = ['HARBOR COFFEE', 'MARINA MOTORS', 'CASA PALMA', 'NIGHT MARKET', 'EAST BAY RECORDS', 'PORTSIDE HOTEL'];
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  ctx.fillStyle = ['#253a3e', '#413b32', '#5b5447', '#4b3435', '#2b3d42', '#384535'][index % 6]; ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = '#e7dfc5'; ctx.font = '600 52px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(labels[index % 6], 512, 77, 930);
  ctx.fillStyle = '#acb397'; ctx.fillRect(160, 99, 704, 2);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}


/** Curved central stem with individual tapered leaflets; no pyramid crowns. */
function palmFrondGeometry(THREE) {
  const positions = [], uv = [];
  const point = (x, y, z, u, v) => { positions.push(x, y, z); uv.push(u, v); };
  for (let i = 0; i < 18; i++) {
    const t = i / 18, y = -0.5 + t, bend = 0.3 * t * t;
    const width = Math.sin(Math.PI * (t * 0.87 + 0.07)) * 0.6 * (1 - t * 0.5);
    for (const side of [-1, 1]) {
      point(0, y - 0.016, bend, 0.5, t);
      point(side * width, y + 0.105, bend - 0.1 - t * 0.05, side > 0 ? 1 : 0, t + 0.1);
      point(side * 0.035, y + 0.048, bend + 0.01, 0.5, t + 0.05);
    }
    point(-0.012, y, bend, 0.49, t); point(0.012, y, bend, 0.51, t); point(0.012, y + 0.057, 0.3 * (t + 0.057) ** 2, 0.51, t + 0.057);
    point(-0.012, y, bend, 0.49, t); point(0.012, y + 0.057, 0.3 * (t + 0.057) ** 2, 0.51, t + 0.057); point(-0.012, y + 0.057, 0.3 * (t + 0.057) ** 2, 0.49, t + 0.057);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals(); return geometry;
}

function canopyClusterGeometry(THREE) {
  const geometry = new THREE.SphereGeometry(1, 12, 9);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const r = 0.9 + Math.sin(x * 8 + y * 4) * 0.045 + Math.cos(z * 9 - y * 6) * 0.045;
    position.setXYZ(i, x * r, y * r, z * r);
  }
  geometry.computeVertexNormals(); return geometry;
}


/** Facade maps are measured in metres, independent of instanced building size. */
function useWorldScaleTexture(material, kind) {
  material.onBeforeCompile = shader => {
    const brick = kind === 'brick';
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_MAP
  mat4 cityTransform = modelMatrix;
  #ifdef USE_INSTANCING
    cityTransform = modelMatrix * instanceMatrix;
  #endif
  vec3 cityPosition = (cityTransform * vec4(position, 1.0)).xyz;
  vec3 cityNormal = normalize(mat3(cityTransform) * normal);
  if (abs(cityNormal.y) > max(abs(cityNormal.x), abs(cityNormal.z))) {
    vMapUv = cityPosition.xz / 2.0;
  } else if (abs(cityNormal.x) > abs(cityNormal.z)) {
    vMapUv = vec2(cityPosition.z / ${brick ? '1.15' : '2.0'}, cityPosition.y / ${brick ? '0.8' : '2.0'});
  } else {
    vMapUv = vec2(cityPosition.x / ${brick ? '1.15' : '2.0'}, cityPosition.y / ${brick ? '0.8' : '2.0'});
  }
#endif`);
  };
  material.customProgramCacheKey = () => `city-metric-texture-${kind}-1`;
}

function streetSignTexture(THREE, index) {
  if (typeof document === 'undefined') return null;
  const labels = ['BAYSHORE DR', 'SUNSET BLVD', 'PALM STREET', 'HARBOR AVE', 'CENTRAL AVE', 'MARINA RD', 'COASTLINE DR'];
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d'); if (!ctx) return null;
  ctx.fillStyle = '#294c46'; ctx.fillRect(0, 0, 512, 96); ctx.fillStyle = '#e1e7d7'; ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center'; ctx.fillText(labels[index % labels.length], 256, 59, 470);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}
