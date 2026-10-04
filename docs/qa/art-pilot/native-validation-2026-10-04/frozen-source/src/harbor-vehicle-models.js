import { applySurfaceFinish, cloneSurfaceMaterial } from './surface-finish.js';

/**
 * Original metre-scale transport for the harbor sample. +Z is the bow/front;
 * bus/tram y=0 is the road, ferry y=0 is the waterline. These are authored
 * procedural meshes, not scans, licensed vehicle replicas, or finished AAA art.
 * Geometry is shared by kind; every instance owns its lighting/paint materials.
 */
export const HARBOR_VEHICLE_SPECS = Object.freeze({
  bus: Object.freeze({ name: 'Tide double-decker', width: 2.55, length: 11, height: 4.4, minY: 0, maxY: 4.4,
    halfWidth: 1.275, halfLength: 5.5, passengerRadius: .22, clearAisleWidth: .66, routeCode: '12',
    floors: Object.freeze([.44, 2.40]), color: '#356b68', accent: '#d7c28c' }),
  tram: Object.freeze({ name: 'Lantern street tram', width: 2.30, length: 9, height: 4.7, minY: 0, maxY: 4.7,
    halfWidth: 1.15, halfLength: 4.5, passengerRadius: .22, clearAisleWidth: .62, routeCode: '08',
    floors: Object.freeze([.44, 2.40]), color: '#ad684b', accent: '#e6d9b7' }),
  ferry: Object.freeze({ name: 'Estuary harbor ferry', width: 7, length: 26, height: 8, minY: -1, maxY: 7,
    halfWidth: 3.5, halfLength: 13, passengerRadius: .30, clearAisleWidth: 1.35, routeCode: '03',
    floors: Object.freeze([1.3, 3.7]), color: '#405b56', accent: '#e4debf' }),
});

const libraries = new WeakMap();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const inside = (b, x, z, pad = 0) => x >= b.minX - pad && x <= b.maxX + pad && z >= b.minZ - pad && z <= b.maxZ + pad;
const ferryHullHalfWidth = z => { const u = Math.abs(z) / 13; return 3.5 * (1 - .91 * u ** 5) * (1 - .025 * Math.cos(u * Math.PI)); };
const ferryDeckHalfWidth = z => Math.min(3.29, ferryHullHalfWidth(z) - .13);

