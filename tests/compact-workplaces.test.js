import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';
import { expansionBuilding } from '../src/expansion-programmes.js';
import { createInteriorLayout } from '../src/metropolis-interiors.js';
import { circleContacts, SpatialIndex, CHARACTER_RADIUS } from '../src/collision.js';

const source = createWorld(THREE, new THREE.Scene(), { streaming: true });
const buildings = source.buildings.map((b, i) => expansionBuilding(b, 'south', i));
const expected = { office: 'office-desk', conference: 'conference-table', library: 'library-shelf',
  archive: 'archive-shelf', workshop: 'workbench', maritime: 'maritime-case' };

function inspect(layout, building) {
  for (const room of layout.rooms) {
    if (!expected[room.type]) continue;
    const parts = layout.parts.filter(p => p.roomId === room.id);
    assert.ok(parts.some(p => p.kind === expected[room.type]), `${building.id}/${room.type}: actual use-specific furnishing missing`);
    assert.equal(parts.some(p => p.kind === 'sofa'), false, `${building.id}/${room.type}: workplace fell back to a lounge`);
    for (const p of parts.filter(p => !/partition|ceiling|floor|door|wall/.test(p.kind))) {
      assert.ok(p.x - p.sx / 2 >= room.bounds.minX - .01 && p.x + p.sx / 2 <= room.bounds.maxX + .01
        && p.z - p.sz / 2 >= room.bounds.minZ - .01 && p.z + p.sz / 2 <= room.bounds.maxZ + .01,
      `${building.id}/${room.type}/${p.kind}: furniture crossed room bounds`);
    }
    const furniture = layout.colliders.filter(c => parts.some(p => p.id === c.id)
      && !/partition|ceiling|floor|door|wall/.test(c.kind));
    assert.ok(furniture.every(c => c.x + c.hx <= room.bounds.maxX - 2), `${building.id}/${room.type}: furniture blocks 2 m arrival strip`);
    const physics = { index: new SpatialIndex(layout.colliders), bounds: 1800 };
    // The ordinary player capsule traverses the doorway and both directions
    // of the room's clear strip at physical walking height.
    for (let x = room.entrance.x + .8; x >= room.arrival.x; x -= .1)
      assert.equal(circleContacts({ x, z: room.entrance.z, groundY: layout.groundY, y: layout.groundY }, CHARACTER_RADIUS, physics).length, 0);
    for (let z = room.bounds.minZ + .8; z <= room.bounds.maxZ - .8; z += .1)
      assert.equal(circleContacts({ x: room.bounds.maxX - 1, z, groundY: layout.groundY, y: layout.groundY }, CHARACTER_RADIUS, physics).length, 0,
        `${building.id}/${room.type}: clear strip blocked at ${z}`);
  }
}

test('every restored southern workplace has fitting functional furniture and a clear full-height room approach', () => {
  const workplaces = buildings.filter(b => ['office', 'warehouse'].includes(b.programmeUse));
  assert.equal(workplaces.length, 16);
  for (const b of workplaces) for (const f of b.floors) inspect(createInteriorLayout(b, f), b);
  const warehouse = buildings.find(b => b.id === 'south-086');
  const lobby = createInteriorLayout(warehouse, warehouse.floors[0]);
  assert.deepEqual(lobby.rooms.map(r => r.type), ['workshop', 'archive']);
  for (const kind of ['workbench', 'bench-vice', 'workshop-tool', 'freight-crate', 'archive-box', 'reference-ledger'])
    assert.ok(lobby.parts.some(p => p.kind === kind), `${warehouse.id}: ${kind} missing`);
});

test('shared workplace layouts fit the minimum compact shell and support future taller freight buildings', () => {
  const small = expansionBuilding({ id: 'minimum-office', x: 0, z: 0, width: 13, depth: 15, height: 22, baseY: .18, style: 'office' }, 'south', 700);
  for (const floor of small.floors) inspect(createInteriorLayout(small, floor), small);
  const tall = expansionBuilding({ id: 'tall-freight-shell', x: 0, z: 0, width: 42, depth: 29, height: 30, baseY: .18, style: 'office' }, 'south', 701);
  const gallery = createInteriorLayout(tall, tall.floors.find(f => f.id === 'gallery'));
  assert.deepEqual(gallery.rooms.map(r => r.type), ['maritime', 'lounge']);
  inspect(gallery, tall);
});
