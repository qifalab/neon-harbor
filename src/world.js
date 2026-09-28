/**
 * The city is entirely original procedural art. Static details are batched by
 * material, so thousands of windows/road marks cost a few dozen draw calls.
 * Every solid inside the driving area also emits an axis-aligned collider.
 */
export function createWorld(THREE, scene, { quality = 'high' } = {}) {
  const root = new THREE.Group();
  root.name = 'Neon Harbor · city';
  scene.add(root);
  const colliders = [];
  const palettes = {
    asphalt: '#28323c', sidewalk: '#b9ad9e', curbs: '#ded5c4', median: '#526558',
    marking: '#f0dfaa', white: '#dae0d5', park: '#52694a', path: '#c2ac88',
    sand: '#c9b797', roof: '#56616a', equipment: '#829392', dark: '#223943',
    glass: '#316c7d', glassDark: '#344c65', glassLight: '#64a1a2',
    light: '#ffdba2', teal: '#39d4c7', coral: '#d98970', cream: '#d5c7ad',
    pink: '#caa696', stone: '#89908b', navy: '#43546a', brick: '#a77f65',
    leaves: '#4a7464', trunk: '#987e60', metal: '#536775', boardwalk: '#9f8671',
  };
  const materials = {};
  const pool = new Map();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const leafGeo = new THREE.ConeGeometry(1, 1, 4);
  const temp = new THREE.Object3D();
  const rng = seededRandom(749213);
  let sharedEmissive = [];

  function mat(key) {
    if (!materials[key]) {
      const emissive = ['light', 'teal'].includes(key);
      materials[key] = new THREE.MeshStandardMaterial({
        color: palettes[key] || key,
        roughness: key.startsWith('glass') ? 0.34 : 0.82,
        metalness: key.startsWith('glass') ? 0.3 : 0.02,
        ...(emissive ? { emissive: palettes[key], emissiveIntensity: 0.5 } : {}),
      });
      if (emissive) sharedEmissive.push(materials[key]);
    }
    return materials[key];
  }
  function stamp(kind, key, x, y, z, sx, sy, sz, ry = 0, rz = 0, rx = 0) {
    const id = `${kind}:${key}`;
    if (!pool.has(id)) pool.set(id, { kind, material: mat(key), transforms: [] });
    pool.get(id).transforms.push([x, y, z, sx, sy, sz, rx, ry, rz]);
  }
  const box = (key, x, y, z, sx, sy, sz, ry = 0) => stamp('box', key, x, y, z, sx, sy, sz, ry);
  const solid = (x, z, hx, hz) => colliders.push({ x, z, hx, hz });
  function block(key, x, y, z, sx, sy, sz, blocking = true) {
    box(key, x, y, z, sx, sy, sz);
    if (blocking && sy > 0.4) solid(x, z, sx / 2, sz / 2);
  }
  function mesh(geometry, material, x, y, z) {
    const obj = new THREE.Mesh(geometry, material);
    obj.position.set(x, y, z);
    obj.receiveShadow = true;
    root.add(obj);
    return obj;
  }

  // Continuous ground and separated road planes avoid z-fighting at intersections.
  box('sand', 0, -0.28, 0, 598, 0.5, 598);
  const roads = [-240, -160, -80, 0, 80, 160, 240];
  for (const lane of roads) {
    box('asphalt', lane, 0.011, 0, 22, 0.035, 590);
    box('asphalt', 0, 0.015, lane, 590, 0.035, 22);
    // Dashed center lines are omitted at junctions, where zebra crossings take over.
    for (let segment = -286; segment < 289; segment += 12) {
      if (roads.some(v => Math.abs(segment - v) < 16)) continue;
      box('marking', lane - 0.22, 0.045, segment, 0.13, 0.01, 5.2);
      box('marking', lane + 0.22, 0.045, segment, 0.13, 0.01, 5.2);
      box('marking', segment, 0.049, lane - 0.22, 5.2, 0.01, 0.13);
      box('marking', segment, 0.049, lane + 0.22, 5.2, 0.01, 0.13);
    }
  }
  for (const x of roads) for (const z of roads) {
    for (let i = -8; i <= 8; i += 2.6) {
      box('white', x + i, 0.055, z - 13.1, 1.3, 0.01, 3.6);
      box('white', x + i, 0.055, z + 13.1, 1.3, 0.01, 3.6);
      box('white', x - 13.1, 0.06, z + i, 3.6, 0.01, 1.3);
      box('white', x + 13.1, 0.06, z + i, 3.6, 0.01, 1.3);
    }
  }

  function palm(x, z, height = 8) {
    stamp('cylinder', 'trunk', x, height / 2, z, 0.28, height, 0.28);
    solid(x, z, 0.38, 0.38);
    for (let i = 0; i < 6; i++) {
      const angle = i * Math.PI / 3;
      // Flattened tilted cones provide recognizable fronds with minimal geometry.
      stamp('leaf', 'leaves', x + Math.sin(angle) * 1.5, height + 0.1, z + Math.cos(angle) * 1.5,
        1.4, 5, 0.24, angle, Math.PI / 2.5, 0);
    }
    stamp('cylinder', 'trunk', x, height - 0.1, z, 0.57, 0.6, 0.57);
  }
  function tree(x, z) {
    stamp('cylinder', 'trunk', x, 1.6, z, 0.4, 3.2, 0.4);
    stamp('leaf', 'leaves', x, 4.5, z, 3.2, 5.5, 3.2);
    solid(x, z, 0.55, 0.55);
  }
  function lamp(x, z, axis = 0) {
    const dx = axis === 0 ? 2.5 : 0, dz = axis === 0 ? 0 : 2.5;
    stamp('cylinder', 'metal', x, 3.7, z, 0.1, 7.4, 0.1);
    box('metal', x + dx / 2, 7.35, z + dz / 2, axis === 0 ? 2.8 : 0.13, 0.15, axis === 0 ? 0.13 : 2.8);
    box('light', x + dx, 7.3, z + dz, axis === 0 ? 1.1 : 0.6, 0.1, axis === 0 ? 0.6 : 1.1);
    solid(x, z, 0.18, 0.18);
  }
  function bench(x, z, rotation = 0) {
    box('boardwalk', x, 0.65, z, 2.8, 0.2, 0.75, rotation);
    box('boardwalk', x + Math.sin(rotation) * 0.35, 1.05, z + Math.cos(rotation) * 0.35, 2.8, 0.7, 0.13, rotation);
    box('metal', x - Math.cos(rotation), 0.3, z + Math.sin(rotation), 0.2, 0.6, 0.6, rotation);
    box('metal', x + Math.cos(rotation), 0.3, z - Math.sin(rotation), 0.2, 0.6, 0.6, rotation);
    solid(x, z, rotation === 0 ? 1.5 : 0.5, rotation === 0 ? 0.5 : 1.5);
  }
  function windows(x, z, width, depth, height, glass, style = 0) {
    const floors = Math.max(1, Math.floor((height - 2.5) / 3.6));
    for (let floor = 0; floor < floors; floor++) {
      const y = 3.3 + floor * 3.6;
      const lit = floor % 5 === 1;
      const key = lit && rng() > 0.44 ? 'light' : glass;
      if (style === 1) {
        // Ribbon glazing gives the financial district a modern, continuous facade.
        box(key, x, y, z + depth / 2 + 0.032, width - 1.2, 1.9, 0.07);
        box(key, x, y, z - depth / 2 - 0.032, width - 1.2, 1.9, 0.07);
        box(key, x + width / 2 + 0.032, y, z, 0.07, 1.9, depth - 1.2);
        box(key, x - width / 2 - 0.032, y, z, 0.07, 1.9, depth - 1.2);
      } else {
        for (let wx = -width / 2 + 2; wx < width / 2 - 1; wx += 3.4) {
          box(key, x + wx, y, z + depth / 2 + 0.035, 1.55, 1.7, 0.07);
          box(key, x + wx, y, z - depth / 2 - 0.035, 1.55, 1.7, 0.07);
        }
        for (let wz = -depth / 2 + 2; wz < depth / 2 - 1; wz += 3.4) {
          box(key, x + width / 2 + 0.035, y, z + wz, 0.07, 1.7, 1.55);
          box(key, x - width / 2 - 0.035, y, z + wz, 0.07, 1.7, 1.55);
        }
      }
    }
  }
  function building(x, z, width, depth, height, key = 'cream', style = 0) {
    block(key, x, height / 2 + 0.22, z, width, height, depth);
    box('roof', x, height + 0.35, z, width + 0.45, 0.4, depth + 0.45);
    box('dark', x, 0.9, z + depth / 2 + 0.045, width - 0.9, 1.4, 0.08);
    windows(x, z, width, depth, height, style ? 'glass' : 'glassDark', style);
    // Rooftop hardware reads well from the third-person and title cameras.
    box('equipment', x + width * 0.18, height + 1, z - depth * 0.18, 2.7, 1.2, 2.2);
    box('roof', x - width * 0.24, height + 0.65, z + depth * 0.2, 2.8, 0.35, 3.6);
    if (height > 45) {
      box('teal', x, height + 0.65, z + depth / 2 + 0.3, width + 0.7, 0.18, 0.17);
      box('metal', x, height + 4, z, 0.25, 7, 0.25);
      box('light', x, height + 7.6, z, 0.4, 0.4, 0.4);
    }
  }
  function billboard(text, sub, color, x, y, z, width = 15, height = 5, rotation = 0) {
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
    box('metal', x, y - height / 2 - 1.5, z, 0.3, 3, 0.3);
  }

  const centers = [-200, -120, -40, 40, 120, 200];
  const facadeKeys = ['cream', 'pink', 'stone', 'coral', 'brick', 'navy'];
  for (let ix = 0; ix < centers.length; ix++) for (let iz = 0; iz < centers.length; iz++) {
    const x = centers[ix], z = centers[iz];
    box('sidewalk', x, 0.095, z, 57.4, 0.18, 57.4);
    box('curbs', x, 0.12, z - 28.6, 57.4, 0.2, 0.35);
    box('curbs', x, 0.12, z + 28.6, 57.4, 0.2, 0.35);
    box('curbs', x - 28.6, 0.12, z, 0.35, 0.2, 57.4);
    box('curbs', x + 28.6, 0.12, z, 0.35, 0.2, 57.4);

    const parkBlock = (x === 120 && z === -120) || (x === -40 && z === 120);
    const plazaBlock = x === 40 && z === 40;
    const warehouse = x === 200 && z <= 40;
    if (parkBlock) {
      box('park', x, 0.21, z, 47, 0.12, 47);
      box('path', x, 0.29, z, 5, 0.045, 48);
      box('path', x, 0.3, z, 48, 0.045, 5);
      for (const dx of [-16, 16]) for (const dz of [-16, 16]) {
        palm(x + dx, z + dz, 8 + rng() * 3);
        tree(x + dx, z + dz * 0.45);
      }
      bench(x - 7, z + 8); bench(x + 7, z - 8);
      block('cream', x + 11, 0.55, z + 11, 5, 1.1, 5);
      box('teal', x + 11, 1.15, z + 11, 4.5, 0.15, 4.5);
    } else if (plazaBlock) {
      box('path', x, 0.23, z, 48, 0.1, 48);
      stamp('cylinder', 'cream', x, 0.6, z, 7, 1.1, 7);
      stamp('cylinder', 'teal', x, 1.16, z, 6.1, 0.12, 6.1);
      solid(x, z, 7, 7);
      const sculpture = mesh(new THREE.TorusKnotGeometry(2.5, 0.48, 56, 6), mat('teal'), x, 4.2, z);
      sculpture.castShadow = true;
      for (const dx of [-19, 19]) for (const dz of [-19, 19]) palm(x + dx, z + dz, 9);
      bench(x - 12, z + 2, Math.PI / 2); bench(x + 12, z + 2, Math.PI / 2);
    } else if (warehouse) {
      building(x, z + 7, 42, 29, 10 + rng() * 3, 'stone');
      for (let c = 0; c < 3; c++) {
        const cx = x - 14 + c * 14;
        block(c % 2 ? 'coral' : 'glass', cx, 1.7, z - 16, 11, 3, 5.2);
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
        block('roof', x - 6, 1.2, z - 3, width + 5, 2, depth + 5);
      } else {
        for (const dx of [-13, 13]) for (const dz of [-13, 13]) {
          const h = 10 + rng() * 19;
          building(x + dx, z + dz, 17 + rng() * 4, 17 + rng() * 4, h,
            facadeKeys[Math.floor(rng() * facadeKeys.length)], 0);
          // Shallow storefront canopies give street level a human scale.
          box(rng() > 0.5 ? 'teal' : 'coral', x + dx, 2.2, z + dz + 10.6, 12, 0.28, 1.2);
        }
      }
      palm(x - 24, z + 23, 7.5 + rng() * 3);
      palm(x + 24, z - 23, 7 + rng() * 3);
    }
    lamp(x - 25.5, z - 25.5);
    lamp(x + 25.5, z + 25.5, 1);
  }

  // The perimeter remains driveable and has a continuous pedestrian promenade.
  box('boardwalk', 283, 0.095, 0, 20, 0.18, 589);
  box('curbs', 294, 0.4, 0, 1.2, 0.8, 594);
  solid(294, 0, 0.6, 297);
  for (let z = -278; z <= 278; z += 28) {
    palm(282, z, 9 + rng() * 2);
    box('metal', 290, 0.75, z, 0.2, 1.5, 0.2);
    box('metal', 290, 1.15, z + 14, 0.12, 0.12, 28);
    solid(290, z, 0.2, 0.2);
    bench(276, z + 5, Math.PI / 2);
  }
  solid(290, 0, 0.18, 295);
  for (let x = -276; x < 277; x += 32) {
    if (!roads.some(v => Math.abs(x - v) < 15)) {
      palm(x, 280, 8.5 + rng() * 2);
      palm(x, -280, 8.5 + rng() * 2);
    }
  }

  const oceanMaterial = new THREE.MeshStandardMaterial({ color: '#287f8d', roughness: 0.32, metalness: 0.18 });
  const ocean = mesh(new THREE.PlaneGeometry(2200, 2600, 1, 1), oceanMaterial, 1397, -0.3, 0);
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

  // Assemble instance batches once. No static per-frame traversal is required.
  for (const { kind, material, transforms } of pool.values()) {
    const geometry = kind === 'box' ? boxGeo : kind === 'leaf' ? leafGeo : cylinderGeo;
    const instanced = new THREE.InstancedMesh(geometry, material, transforms.length);
    transforms.forEach(([x, y, z, sx, sy, sz, rx, ry, rz], index) => {
      temp.position.set(x, y, z); temp.scale.set(sx, sy, sz); temp.rotation.set(rx, ry, rz);
      temp.updateMatrix(); instanced.setMatrixAt(index, temp.matrix);
    });
    instanced.castShadow = quality === 'high' && !['asphalt', 'light', 'marking', 'white'].includes(Object.keys(materials).find(key => materials[key] === material));
    instanced.receiveShadow = true;
    instanced.computeBoundingSphere();
    root.add(instanced);
  }

  const landmarks = [
    { id: 'civic', name: '中央广场', x: 0, z: 80, color: '#62dec9' },
    { id: 'harbor', name: '东湾码头', x: 160, z: 0, color: '#6bc9ec' },
    { id: 'market', name: '霞光集市', x: -160, z: -160, color: '#ffb48b' },
    { id: 'studio', name: '海风影城', x: -80, z: 160, color: '#d49fea' },
    { id: 'gardens', name: '棕榈公园', x: 80, z: -160, color: '#a5d481' },
    { id: 'skyline', name: '星港金融区', x: 0, z: -80, color: '#f2d18a' },
  ];
  let elapsed = 0;
  return {
    root, colliders, landmarks, bounds: 290, spawn: { x: 8, z: 174, yaw: Math.PI },
    districtAt(x, z) {
      if (x > 170) return '东湾港区';
      if (z > 100) return '海风大道';
      if (x < -120 && z < -75) return '霞光老城';
      if (x > 50 && z < -85) return '棕榈花园';
      if (z < 20 && Math.abs(x) < 145) return '星港金融区';
      return '中央城区';
    },
    update(dt, timeOfDay) {
      elapsed += dt;
      // Works with either a normalized day fraction or an hour-based clock.
      const hour = Number.isFinite(timeOfDay) ? (timeOfDay <= 1 ? timeOfDay * 24 : timeOfDay) % 24 : 18;
      const daylight = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
      for (const material of sharedEmissive) material.emissiveIntensity = 0.35 + (1 - daylight) * 1.5;
      for (const { wave, x, phase } of waves) wave.position.x = x + Math.sin(elapsed * 0.24 + phase) * 2.2;
      waveMaterial.opacity = 0.18 + daylight * 0.14;
    },
  };
}

