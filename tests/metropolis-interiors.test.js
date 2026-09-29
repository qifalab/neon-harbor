import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { METROPOLIS_BUILDINGS } from '../src/metropolis-catalog.js';
import { createInteriorLayout, createInteriorSystem } from '../src/metropolis-interiors.js';
import { SpatialIndex, moveCircle, circleContacts, CHARACTER_RADIUS } from '../src/collision.js';

const create = () => createInteriorSystem(THREE, new THREE.Scene());
const physics = system => ({ index: new SpatialIndex(system.collisionContext().colliders),
  groundHeightAt: system.collisionContext().groundHeightAt, bounds: 1450 });
const walkToCabin = (system, entry) => {
  const player = { ...entry.position, y: 0, groundY: entry.groundY };
  const cabin = system.snapshot().cabin;
  const collision = physics(system);
  moveCircle(player, 0, cabin.z - player.z, CHARACTER_RADIUS, collision);
  assert.ok(Math.abs(player.z - cabin.z) < 0.01, `central aisle obstructed in ${system.snapshot().buildingId}`);
  assert.equal(circleContacts(player, CHARACTER_RADIUS, collision).length, 0, 'cabin boarding point must be clear');
  return player;
};
const completeRide = (system, player) => {
  const heights = [system.collisionContext().groundHeightAt(player.x, player.z)];
  const phases = new Set(); let transition = null;
  for (let frame = 0; frame < 5000 && system.state.moving; frame++) {
    phases.add(system.state.elevator.phase);
    transition = system.update(1 / 60) || transition;
    heights.push(system.collisionContext().groundHeightAt(player.x, player.z));
  }
  assert.equal(system.state.moving, false, 'elevator must finish within its physical trip duration');
  assert.equal(system.state.elevator.phase, 'idle');
  assert.deepEqual([...phases].sort(), ['closing', 'moving', 'opening']);
  return { heights, transition };
};

test('every one of 48 addresses has distinct furnished programmes, open entrances, and a walkable elevator route', () => {
  const system = create(), categories = new Set();
  assert.equal(METROPOLIS_BUILDINGS.length, 48);
  assert.equal(system.collisionContext(), null, 'an inactive interior must not override world physics');
  for (const building of METROPOLIS_BUILDINGS) {
    const entry = system.enter(building.id);
    assert.ok(entry, building.id);
    categories.add(system.snapshot().floorType);
    assert.ok(system.snapshot().furnitureCount >= 20, `${building.id} requires furnished spaces`);
    const outside = { x: building.x, z: building.z + (building.depth - 0.7) / 2 + 0.7, y: 0 };
    moveCircle(outside, 0, entry.position.z - outside.z, CHARACTER_RADIUS, physics(system));
    assert.ok(Math.abs(outside.z - entry.position.z) < 0.01, `${building.id} main doorway has no solid wall`);
    const player = walkToCabin(system, entry);
    assert.equal(system.getPrompt(player).kind, 'elevator');
    assert.equal(system.interact(player).elevator.floors.length, 4);
    moveCircle(player, 0, entry.position.z - player.z, CHARACTER_RADIUS, physics(system));
    assert.equal(system.getPrompt(player).kind, 'exit');
    const leave = system.exit();
    assert.equal(leave.outside, true);
    assert.equal(system.collisionContext(), null);
    assert.equal(system.snapshot().activeFloors, 0);
    assert.ok(leave.position.z > building.z + building.depth / 2);
  }
  assert.ok(categories.size >= 12, `public interiors should reflect their actual uses: ${[...categories]}`);
  system.dispose();
});

test('all 192 floor plans keep furniture collision aligned with visible geometry and guard upper-floor edges', () => {
  const categories = new Set();
  for (const building of METROPOLIS_BUILDINGS) for (const floor of building.floors) {
    const layout = createInteriorLayout(building, floor); categories.add(layout.category);
    assert.ok(layout.parts.length > 220, `${building.id}/${floor.id} must contain modeled furnishings and finishes`);
    for (const collider of layout.colliders) {
      const part = layout.parts.find(item => item.id === collider.id);
      assert.ok(part, 'every collider corresponds to a rendered solid');
      assert.equal(collider.x, part.x); assert.equal(collider.z, part.z);
      assert.equal(collider.hx, part.sx / 2); assert.equal(collider.hz, part.sz / 2);
      assert.ok(collider.minY >= floor.y - 0.01, 'solids must use the occupied floor elevation');
    }
    if (floor.id !== building.floors[0].id) {
      const player = { x: building.x, z: building.z + layout.depth / 2 - 1.4, y: 0 };
      moveCircle(player, 0, 6, CHARACTER_RADIUS, { index: new SpatialIndex(layout.colliders), groundHeightAt: () => floor.y, bounds: 1450 });
      assert.ok(player.z < building.z + layout.depth / 2, 'upper facade must prevent falling through the entrance gap');
    }
  }
  assert.ok(categories.has('observation'));
});

