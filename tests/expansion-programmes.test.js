import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';
import { HARBOR_TOWERS } from '../src/harbor-skyline.js';
import { METROPOLIS_BUILDINGS } from '../src/metropolis-catalog.js';
import { expansionBuilding, expansionRoomDesign, HARBOR_GROUND_PROGRAMMES } from '../src/expansion-programmes.js';
import { getRoomDesign } from '../src/metropolis-room-designs.js';

const source = createWorld(THREE, new THREE.Scene(), { streaming: true });
const south = source.buildings.map((b, i) => expansionBuilding(b, 'south', i));
const east = HARBOR_TOWERS.map((b, i) => expansionBuilding(b, 'east', i));
const uses = buildings => buildings.reduce((counts, b) => {
  counts[b.programmeUse] = (counts[b.programmeUse] || 0) + 1; return counts;
}, {});

test('existing shell uses survive stable address IDs and safer floor heights across both new shores', () => {
  assert.deepEqual(uses(south), { home: 80, office: 12, warehouse: 4 });
  assert.deepEqual(uses(east), { office: 35, home: 41 });
  for (const [raws, buildings] of [[source.buildings, south], [HARBOR_TOWERS, east]]) {
    for (const [i, b] of buildings.entries()) {
      const raw = raws[i];
      const use = b.compact && raw.width > 35 ? 'warehouse' : raw.style === 'residential' ? 'home' : 'office';
      assert.equal(b.programmeUse, use, b.id);
      assert.equal(b.shellId, raw.id, b.id);
      if (HARBOR_GROUND_PROGRAMMES[b.id]) continue;
      const design = getRoomDesign(b.id, b.floors[0].id);
      assert.equal(design.category, use === 'warehouse' ? 'gallery' : use === 'home' ? 'residential' : 'office', b.id);
      assert.deepEqual(design.rooms.map(r => r.type), b.compact
        ? use === 'warehouse' ? ['workshop', 'archive'] : use === 'home' ? ['living', 'bedroom'] : ['office', 'conference']
        : use === 'home' ? ['living', 'bedroom', 'kitchen', 'bath'] : ['office', 'conference', 'library', 'lounge'], b.id);
    }
  }
  assert.equal(south.reduce((n, b) => n + b.floors.length, 0), 501);
  assert.equal(east.reduce((n, b) => n + b.floors.length, 0), 2729);
  assert.equal([...METROPOLIS_BUILDINGS, ...south, ...east].reduce((n, b) => n + b.floors.length, 0), 4150);
});

test('harbor shop overrides and residents actual homes remain distinct from the restored employment warehouses', () => {
  for (const [id, [name, category, rooms]] of Object.entries(HARBOR_GROUND_PROGRAMMES)) {
    const building = south.find(b => b.id === id), design = getRoomDesign(id, 'lobby');
    assert.equal(building.name, name);
    assert.equal(design.name, name); assert.equal(design.category, category);
    assert.deepEqual(design.rooms.map(r => r.type), rooms.map(s => s.split(':')[1] || s.split(':')[0]));
  }
  for (const number of [77, 78, 79, 80, 81, 82, 83, 84, 89, 93]) {
    const id = `south-${String(number).padStart(3, '0')}`;
    assert.equal(getRoomDesign(id, 'lobby').category, 'residential', `${id}: resident home replaced`);
    assert.deepEqual(getRoomDesign(id, 'lobby').rooms.map(r => r.type), ['living', 'bedroom']);
  }
  for (const number of [85, 86, 87, 88]) {
    const id = `south-${String(number).padStart(3, '0')}`, design = getRoomDesign(id, 'lobby');
    assert.equal(design.category, 'gallery'); assert.equal(design.floorFinish, 'ceramic');
    assert.deepEqual(design.rooms.map(r => r.type), ['workshop', 'archive']);
    assert.deepEqual(expansionRoomDesign(id, 'gallery').rooms.map(r => r.type), ['maritime', 'lounge']);
  }
});