/** Sports sedan model: +Z is forward; each wheel group rotates about local X. */
export function createCar(THREE, color = '#38c6bc', type = 'sport') {
  const group = new THREE.Group();
  const material = (value, roughness = 0.5, metalness = 0.15) => new THREE.MeshStandardMaterial({ color: value, roughness, metalness });
  const paint = material(color, 0.3, 0.55);
  const dark = material('#152431', 0.52, 0.2);
  const glass = material('#244457', 0.2, 0.6);
  const rim = material('#adb8b8', 0.26, 0.7);
  const headlight = new THREE.MeshStandardMaterial({ color: '#fff3bf', emissive: '#ffefba', emissiveIntensity: 1.2, roughness: 0.3 });
  const taillight = new THREE.MeshStandardMaterial({ color: '#fb5862', emissive: '#ed2e48', emissiveIntensity: 0.8 });
  function part(geometry, mat, x, y, z) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  }
  const cuboid = (mat, x, y, z, w, h, d) => part(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  cuboid(paint, 0, 0.62, 0, 1.92, 0.55, 4.45);
  cuboid(dark, 0, 0.37, 0, 1.8, 0.16, 4.5);
  cuboid(paint, 0, 0.88, 1.35, 1.87, 0.17, 1.52);
  cuboid(paint, 0, 0.85, -1.56, 1.88, 0.13, 1.04);
  // Sloped cabin is a hand-authored prism, avoiding a toy-like stacked-box shape.
  const cabin = new THREE.BufferGeometry();
  const w = 0.79, lowerW = 0.87, baseY = 0.85, topY = type === 'van' ? 1.62 : 1.38;
  const corners = [
    [-lowerW, baseY, -1.11], [lowerW, baseY, -1.11], [lowerW, baseY, 0.98], [-lowerW, baseY, 0.98],
    [-w, topY, -0.7], [w, topY, -0.7], [w, topY, 0.31], [-w, topY, 0.31],
  ];
  const faceIndices = [[0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5], [4, 5, 6, 7]];
  const vertices = [];
  for (const [a, b, c, d] of faceIndices) for (const i of [a, c, b, a, d, c]) vertices.push(...corners[i]);
  cabin.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); cabin.computeVertexNormals();
  part(cabin, glass, 0, 0, 0);
  cuboid(paint, 0, topY + 0.015, -0.2, w * 2 + 0.035, 0.055, 1.04);
  // Center pillars and mirrors make the vehicle readable at street level.
  cuboid(paint, -0.83, (topY + baseY) / 2, -0.12, 0.07, topY - baseY, 0.1);
  cuboid(paint, 0.83, (topY + baseY) / 2, -0.12, 0.07, topY - baseY, 0.1);
  cuboid(dark, -1.04, 0.98, 0.62, 0.21, 0.15, 0.3);
  cuboid(dark, 1.04, 0.98, 0.62, 0.21, 0.15, 0.3);
  cuboid(dark, 0, 0.58, 2.238, 0.8, 0.2, 0.025);
  for (const x of [-0.65, 0.65]) {
    cuboid(headlight, x, 0.76, 2.238, 0.44, 0.13, 0.035);
    cuboid(taillight, x, 0.73, -2.238, 0.45, 0.13, 0.035);
  }
  cuboid(rim, 0, 0.5, -2.26, 0.49, 0.13, 0.035);
  if (type === 'police') {
    const red = new THREE.MeshStandardMaterial({ color: '#ff4566', emissive: '#ff1746', emissiveIntensity: 1.6 });
    const blue = new THREE.MeshStandardMaterial({ color: '#4b94ff', emissive: '#1261ff', emissiveIntensity: 1.6 });
    cuboid(dark, 0, topY + 0.12, -0.12, 1.15, 0.11, 0.34);
    cuboid(red, -0.3, topY + 0.22, -0.12, 0.44, 0.13, 0.29);
    cuboid(blue, 0.3, topY + 0.22, -0.12, 0.44, 0.13, 0.29);
    group.userData.policeLights = [red, blue];
  }
  // Reuse one wheel geometry with vertex colors: tire and alloy need one draw.
  const wheelGeometry = mergeColoredGeometry(THREE, [
    { geometry: new THREE.CylinderGeometry(0.43, 0.43, 0.27, 12), color: '#152027' },
    { geometry: new THREE.CylinderGeometry(0.245, 0.245, 0.285, 6), color: '#adb8b8' },
  ]);
  wheelGeometry.rotateZ(Math.PI / 2);
  const wheelMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.67, metalness: 0.2 });
  const wheels = [];
  for (const x of [-0.94, 0.94]) for (const z of [-1.39, 1.4]) {
    const wheel = new THREE.Group(); wheel.position.set(x, 0.43, z);
    const rubber = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rubber.castShadow = true; wheel.add(rubber);
    group.add(wheel); wheels.push(wheel);
  }
  mergeStaticParts(THREE, group);
  group.userData.wheels = wheels;
  group.userData.color = color;
  return group;
}