export function createHarborVehicleLayout(kind) {
  const spec = HARBOR_VEHICLE_SPECS[kind];
  if (!spec) throw new RangeError(`Unknown harbor vehicle: ${kind}`);
  const ferry = kind === 'ferry', tram = kind === 'tram', [lowerY, upperY] = spec.floors;
  const stairs = { id: `${kind}-companionway`, x: ferry ? 1.78 : tram ? -.69 : -.77,
    startZ: ferry ? 5.15 : tram ? -3.1 : 2.65, endZ: ferry ? 1.03 : tram ? .02 : -.53,
    width: ferry ? 1.02 : .74, fromY: lowerY, toY: upperY, treadCount: ferry ? 14 : 12,
    fromFloorId: 'lower', toFloorId: 'upper' };
  stairs.run = Math.abs(stairs.endZ - stairs.startZ); stairs.rise = upperY - lowerY;
  const direction = Math.sign(stairs.endZ - stairs.startZ);
  stairs.bottom = { x: stairs.x, y: lowerY, z: stairs.startZ - direction * .42 };
  stairs.top = { x: stairs.x, y: upperY, z: stairs.endZ + direction * .42 };
  // The entire rising route is open through the upper floor. Cutting only the
  // final treads leaves a very real head strike halfway up the companionway.
  stairs.hole = { minX: stairs.x - stairs.width / 2 - .07, maxX: stairs.x + stairs.width / 2 + .07,
    minZ: Math.min(stairs.startZ, stairs.endZ) - (direction > 0 ? .42 : 0),
    maxZ: Math.max(stairs.startZ, stairs.endZ) + (direction < 0 ? .42 : 0) };
  stairs.waypoints = [stairs.bottom, { x: stairs.x, y: lowerY, z: stairs.startZ },
    { x: stairs.x, y: upperY, z: stairs.endZ }, stairs.top];
  const interiorWidth = spec.width - (ferry ? .42 : .20), interiorLength = spec.length - (ferry ? 3.2 : .5);
  const decks = spec.floors.map((y, index) => ({ id: index ? 'upper' : 'lower', y,
    ceilingY: index ? ferry ? 5.84 : 4.31 : ferry ? 3.44 : upperY - .075,
    minX: -interiorWidth / 2, maxX: interiorWidth / 2,
    minZ: -interiorLength / 2, maxZ: interiorLength / 2,
    holes: index ? [{ ...stairs.hole }] : [], headroom: (index ? ferry ? 5.84 : 4.31 : ferry ? 3.44 : upperY - .075) - y }));
  const doorZs = ferry ? [-7.2, 7.2] : tram ? [-3.45, 2.36] : [3.74, -.96];
  const doors = doorZs.flatMap((z, index) => (ferry ? [-1, 1] : [-1]).map(side => ({
    id: `${kind}-door-${index}-${side < 0 ? 'port' : 'starboard'}`, side, x: side * spec.halfWidth, z,
    width: ferry ? 1.55 : tram || index ? .98 : 1.1, height: 1.84, sillY: lowerY, deckId: 'lower',
    inside: { x: ferry ? side * 2.7 : -.55, y: lowerY, z },
    outside: { x: side * (spec.halfWidth + .38), y: lowerY, z },
  })));
  const blockers = [], seats = [], aislePaths = [];
  const addBlocker = (id, x, y, z, width, height, depth, deckId, kind = 'furniture') => {
    const b = { id, x, y, z, width, height, depth, hx: width / 2, hz: depth / 2,
      minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2,
      minY: y - height / 2, maxY: y + height / 2, deckId, kind };
    blockers.push(b); return b;
  };
  for (const deck of decks) {
    const firstZ = ferry ? -8.9 : tram ? -2.75 : -4.58;
    const lastZ = ferry ? 8.9 : tram ? 2.7 : 2.75;
    const spacing = ferry ? 1.22 : .79, seatWidth = ferry ? 1.3 : tram ? .57 : .63;
    const seatX = ferry ? 2.05 : tram ? .78 : .84;
    for (let z = firstZ, row = 0; z <= lastZ; z += spacing, row++) for (const side of [-1, 1]) {
      const x = side * seatX;
      const bounds = { minX: x - seatWidth / 2 - .05, maxX: x + seatWidth / 2 + .05,
        minZ: z - .36, maxZ: z + .36 };
      const overlapsStair = bounds.minX < stairs.hole.maxX && bounds.maxX > stairs.hole.minX
        && bounds.minZ < stairs.hole.maxZ + .75 && bounds.maxZ > stairs.hole.minZ - .75;
      const atDoor = deck.id === 'lower' && doors.some(d => d.side === side && Math.abs(d.z - z) < d.width / 2 + .53);
      if (overlapsStair || atDoor || (!ferry && deck.id === 'lower' && z > (tram ? 2.1 : 3.2))) continue;
      const id = `${kind}-${deck.id}-seat-${row}-${side}`;
      seats.push({ id, deckId: deck.id, x, z, floorY: deck.y, width: seatWidth, depth: .60, facing: 1 });
      addBlocker(id, x, deck.y + .56, z - .06, seatWidth, 1.1, .65, deck.id, 'seat');
    }
    aislePaths.push({ id: `${deck.id}-aisle`, deckId: deck.id, width: spec.clearAisleWidth,
      waypoints: [{ x: 0, y: deck.y, z: ferry ? -9.4 : tram ? -3.4 : -4.83 },
        { x: 0, y: deck.y, z: ferry ? 7.0 : tram ? 2.9 : 3.8 }] });
  }
  // Driver furniture is solid and outside the boarding/central aisle route.
  const driver = ferry ? { x: 0, z: 9.1, floorY: upperY, deckId: 'upper', width: 2.35, depth: 2.0 }
    : { x: .63, z: tram ? 3.76 : 4.83, floorY: lowerY, deckId: 'lower', width: .82, depth: 1.05 };
  addBlocker(`${kind}-driver-console`, driver.x, driver.floorY + .78, driver.z + .28, driver.width, .84, .52, driver.deckId, 'driver');
  addBlocker(`${kind}-driver-chair`, driver.x, driver.floorY + .58, driver.z - .30, .56, 1.15, .55, driver.deckId, 'driver');
  for (const deck of decks) {
    // Side collision is segmented around portals and does not seal the doors.
    for (const side of [-1, 1]) {
      const holes = deck.id === 'lower' ? doors.filter(d => d.side === side).map(d => [d.z - d.width / 2, d.z + d.width / 2]).sort((a, b) => a[0] - b[0]) : [];
      let start = deck.minZ;
      for (const [a, b] of [...holes, [deck.maxZ, deck.maxZ]]) {
        if (a > start && ferry) {
          const count = Math.ceil((a - start) / .5);
          for (let i = 0; i < count; i++) {
            const za = start + i / count * (a - start), zb = start + (i + 1) / count * (a - start);
            const edge = Math.min(ferryDeckHalfWidth(za), ferryDeckHalfWidth(zb));
            addBlocker(`${kind}-${deck.id}-rail-${side}-${za.toFixed(2)}`, side * edge,
              deck.y + .52, (za + zb) / 2, .07, 1.04, zb - za, deck.id, 'rail');
          }
        } else if (a > start) addBlocker(`${kind}-${deck.id}-side-${side}-${start.toFixed(2)}`, side * (spec.halfWidth - .045),
          deck.y + .95, (start + a) / 2, .09, 1.9, a - start, deck.id, 'shell');
        start = Math.max(start, b);
      }
    }
    for (const side of [-1, 1]) addBlocker(`${kind}-${deck.id}-end-${side}`, 0, deck.y + (ferry ? .52 : .94),
      side * (deck.maxZ + (ferry ? 0 : .12)), ferry ? ferryDeckHalfWidth(deck.maxZ) * 2 : interiorWidth,
      ferry ? 1.04 : 1.88, .12, deck.id, ferry ? 'rail' : 'shell');
  }
  const walkSurfaces = decks.flatMap(deck => {
    const strips = ferry ? Array.from({ length: 48 }, (_, i) => {
      const a = deck.minZ + i / 48 * (deck.maxZ - deck.minZ), b = deck.minZ + (i + 1) / 48 * (deck.maxZ - deck.minZ);
      const width = Math.min(ferryDeckHalfWidth(a), ferryDeckHalfWidth(b));
      return { ...deck, minX: -width, maxX: width, minZ: a, maxZ: b };
    }) : [deck];
    return strips.flatMap(strip => splitFloor(strip)).map((b, index) => ({ ...b, id: `${deck.id}-floor-${index}`, deckId: deck.id, y: deck.y, kind: 'deck' }));
  });
  if (ferry) for (const door of doors) walkSurfaces.push({ id: `${door.id}-threshold`, deckId: 'lower', y: lowerY, kind: 'threshold',
    minX: door.side < 0 ? -spec.halfWidth : 2.7, maxX: door.side < 0 ? -2.7 : spec.halfWidth,
    minZ: door.z - door.width / 2, maxZ: door.z + door.width / 2 });
  const doorApproaches = doors.map(door => ({ id: door.id, deckId: 'lower', width: door.width,
    waypoints: [door.outside, door.inside, { x: 0, y: lowerY, z: door.z }] }));
  return { kind, coordinateSpace: 'vehicle-local-metres', passengerRadius: spec.passengerRadius, passengerHeight: 1.8,
    decks, deckLevels: spec.floors.slice(), doors, portals: doors, stairs: [stairs], walkSurfaces,
    blockers, colliders: blockers, seats, aislePaths, doorApproaches, driver,
    boarding: { deckId: 'lower', position: { x: 0, y: lowerY, z: doors[0].z } } };
}

/** Continuous stair support only inside the open companionway; no solid ramp. */
export function harborVehicleSupportHeight(layout, x, z, deckId = 'lower') {
  const stair = layout.stairs.find(s => Math.abs(x - s.x) <= s.width / 2 + 1e-8
    && z >= Math.min(s.startZ, s.endZ) - 1e-8 && z <= Math.max(s.startZ, s.endZ) + 1e-8);
  if (stair) return stair.fromY + clamp((z - stair.startZ) / (stair.endZ - stair.startZ), 0, 1) * stair.rise;
  const deck = layout.decks.find(d => d.id === deckId);
  return deck && layout.walkSurfaces.some(surface => surface.deckId === deckId && inside(surface, x, z)) ? deck.y : null;
}

