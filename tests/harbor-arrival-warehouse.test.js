import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';
import { createHarborDistrict, HARBOR_FRONTAGES } from '../src/harbor-district.js';
import { createArrivalWarehouseOwner, createArrivalCanopyGeometry, ARRIVAL_WAREHOUSE_LIMITS } from '../src/harbor-arrival-warehouse.js';
import { GameSimulation } from '../src/simulation.js';
import { circleOBB } from '../src/collision.js';

const world = createWorld(THREE, new THREE.Scene(), { streaming: false, openNorth: true });
const warehouse = world.buildings.find(b => b.id === 'south-085');
const make = () => createArrivalWarehouseOwner(THREE, new THREE.Group(), { buildings: world.buildings });

test('the authored arrival owner fits the actual warehouse and adds only high supported obstacles', () => {
  assert.deepEqual([warehouse.x, warehouse.z, warehouse.width, warehouse.depth, warehouse.baseY], [200, -193, 42, 29, .18]);
  const owner = make(); assert.equal(owner.colliders.length, 16);
  for (const c of owner.colliders) {
    assert.equal(c.buildingId, 'south-085'); assert.equal(c.physics, true); assert.equal(c.camera, true);
    assert.ok(c.minY >= warehouse.baseY + 3.4); assert.ok(c.maxY > c.minY);
    assert.ok(c.x + c.hx < 196 || c.x - c.hx > 204, 'central doorway is fully clear');
    assert.ok(c.z + c.hz < -171 && c.x + c.hx < 229 && c.x - c.hx > 171, 'all rain-shelter volumes stay off road bands');
    for (const x of [c.x - c.hx, c.x, c.x + c.hx]) for (const z of [c.z - c.hz, c.z, c.z + c.hz]) assert.equal(world.groundHeightAt(x, z), .18, 'original metre-accurate sidewalk is unchanged');
  }
  // The actual folded front return is centered at out=1.8 m and 45 mm
  // thick, so its foremost face is 1.8225 m, beyond the sheet's 1.8 m edge.
  // Each final curve piece must contain that physical face, not just the roof.
  for (const bay of [-12.4, 14]) {
    const edge = owner.colliders.find(c => c.id === `south-085-arrival-canopy-${bay}-5`);
    assert.ok(edge.z + edge.hz >= -178.5 + 1.8225, 'front folded edge is fully enclosed by permanent collision');
  }
  // The existing north-facing portal, approach and bus boarding path remain
  // untouched; tall volumes cannot be mistaken for ground-level furniture.
  for (const p of [{ x: 200, z: -178.42 }, { x: 200, z: -175.5 }, { x: 196.26, z: -172.275 }]) {
    assert.ok(!owner.colliders.some(c => c.minY < .18 + 1.8 && circleOBB({ ...p, radius: .65 }, c)));
  }
  owner.dispose();
});

test('curved canopy is a closed thin sheet with outward top and underside normals', () => {
  const geometry = createArrivalCanopyGeometry(THREE), p = geometry.getAttribute('position'), n = geometry.getAttribute('normal');
  assert.ok(p.count > 300); assert.ok(geometry.boundingBox.max.y - geometry.boundingBox.min.y > .30);
  assert.equal(geometry.boundingBox.min.y, Math.fround(3.615));
  // First top and underside faces are respectively outward up and down.
  assert.ok(n.getY(0) > .9); assert.ok(n.getY(6) < -.9);
  for (const key of ['position', 'normal']) for (const value of geometry.getAttribute(key).array) assert.ok(Number.isFinite(value));
  geometry.dispose();
});