/** A compact stylized courier. Limb pivots let the simulation animate walking. */
export function createCharacter(THREE) {
  const group = new THREE.Group();
  const mats = {
    skin: new THREE.MeshStandardMaterial({ color: '#b98260', roughness: 0.9 }),
    jacket: new THREE.MeshStandardMaterial({ color: '#69c2b6', roughness: 0.85 }),
    pants: new THREE.MeshStandardMaterial({ color: '#243544', roughness: 0.92 }),
    shoe: new THREE.MeshStandardMaterial({ color: '#e7ddc6', roughness: 0.92 }),
    dark: new THREE.MeshStandardMaterial({ color: '#263139', roughness: 0.85 }),
  };
  function add(parent, mat, x, y, z, w, h, d) {
    const obj = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[mat]);
    obj.position.set(x, y, z); obj.castShadow = true; parent.add(obj); return obj;
  }
  add(group, 'jacket', 0, 1.05, 0, 0.49, 0.61, 0.3);
  add(group, 'skin', 0, 1.55, 0, 0.33, 0.35, 0.31);
  add(group, 'dark', 0, 1.72, -0.03, 0.35, 0.13, 0.31);
  add(group, 'dark', 0, 1.59, 0.164, 0.27, 0.064, 0.035);
  add(group, 'dark', 0, 1.05, -0.22, 0.34, 0.42, 0.16);
  for (const [name, x] of [['leftLeg', -0.14], ['rightLeg', 0.14]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.77, 0);
    add(pivot, 'pants', 0, -0.31, 0, 0.2, 0.62, 0.24);
    add(pivot, 'shoe', 0, -0.69, 0.055, 0.22, 0.15, 0.36);
    group.add(pivot); group.userData[name] = pivot;
  }
  for (const [name, x] of [['leftArm', -0.34], ['rightArm', 0.34]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 1.28, 0);
    add(pivot, 'jacket', 0, -0.16, 0, 0.16, 0.35, 0.22);
    add(pivot, 'skin', 0, -0.42, 0, 0.13, 0.2, 0.17);
    group.add(pivot); group.userData[name] = pivot;
  }
  // Each articulated body part shares one vertex-colored material; pedestrians
  // retain full limb animation while costing only five draw calls apiece.
  const characterMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
  for (const parent of [group, ...Object.values(group.userData)]) {
    const pieces = [];
    for (const child of [...parent.children]) {
      if (!child.isMesh) continue;
      child.updateMatrix();
      const geometry = child.geometry.clone().applyMatrix4(child.matrix);
      pieces.push({ geometry, color: child.material.color });
      parent.remove(child); child.geometry.dispose();
    }
    const geometry = mergeColoredGeometry(THREE, pieces);
    const mesh = new THREE.Mesh(geometry, characterMaterial);
    mesh.castShadow = true; parent.add(mesh);
  }
  for (const material of Object.values(mats)) material.dispose();
  return group;
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