export function createHarborVehicle(THREE, kind, options = {}) {
  const spec = HARBOR_VEHICLE_SPECS[kind];
  if (!spec) throw new RangeError(`Unknown harbor vehicle: ${kind}`);
  if (!libraries.has(THREE)) libraries.set(THREE, new Map());
  const library = libraries.get(THREE);
  if (!library.has(kind)) library.set(kind, [0, 1, 2].map(tier => buildVehicle(THREE, kind, tier)));
  const templates = library.get(kind), group = new THREE.Group(), lod = new THREE.LOD();
  group.name = spec.name; lod.name = `${kind}-controlled-lod`; lod.autoUpdate = false; group.add(lod);
  const materials = new Map();
  for (const [tier, distance] of (kind === 'ferry' ? [0, 85, 220] : [0, 42, 120]).entries()) {
    const model = templates[tier].clone(true); model.visible = tier === 0;
    model.traverse(node => { if (node.isMesh) {
      if (!materials.has(node.material)) materials.set(node.material, cloneSurfaceMaterial(node.material));
      node.material = materials.get(node.material);
      if (node.material.name === 'harbor-paint' && options.color !== undefined) node.material.color.set(options.color);
    } });
    lod.addLevel(model, distance, .12);
  }
  const layout = createHarborVehicleLayout(kind), doorsByTier = lod.levels.map(level => layout.doors.map(door => level.object.getObjectByName(door.id)).filter(Boolean));
  const cabinLights = layout.decks.map(deck => {
    const light = new THREE.PointLight('#ffe5b3', 0, kind === 'ferry' ? 13 : 7.5, 2);
    light.name = `${kind}-${deck.id}-cabin-light`;
    light.position.set(0, deck.y + 1.43, 0);
    light.castShadow = false; lod.levels[0].object.add(light); return light;
  });
  const windows = [...materials.values()].filter(material => material.name === 'harbor-glass');
  const lights = [...materials.values()].filter(material => material.name === 'harbor-cabin-light');
  const stats = templates.map(measureModel), palette = [...materials.values()];
  let disposed = false, doorOpen = options.doorsOpen ? 1 : 0, lighting = -1, lightRangeAllowed = true, cabinLightingAllowed = true;
  const syncLights = () => { for (const light of cabinLights) light.visible = !disposed && lighting > 0 && lightRangeAllowed && cabinLightingAllowed; };
  const setDoors = openness => {
    doorOpen = clamp(openness, 0, 1);
    for (const nodes of doorsByTier) for (const door of nodes) {
      // Sliding leaves retract along the skin; nobody walks through a rotated
      // slab that is still visually across the opening at a stop.
      for (const leaf of door.children) leaf.position.z = leaf.userData.closedZ + leaf.userData.slide * doorOpen;
    }
    group.userData.doorOpenness = doorOpen;
  };
  const setNight = amount => {
    const night = clamp(amount, 0, 1); if (night === lighting) return; lighting = night;
    for (const material of lights) material.emissiveIntensity = .08 + night * 1.2;
    for (const material of windows) material.emissiveIntensity = night * .06;
    for (const light of cabinLights) light.intensity = night * (kind === 'ferry' ? 15 : 5);
    syncLights();
    group.userData.night = night;
  };
  Object.assign(group.userData, { kind, dimensions: spec, layout, collision: { envelope: spec, blockers: layout.blockers, walkSurfaces: layout.walkSurfaces },
    doors: layout.doors, deckLevels: layout.deckLevels, stairs: layout.stairs, lod, materials: palette, cabinLights,
    wheels: lod.levels[0].object.children.filter(node => node.name.startsWith('wheel-')),
    manifest: { id: `nh-harbor-${kind}-v1`, version: 1, units: 'metres', axis: '+Z forward',
      provenance: { authoring: 'Original hand-authored procedural meshes in harbor-vehicle-models.js', externalAssets: [], license: 'Repository MIT', realBrands: false },
      productionStatus: 'Procedural harbor sample; professional art and hardware performance review remain open',
      lodCount: 3, tiers: stats, textureBytes: 0, materialSlots: palette.length, nearCabinLights: cabinLights.length,
      collision: 'Local deck surfaces, stair cutout, furniture and open door portals',
      budget: { nearTriangles: 90000, nearDrawCalls: 48, middleTriangles: 24000, farTriangles: 8000 } },
    setDoorOpenness: setDoors, setDoorsOpen: open => setDoors(open ? 1 : 0), setNight,
    setCabinLightingEnabled: enabled => { cabinLightingAllowed = Boolean(enabled); syncLights(); },
    setDetail: tier => { const selected = clamp(Math.round(tier), 0, 2); lod.levels.forEach((level, i) => { level.object.visible = i === selected; });
      lightRangeAllowed = selected === 0; syncLights(); },
    updateLOD: camera => { group.updateWorldMatrix(true, false); lod.updateWorldMatrix(false, false); lod.update(camera);
      const distance = group.getWorldPosition(new THREE.Vector3()).distanceTo(camera.getWorldPosition(new THREE.Vector3()));
      lightRangeAllowed = lod.getCurrentLevel() === 0 && distance <= (kind === 'ferry' ? 26 : 18); syncLights(); },
    update: (deltaOrState = 0, state = {}) => {
      const input = typeof deltaOrState === 'object' ? deltaOrState : state;
      if (input.night !== undefined) setNight(input.night);
      else if (input.timeOfDay !== undefined) setNight(input.timeOfDay < 6 || input.timeOfDay >= 18 ? 1 : 0);
      if (input.doorOpenness !== undefined) setDoors(input.doorOpenness);
      else if (input.doorsOpen !== undefined) setDoors(input.doorsOpen ? 1 : 0);
      if (input.camera) group.userData.updateLOD(input.camera);
      const distance = Number.isFinite(input.distanceTravelled) ? input.distanceTravelled : 0;
      for (const level of lod.levels) for (const wheel of level.object.children.filter(node => node.name.startsWith('wheel-'))) wheel.rotation.x = distance / .43;
    },
    disposeInstance: () => { if (disposed) return; disposed = true; syncLights(); palette.forEach(material => material.dispose()); group.userData.disposed = true; },
  });
  setDoors(doorOpen); setNight(options.night || 0); return group;
}

function splitFloor(deck) {
  if (!deck.holes.length) return [{ minX: deck.minX, maxX: deck.maxX, minZ: deck.minZ, maxZ: deck.maxZ }];
  const original = deck.holes[0];
  if (original.maxX <= deck.minX || original.minX >= deck.maxX || original.maxZ <= deck.minZ || original.minZ >= deck.maxZ)
    return [{ minX: deck.minX, maxX: deck.maxX, minZ: deck.minZ, maxZ: deck.maxZ }];
  const h = { minX: Math.max(deck.minX, original.minX), maxX: Math.min(deck.maxX, original.maxX),
    minZ: Math.max(deck.minZ, original.minZ), maxZ: Math.min(deck.maxZ, original.maxZ) };
  return [
    { minX: deck.minX, maxX: h.minX, minZ: deck.minZ, maxZ: deck.maxZ },
    { minX: h.maxX, maxX: deck.maxX, minZ: deck.minZ, maxZ: deck.maxZ },
    { minX: h.minX, maxX: h.maxX, minZ: deck.minZ, maxZ: h.minZ },
    { minX: h.minX, maxX: h.maxX, minZ: h.maxZ, maxZ: deck.maxZ },
  ].filter(b => b.maxX - b.minX > .01 && b.maxZ - b.minZ > .01);
}

