import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { METROPOLIS_BUILDINGS } from '../src/metropolis-catalog.js';
import { ROOM_DESIGNS, getRoomDesign } from '../src/metropolis-room-designs.js';
import { createInteriorLayout, createInteriorSystem } from '../src/metropolis-interiors.js';
import { SpatialIndex, moveCircle, circleContacts, CHARACTER_RADIUS } from '../src/collision.js';

test('all natural floors name distinct functional areas without substituting furniture for rooms', () => {
  assert.deepEqual(Object.keys(ROOM_DESIGNS).sort(), METROPOLIS_BUILDINGS.map(building => building.id).sort());
  const floorNames = new Set(), roomIds = new Set(), uses = new Set();
  for (const building of METROPOLIS_BUILDINGS) for (const floor of building.floors) {
    const design = getRoomDesign(building.id, floor.id);
    assert.ok(design.name.length > 3); assert.equal(design.rooms.length, 4);
    assert.ok(!floorNames.has(design.name), `floor title must identify an actual programme: ${design.name}`);
    floorNames.add(design.name);
    assert.equal(new Set(design.rooms.map(room => room.name)).size, 4);
    for (const room of design.rooms) {
      roomIds.add(room.id); uses.add(room.type); assert.ok(room.name.length > 3);
      if (room.number) assert.ok(room.name.endsWith(room.number), 'upper room titles and door numbers use the same floor/room code');
    }
  }
  const count = METROPOLIS_BUILDINGS.reduce((n, building) => n + building.floors.length, 0);
  assert.equal(floorNames.size, count); assert.equal(roomIds.size, count * 4); assert.ok(uses.size >= 45);
  assert.throws(() => getRoomDesign('missing-address', 'lobby'), /Missing authored interior/);
});

