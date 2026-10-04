import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { HARBOR_COAST, harborCoastX, harborTerrainGroundHeightAt } from '../src/harbor-terrain.js';
import { createHarborSkyline } from '../src/harbor-skyline.js';
import { multiplayerGroundHeightAt } from '../tools/multiplayer-server.mjs';
import { vehicleGroundSupport } from '../src/ground-support.js';

test('shared shore support ends at the visible coastline and preserves water outside it', () => {
  for (const z of [-1320, -1140, -1018.2, -400, 100, 730, 905]) {
    const edge = harborCoastX(z);
    assert.equal(harborTerrainGroundHeightAt(edge + .001, z), 3.75);
    assert.equal(harborTerrainGroundHeightAt(edge - .001, z), null);
  }
  assert.equal(harborTerrainGroundHeightAt(1200, HARBOR_COAST[0].z - .01), null);
  assert.equal(harborTerrainGroundHeightAt(1200, HARBOR_COAST.at(-1).z + .01), null);
  for (const [x, z] of [[900, -400], [1200, 1200], [2290, -400], [1800, 1180]]) {
    assert.equal(harborTerrainGroundHeightAt(x, z), null);
    assert.equal(multiplayerGroundHeightAt(x, z), 0);
  }
  assert.equal(harborTerrainGroundHeightAt(NaN, 0), null);
});

test('client and multiplayer server support match raycast triangles on both sides of ridge diagonals', () => {
  const harbor = createHarborSkyline(THREE, new THREE.Scene());
  try {
    const terrain = harbor.root.children.filter(mesh => ['East Bay · walkable shore', 'Continuous eastern mountain ridge'].includes(mesh.name));
    assert.equal(terrain.find(mesh => mesh.name === 'East Bay · walkable shore').receiveShadow, true);
    harbor.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
    const renderedHeight = (x, z) => {
      ray.ray.origin.set(x, 1000, z);
      const hit = ray.intersectObjects(terrain, false)[0];
      assert.ok(hit, `rendered terrain missing at ${x}, ${z}`);
      return hit.point.y;
    };
    // Include shore/ridge overlap, both diagonal halves, the x1670 seam and
    // mountain triangles extending beyond the flat shore's z limits.
    for (const z of [-1490, -1200, -401.7, 750, 1040]) for (const x of [1670, 1675.3, 1699, 1705.8, 1750, 1799.5]) {
      const expected = renderedHeight(x, z);
      assert.ok(Math.abs(harbor.groundHeightAt(x, z) - expected) < .0005);
      assert.ok(Math.abs(multiplayerGroundHeightAt(x, z, expected) - expected) < .0005,
        `server drops below visible ridge at ${x}, ${z}`);
    }
    for (const pose of [{ x: 1192, z: -193, yaw: 0 }, { x: 1710, z: -401.7, yaw: .3 }]) {
      const expected = vehicleGroundSupport(pose, renderedHeight);
      const actual = vehicleGroundSupport(pose, multiplayerGroundHeightAt);
      for (const key of ['y', 'pitch', 'roll']) assert.ok(Math.abs(actual[key] - expected[key]) < .0005,
        `server vehicle ${key} differs from rendered wheel support`);
      assert.ok(actual.y >= 3.75);
    }
  } finally { harbor.dispose(); }
});

test('multiplayer support retains reachable infrastructure decks and the road beneath an underpass', () => {
  assert.equal(multiplayerGroundHeightAt(-480, -850, 8), 8);
  assert.equal(multiplayerGroundHeightAt(-480, -850, 0), 0);
  assert.equal(multiplayerGroundHeightAt(-540, -345, 2.4), 2.4);
  assert.equal(multiplayerGroundHeightAt(1192, -193, 3.75), 3.75);
  assert.ok(multiplayerGroundHeightAt(1750, -400, 3.75) > 50);
});