function buildVehicle(THREE, kind, tier) {
  const spec = HARBOR_VEHICLE_SPECS[kind], layout = createHarborVehicleLayout(kind), root = new THREE.Group();
  root.name = `${kind}-detail-${tier}`;
  const mats = makePalette(THREE, spec, tier), parts = new Map(), n = tier ? 1 : 3;
  const add = (geometry, material, x = 0, y = 0, z = 0, rotation = null, parent = null, name = '') => {
    if (parent) {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z);
      if (rotation) mesh.rotation.set(...rotation); mesh.name = name; mesh.castShadow = !material.transparent;
      mesh.receiveShadow = true; parent.add(mesh); return mesh;
    }
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rotation || [0, 0, 0]))), new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(transform);
    if (!parts.has(material)) parts.set(material, []); parts.get(material).push(geometry); return null;
  };
  const box = (material, x, y, z, w, h, d, radius = .025, rotation = null, parent = null, name = '') =>
    add(roundedBox(THREE, w, h, d, radius, n), material, x, y, z, rotation, parent, name);
  const bar = (material, a, b, radius = .017, parent = null) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), delta = to.clone().sub(from);
    const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), tier ? 6 : 10);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    const mid = from.add(to).multiplyScalar(.5); return add(geometry, material, mid.x, mid.y, mid.z, null, parent);
  };
  const ring = (material, x, y, z, radius, thickness, rotation = [0, 0, 0], parent = null) =>
    add(new THREE.TorusGeometry(radius, thickness, tier ? 4 : 7, tier ? 10 : 20), material, x, y, z, rotation, parent);
  const tools = { add, box, bar, ring, spec, layout, root, mats, tier, THREE };
  if (kind === 'ferry') buildFerry(tools); else buildCoach(tools, kind);
  // Near and middle keep real interiors. Far removes inside fittings while
  // preserving two-deck silhouettes, door animation and collision metadata.
  if (tier < 2) {
    for (const surface of layout.walkSurfaces) box(mats.floor, (surface.minX + surface.maxX) / 2, surface.y - .0375,
      (surface.minZ + surface.maxZ) / 2, surface.maxX - surface.minX, .075, surface.maxZ - surface.minZ, .01);
    for (const seat of layout.seats) {
      const { x, floorY: y, z, width: w } = seat;
      box(mats.upholstery, x, y + .44, z, w, .11, .55, .06);
      box(mats.upholstery, x, y + .78, z - .25, w, .63, .105, .045, [-.075, 0, 0]);
      if (!tier) {
        for (const dx of [-w * .36, w * .36]) bar(mats.metal, [x + dx, y + .12, z - .18], [x + dx, y + .44, z - .18], .022);
        bar(mats.metal, [x - w * .42, y + 1.01, z - .27], [x + w * .42, y + 1.01, z - .27], .018);
        box(mats.trim, x, y + .17, z, w * .67, .065, .36, .015);
      }
    }
    addStairs(tools);
    addDriver(tools);
    for (const deck of layout.decks) {
      const roofY = kind === 'ferry' ? deck.ceilingY - .045 : deck.id === 'lower' ? spec.floors[1] - .13 : 4.26;
      // Narrow luminous strips have an actual fixture, not a window-wide glow.
      for (const x of [-spec.width * .25, spec.width * .25]) {
        const halfRun = spec.length * .30, hole = layout.stairs[0].hole;
        const interrupted = deck.id === 'lower' && x + .06 > hole.minX && x - .06 < hole.maxX;
        const ranges = interrupted ? [[-halfRun, Math.max(-halfRun, hole.minZ)], [Math.min(halfRun, hole.maxZ), halfRun]] : [[-halfRun, halfRun]];
        for (const [a, b] of ranges) if (b - a > .1) {
          box(mats.trim, x, roofY, (a + b) / 2, .10, .035, b - a, .01);
          box(mats.cabin, x, roofY - .02, (a + b) / 2, .062, .014, b - a - .03, .005);
        }
      }
      if (!tier) for (const z of kind === 'ferry' ? [-8, -5, -2, 1, 4, 7] : [-3.5, -1.7, .1, 1.9]) {
        const x = kind === 'ferry' ? -.78 : .31;
        bar(mats.metal, [x, deck.y + .055, z], [x, roofY - .12, z], .019);
        if (kind !== 'ferry') ring(mats.metal, x, roofY - .38, z, .075, .012, [0, Math.PI / 2, 0]);
      }
    }
  }
  addDoors(tools);
  batchMovableParts(THREE, root);
  for (const [material, geometries] of parts) {
    const mesh = new THREE.Mesh(mergeGeometry(THREE, geometries), material);
    mesh.name = `${kind}-${material.name}`; mesh.castShadow = !material.transparent; mesh.receiveShadow = true; root.add(mesh);
  }
  return root;
}

function makePalette(THREE, spec, tier) {
  const standard = (name, parameters, finish) => {
    const material = new THREE.MeshStandardMaterial(parameters); material.name = `harbor-${name}`;
    return finish && tier < 2 ? applySurfaceFinish(material, finish) : material;
  };
  const paint = new THREE.MeshPhysicalMaterial({ color: spec.color, roughness: .39, metalness: .34, clearcoat: .38, clearcoatRoughness: .3 });
  paint.name = 'harbor-paint'; paint.side = THREE.DoubleSide; if (tier < 2) applySurfaceFinish(paint, 'automotive');
  const glass = new THREE.MeshPhysicalMaterial({ color: '#9ab9b8', roughness: .085, metalness: .02,
    transparent: tier < 2, opacity: tier < 2 ? .31 : 1, depthWrite: tier === 2, side: THREE.DoubleSide,
    thickness: .025, ior: 1.47, clearcoat: .65, emissive: '#baaa7a', emissiveIntensity: 0 });
  glass.name = 'harbor-glass';
  const cabin = standard('cabin-light', { color: '#fff0c9', emissive: '#ffe7b5', emissiveIntensity: .08, roughness: .3 });
  return { paint, glass, cabin,
    ivory: standard('ivory', { color: spec.accent, roughness: .67, metalness: .07, side: THREE.DoubleSide }, 'automotive'),
    trim: standard('rubber', { color: '#18282a', roughness: .91 }, 'rubber'),
    metal: standard('metal', { color: '#93a5a2', roughness: .34, metalness: .86 }, 'metal'),
    floor: standard('floor', { color: spec.name.includes('ferry') ? '#7a6952' : '#6c736b', roughness: .89 }, 'rubber'),
    upholstery: standard('upholstery', { color: spec.name.includes('tram') ? '#67472f' : '#657777', roughness: .91, metalness: 0 }, 'cloth'),
    red: standard('red-lamp', { color: '#8d4039', emissive: '#be2f26', emissiveIntensity: .55, roughness: .27 }),
    white: standard('white-lamp', { color: '#d5e0d5', emissive: '#d9e6c6', emissiveIntensity: .55, roughness: .25 }),
    green: standard('green-lamp', { color: '#365e49', emissive: '#287c45', emissiveIntensity: .5, roughness: .27 }),
    sign: standard('route-sign', { color: '#d4b66f', emissive: '#ebc67e', emissiveIntensity: .7, roughness: .65 }),
  };
}