// A vehicle can appear many times. Merge its fixed body pieces by material while
// retaining the four wheel pivots as separate children for steering/rolling.
function mergeStaticParts(THREE, group) {
  const batches = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh) continue;
    child.updateMatrix();
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometry.applyMatrix4(child.matrix);
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material).push(geometry);
    group.remove(child);
    child.geometry.dispose();
  }
  for (const [material, geometries] of batches) {
    const geometry = new THREE.BufferGeometry();
    for (const key of ['position', 'normal']) {
      const count = geometries.reduce((sum, part) => sum + part.attributes[key].array.length, 0);
      const values = new Float32Array(count);
      let offset = 0;
      for (const part of geometries) {
        values.set(part.attributes[key].array, offset);
        offset += part.attributes[key].array.length;
      }
      geometry.setAttribute(key, new THREE.BufferAttribute(values, 3));
    }
    for (const part of geometries) part.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  }
}

function mergeColoredGeometry(THREE, pieces) {
  const positions = [], normals = [], colors = [];
  for (const { geometry, color } of pieces) {
    const expanded = geometry.index ? geometry.toNonIndexed() : geometry;
    positions.push(...expanded.attributes.position.array);
    normals.push(...expanded.attributes.normal.array);
    const rgb = new THREE.Color(color);
    for (let i = 0; i < expanded.attributes.position.count; i++) colors.push(rgb.r, rgb.g, rgb.b);
    if (expanded !== geometry) expanded.dispose();
    geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return merged;
}