test('the tallest lift carries a boarded passenger continuously, closes its doors, and arrives clear of furniture', () => {
  const system = create(), building = METROPOLIS_BUILDINGS.find(item => item.id === 'apex-tower');
  const entry = system.enter(building.id), player = walkToCabin(system, entry);
  assert.equal(system.selectFloor('observation'), null, 'floor selection requires physically entering and operating the cabin');
  system.interact(player);
  const start = system.selectFloor('observation');
  assert.equal(start.groundY, 0, 'selection cannot teleport to the target floor');
  assert.equal(system.state.elevator.y, 0);
  assert.deepEqual(system.state.elevator.anchor, { x: player.x, z: player.z });
  assert.equal(system.exit(), null, 'cannot walk out of the city during a lift ride');
  assert.equal(system.selectFloor('gallery'), null, 'a running cabin cannot be redirected midway');
  const blocked = { ...player };
  moveCircle(blocked, 0, 12, CHARACTER_RADIUS, physics(system));
  assert.ok(blocked.z < system.snapshot().cabin.doorZ, 'safety door must retain passenger during motion');
  const up = completeRide(system, player), top = building.floors.at(-1);
  assert.equal(system.state.floor.id, top.id);
  assert.equal(up.heights.at(-1), top.y);
  for (let n = 1; n < up.heights.length; n++) {
    assert.ok(up.heights[n] >= up.heights[n - 1], 'upward travel is monotonic');
    assert.ok(up.heights[n] - up.heights[n - 1] < 0.25, 'motion is continuous at 60 fps');
  }
  assert.equal(up.transition.groundY, top.y);
  assert.equal(system.snapshot().activeFloors, 1, 'inactive floors must not accumulate in memory');
  assert.equal(circleContacts(player, CHARACTER_RADIUS, physics(system)).length, 0);
  const doorway = { ...player };
  moveCircle(doorway, 0, 5, CHARACTER_RADIUS, physics(system));
  assert.ok(doorway.z > system.snapshot().cabin.doorZ + 1, 'doors reopen into the destination floor');
  assert.equal(system.exit(), null, 'a high-floor exit cannot teleport through a window');
  system.interact(player); system.selectFloor('lobby');
  const down = completeRide(system, player);
  assert.equal(down.heights.at(-1), 0);
  for (let n = 1; n < down.heights.length; n++) assert.ok(down.heights[n] <= down.heights[n - 1]);
  assert.ok(system.exit()?.outside); system.dispose();
});

test('elevator selection validates the passenger still occupies the physical cabin and forced leave clears a moving ride', () => {
  const system = create(); const building = METROPOLIS_BUILDINGS[0];
  const entry = system.enter(building.id), player = walkToCabin(system, entry);
  system.interact(player); player.z += 8;
  assert.equal(system.selectFloor('gallery'), null, 'an open menu does not grant remote elevator travel');
  player.z -= 8; system.interact(player);
  assert.equal(system.selectFloor('missing-floor'), null);
  assert.equal(system.selectFloor('lobby'), null);
  assert.ok(system.selectFloor('gallery'));
  for (let frame = 0; frame < 100; frame++) system.update(1 / 60);
  assert.ok(system.state.elevator.y > 0);
  const leave = system.exit({ force: true });
  assert.ok(leave.outside); assert.equal(leave.groundY, 0);
  assert.equal(system.snapshot().buildingId, null); assert.equal(system.collisionContext(), null);
  assert.equal(system.update(1), null);
  assert.equal(system.root.visible, false); system.dispose();
});

test('interiors use textured shared finishes but transparent local glazing, and refresh copied player snapshots', () => {
  const system = create(), building = METROPOLIS_BUILDINGS[0];
  const entry = system.enter(building.id), player = walkToCabin(system, entry);
  const materials = [];
  system.root.traverse(object => { if (object.isInstancedMesh) materials.push(object.material); });
  assert.ok(materials.some(material => material.map && material.userData.metropolisWorldMetres), 'occupied floors must use textured world-scale finishes');
  assert.ok(materials.some(material => material.transparent && material.opacity < 0.3), 'interior windows must reveal the real exterior city');
  system.interact({ ...player });
  system.update(1 / 60, { ...player, z: player.z + 9 });
  assert.equal(system.selectFloor('gallery'), null, 'a copied menu snapshot cannot bypass current cabin position');
  system.exit({ force: true }); system.dispose();
});

