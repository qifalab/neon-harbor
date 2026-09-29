import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createMetropolisInfrastructure, infrastructureGroundHeightAt, infrastructureSupportAt, flyoverHeight,
  FLYOVERS, FREIGHT_PORT, INFRASTRUCTURE_LANDMARKS } from '../src/metropolis-infrastructure.js';
import { METROPOLIS_BUILDINGS, METROPOLIS_ROADS } from '../src/metropolis-catalog.js';
import { TRANSIT_STOPS, TRANSIT_ROUTES } from '../src/metropolis-transit.js';
import { createMetropolisWorld } from '../src/metropolis-world.js';
import { vehicleGroundSupport } from '../src/ground-support.js';
import { circleOBB, vehicleContacts, SpatialIndex } from '../src/collision.js';

const scene = new THREE.Scene(), infrastructure = createMetropolisInfrastructure(THREE, scene);
const north = createMetropolisWorld(THREE, new THREE.Scene(), { streaming: true });
const allColliders = [...north.colliders, ...infrastructure.colliders];
const point = (r, t, offset = 0) => r.axis === 'z' ? { x: r.cross + offset, z: t } : { x: t, z: r.cross + offset };
const blocked = (x, z, y = 0, colliders = allColliders, radius = .65) => colliders.filter(c =>
  c.physics !== false && y + 1.8 > c.minY + 1e-7 && y < c.maxY - 1e-7 && circleOBB({ x, z, radius }, c));

test('an underpass and its upper carriageway stay independent at the same x/z', () => {
  for (const road of FLYOVERS) {
    const p = point(road, (road.start + road.end) / 2);
    assert.equal(infrastructureGroundHeightAt(p.x, p.z, 0), null, `${road.id}: ground user pulled upward`);
    assert.equal(infrastructureGroundHeightAt(p.x, p.z), null, 'an omitted height is ground level');
    assert.equal(infrastructureGroundHeightAt(p.x, p.z, road.height), road.height);
    assert.equal(blocked(p.x, p.z).length, 0);
    assert.equal(blocked(p.x, p.z, road.height).length, 0);
    const support = infrastructureSupportAt(p.x, p.z, road.height);
    assert.equal(support.id, road.id);
    assert.deepEqual(support.entrance, INFRASTRUCTURE_LANDMARKS.find(l => l.id === road.id).entrance);
  }
  assert.equal(infrastructureGroundHeightAt(120, 160, 0), null, 'do not overwrite south shore ground');
  assert.equal(infrastructureGroundHeightAt(NaN, 0, 0), null);
});

test('both directions of both ramps support a continuous pedestrian journey without an elevation snap', () => {
  for (const road of FLYOVERS) for (const direction of [-1, 1]) {
    let y = 0, peak = 0;
    const start = direction === 1 ? road.start : road.end;
    for (let distance = 0; distance <= road.end - road.start; distance += .25) {
      const along = start + direction * distance, p = point(road, along, 2.8);
      const next = infrastructureGroundHeightAt(p.x, p.z, y);
      assert.notEqual(next, null, `${road.id}: unsupported at ${along}`);
      assert.ok(Math.abs(next - y) < .029, `${road.id}: discontinuous slope`);
      assert.equal(blocked(p.x, p.z, next).length, 0, `${road.id}: route blocked at ${along}`);
      y = next; peak = Math.max(peak, y);
    }
    assert.equal(y, 0); assert.equal(peak, road.height);
    assert.ok(flyoverHeight(road, road.start + .1) < .00003, 'smooth ramp toe');
  }
});

test('four-wheel car support follows both complete flyovers without jumping level or striking a collider', () => {
  const index = new SpatialIndex(allColliders);
  for (const road of FLYOVERS) for (const direction of [-1, 1]) {
    let car = { ...point(road, direction === 1 ? road.start - 3 : road.end + 3, 2.8), y: 0,
      yaw: (road.axis === 'z' ? 0 : Math.PI / 2) + (direction === 1 ? 0 : Math.PI) };
    for (let distance = 0; distance <= road.end - road.start + 6; distance += .5) {
      const along = (direction === 1 ? road.start - 3 : road.end + 3) + direction * distance;
      car = { ...car, ...point(road, along, 2.8) };
      // All footprint samples must choose the level from the same previous
      // body pose, including the analytic tire clearance correction samples.
      const ground = (x, z) => infrastructureGroundHeightAt(x, z, car.y) ?? 0;
      const support = vehicleGroundSupport(car, ground);
      assert.ok(Math.abs(support.y - car.y) < .064, `${road.id}: tire support snapped`);
      assert.ok(Math.abs(support.pitch) < .12, `${road.id}: unreasonable grade`);
      Object.assign(car, support);
      const contacts = vehicleContacts(car, { index, bounds: 1450, supportAt: pose => vehicleGroundSupport(pose, ground) });
      assert.equal(contacts.length, 0, `${road.id}: car hit ${contacts[0]?.obstacle.id}`);
    }
    assert.ok(Math.abs(car.y) < .002);
  }
});