test('every natural-floor room threshold remain reachable through the central aisle and real door openings', () => {
  for (const building of METROPOLIS_BUILDINGS) for (const floor of building.floors) {
    const layout = createInteriorLayout(building, floor);
    const physics = { index: new SpatialIndex(layout.colliders), groundHeightAt: () => floor.y, bounds: 1450 };
    for (const room of layout.rooms) {
      const player = { x: building.x, z: layout.entrance.z, y: 0, groundY: floor.y };
      moveCircle(player, 0, room.entrance.z - player.z, CHARACTER_RADIUS, physics);
      moveCircle(player, room.arrival.x - player.x, 0, CHARACTER_RADIUS, physics);
      assert.ok(Math.hypot(player.x - room.arrival.x, player.z - room.arrival.z) < 0.015, `${building.id}/${floor.id}/${room.name} entrance obstructed`);
      assert.equal(circleContacts(player, CHARACTER_RADIUS, physics).length, 0, `${room.name} arrival must not overlap furniture`);
      moveCircle(player, building.x - player.x, 0, CHARACTER_RADIUS, physics);
      moveCircle(player, 0, layout.entrance.z - player.z, CHARACTER_RADIUS, physics);
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
  assert.ok(batches.length / snapshot.activeFloors < 80, 'each resident floor batches its furnishings by shared material/shape so hidden floors can be culled');
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

test('eight hospital rooms have clean bounded interiors and medical furniture within real walls', () => {
  const hospital = METROPOLIS_BUILDINGS.find(building => building.id === 'garden-hospital');
  let total = 0;
  for (const floor of hospital.floors.slice(0, 2)) {
    const layout = createInteriorLayout(hospital, floor);
    for (const room of layout.rooms) {
      total++;
      const expected = { reception: [14, 12], waiting: [16, 14], pharmacy: [12, 10], consult: [10, 10], ward: [14, 12], rehab: [14, 12], office: [12, 10] }[room.type];
      assert.deepEqual([room.width, room.depth], expected); assert.equal(room.ceilingHeight, 3.18); assert.equal(room.enclosed, true);
      const parts = layout.parts.filter(part => part.roomId === room.id);
      const walls = parts.filter(part => part.kind === 'partition');
      assert.equal(walls.length, 5, `${room.name}: four sides and a split door wall`);
      assert.ok(walls.every(part => part.material === 'clinicPaint'));
      const ceiling = parts.find(part => part.kind === 'ceiling');
      assert.equal(ceiling.sx, room.width); assert.equal(ceiling.sz, room.depth);
      assert.ok(Math.abs(ceiling.y - ceiling.sy / 2 - floor.y - room.ceilingHeight) < 1e-8);
      assert.ok(parts.some(part => part.material === 'clinicalFloor' && part.sx > room.width - 0.3));
      for (const part of parts) {
        assert.ok(part.x - part.sx / 2 >= room.bounds.minX - 0.15 && part.x + part.sx / 2 <= room.bounds.maxX + 0.15, `${room.name}/${part.kind} spills through a side wall`);
        assert.ok(part.z - part.sz / 2 >= room.bounds.minZ - 0.15 && part.z + part.sz / 2 <= room.bounds.maxZ + 0.15, `${room.name}/${part.kind} spills through an end wall`);
      }
      if (room.type === 'consult') {
        assert.ok(parts.some(part => part.kind === 'examination-bed' && part.material === 'steel' && part.sz < 2.3));
        assert.ok(parts.some(part => part.kind === 'privacy-screen' && part.material === 'fabric'));
        assert.ok(parts.some(part => part.kind === 'basin')); assert.ok(parts.filter(part => part.kind === 'chair').length >= 4);
        assert.ok(!parts.some(part => part.kind === 'bed'), 'a domestic wooden bed is not a medical examination bed');
      }
      if (room.type === 'waiting') assert.equal(parts.filter(part => part.kind === 'chair').length, 36, '18 individually modeled waiting seats');
    }
  }
  assert.equal(total, 8);
});

test('hospital visitors can reach counters, seats, beds, handwashing and rehabilitation equipment and return', () => {
  const hospital = METROPOLIS_BUILDINGS.find(building => building.id === 'garden-hospital');
  let visited = 0;
  for (const floor of hospital.floors.slice(0, 2)) {
    const layout = createInteriorLayout(hospital, floor);
    const physics = { index: new SpatialIndex(layout.colliders), groundHeightAt: () => floor.y, bounds: 1450 };
    for (const room of layout.rooms) for (const point of room.accessPoints) {
      const player = { ...room.arrival, y: 0, groundY: floor.y };
      for (const target of [point.via, point, point.via, room.arrival]) {
        moveCircle(player, target.x - player.x, target.z - player.z, CHARACTER_RADIUS, physics);
        assert.ok(Math.hypot(player.x - target.x, player.z - target.z) < 0.015, `${room.name}/${point.name} has blocked access`);
        assert.equal(circleContacts(player, CHARACTER_RADIUS, physics).length, 0, `${room.name}/${point.name} overlaps furniture`);
      }
      visited++;
    }
  }
  assert.equal(visited, 20);
});

test('all enclosed occupied rooms have human-scale enclosures and furnishings within their walls', () => {
  let occupied = 0;
  for (const building of METROPOLIS_BUILDINGS) for (const floor of building.floors.filter(item => item.id !== 'observation')) {
    const layout = createInteriorLayout(building, floor);
    for (const room of layout.rooms) {
      occupied++;
      assert.ok(room.enclosed && room.width <= 19 && room.depth <= 18 && room.ceilingHeight <= 3.7, `${building.id}/${room.name} must not be an empty full-width hall`);
      const parts = layout.parts.filter(part => part.roomId === room.id);
      assert.equal(parts.filter(part => part.kind === 'partition').length, 5, 'four walls include a real split door opening');
      assert.ok(parts.some(part => part.kind === 'ceiling'));
      assert.ok(parts.filter(part => !['partition', 'ceiling', 'detail'].includes(part.kind)).length >= 8, `${room.name} lacks modeled furnishings`);
      for (const part of parts) {
        assert.ok(part.x - part.sx / 2 >= room.bounds.minX - 0.16 && part.x + part.sx / 2 <= room.bounds.maxX + 0.16, `${room.name}/${part.kind} crosses a side wall`);
        assert.ok(part.z - part.sz / 2 >= room.bounds.minZ - 0.16 && part.z + part.sz / 2 <= room.bounds.maxZ + 0.16, `${room.name}/${part.kind} crosses an end wall`);
      }
    }
  }
  assert.equal(occupied, METROPOLIS_BUILDINGS.reduce((n, building) => n + (building.floors.length - 1) * 4, 0));
});

test('public arrival and corridor spaces contain legible orientation, seating and programme-specific displays', () => {
  for (const building of METROPOLIS_BUILDINGS) for (const floor of building.floors.filter(item => item.id !== 'observation')) {
    const layout = createInteriorLayout(building, floor);
    assert.ok(layout.parts.some(part => part.kind === 'welcome-counter'));
    assert.ok(layout.parts.filter(part => part.kind === 'bench' && !part.roomId).length >= 4);
    assert.ok(layout.labels.some(label => label.graphic === 'directory' && label.rooms.length === 4));
    assert.equal(layout.labels.filter(label => label.graphic === 'harbour').length, 2);
    for (const label of layout.labels.filter(label => label.text?.startsWith('楼梯'))) {
      assert.ok(Math.abs(label.x - building.x) >= 5.2 && label.height <= 0.3, 'stair labels must be wall-mounted rather than hanging over the camera');
    }
    const counter = layout.parts.find(part => part.kind === 'welcome-counter');
    assert.ok(counter.sx <= 2.4 && counter.sy <= 0.96, 'arrival furnishings retain human dimensions');
  }
  const museum = METROPOLIS_BUILDINGS[0], layout = createInteriorLayout(museum, museum.floors[0]);
  assert.ok(layout.parts.some(part => part.kind === 'welcome-ship-hull'));
});
