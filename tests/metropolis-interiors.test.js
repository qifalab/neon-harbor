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
    assert.equal(system.interact(player).elevator.floors.length, 3);
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

test('all 144 floor plans keep furniture collision aligned with visible geometry and guard upper-floor edges', () => {
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