test('rendered carriageway tops agree with the analytical support profile to one centimetre', () => {
  const matrix = new THREE.Matrix4(), normal = new THREE.Vector3(), top = new THREE.Vector3();
  for (const road of FLYOVERS) {
    const group = infrastructure.root.children.find(c => c.name === road.name);
    const asphalt = group.children.find(c => c.isInstancedMesh && c.name.endsWith(' · asphalt'));
    assert.ok(asphalt);
    for (let i = 0; i < asphalt.count; i++) {
      asphalt.getMatrixAt(i, matrix); top.set(0, .5, 0).applyMatrix4(matrix);
      normal.set(0, 1, 0).transformDirection(matrix);
      const along = road.axis === 'z' ? top.z : top.x;
      assert.ok(Math.abs(top.y - flyoverHeight(road, along)) < .011, `deck/support gap at ${road.id} ${along}`);
      assert.ok(normal.y > .993);
    }
  }
});

test('cross-streets retain a clear path below the flyovers and bridge piers remain outside carriageways', () => {
  for (const road of FLYOVERS) {
    const crossings = road.axis === 'z' ? METROPOLIS_ROADS.horizontal : METROPOLIS_ROADS.vertical;
    for (const cross of crossings.filter(t => t > road.start + road.ramp && t < road.end - road.ramp)) {
      for (let offset = -25; offset <= 25; offset += .5) {
        const p = point(road, cross, offset);
        assert.equal(infrastructureGroundHeightAt(p.x, p.z, 0), null);
        assert.equal(blocked(p.x, p.z).length, 0, `${road.id}: underpass blocked`);
      }
    }
  }
  for (const pier of infrastructure.colliders.filter(c => c.kind === 'flyover-pier')) {
    for (const x of METROPOLIS_ROADS.vertical) assert.ok(Math.abs(pier.x - x) > 13 + pier.hx ||
      METROPOLIS_ROADS.horizontal.every(z => Math.abs(pier.z - z) > 21), 'pier placed in junction');
  }
});

test('freight access rises continuously over the original seawall and reaches a real clear deck', () => {
  const p = FREIGHT_PORT, r = p.ramp; let y = 0;
  for (let z = r.start; z <= -320; z += .1) {
    const next = infrastructureGroundHeightAt(r.x, z, y);
    assert.notEqual(next, null, `no freight support at ${z}`);
    assert.ok(Math.abs(next - y) < .02);
    assert.equal(blocked(r.x, z, next).length, 0, `port entrance blocked at ${z}`);
    y = next;
  }
  assert.equal(y, p.y);
  assert.equal(infrastructureGroundHeightAt(p.x, p.z, 0), null);
  assert.ok(infrastructureGroundHeightAt(r.x, -389, p.y) > 2, 'deck must clear existing 2m seawall');
});

test('station additions preserve every building entrance, transit entrance and ferry passage', () => {
  for (const b of METROPOLIS_BUILDINGS) for (const dz of [-4, -2, 0, 5, 9])
    assert.equal(blocked(b.entrance.x, b.entrance.z + dz, 0, infrastructure.colliders).length, 0, b.id);
  for (const stop of TRANSIT_STOPS) for (const dz of [-3, 0, 3.5])
    assert.equal(blocked(stop.entrance.x, stop.entrance.z + dz, 0, infrastructure.colliders).length, 0, stop.id);
  for (let z = -409; z <= -399; z += .1) assert.equal(blocked(-160, z, 0, infrastructure.colliders).length, 0);
  const ferry = TRANSIT_ROUTES.find(r => r.id === 'ferry');
  for (const n of ferry.nodes) assert.equal(infrastructure.colliders.some(c => c.physics !== false &&
    Math.abs(c.x - n.x) < c.hx + 5 && Math.abs(c.z - n.z) < c.hz + 10), false, 'freight structure obstructs ferry');
});

test('district culling hides distant detail while keeping local geometry and permanent collisions', () => {
  const before = infrastructure.colliders.length;
  infrastructure.update({ x: -540, z: -345 });
  const port = infrastructure.root.children.find(c => c.name === FREIGHT_PORT.name);
  assert.equal(port.visible, true);
  assert.ok(port.children.some(c => c.name.includes('nearby') && c.visible));
  infrastructure.update({ x: 1000, z: 1000 });
  assert.equal(port.visible, false);
  assert.equal(infrastructure.colliders.length, before);
  assert.ok(infrastructure.metadata.instanceCount > 4000);
  assert.ok(infrastructure.metadata.batchCount < 160);
  infrastructure.update({ x: -540, z: -345 });
});

test.after(() => { north.dispose(); infrastructure.dispose(); });