test('actual ordinary jump stays below every new canopy and brace collider', () => {
  const owner = make(); const sim = new GameSimulation({ colliders: owner.colliders, bounds: 290, groundHeightAt: world.groundHeightAt });
  sim.player.x = 188; sim.player.z = -177.5; sim.player.groundY = .18; sim.player.y = 0; sim.player.vy = 0;
  let highestHead = .18 + 1.8;
  for (let i = 0; i < 180; i++) { sim.update(1 / 120, { jump: i === 0 }); highestHead = Math.max(highestHead, sim.player.groundY + sim.player.y + 1.8); }
  assert.ok(highestHead > 3.2 && highestHead < 3.32, 'real normal jump, rather than a grounded mock');
  assert.ok(Math.min(...owner.colliders.map(c => c.minY)) - highestHead > .30);
  owner.dispose();
});

test('warehouse detail obeys hysteresis, shell visibility, budget and real resource disposal', () => {
  const parent = new THREE.Group(), owner = createArrivalWarehouseOwner(THREE, parent, { buildings: world.buildings });
  owner.update({ x: 200, z: -177 }); let state = owner.snapshot();
  assert.equal(state.resident, true); assert.equal(state.quality, 'high'); assert.ok(state.drawCalls <= ARRIVAL_WAREHOUSE_LIMITS.maxDrawCalls);
  assert.ok(state.triangles <= ARRIVAL_WAREHOUSE_LIMITS.maxTriangles); assert.ok(state.ownedTextures <= 2);
  let geometryDisposals = 0, materialDisposals = 0; const group = parent.children[0];
  group.traverse(m => { if (!m.isMesh) return; m.geometry.addEventListener('dispose', () => geometryDisposals++); m.material.addEventListener('dispose', () => materialDisposals++);
    assert.ok(m.geometry.boundingSphere.radius > 0); for (const key of ['position', 'normal', 'uv']) for (const value of m.geometry.getAttribute(key).array) assert.ok(Number.isFinite(value)); });
  owner.setInteriorBuilding('south-085'); assert.equal(group.visible, false);
  owner.setInteriorBuilding(null); assert.equal(group.visible, true);
  owner.update({ x: 200, z: -178.5 + 83 }); assert.equal(owner.snapshot().resident, true);
  owner.update({ x: 200, z: -178.5 + 97 }); assert.equal(owner.snapshot().resident, false);
  assert.equal(parent.children.length, 0); assert.equal(geometryDisposals, state.drawCalls); assert.equal(materialDisposals, state.drawCalls);
  assert.equal(owner.colliders.length, 16, 'visual unloading preserves permanent collision');
  owner.update({ x: 200, z: -178.5 + 83 }); assert.equal(owner.snapshot().resident, false);
  owner.setInteriorBuilding('south-085'); owner.update({ x: 200, z: -178 }); assert.equal(owner.snapshot().visible, false);
  owner.setQuality('balanced'); parent.traverse(m => { if (m.isMesh) assert.equal(m.castShadow, false); });
  owner.setQuality('high'); parent.traverse(m => { if (m.isMesh) assert.equal(m.castShadow, true); });
  owner.dispose(); assert.equal(parent.children.length, 0); owner.update({ x: 200, z: -178 }); assert.equal(owner.snapshot().resident, false);
});

test('the six real shopfronts keep their IDs while warehouse shell hiding and collision are integrated', () => {
  assert.equal(HARBOR_FRONTAGES.length, 6);
  const district = createHarborDistrict(THREE, new THREE.Scene(), { buildings: world.buildings, groundHeightAt: world.groundHeightAt });
  district.update({ x: 200, z: -175.5 }); assert.equal(district.snapshot().arrivalWarehouse.resident, true);
  assert.equal(district.snapshot().frontages.length, 6); assert.equal(district.colliders.filter(c => c.kind === 'harbor-arrival-canopy').length, 16);
  district.setInteriorBuilding('south-085'); assert.equal(district.snapshot().arrivalWarehouse.visible, false);
  district.setInteriorBuilding(null); assert.equal(district.snapshot().arrivalWarehouse.visible, true); district.dispose(); assert.equal(district.root.parent, null);
});
