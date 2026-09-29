import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { CHARACTER_STYLES, createCharacter } from '../src/models.js';
import { METROPOLIS_BUILDINGS, METROPOLIS_ROADS } from '../src/metropolis-catalog.js';
import { createPeopleSystem, createPedestrianRoutes, samplePedestrianRoute, PEOPLE_BUDGET } from '../src/metropolis-people.js';
import { circleOBB } from '../src/collision.js';

const buildingBoxes = METROPOLIS_BUILDINGS.map(building => ({ x: building.x, z: building.z,
  hx: building.width / 2 + 4, hz: building.depth / 2 + 4, minY: 0, maxY: building.height }));
const create = (extra = {}) => createPeopleSystem(THREE, new THREE.Scene(), {
  buildings: METROPOLIS_BUILDINGS, colliders: buildingBoxes, ...extra,
});

test('all 48 closed pedestrian routes remain on pavements and outside every building envelope', () => {
  const routes = createPedestrianRoutes(METROPOLIS_BUILDINGS);
  assert.equal(routes.length, 48);
  for (const route of routes) for (let travel = 0; travel < route.length; travel += 1) {
    const point = samplePedestrianRoute(route, travel);
    for (const box of buildingBoxes) assert.equal(circleOBB({ ...point, radius: .65 }, box), null, route.id);
    for (const road of METROPOLIS_ROADS.vertical) assert.ok(Math.abs(point.x - road) > METROPOLIS_ROADS.width / 2 + .65);
    for (const road of METROPOLIS_ROADS.horizontal) assert.ok(Math.abs(point.z - road) > METROPOLIS_ROADS.width / 2 + .65);
  }
});

test('population has continuous persistent identities, social groups and eight original wardrobes', () => {
  const people = create();
  const initial = people.snapshot();
  assert.equal(initial.logical, 240); assert.equal(initial.conversations, 48); assert.equal(initial.styles, 8);
  const origin = { x: -500, z: -490 };
  for (let frame = 0; frame < 80; frame++) people.update(.1, { position: origin, hour: 12 });
  const moved = people.snapshot();
  assert.deepEqual(moved.people.map(person => person.id), initial.people.map(person => person.id));
  assert.ok(moved.people.some((person, i) => Math.hypot(person.x - initial.people[i].x, person.z - initial.people[i].z) > 4));
  assert.ok(moved.people.filter(person => person.groupId).every(person => person.state === 'talking'));
  for (const person of moved.people) for (const box of buildingBoxes) assert.equal(circleOBB({ ...person, radius: .37 }, box), null);
  people.dispose();
});

test('distance streaming enforces entity budgets and unloads the entire crowd beyond the city', () => {
  const people = create();
  for (let i = 0; i < 20; i++) people.update(.05, { position: { x: -350, z: -750 } });
  const near = people.snapshot();
  assert.ok(near.detailed > 0); assert.ok(near.distant > 0);
  assert.ok(near.detailed <= PEOPLE_BUDGET.detailed); assert.ok(near.distant <= PEOPLE_BUDGET.distant);
  people.update(.05, { position: { x: 2500, z: 2500 } });
  const far = people.snapshot();
  assert.equal(far.logical, 240); assert.equal(far.detailed, 0); assert.equal(far.distant, 0);
  assert.ok(far.pooled <= PEOPLE_BUDGET.detailed);
  people.dispose();
});

test('pause freezes resident positions and animation time, and nearby conversations return actual local directions', () => {
  const people = create(), person = people.snapshot().people.find(person => person.groupId);
  const player = { x: person.x + .7, z: person.z, y: 0 };
  people.update(.1, { position: player });
  const before = people.snapshot();
  for (let i = 0; i < 10; i++) people.update(.1, { position: player, paused: true });
  const after = people.snapshot();
  assert.equal(after.time, before.time);
  assert.deepEqual(after.people.map(({ x, z, yaw }) => [x, z, yaw]), before.people.map(({ x, z, yaw }) => [x, z, yaw]));
  assert.match(people.getPrompt(player), /交谈/);
  const result = people.interact(player), building = METROPOLIS_BUILDINGS.find(building => building.id === person.buildingId);
  assert.equal(result.buildingId, building.id); assert.ok(result.message.includes(building.name));
  assert.deepEqual(result.target, { x: building.entrance.x, z: building.entrance.z });
  assert.equal(people.interact({ x: 3000, z: 3000 }), null);
  assert.equal(people.getPrompt({ ...player, y: 50 }), null);
  people.dispose();
});

test('pedestrians wait for a stopped vehicle on their route without tunnelling into its body', () => {
  const people = create(), person = people.snapshot().people.find(person => !person.groupId);
  const vehicle = { x: person.x + Math.sin(person.yaw) * 4.5, z: person.z + Math.cos(person.yaw) * 4.5,
    yaw: person.yaw, hx: 1.15, hz: 2.3, health: 100 };
  let waited = false;
  for (let frame = 0; frame < 35; frame++) {
    people.update(.1, { position: person, vehicles: [vehicle] });
    const current = people.snapshot().people.find(candidate => candidate.id === person.id);
    assert.equal(circleOBB({ ...current, radius: .37 }, vehicle), null);
    waited ||= current.state === 'waiting';
  }
  assert.ok(waited, 'an NPC must stop when a car obstructs its pavement');
  people.dispose();
});

test('wardrobe variants share cached geometry while retaining compatible animated knees and elbows', () => {
  const versions = CHARACTER_STYLES.map((style, index) => createCharacter(THREE, { style: index }));
  assert.equal(new Set(versions.map(person => person.userData.style)).size, 8);
  for (const [index, person] of versions.entries()) {
    person.userData.leftKnee.rotation.x = .62; person.userData.rightElbow.rotation.x = -.81;
    person.userData.setDetail(2);
    assert.equal(person.userData.lod.levels[2].object.getObjectByName('leftKnee').rotation.x, .62);
    assert.equal(person.userData.lod.levels[2].object.getObjectByName('rightElbow').rotation.x, -.81);
    let triangles = 0;
    person.userData.lod.levels[2].object.traverse(node => { if (node.isMesh) triangles += node.geometry.attributes.position.count / 3; });
    assert.ok(triangles < 3200, `${CHARACTER_STYLES[index].id} far geometry budget`);
  }
  const again = createCharacter(THREE, { style: 3 });
  assert.equal(again.userData.leftKnee.children[0].geometry, versions[3].userData.leftKnee.children[0].geometry);
});

test('local collision queries match a full-population reference after movement and reuse stable body records', () => {
  const people = create();
  for (let frame = 0; frame < 35; frame++) people.update(.1, { position: { x: -320, z: -850 } });
  const all = people.snapshot().people;
  for (let query = 0; query < 72; query++) {
    const position = { x: -650 + (query * 127 % 1300), z: -1270 + (query * 83 % 900) };
    const radius = query % 2 ? 12 : 95;
    const expected = all.filter(person => Math.hypot(person.x - position.x, person.z - position.z) < radius).map(person => person.id).sort();
    assert.deepEqual(people.getCollisionBodies(position, radius).map(body => body.id).sort(), expected);
  }
  const point = all[0], first = people.getCollisionBodies(point, 1).find(body => body.id === point.id);
  assert.equal(people.getCollisionBodies(point, 1).find(body => body.id === point.id), first);
  const distant = people.root.getObjectByName('Distant citizens · one draw call');
  let disposed = 0; distant.addEventListener('dispose', () => disposed++);
  people.dispose(); people.dispose();
  assert.equal(disposed, 1, 'instance buffers must be released exactly once');
  assert.deepEqual(people.getCollisionBodies(point, 12), []);
});