test('entering and leaving rooms preserves the global point-light shader budget without changing outdoor daylight', () => {
  const scene = new THREE.Scene(), system = createInteriorSystem(THREE, scene);
  const lights = scene.children.filter(object => object.isPointLight);
  assert.equal(lights.length, 2);
  assert.ok(lights.every(light => light.visible && light.intensity === 0));
  for (const building of METROPOLIS_BUILDINGS.slice(0, 3)) {
    system.enter(building.id);
    assert.deepEqual(scene.children.filter(object => object.isPointLight), lights);
    assert.ok(lights.every(light => light.visible && light.intensity > 0));
    const nestedLights = [];
    system.root.traverse(object => { if (object.isLight) nestedLights.push(object); });
    assert.equal(nestedLights.length, 0, 'occupancy cannot add lights beneath the toggled interior root');
    system.exit();
    assert.ok(lights.every(light => light.visible && light.intensity === 0));
  }
  system.dispose();
  assert.equal(scene.children.filter(object => object.isPointLight).length, 0);
});

test('all 96 stair flights carry ordinary walking up and down three occupied floors without teleporting', async () => {
  const { GameSimulation } = await import('../src/simulation.js');
  const system = create();
  for (const building of METROPOLIS_BUILDINGS) {
    const entry = system.enter(building.id), context = system.collisionContext();
    const sim = new GameSimulation({ colliders: context.colliders, groundHeightAt: context.groundHeightAt, bounds: 1450 });
    sim.cars = []; Object.assign(sim.player, entry.position, { groundY: 0, y: 0 });
    const revision = sim.teleportRevision, stairs = system.snapshot().stairs;
    assert.equal(stairs.length, 2); assert.equal(system.snapshot().activeFloors, 3);
    const visited = new Set([0]); let largestStep = 0, previous = 0;
    const walk = target => {
      let frames = 0;
      while (Math.hypot(sim.player.x - target.x, sim.player.z - target.z) > 0.09 && frames++ < 1200) {
        const change = system.update(1 / 60, sim.player);
        assert.ok(!change?.position && !change?.transition, 'stairs never emit a position reset');
        const physics = system.collisionContext(); sim.colliders = physics.colliders; sim.groundHeightAt = physics.groundHeightAt;
        sim.update(1 / 60, { forward: 1, cameraYaw: Math.atan2(target.x - sim.player.x, target.z - sim.player.z) });
        largestStep = Math.max(largestStep, Math.abs(sim.player.groundY - previous)); previous = sim.player.groundY;
        visited.add(Math.round(sim.player.groundY * 1000));
        assert.equal(sim.player.y, 0, 'walking stairs requires no jumping');
      }
      system.update(1 / 60, sim.player);
      assert.ok(Math.hypot(sim.player.x - target.x, sim.player.z - target.z) <= 0.09, `${building.id}: stair route blocked at ${JSON.stringify(sim.player)} before ${JSON.stringify(target)}`);
      assert.equal(sim.teleportRevision, revision);
    };
    walk({ x: building.x, z: stairs[0].bottom.z }); walk(stairs[0].bottom); walk(stairs[0].top);
    assert.equal(system.state.floor.id, 'gallery'); assert.equal(sim.player.groundY, 4.2);
    for (const point of stairs[0].bypass) walk(point);
    walk(stairs[1].bottom); walk(stairs[1].top);
    assert.equal(system.state.floor.id, 'workplace'); assert.equal(sim.player.groundY, 8.4);
    assert.ok(system.snapshot().rooms.every(room => room.enclosed), 'new third floor is physically furnished and enclosed');
    walk(stairs[1].bottom);
    for (const point of [...stairs[0].bypass].reverse()) walk(point);
    walk(stairs[0].top); walk(stairs[0].bottom);
    walk({ x: building.x, z: stairs[0].bottom.z }); walk(entry.position);
    assert.equal(system.state.floor.id, 'lobby'); assert.equal(sim.player.groundY, 0);
    assert.ok(visited.size >= 49, 'both flights expose their real intermediate tread elevations');
    assert.ok(largestStep <= 0.17500001, `a normal walking frame may climb one real riser, received ${largestStep}`);
    assert.ok(system.exit()?.outside);
  }
  system.dispose();
});

test('stair treads, nosings, landings and cutouts agree with continuous-world support geometry', () => {
  for (const building of METROPOLIS_BUILDINGS) {
    const system = create(); system.enter(building.id);
    for (const flight of system.snapshot().stairs) {
      const floor = building.floors.find(item => item.id === flight.fromFloorId), layout = createInteriorLayout(building, floor);
      assert.equal(layout.parts.filter(part => part.kind === 'stair-tread').length, 24);
      assert.equal(layout.parts.filter(part => part.kind === 'stair-nosing').length, 24);
      assert.equal(layout.parts.filter(part => part.kind === 'stair-landing').length, 1);
      assert.equal(layout.parts.filter(part => part.kind === 'stair-handrail').length, 2);
      assert.ok(flight.width >= 2.8);
      let height = flight.fromY;
      for (let index = 0; index < flight.treadCount; index++) {
        const position = { x: flight.x, z: flight.startZ - (index + 0.5) * flight.run / flight.treadCount, groundY: height };
        height = system.collisionContext().groundHeightAt(position.x, position.z, height);
        assert.ok(Math.abs(height - (flight.fromY + (index + 1) * flight.rise / flight.treadCount)) < 1e-8);
        position.groundY = height;
        assert.equal(circleContacts(position, CHARACTER_RADIUS, physics(system)).length, 0, 'cutout must clear the whole standing player, including the ceiling edge');
      }
    }
    system.dispose();
  }
});