function buildCoach(t, kind) {
  const { THREE, box, bar, add, spec: s, layout, mats: m, tier, root } = t;
  const tram = kind === 'tram', w = s.width, length = s.length;
  // Axles must clear the whole doorway, including a passenger capsule near
  // either jamb. The short-wheelbase tram keeps its two axles near the centre.
  const wheelZs = tram ? [-1.30, 1.30] : [-3.44, 2.65];
  // Continuous curved roof and gently wrapped front/rear fascias. Sidewall
  // sections stop around doors, and windows are recessed between real pillars.
  add(gridGeometry(THREE, tier ? 8 : 28, tier ? 10 : 28, (u, v) => {
    const z = (u - .5) * (length - .18), x = Math.cos(v * Math.PI) * (w / 2 - .025);
    return [x, (tram ? 4.20 : 4.13) + Math.sin(v * Math.PI) * (tram ? .20 : .18), z];
  }), m.ivory);
  box(m.trim, 0, .27, 0, w - .30, .19, length - .30, .07);
  for (const deck of layout.decks) {
    const y = deck.y;
    for (const side of [-1, 1]) {
      const sideDoors = deck.id === 'lower' ? layout.doors.filter(d => d.side === side) : [];
      let start = -length / 2 + .18;
      for (const [a, b] of [...sideDoors.map(d => [d.z - d.width / 2, d.z + d.width / 2]).sort((a, b) => a[0] - b[0]), [length / 2 - .18, length / 2 - .18]]) {
        if (a > start) {
          if (deck.id === 'lower' && !tram && tier < 2) {
            const bottomAt = z => {
              let bottom = y;
              for (const wheelZ of wheelZs) {
                const dz = Math.abs(z - wheelZ), radius = .475;
                if (dz < radius) bottom = Math.max(bottom, .43 + Math.sqrt(radius ** 2 - dz ** 2));
              }
              return bottom;
            };
            for (const offset of [.004, .082]) add(gridGeometry(THREE, Math.max(6, Math.ceil((a - start) * (tier ? 10 : 30))), 3, (u, v) => {
              const z = start + u * (a - start), bottom = bottomAt(z);
              return [side * (w / 2 - offset), bottom + v * (y + .56 - bottom), z];
            }), m.paint);
            add(gridGeometry(THREE, Math.max(6, Math.ceil((a - start) * (tier ? 10 : 30))), 2, (u, v) => {
              const z = start + u * (a - start); return [side * (w / 2 - .004 - v * .078), bottomAt(z), z];
            }), m.paint);
          } else box(deck.id === 'lower' ? m.paint : m.ivory, side * (w / 2 - .043), y + .28, (start + a) / 2, .084, .56, a - start, .035);
          box(m.paint, side * (w / 2 - .044), y + 1.76, (start + a) / 2, .088, .22, a - start, .026);
          if (deck.id === 'upper' || tram || tier === 2) box(m.ivory, side * (w / 2 - .007), y + .095, (start + a) / 2, .013, .09, a - start, .004);
          box(m.paint, side * (w / 2 - .046), y + .57, (start + a) / 2, .086, .10, a - start, .022);
          const count = Math.max(1, Math.ceil((a - start) / (tram ? 1.10 : 1.30)));
          for (let i = 0; i < count; i++) {
            const za = start + i * (a - start) / count, zb = start + (i + 1) * (a - start) / count;
            windowPane(t, side * (w / 2 - .052), y + 1.08, (za + zb) / 2, .025, 1.03, zb - za - .075, 'side');
            box(m.paint, side * (w / 2 - .04), y + 1.11, za + .021, .078, 1.2, .046, .015);
          }
        }
        start = Math.max(start, b);
      }
    }
    for (const end of [-1, 1]) {
      const z = end * (length / 2 - .085);
      box(deck.id === 'lower' ? m.paint : m.ivory, 0, y + .29, z, w - .06, .58, .16, .07);
      box(m.glass, 0, y + 1.085, z + end * .007, w - .32, 1.0, .035, .10,
        [end * (tram ? .012 : -.055), 0, 0]);
      box(m.trim, 0, y + .572, z + end * .026, w - .25, .032, .045, .011);
      box(m.trim, 0, y + 1.598, z + end * .026, w - .25, .035, .045, .011);
      for (const side of [-1, 1]) box(m.paint, side * (w / 2 - .10), y + 1.09, z, .18, 1.19, .17, .048);
      box(m.paint, 0, y + 1.77, z, w - .05, .24, .16, .06);
      if (!tier) {
        bar(m.trim, [-.28, y + .65, z + end * .061], [-.76, y + 1.02, z + end * .064], .013);
        bar(m.trim, [.46, y + .65, z + end * .061], [.02, y + 1.02, z + end * .064], .013);
      }
    }
  }
  for (const z of [length / 2 - .075, -length / 2 + .075]) {
    box(m.trim, 0, .45, z, w - .16, .13, .13, .04);
    box(m.ivory, 0, 2.20, z, w - .12, .11, .11, .03);
    routeSign(t, 0, 1.85, Math.sign(z) * (length / 2 - .03), .90, .23, Math.sign(z));
    for (const side of [-1, 1]) {
      box(m.trim, side * (w * .36), .88, z, .28, .20, .13, .055);
      box(z > 0 ? m.white : m.red, side * (w * .36), .89, z + Math.sign(z) * .036, .17, .08, .04, .029);
    }
  }
  // Wheel hubs have a real axle orientation (+/-X), cylindrical sidewalls and
  // separate metal rims. They sit fully inside the declared envelope.
  for (const z of wheelZs) for (const side of [-1, 1]) {
    const wheel = new THREE.Group(); wheel.name = `wheel-${z > 0 ? 'front' : 'rear'}-${side}`;
    wheel.position.set(side * (w / 2 - .18), .43, z); root.add(wheel);
    const tyre = new THREE.CylinderGeometry(.43, .43, .27, tier ? 12 : 28); tyre.rotateZ(Math.PI / 2);
    add(tyre, m.trim, 0, 0, 0, null, wheel);
    const rim = new THREE.CylinderGeometry(.25, .25, .275, tier ? 10 : 24); rim.rotateZ(Math.PI / 2);
    add(rim, m.metal, 0, 0, 0, null, wheel);
    if (!tier) for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      box(m.trim, side * .14, Math.cos(a) * .18, Math.sin(a) * .18, .009, .055, .035, .01, [a, 0, 0], wheel);
    }
  }
  if (tram) {
    // Original compact diamond collector; no overseas transit logo or name.
    const base = 4.38, top = 4.67;
    for (const x of [-.45, .45]) {
      bar(m.metal, [x, base, -.4], [x * .4, top, 0], .017);
      bar(m.metal, [x * .4, top, 0], [x, base, .4], .017);
    }
    bar(m.metal, [-.6, top - .02, 0], [.6, top - .02, 0], .025);
    if (!tier) for (const side of [-1, 1]) {
      box(m.trim, side * (w / 2 - .06), .95, -length / 2 + .33, .026, .13, .14, .014);
      bar(m.metal, [side * .84, .49, 3.98], [side * .84, 1.4, 3.98], .021);
    }
  } else if (!tier) {
    for (const side of [-1, 1]) {
      // Flush recessed mirrors keep the collision/art width in agreement.
      box(m.trim, side * (w / 2 - .047), 1.89, 4.67, .08, .23, .33, .06);
      box(m.glass, side * (w / 2 - .002), 1.89, 4.66, .004, .18, .27, .025);
    }
    box(m.trim, 0, 4.36, -2.6, .90, .08, 1.20, .040);
    for (let i = 0; i < 8; i++) box(m.metal, 0, 4.398, -3.05 + i * .13, .72, .004, .035, .002);
  }
}

