import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { METROPOLIS_BUILDINGS } from '../src/metropolis-catalog.js';
import { ROOM_DESIGNS, getRoomDesign } from '../src/metropolis-room-designs.js';
import { createInteriorLayout, createInteriorSystem } from '../src/metropolis-interiors.js';
import { SpatialIndex, moveCircle, circleContacts } from '../src/collision.js';

test('144 authored public floors name 576 functional areas without substituting furniture for rooms', () => {
  assert.deepEqual(Object.keys(ROOM_DESIGNS).sort(), METROPOLIS_BUILDINGS.map(building => building.id).sort());
  const floorNames = new Set(), roomIds = new Set(), uses = new Set();
  for (const building of METROPOLIS_BUILDINGS) for (const floor of building.floors) {
    const design = getRoomDesign(building.id, floor.id);
    assert.ok(design.name.length > 3); assert.equal(design.rooms.length, 4);
    assert.ok(!floorNames.has(design.name), `floor title must identify an actual programme: ${design.name}`);
    floorNames.add(design.name);
    assert.equal(new Set(design.rooms.map(room => room.name)).size, 4);
    for (const room of design.rooms) { roomIds.add(room.id); uses.add(room.type); assert.ok(room.name.length > 3); }
  }
  assert.equal(floorNames.size, 144); assert.equal(roomIds.size, 576); assert.ok(uses.size >= 45);
  assert.throws(() => getRoomDesign('missing-address', 'lobby'), /Missing authored interior/);
});

test('all 576 room thresholds remain reachable through the central aisle and real door openings', () => {
  for (const building of METROPOLIS_BUILDINGS) for (const floor of building.floors) {
    const layout = createInteriorLayout(building, floor);
    const physics = { index: new SpatialIndex(layout.colliders), groundHeightAt: () => floor.y, bounds: 1450 };
    for (const room of layout.rooms) {
      const player = { x: building.x, z: layout.entrance.z, y: 0, groundY: floor.y };
      moveCircle(player, 0, room.entrance.z - player.z, 0.42, physics);
      moveCircle(player, room.arrival.x - player.x, 0, 0.42, physics);
      assert.ok(Math.hypot(player.x - room.arrival.x, player.z - room.arrival.z) < 0.015, `${building.id}/${floor.id}/${room.name} entrance obstructed`);
      assert.equal(circleContacts(player, 0.42, physics).length, 0, `${room.name} arrival must not overlap furniture`);
      moveCircle(player, building.x - player.x, 0, 0.42, physics);
      moveCircle(player, 0, layout.entrance.z - player.z, 0.42, physics);
      assert.ok(Math.hypot(player.x - building.x, player.z - layout.entrance.z) < 0.015, `${room.name} cannot return to elevator/exit aisle`);
    }
    for (const part of layout.parts) {
      assert.ok(['box', 'rounded', 'cylinder', 'sphere'].includes(part.geometry));
      assert.ok([part.x, part.y, part.z, part.sx, part.sy, part.sz].every(Number.isFinite));
      assert.ok(part.sx > 0 && part.sy > 0 && part.sz > 0);
    }
  }
});

test('distinct programmes contain their recognizable specialist equipment and real domestic subdivisions', () => {
  const types = new Map();
  for (const building of METROPOLIS_BUILDINGS) for (const floor of building.floors) {
    const layout = createInteriorLayout(building, floor);
    for (const room of layout.rooms) types.set(room.type, layout.parts);
  }
  for (const [roomType, modelKind] of [['piano', 'piano'], ['maritime', 'ship-hull'], ['bath', 'bathtub'], ['fitness', 'treadmill'], ['projection', 'projector'], ['robot', 'robot-arm'], ['weather', 'weather-mast'], ['mail', 'mailbox'], ['kitchen', 'kitchen-island'], ['archive', 'archive-cabinet']]) {
    assert.ok(types.get(roomType)?.some(part => part.kind === modelKind), `${roomType} needs modeled ${modelKind}`);
  }
  const home = getRoomDesign('camellia-court', 'gallery');
  assert.deepEqual(home.rooms.map(room => room.type), ['living', 'bedroom', 'kitchen', 'bath']);
  const rooms = createInteriorLayout(METROPOLIS_BUILDINGS.find(building => building.id === 'camellia-court'), METROPOLIS_BUILDINGS.find(building => building.id === 'camellia-court').floors[1]).rooms;
  assert.ok(rooms.every(room => room.enclosed));
});

test('soft furniture batches share geometry and materials while snapshot exposes navigable room metadata', () => {
  const system = createInteriorSystem(THREE, new THREE.Scene()); system.enter('camellia-court');
  const snapshot = system.snapshot();
  assert.equal(snapshot.floorName, '山茶邻里客厅'); assert.equal(snapshot.roomCount, 4);
  assert.equal(snapshot.rooms[0].name, '邻里会客室');
  const batches = []; system.root.traverse(object => { if (object.isInstancedMesh) batches.push(object); });
  assert.ok(batches.length < 80, 'hundreds of pieces must remain in shared material/shape batches');
  for (const geometry of ['rounded', 'cylinder', 'sphere']) assert.ok(batches.some(batch => batch.name.endsWith(`:${geometry}`)), `render ${geometry} rather than its box proxy`);
  assert.ok(batches.some(batch => batch.material.userData.metropolisWorldMetres), 'occupied surfaces retain physical-scale textures');
  system.exit({ force: true }); assert.deepEqual(system.snapshot().rooms, []); system.dispose();
});


test('domestic room dimensions reflect furnished homes rather than unused public halls', () => {
  for (const building of METROPOLIS_BUILDINGS) {
    const floor = building.floors[1], design = getRoomDesign(building.id, floor.id);
    if (design.category !== 'residential') continue;
    const layout = createInteriorLayout(building, floor);
    for (const room of layout.rooms) {
      const expected = { living: [9, 10], bedroom: [8, 8], kitchen: [7, 8], bath: [5, 6] }[room.type];
      if (!expected) continue;
      assert.deepEqual([room.width, room.depth], expected, `${building.id} ${room.name} needs human-scale enclosure`);
      assert.equal(room.ceilingHeight, 2.98); assert.equal(room.enclosed, true);
    }
  }
  const museum = METROPOLIS_BUILDINGS.find(building => building.id === 'tide-museum');
  const layout = createInteriorLayout(museum, museum.floors[0]);
  assert.equal(layout.design.floorFinish, 'limestone');
  assert.ok(layout.parts.some(part => part.kind === 'historic-anchor'));
  assert.ok(layout.parts.filter(part => part.kind === 'ship-hull').length >= 2);
});