test('the upper stair opening guards its wrong end without a four-metre ground-height snap', () => {
  const system = create(); const entry = system.enter('tide-museum'), player = walkToCabin(system, entry);
  system.interact(player); system.selectFloor('workplace'); completeRide(system, player);
  const flight = system.snapshot().stairs[1];
  const standing = { x: flight.bottom.x, z: flight.bottom.z, groundY: flight.toY, y: 0 };
  const collision = physics(system);
  moveCircle(standing, 0, -3, CHARACTER_RADIUS, collision);
  assert.ok(standing.z >= flight.startZ + 0.99, 'the guarded bottom-side lip must stop a visitor on 3F');
  assert.equal(collision.groundHeightAt(standing.x, standing.z, flight.toY), flight.toY);
  assert.equal(system.snapshot().floorId, 'workplace');
  system.dispose();
});

test('hidden enclosed floors keep their collision and furnishings resident while the stair opening reveals adjacent floors', () => {
  const system = create(), building = METROPOLIS_BUILDINGS[0]; system.enter(building.id);
  const resident = system.collisionContext().colliders;
  system.update(1 / 60, { x: building.x, z: building.z - 16, groundY: 0 });
  assert.deepEqual(system.snapshot().visibleFloors, ['lobby']);
  assert.equal(system.snapshot().activeFloors, 3);
  assert.equal(system.collisionContext().colliders, resident, 'visibility optimization cannot alter physical collision');
  const flight = system.snapshot().stairs[0];
  system.update(1 / 60, { x: flight.x, z: (flight.startZ + flight.endZ) / 2, groundY: flight.rise / 2 });
  assert.deepEqual(system.snapshot().visibleFloors, ['lobby', 'gallery']);
  assert.equal(system.collisionContext().colliders, resident);
  system.exit({ force: true }); assert.deepEqual(system.snapshot().visibleFloors, []); system.dispose();
});

test('painted corridor ceilings sit below the stone slab above instead of exposing its underside', () => {
  for (const building of METROPOLIS_BUILDINGS) for (const floor of building.floors.slice(0, 2)) {
    const layout = createInteriorLayout(building, floor), upper = building.floors.find(item => item.y > floor.y);
    const ceiling = layout.parts.filter(part => part.kind === 'ceiling' && !part.roomId);
    assert.ok(ceiling.length >= 1);
    for (const part of ceiling) {
      assert.equal(part.material, 'interiorCeiling');
      assert.ok(part.y - part.sy / 2 < upper.y - 0.32 - 0.05, 'warm painted soffit must be the lowest visible surface, clear of the upper stone slab');
      assert.ok(part.y - part.sy / 2 - floor.y >= 3.2, 'retain comfortable public-corridor headroom');
    }
  }
});

test('occupied finishes retain matte microtexture and modest indirect light with the same two-point-light budget', () => {
  const scene = new THREE.Scene(), system = createInteriorSystem(THREE, scene); const entry = system.enter('tide-museum');
  const finishMaterials = new Map(); system.root.traverse(node => { if (node.isMesh && node.material?.userData.interiorBounce) finishMaterials.set(node.material.name, node.material); });
  for (const key of ['interiorCeiling', 'galleryPaint', 'interiorStone']) {
    const material = finishMaterials.get(`Occupied interior · ${key}`);
    assert.ok(material?.map?.isDataTexture && material.userData.metropolisWorldMetres, 'clean indoor surfaces retain original subtle texture at world scale');
    assert.ok(material.roughness >= 0.75 && material.metalness === 0);
    assert.ok(material.emissiveIntensity > 0 && material.emissiveIntensity <= 0.2, 'indirect fill cannot replace orientation and shading with full brightness');
  }
  const lights = scene.children.filter(node => node.isPointLight);
  assert.equal(lights.length, 2);
  assert.ok(lights.every(light => !light.castShadow));
  assert.ok(Math.hypot(lights[0].position.x - entry.position.x, lights[0].position.z - entry.position.z) < 8, 'the arrival display receives a local light rather than one hidden twenty metres away in a side room');
  system.dispose();
});