function windowPane(t, x, y, z, w, h, d, orientation = 'front') {
  const { box, mats: m, tier } = t;
  const side = orientation === 'side';
  // Four frame bars rather than a solid opaque plate behind the glazing.
  if (side) {
    for (const edge of [-1, 1]) {
      box(m.trim, x, y + edge * (h / 2 + .01), z, .052, .032, d + .06, .01);
      box(m.trim, x, y, z + edge * (d / 2 + .012), .052, h + .06, .030, .01);
    }
  } else {
    for (const edge of [-1, 1]) {
      box(m.trim, x, y + edge * (h / 2 + .01), z, w + .06, .032, .052, .01);
      box(m.trim, x + edge * (w / 2 + .01), y, z, .032, h + .06, .052, .01);
    }
  }
  // Side frames use a very narrow perimeter; pane thickness is 25 mm.
  if (side) {
    box(m.glass, x - Math.sign(x) * .004, y, z, .025, h, d, .012);
    if (!tier) {
      box(m.metal, x, y + h * .29, z, .032, .018, d, .006);
      box(m.trim, x, y + h * .30, z, .036, .022, d, .006);
    }
  } else box(m.glass, x, y, z, w, h, .025, .025);
}

function addStairs(t) {
  const { box, bar, layout, mats: m, tier } = t;
  const s = layout.stairs[0], direction = Math.sign(s.endZ - s.startZ), tread = s.run / s.treadCount;
  for (let i = 0; i < s.treadCount; i++) {
    const z = s.startZ + direction * tread * (i + .5), y = s.fromY + s.rise * (i + 1) / s.treadCount;
    box(m.floor, s.x, y - .025, z, s.width, .05, tread + .005, .008);
    box(m.ivory, s.x, y - .019, z - direction * (tread / 2 - .013), s.width - .03, .025, .024, .005);
    if (!tier) box(m.paint, s.x, y - .025 - s.rise / s.treadCount / 2, z - direction * tread / 2,
      s.width, s.rise / s.treadCount, .021, .004);
  }
  for (const side of [-1, 1]) {
    const x = s.x + side * (s.width / 2 - .025);
    // Slender visible stringers and rails; the space below and above remains
    // empty. Rails stop before the landing, leaving a clear turning route.
    bar(m.metal, [x, s.fromY + .83, s.startZ], [x, s.toY + .83, s.endZ], .021);
    bar(m.paint, [x, s.fromY - .02, s.startZ], [x, s.toY - .02, s.endZ], .035);
    for (let i = 0; i <= (tier ? 3 : 6); i++) {
      const u = i / (tier ? 3 : 6), z = s.startZ + (s.endZ - s.startZ) * u, y = s.fromY + s.rise * u;
      bar(m.metal, [x, y + .02, z], [x, y + .83, z], .014);
    }
  }
}

function addDriver(t) {
  const { box, bar, ring, layout, mats: m, spec } = t;
  const d = layout.driver, y = d.floorY;
  box(m.trim, d.x, y + .85, d.z + .27, d.width, .52, .54, .055);
  box(m.metal, d.x, y + 1.035, d.z + .12, d.width * .72, .09, .36, .025, [-.21, 0, 0]);
  box(m.upholstery, d.x, y + .46, d.z - .30, .52, .12, .49, .07);
  box(m.upholstery, d.x, y + .78, d.z - .55, .54, .64, .095, .045);
  bar(m.metal, [d.x, y + .53, d.z + .17], [d.x, y + .94, d.z - .05], .032);
  ring(m.trim, d.x, y + 1.0, d.z - .075, spec.length > 20 ? .22 : .17, .016, [-.45, 0, 0]);
  for (const angle of [0, Math.PI * .66, Math.PI * 1.33]) bar(m.metal,
    [d.x, y + 1.0, d.z - .075], [d.x + Math.sin(angle) * .14, y + 1.0 + Math.cos(angle) * .12, d.z - .075], .009);
  for (let i = 0; i < 3; i++) box(m.cabin, d.x - .18 + i * .18, y + 1.09, d.z + .06, .10, .018, .08, .01);
  if (spec.length < 20) {
    box(m.glass, d.x - d.width / 2 - .022, y + 1.00, d.z, .025, 1.65, 1.01, .035);
    bar(m.metal, [d.x - d.width / 2 - .02, y + .06, d.z - .53], [d.x - d.width / 2 - .02, y + 1.8, d.z - .53], .017);
  }
}

