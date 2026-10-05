import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';
import { expansionBuilding } from '../src/expansion-programmes.js';
import { createInteriorLayout } from '../src/metropolis-interiors.js';
import { circleContacts, SpatialIndex, CHARACTER_RADIUS } from '../src/collision.js';
import { planHarborWorkshopPilot } from '../src/harbor-workshop-pilot.js';
import { verifiedWorkshopGeometry, authoredWorkshopFurniture } from './helpers/workshop-furniture-geometry.js';

const workshopGeometry = await verifiedWorkshopGeometry();
const source = createWorld(THREE, new THREE.Scene(), { streaming: true });
const buildings = source.buildings.map((b, i) => expansionBuilding(b, 'south', i));
const expected = { office: 'office-desk', conference: 'conference-table', library: 'library-shelf',
  archive: 'archive-shelf', workshop: 'workbench', maritime: 'maritime-case' };

function inspect(layout, building) {
  const floor = building.floors.find(f => f.id === layout.floorId);
  const plan = layout.workshopAuthored ? planHarborWorkshopPilot(building, floor, layout) : null;
  const authored = plan ? authoredWorkshopFurniture(layout, plan, workshopGeometry) : [];
  const renderedParts = plan ? layout.parts.filter(p => !plan.replacePartIds.includes(p.id)) : layout.parts;
  // Use the actual production collision assembly, including owner colliders.
  // Semantic geometry stays in this test view, never adds render/physics parts.
  const colliders = plan ? [...layout.colliders, ...plan.colliders] : layout.colliders;
  for (const room of layout.rooms) {
    if (!expected[room.type]) continue;
    const parts = [...renderedParts, ...authored].filter(p => p.roomId === room.id);
    assert.ok(parts.some(p => p.kind === expected[room.type]), `${building.id}/${room.type}: actual use-specific furnishing missing`);
    assert.equal(parts.some(p => p.kind === 'sofa'), false, `${building.id}/${room.type}: workplace fell back to a lounge`);
    for (const p of parts.filter(p => !/partition|ceiling|floor|door|wall/.test(p.kind))) {
      assert.ok(p.x - p.sx / 2 >= room.bounds.minX - .01 && p.x + p.sx / 2 <= room.bounds.maxX + .01
        && p.z - p.sz / 2 >= room.bounds.minZ - .01 && p.z + p.sz / 2 <= room.bounds.maxZ + .01,
      `${building.id}/${room.type}/${p.kind}: furniture crossed room bounds`);
    }
    const originalIds = new Set(layout.parts.filter(p => p.roomId === room.id).map(p => p.id));
    const furniture = colliders.filter(c => (originalIds.has(c.id) || plan?.colliders.some(p => p.id === c.id)
      && c.z >= room.bounds.minZ && c.z <= room.bounds.maxZ)
      && !/partition|ceiling|floor|door|wall/.test(c.kind));
    assert.ok(furniture.every(c => c.x + c.hx <= room.bounds.maxX - 2), `${building.id}/${room.type}: furniture blocks 2 m arrival strip`);
    const physics = { index: new SpatialIndex(colliders), bounds: 1800 };
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
  const pilot = planHarborWorkshopPilot(warehouse, warehouse.floors[0], lobby);
  const furniture = authoredWorkshopFurniture(lobby, pilot, workshopGeometry);
  for (const kind of ['workbench', 'bench-vice', 'workshop-tool', 'freight-crate', 'archive-shelf', 'reading-table', 'reference-folder', 'reference-ledger'])
    assert.ok(furniture.some(p => p.kind === kind), `${warehouse.id}: actual rendered ${kind} missing`);
  assert.equal(furniture.filter(p => p.kind === 'archive-shelf').length, 3);
  assert.equal(furniture.filter(p => p.source.contributor === 'archive vertical folder').length, 90);
  assert.equal(lobby.parts.some(p => p.kind === 'archive-box'), false, 'Authored archive stores real shelf folders rather than keeping obsolete box render parts');
});

test('shared workplace layouts fit the minimum compact shell and support future taller freight buildings', () => {
  const small = expansionBuilding({ id: 'minimum-office', x: 0, z: 0, width: 13, depth: 15, height: 22, baseY: .18, style: 'office' }, 'south', 700);
  for (const floor of small.floors) inspect(createInteriorLayout(small, floor), small);
  const tall = expansionBuilding({ id: 'tall-freight-shell', x: 0, z: 0, width: 42, depth: 29, height: 30, baseY: .18, style: 'office' }, 'south', 701);
  const gallery = createInteriorLayout(tall, tall.floors.find(f => f.id === 'gallery'));
  assert.deepEqual(gallery.rooms.map(r => r.type), ['maritime', 'lounge']);
  inspect(gallery, tall);
});

test('authored workplace checks reject missing real furniture, moved geometry and a blocked player corridor', () => {
  const warehouse = buildings.find(b => b.id === 'south-086'), floor = warehouse.floors[0];
  const layout = createInteriorLayout(warehouse, floor), plan = planHarborWorkshopPilot(warehouse, floor, layout);
  assert.throws(() => authoredWorkshopFurniture(layout, { ...plan,
    placements: plan.placements.filter(p => p.id !== 'metal_office_desk') }, workshopGeometry),
    'A file id for other models does not satisfy the real retrieval desk requirement');
  assert.throws(() => authoredWorkshopFurniture(layout, { ...plan,
    placements: plan.placements.map(p => p.id === 'wooden_bookshelf_worn'
      ? { ...p, position: { ...p.position, x: p.position.x + .5 } } : p) }, workshopGeometry),
    /collision matches visible GLB bounds/);
  const room = layout.rooms.find(r => r.type === 'archive');
  const blocker = { id: 'cpu-deliberate-corridor-blocker', kind: 'interior-furniture',
    x: room.bounds.maxX - 1, z: room.z, hx: .1, hz: .1,
    minY: floor.y, maxY: floor.y + 1.8, physics: true, camera: true };
  assert.throws(() => inspect({ ...layout, colliders: [...layout.colliders, blocker] }, warehouse),
    'An unregistered physical blocker must still fail the real-radius doorway/strip check');
});
