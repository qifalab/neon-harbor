import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld, createCar, createCharacter } from '../src/world.js';
import { ROAD_CENTERS, VEHICLE_DIMENSIONS, PLAYER_DIMENSIONS } from '../src/world-config.js';

const world = createWorld(THREE, new THREE.Scene(), { quality: 'balanced' });
world.root.updateMatrixWorld(true);
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 2e-5, `${message}: ${actual} != ${expected}`);

test('asphalt surfaces tile the real road grid at one height without overlapping intersections', () => {
  for (const road of world.roadSurfaces) near(road.y, 0, road.id);
  for (const [i, a] of world.roadSurfaces.entries()) for (const b of world.roadSurfaces.slice(i + 1)) {
    const ox = a.hx + b.hx - Math.abs(a.x - b.x), oz = a.hz + b.hz - Math.abs(a.z - b.z);
    assert.ok(ox <= 1e-8 || oz <= 1e-8, `${a.id} overlaps ${b.id}`);
  }
  for (const road of ROAD_CENTERS) for (let p = -270; p <= 270; p += 5) {
    near(world.groundHeightAt(road, p), 0, `vertical road ${road}/${p}`);
    near(world.groundHeightAt(p, road), 0, `horizontal road ${p}/${road}`);
  }
});

test('ground-height query agrees with rendered triangles at ramps, pavement, park paths and promenade', () => {
  const ray = new THREE.Raycaster();
  const groundMeshes = world.root.children.filter(n => n.userData.batchId?.startsWith('surface-') || n.userData.batchId === 'box:sand');
  const points = [
    [0, 0], [8, 174], [-280, 0], [265, 30], [40, 120], [40, 40],
    [11.3, 40], [11.4, 40], [11.7, 40], [12, 40], [12.2, 40], [15, 40],
    [11.5, 11.5], [11.8, 11.6], [12, 11.8],
    [96.5, -120], [96.7, -120], [97, -120], [100, -120], [120, -120],
    [120, -97], [120, -96.5], [117.5, -120], [117.7, -120],
    [273, 0], [273.2, 0], [273.5, 0], [274, 0], [282, 0],
  ];
  for (const [x, z] of points) {
    ray.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(groundMeshes, false)[0];
    assert.ok(hit, `rendered ground missing at ${x}/${z}`);
    near(world.groundHeightAt(x, z), hit.point.y, `ground at ${x}/${z}`);
  }
});

test('all registered obstacles have finite height and cover their actual instance geometry', () => {
  const ids = new Set();
  const byId = new Map(world.colliders.map(c => [c.id, c]));
  const batches = new Map(world.root.children.filter(n => n.isInstancedMesh).map(n => [n.userData.batchId, n]));
  const matrix = new THREE.Matrix4();
  for (const c of world.colliders) {
    assert.ok(!ids.has(c.id), `duplicate ${c.id}`); ids.add(c.id);
    assert.ok([c.x, c.z, c.hx, c.hz, c.minY, c.maxY].every(Number.isFinite), c.id);
    assert.ok(c.hx > 0 && c.hz > 0 && c.maxY > c.minY, c.id);
  }
  for (const part of world.renderObstacles) {
    const collider = byId.get(part.colliderId), mesh = batches.get(part.batch);
    assert.ok(collider && mesh, part.colliderId);
    mesh.geometry.computeBoundingBox(); mesh.getMatrixAt(part.index, matrix);
    const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(matrix);
    const eps = 3e-5;
    assert.ok(bounds.min.x >= collider.x - collider.hx - eps && bounds.max.x <= collider.x + collider.hx + eps, `${collider.id} X`);
    assert.ok(bounds.min.z >= collider.z - collider.hz - eps && bounds.max.z <= collider.z + collider.hz + eps, `${collider.id} Z`);
    assert.ok(bounds.min.y >= collider.minY - eps && bounds.max.y <= collider.maxY + eps, `${collider.id} Y`);
  }
  for (const kind of ['building', 'roof', 'canopy', 'lamp-arm', 'bench', 'railing', 'billboard', 'sculpture', 'boundary'])
    assert.ok(world.colliders.some(c => c.kind === kind), `missing ${kind}`);
  assert.ok(world.colliders.filter(c => c.kind === 'canopy').every(c => c.minY > PLAYER_DIMENSIONS.height), 'awnings must not block grounded people');
});

test('Node and browser texture paths emit identical physical and camera geometry', () => {
  const previous = globalThis.document;
  try {
    globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) };
    const texturedWorld = createWorld(THREE, new THREE.Scene());
    assert.deepEqual(texturedWorld.colliders, world.colliders);
    assert.deepEqual(texturedWorld.surfaces, world.surfaces);
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('shared vehicle and character dimensions enclose actual rendered geometry including mirrors and police lights', () => {
  for (const type of ['sport', 'sedan', 'police']) {
    const car = createCar(THREE, '#4ca5ac', type);
    const bounds = new THREE.Box3().setFromObject(car);
    assert.ok(bounds.min.x >= -VEHICLE_DIMENSIONS.halfWidth && bounds.max.x <= VEHICLE_DIMENSIONS.halfWidth, `${type} width`);
    assert.ok(bounds.min.z >= -VEHICLE_DIMENSIONS.halfLength && bounds.max.z <= VEHICLE_DIMENSIONS.halfLength, `${type} length`);
    assert.ok(bounds.max.y <= VEHICLE_DIMENSIONS.height, `${type} height`);
    near(bounds.min.y, 0, `${type} tyre ground contact`);
  }
  const character = new THREE.Box3().setFromObject(createCharacter(THREE));
  assert.ok(character.max.y <= PLAYER_DIMENSIONS.height);
  assert.ok(character.max.x <= PLAYER_DIMENSIONS.radius && character.min.x >= -PLAYER_DIMENSIONS.radius);
  near(character.min.y, 0.005, 'shoe clearance');
});

test('all decorative sidewalk routes remain clear of grounded obstacles and sample the real pavement', () => {
  for (const [index, route] of world.walkerRoutes.entries()) for (let edge = 0; edge < route.length; edge++) {
    const a = route[edge], b = route[(edge + 1) % route.length];
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    for (let t = 0; t <= distance; t += 0.5) {
      const x = a.x + (b.x - a.x) * t / distance, z = a.z + (b.z - a.z) * t / distance;
      const y = world.groundHeightAt(x, z);
      near(y, 0.18, `walker ${index} ground`);
      for (const c of world.colliders) {
        if (!c.physics || c.minY >= y + PLAYER_DIMENSIONS.height || c.maxY <= y) continue;
        const dx = Math.max(0, Math.abs(x - c.x) - c.hx), dz = Math.max(0, Math.abs(z - c.z) - c.hz);
        assert.ok(Math.hypot(dx, dz) >= PLAYER_DIMENSIONS.radius, `walker ${index} intersects ${c.id}`);
      }
    }
  }
});