function addDoors(t) {
  const { THREE, root, layout, box, mats: m } = t;
  for (const door of layout.doors) {
    const pivot = new THREE.Group(); pivot.name = door.id; pivot.position.set(door.x - door.side * .045, door.sillY, door.z); root.add(pivot);
    for (const sign of [-1, 1]) {
      const leaf = new THREE.Group(); leaf.name = `${door.id}-leaf-${sign}`;
      leaf.position.z = sign * door.width / 4; leaf.userData.closedZ = leaf.position.z;
      leaf.userData.slide = sign * door.width / 2; pivot.add(leaf);
      const h = door.height, width = door.width / 2 - .022;
      box(m.paint, 0, .22, 0, .066, .44, width, .022, null, leaf);
      box(m.glass, 0, .98, 0, .025, 1.07, width - .064, .012, null, leaf);
      for (const z of [-width / 2, width / 2]) box(m.trim, 0, h / 2, z, .072, h, .026, .011, null, leaf);
      box(m.paint, 0, h - .07, 0, .072, .14, width, .025, null, leaf);
      box(m.metal, -door.side * .044, .99, sign * .05, .018, .30, .025, .008, null, leaf);
    }
    box(m.ivory, door.x - door.side * .042, door.sillY + door.height + .065, door.z, .075, .13, door.width + .15, .025);
    box(m.metal, door.x - door.side * .060, door.sillY - .032, door.z, .09, .045, door.width + .04, .012);
  }
}

function buildFerry(t) {
  const { THREE, add, box, bar, ring, mats: m, tier, layout, spec: s } = t;
  // Flared double-ended hull, with continuous bilge curvature and sharp but
  // rounded stems. The open top is closed by the lower walking deck, not a box.
  const profile = ferryHullHalfWidth;
  add(gridGeometry(THREE, tier === 2 ? 14 : tier ? 36 : 84, tier === 2 ? 10 : tier ? 20 : 40, (u, v) => {
    const z = (u - .5) * 26, angle = v * Math.PI;
    return [Math.cos(angle) * profile(z), 1.25 - Math.sin(angle) ** .75 * 2.25, z];
  }), m.paint);
  for (const end of [-1, 1]) add(gridGeometry(THREE, 4, tier ? 10 : 24, (u, v) => {
    const theta = v * Math.PI;
    return [Math.cos(theta) * profile(13) * u, 1.25 - Math.sin(theta) ** .75 * 2.25 * u, end * 13];
  }), m.paint);
  // Dark rubbing strakes are continuous around the hull and read at distance.
  for (const side of [-1, 1]) {
    const points = [];
    for (let i = 0; i <= (tier ? 16 : 48); i++) { const z = -12.8 + i / (tier ? 16 : 48) * 25.6; points.push([side * profile(z), .95, z]); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), tier ? 24 : 90, .047, tier ? 5 : 8), m.trim);
  }
  for (const deck of layout.decks) {
    const y = deck.y, halfLength = 9.0, halfWidth = deck.id === 'lower' ? 2.83 : 2.75;
    // Saloon structure alternates thin glazed openings with rounded timber/
    // paint pillars, leaving a recognizable promenade outside each saloon.
    for (const side of [-1, 1]) {
      const sideDoors = deck.id === 'lower' ? layout.doors.filter(d => d.side === side) : [];
      let start = -halfLength;
      for (const [a, b] of [...sideDoors.map(d => [d.z - d.width / 2, d.z + d.width / 2]).sort((a, b) => a[0] - b[0]), [halfLength, halfLength]]) {
        if (a > start) {
          box(m.ivory, side * halfWidth, y + .25, (start + a) / 2, .08, .50, a - start, .03);
          box(m.ivory, side * halfWidth, y + 2.12, (start + a) / 2, .10, .22, a - start, .04);
          const count = Math.ceil((a - start) / 1.8);
          for (let i = 0; i < count; i++) {
            const za = start + i / count * (a - start), zb = start + (i + 1) / count * (a - start);
            box(m.glass, side * halfWidth, y + 1.28, (za + zb) / 2, .025, 1.5, zb - za - .11, .015);
            box(m.ivory, side * halfWidth, y + 1.33, za + .025, .12, 1.8, .065, .025);
          }
        }
        start = Math.max(start, b);
      }
      for (const z of [-10.35, -8.7, -5.6, -2.5, .6, 3.7, 6.8, 9.9]) {
        if (deck.id === 'lower' && sideDoors.some(d => Math.abs(d.z - z) < 1)) continue;
        const x = side * ferryDeckHalfWidth(z);
        bar(m.metal, [x, y + .05, z], [x, y + .99, z], .025);
      }
      // The rail follows the narrowing bow; saloon windows remain see-through.
      let railStart = -11.4;
      for (const [railEnd, nextStart] of [...sideDoors.map(d => [d.z - d.width / 2, d.z + d.width / 2]).sort((a, b) => a[0] - b[0]), [11.4, 11.4]]) {
        if (railEnd > railStart) {
          const railPoints = [];
          for (let i = 0; i <= (tier ? 5 : 14); i++) { const z = railStart + i / (tier ? 5 : 14) * (railEnd - railStart); railPoints.push([side * ferryDeckHalfWidth(z), y + .99, z]); }
          add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPoints.map(p => new THREE.Vector3(...p))), tier ? 8 : 22, .025, tier ? 5 : 8), m.metal);
        }
        railStart = nextStart;
      }
    }
    for (const end of [-1, 1]) {
      const z = end * 11.4, width = ferryDeckHalfWidth(z);
      bar(m.metal, [-width, y + .99, z], [width, y + .99, z], .025);
      for (const side of [-1, 1]) bar(m.metal, [side * width, y + .04, z], [side * width, y + .99, z], .025);
    }
    const roofBounds = { minX: -halfWidth - .16, maxX: halfWidth + .16,
      minZ: -halfLength - .175, maxZ: halfLength + .175,
      holes: deck.id === 'lower' ? [layout.stairs[0].hole] : [] };
    for (const surface of splitFloor(roofBounds)) box(m.ivory, (surface.minX + surface.maxX) / 2, y + 2.22,
      (surface.minZ + surface.maxZ) / 2, surface.maxX - surface.minX, .16, surface.maxZ - surface.minZ, .055);
  }
  // Upper pilothouse has wraparound glass and a solid console below it.
  const d = layout.driver, y = d.floorY;
  box(m.ivory, d.x, y + .39, d.z, 2.62, .78, 2.14, .13);
  for (const side of [-1, 1]) box(m.glass, side * 1.265, y + 1.36, d.z, .025, 1.06, 1.83, .022);
  box(m.glass, 0, y + 1.36, d.z + 1.016, 2.35, 1.06, .03, .06, [-.09, 0, 0]);
  for (const side of [-1, 1]) box(m.ivory, side * 1.26, y + 1.33, d.z + 1.01, .13, 1.22, .13, .025);
  box(m.ivory, 0, y + 1.98, d.z, 2.84, .17, 2.3, .07);
  routeSign(t, 0, y + .43, d.z + 1.087, .95, .28, 1);
  box(m.paint, 0, 6.31, -1.55, 1.02, .76, 1.12, .13);
  box(m.trim, 0, 6.69, -1.55, 1.10, .09, 1.20, .045);
  bar(m.metal, [0, 5.98, 2.72], [0, 6.94, 2.72], .036);
  box(m.white, 0, 6.965, 2.72, .10, .07, .10, .025);
  bar(m.metal, [-.75, 6.68, 2.72], [.75, 6.68, 2.72], .022);
  for (const side of [-1, 1]) {
    box(side < 0 ? m.red : m.green, side * 2.68, 5.94, 7.50, .11, .13, .13, .033);
    if (!tier) {
      for (const z of [-8.8, 8.8]) {
        ring(m.red, side * 2.90, 2.43, z, .28, .065, [0, Math.PI / 2, 0]);
        for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) box(m.ivory, side * 2.905, 2.43 + Math.cos(a) * .28,
          z + Math.sin(a) * .28, .075, .1, .10, .02, [a, 0, 0]);
      }
      for (const z of [-9.85, 9.85]) {
        bar(m.metal, [side * 2.12, 1.32, z], [side * 2.12, 1.58, z], .075);
        bar(m.metal, [side * 1.89, 1.55, z], [side * 2.35, 1.55, z], .065);
      }
    }
  }
}

