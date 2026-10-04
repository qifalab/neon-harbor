import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';
import { createCityExploration } from '../src/city-exploration.js';
import { createInteriorLayout } from '../src/metropolis-interiors.js';
import { GameSimulation, loadProgress } from '../src/simulation.js';
import { validPose, ROOM_WORLD } from '../src/multiplayer-protocol.js';
import { circleOBB, CHARACTER_RADIUS } from '../src/collision.js';

const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
const sim = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt });
city.bind(sim);
const blocked = p => city.colliders.filter(c => c.physics !== false && c.maxY > p.y + .2 && c.minY < p.y + 1.8 && circleOBB({ ...p, radius: CHARACTER_RADIUS }, c));

test('every address targets its own entrance and safely restores its exterior, traffic and save position', async () => {
  assert.equal(city.buildings.length, 220);
  assert.equal(city.buildings.filter(b => b.compact).length, 96);
  assert.equal(city.buildings.filter(b => b.district === 'east-expansion').length, 76);
  assert.equal(new Set(city.buildings.map(b => b.id)).size, 220);
  const cars = sim.cars.length;
  for (const b of city.buildings) {
    await city.travelTo(b);
    assert.equal(city.getPrompt()?.buildingId, b.id, `${b.id}: wrong entrance target`);
    assert.equal(blocked({ ...b.entrance, y: sim.player.groundY }).length, 0, `${b.id}: obstructed entrance`);
    assert.ok(city.interact().handled);
    assert.equal(city.interiors.state.buildingId, b.id);
    assert.equal(sim.cars.length, 0);
    const stored = loadProgress(city.safeSave(), { bounds: city.bounds });
    assert.equal(stored.player.x, b.entrance.x, `${b.id}: save bounds clipped address`);
    assert.equal(stored.player.z, b.entrance.z);
    const exterior = city.snapshot().exterior;
    assert.equal(exterior.southInteriorId, b.compact ? b.shellId : null);
    assert.equal(exterior.harborInteriorId, b.district === 'east-expansion' ? b.shellId : null);
    // Inspect actual GPU instance transforms, not just a state flag.
    const inspect = (root, id, hidden) => root.traverse(mesh => {
      if (!mesh.isInstancedMesh || !mesh.userData.buildings) return;
      mesh.userData.buildings.forEach((member, i) => {
        if (member !== id) return;
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix);
        assert.equal(matrix.determinant() === 0, hidden, `${b.id}: incorrect shell matrix`);
      });
    });
    if (b.shellId) inspect(b.compact ? city.south.root : city.harbor.root, b.shellId, true);
    const exit = city.interiors.exit(); city.applyTransition(exit);
    assert.equal(city.interiors.state.buildingId, null);
    assert.equal(sim.cars.length, cars);
    assert.equal(blocked({ x: sim.player.x, z: sim.player.z, y: sim.player.groundY }).length, 0, `${b.id}: obstructed exit`);
    if (b.shellId) inspect(b.compact ? city.south.root : city.harbor.root, b.shellId, false);
  }
});

test('every occupied floor has finite positive solids, rooms inside its footprint, a clear arrival and continuous stair elevations', () => {
  let floors = 0;
  for (const b of city.buildings) for (const [i, floor] of b.floors.entries()) {
    const layout = createInteriorLayout(b, floor); floors++;
    assert.equal(layout.rooms.length, b.compact ? 2 : 4, `${b.id}/${floor.id}`);
    for (const p of layout.parts) assert.ok([p.x,p.y,p.z,p.sx,p.sy,p.sz].every(Number.isFinite) && Math.min(p.sx,p.sy,p.sz) > 0, `${p.id}: malformed solid`);
    for (const r of layout.rooms) {
      assert.ok(r.bounds.minX >= b.x - b.width / 2 && r.bounds.maxX <= b.x + b.width / 2, `${r.id}: room outside shell width`);
      assert.ok(r.bounds.minZ >= b.z - b.depth / 2 && r.bounds.maxZ <= b.z + b.depth / 2, `${r.id}: room outside shell depth`);
    }
    if (i < b.floors.length - 1) {
      const flight = layout.stairs.find(f => f.fromFloorId === floor.id);
      assert.equal(flight.toY, b.floors[i + 1].y);
      assert.ok(flight.rise >= 3.7 && flight.rise <= 7, `${b.id}: storey headroom`);
    }
  }
  assert.equal(floors, 4150);
});

test('multiplayer accepts the actual eastern top floors and rejects out-of-world or nonfinite positions', () => {
  assert.equal(ROOM_WORLD, 'neon-harbor-v08');
  for (const b of city.buildings) assert.ok(validPose({ x: b.x, y: b.floors.at(-1).y + 1.8, z: b.z, yaw: Math.PI }), b.id);
  assert.ok(validPose({ x: 1800, y: 460, z: -1800, yaw: 0 }));
  for (const pose of [{ x: 1800.01, y: 0, z: 0 }, { x: 0, y: 460.01, z: 0 }, { x: 0, y: NaN, z: 0 }, { x: 0, y: 0, z: Infinity }]) assert.ok(!validPose({ ...pose, yaw: 0 }));
});


test('a south shell stays hidden through an actual streamed load and restores valid culling bounds and fallback scenery on exit', async () => {
  const originalFetch = globalThis.fetch;
  const payloads = new Map(city.south.exportCity().payloads.map(chunk => [chunk.id, chunk]));
  globalThis.fetch = async url => {
    const id = new URL(url).pathname.split('/').at(-1).replace('.json', '');
    return new Response(JSON.stringify(payloads.get(id)), { status: payloads.has(id) ? 200 : 404 });
  };
  try {
    const south = createWorld(THREE, new THREE.Scene(), { streaming: true, openNorth: true });
    const b = city.buildings.find(b => b.compact), matrix = new THREE.Matrix4();
    south.setInteriorBuilding(b.id);
    assert.equal((await south.prepare(b.entrance)).ready, true);
    let checked = 0;
    south.root.traverse(mesh => {
      if (!mesh.isInstancedMesh || !mesh.userData.buildings?.includes(b.id)) return;
      mesh.userData.buildings.forEach((id, i) => {
        if (id !== b.id) return;
        mesh.getMatrixAt(i, matrix); assert.equal(matrix.determinant(), 0);
        const t = mesh.userData.originalTransforms[i];
        assert.ok(mesh.boundingSphere.containsPoint(new THREE.Vector3(t[0], t[1], t[2])), 'future restored shell must retain its original culling envelope'); checked++;
      });
    });
    assert.ok(checked > 30, 'real detailed shell was fetched and hidden');
    south.setInteriorBuilding(null);
    south.root.traverse(mesh => {
      if (!mesh.isInstancedMesh || !mesh.userData.buildings?.includes(b.id)) return;
      mesh.userData.buildings.forEach((id, i) => { if (id === b.id) { mesh.getMatrixAt(i, matrix); assert.notEqual(matrix.determinant(), 0); } });
    });
    for (let i = 0; i < 8; i++) south.streamAt({ x: 1400, z: -800 }, { x: 0, z: 0 }, 1);
    const proxy = south.root.getObjectByName('Distant city silhouette');
    let visible = 0;
    for (let i = 0; i < proxy.count; i++) { proxy.getMatrixAt(i, matrix); if (matrix.determinant() !== 0) visible++; }
    assert.equal(visible, proxy.count, 'unloaded distant street furniture and shells remain represented');
  } finally { globalThis.fetch = originalFetch; }
});