function routeSign(t, x, y, z, width, height, end) {
  const { box, mats: m, spec } = t;
  box(m.trim, x, y, z, width + .065, height + .048, .037, .028);
  const digits = spec.routeCode, size = height * .71, digitWidth = size * .57;
  const segments = { 0: [0, 1, 2, 3, 4, 5], 1: [1, 2], 2: [0, 1, 6, 4, 3], 3: [0, 1, 6, 2, 3], 4: [5, 6, 1, 2],
    5: [0, 5, 6, 2, 3], 6: [0, 5, 6, 4, 2, 3], 7: [0, 1, 2], 8: [0, 1, 2, 3, 4, 5, 6], 9: [0, 1, 2, 3, 5, 6] };
  const points = [[0, .5, true], [.5, .25, false], [.5, -.25, false], [0, -.5, true], [-.5, -.25, false], [-.5, .25, false], [0, 0, true]];
  for (let index = 0; index < digits.length; index++) for (const segment of segments[digits[index]]) {
    const [dx, dy, horizontal] = points[segment], cx = x - width * .30 + index * digitWidth * 1.3;
    box(m.sign, cx + dx * digitWidth, y + dy * size, z + end * .023,
      horizontal ? digitWidth * .79 : size * .095, horizontal ? size * .095 : size * .37, .012, .004);
  }
  // Neutral destination strokes are visibly placeholders rather than names.
  for (let i = 0; i < 3; i++) box(m.sign, x + width * .245, y + (.07 - i * .068) * height * 3,
    z + end * .023, width * .23 - i * .025, height * .075, .010, .003);
}

function roundedBox(THREE, width, height, depth, radius, subdivisions) {
  const geometry = new THREE.BoxGeometry(width, height, depth, subdivisions, subdivisions, subdivisions);
  const p = geometry.attributes.position, normals = geometry.attributes.normal;
  const r = Math.min(radius, width / 2, height / 2, depth / 2), limits = [width / 2 - r, height / 2 - r, depth / 2 - r];
  for (let i = 0; i < p.count; i++) {
    const point = [p.getX(i), p.getY(i), p.getZ(i)], inner = point.map((value, axis) => clamp(value, -limits[axis], limits[axis]));
    const delta = point.map((value, axis) => value - inner[axis]), length = Math.hypot(...delta);
    if (length > 1e-10) { p.setXYZ(i, ...inner.map((value, axis) => value + delta[axis] / length * r)); normals.setXYZ(i, ...delta.map(value => value / length)); }
  }
  return geometry;
}

function gridGeometry(THREE, rows, columns, point) {
  const positions = [], indices = [], uv = [];
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= columns; col++) {
    positions.push(...point(row / rows, col / columns)); uv.push(col / columns, row / rows);
    if (row < rows && col < columns) {
      const a = row * (columns + 1) + col, b = a + 1, c = a + columns + 1, d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function mergeGeometry(THREE, geometries) {
  const positions = [], normals = [], uv = [];
  for (const geometry of geometries) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.attributes.position, n = g.attributes.normal, tex = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { positions.push(p.getX(i), p.getY(i), p.getZ(i)); normals.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(tex?.getX(i) || 0, tex?.getY(i) || 0); }
    if (g !== geometry) g.dispose(); geometry.dispose();
  }
  const result = new THREE.BufferGeometry(); result.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  result.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); result.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  result.computeBoundingBox(); result.computeBoundingSphere(); return result;
}

function measureModel(root) {
  let triangles = 0, drawCalls = 0, geometryBytes = 0; const geometries = new Set();
  root.traverse(node => { if (node.isMesh) { drawCalls++; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
    if (!geometries.has(node.geometry)) { geometries.add(node.geometry); for (const a of Object.values(node.geometry.attributes)) geometryBytes += a.array.byteLength; geometryBytes += node.geometry.index?.array.byteLength || 0; } } });
  return { triangles, drawCalls, geometryBytes };
}

function batchMovableParts(THREE, root) {
  // Each sliding leaf and spinning wheel owns a transform; merge only within
  // that transform, so doors remain live without dozens of repeated draw calls.
  root.traverse(parent => {
    if (parent === root || !parent.isGroup) return;
    const batches = new Map();
    for (const child of [...parent.children]) if (child.isMesh) {
      child.updateMatrix(); child.geometry.applyMatrix4(child.matrix);
      if (!batches.has(child.material)) batches.set(child.material, []);
      batches.get(child.material).push(child.geometry); parent.remove(child);
    }
    for (const [material, geometries] of batches) {
      const mesh = new THREE.Mesh(mergeGeometry(THREE, geometries), material);
      mesh.castShadow = !material.transparent; mesh.receiveShadow = true; parent.add(mesh);
    }
  });
}
