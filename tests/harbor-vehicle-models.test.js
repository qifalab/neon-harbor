import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createHarborVehicle, createHarborVehicleLayout, harborVehicleSupportHeight, HARBOR_VEHICLE_SPECS } from '../src/harbor-vehicle-models.js';

const kinds = ['bus', 'tram', 'ferry'];
const nearModels = new Map(kinds.map(kind => [kind, createHarborVehicle(THREE, kind)]));
const meshes = root => { const nodes = []; root.traverse(node => { if (node.isMesh) nodes.push(node); }); return nodes; };

function blockerHits(layout, point, deckId) {
  return layout.blockers.filter(b => b.deckId === deckId && b.minY < point.y + layout.passengerHeight && b.maxY > point.y + .15 &&
    Math.hypot(Math.max(b.minX - point.x, 0, point.x - b.maxX), Math.max(b.minZ - point.z, 0, point.z - b.maxZ)) < layout.passengerRadius - .006);
}

function sampleSegment(a, b, fn, count = 32) {
  for (let i = 0; i <= count; i++) {
    const t = i / count; fn({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  }
}

test('harbor assets have finite geometry and actual closed/open bounds inside their metre envelopes', () => {
  for (const [kind, vehicle] of nearModels) {
    const spec = HARBOR_VEHICLE_SPECS[kind], levels = vehicle.userData.lod.levels;
    for (const openness of [0, .5, 1]) {
      vehicle.userData.setDoorOpenness(openness);
      for (const level of levels) {
        for (const mesh of meshes(level.object)) for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
          assert.ok([...attribute.array].every(Number.isFinite), `${kind} ${name} finite`);
        }
        const bounds = new THREE.Box3().setFromObject(level.object), tolerance = 2e-6;
        assert.ok(bounds.min.x >= -spec.halfWidth - tolerance && bounds.max.x <= spec.halfWidth + tolerance, `${kind} width`);
        assert.ok(bounds.min.z >= -spec.halfLength - tolerance && bounds.max.z <= spec.halfLength + tolerance, `${kind} length`);
        assert.ok(bounds.min.y >= spec.minY - tolerance && bounds.max.y <= spec.maxY + tolerance, `${kind} height`);
        const size = bounds.getSize(new THREE.Vector3());
        assert.ok(size.x > spec.width * .94 && size.z > spec.length * .98 && size.y > spec.height * .96, `${kind} actual proportions`);
      }
    }
  }
});

test('both decks, all portals and stair landings remain reachable by the declared passenger capsule', () => {
  for (const kind of kinds) {
    const layout = createHarborVehicleLayout(kind), stair = layout.stairs[0];
    assert.equal(layout.decks.length, 2);
    assert.ok(layout.decks.every(deck => deck.headroom >= layout.passengerHeight));
    assert.ok(layout.passengerRadius * 2 < HARBOR_VEHICLE_SPECS[kind].clearAisleWidth);
    for (const path of layout.aislePaths) {
      sampleSegment(path.waypoints[0], path.waypoints[1], point => {
        assert.deepEqual(blockerHits(layout, point, path.deckId), [], `${kind} aisle ${path.deckId}`);
        assert.equal(harborVehicleSupportHeight(layout, point.x, point.z, path.deckId), point.y);
      });
    }
    for (const path of layout.doorApproaches) {
      for (let i = 0; i < path.waypoints.length - 1; i++) sampleSegment(path.waypoints[i], path.waypoints[i + 1], point => {
        assert.deepEqual(blockerHits(layout, point, 'lower'), [], `${kind} door ${path.id}`);
      });
    }
    assert.equal(stair.waypoints.length, 4, 'flat landings must be distinct from incline endpoints');
    for (const [point, deckId] of [[stair.bottom, 'lower'], [stair.top, 'upper']]) {
      assert.deepEqual(blockerHits(layout, point, deckId), [], `${kind} ${deckId} stair landing`);
      assert.equal(harborVehicleSupportHeight(layout, point.x, point.z, deckId), point.y);
      sampleSegment(point, { ...point, x: 0 }, p => assert.deepEqual(blockerHits(layout, p, deckId), [], `${kind} landing turn`));
    }
    sampleSegment(stair.waypoints[1], stair.waypoints[2], point => {
      const height = harborVehicleSupportHeight(layout, point.x, point.z, 'lower');
      assert.ok(Math.abs(height - point.y) < 1e-8, `${kind} continuous stair support`);
      assert.deepEqual(blockerHits(layout, point, 'lower'), [], `${kind} stair lower solids`);
      assert.deepEqual(blockerHits(layout, point, 'upper'), [], `${kind} stair upper solids`);
    });
  }
});

test('open doorway geometry clears a full body at both jambs, and closed leaves block passage', () => {
  for (const [kind, vehicle] of nearModels) {
    const model = vehicle.userData.lod.levels[0].object, layout = vehicle.userData.layout;
    vehicle.userData.setDoorsOpen(true); vehicle.updateMatrixWorld(true);
    for (const door of layout.doors) for (const dz of [-layout.passengerRadius, 0, layout.passengerRadius]) for (const dy of [.25, .95, 1.79]) {
      const start = new THREE.Vector3(door.outside.x, door.sillY + dy, door.z + dz), delta = new THREE.Vector3(0, start.y, start.z).sub(start);
      const ray = new THREE.Raycaster(start, delta.clone().normalize(), 0, delta.length());
      assert.equal(ray.intersectObject(model, true).length, 0, `${kind} portal ${door.id} body height ${dy}`);
    }
    vehicle.userData.setDoorsOpen(false); vehicle.updateMatrixWorld(true);
    for (const door of layout.doors) {
      const origin = new THREE.Vector3(door.outside.x, door.sillY + .95, door.z + .1);
      const ray = new THREE.Raycaster(origin, new THREE.Vector3(-door.side, 0, 0), 0, Math.abs(origin.x));
      assert.ok(ray.intersectObject(model, true).some(hit => hit.object.parent.parent?.name === door.id), `${kind} closed door leaf`);
    }
  }
});

test('actual stair mesh and ceilings leave standing headroom across the entire companionway', () => {
  for (const [kind, vehicle] of nearModels) {
    vehicle.updateMatrixWorld(true);
    const model = vehicle.userData.lod.levels[0].object, layout = vehicle.userData.layout, stair = layout.stairs[0];
    sampleSegment(stair.waypoints[1], stair.waypoints[2], point => {
      for (const dx of [-layout.passengerRadius, 0, layout.passengerRadius]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(point.x + dx, point.y + .30, point.z), new THREE.Vector3(0, 1, 0), 0, 1.49);
        assert.equal(ray.intersectObject(model, true).length, 0, `${kind} real stair headroom at ${point.z}`);
      }
    }, 36);
    // A downward ray must meet the actual thin treads, rather than metadata
    // that says stairs exist while the model contains a single invisible slab.
    for (let i = 0; i < stair.treadCount; i++) {
      const t = (i + .5) / stair.treadCount, z = stair.startZ + (stair.endZ - stair.startZ) * t;
      const expected = stair.fromY + stair.rise * (i + 1) / stair.treadCount;
      const ray = new THREE.Raycaster(new THREE.Vector3(stair.x, expected + .08, z), new THREE.Vector3(0, -1, 0), 0, .11);
      assert.ok(ray.intersectObject(model, true).some(hit => Math.abs(hit.point.y - expected) < .01), `${kind} visible tread ${i}`);
    }
  }
});

test('ferry support and side collision narrow with its bow rather than exposing square deck overhangs', () => {
  const layout = createHarborVehicleLayout('ferry');
  for (const deck of layout.decks) {
    assert.equal(harborVehicleSupportHeight(layout, 3, 11, deck.id), null);
    assert.equal(harborVehicleSupportHeight(layout, 0, 11, deck.id), deck.y);
    const rails = layout.blockers.filter(b => b.deckId === deck.id && b.kind === 'rail' && b.z > 10.5);
    assert.ok(rails.length >= 2 && rails.every(b => Math.abs(b.x) < 2.35));
  }
});

test('LOD budgets, original provenance and material response are explicit and lighting updates are instance-local', () => {
  for (const kind of kinds) {
    const vehicle = createHarborVehicle(THREE, kind), { manifest, lod } = vehicle.userData;
    assert.equal(lod.autoUpdate, false); assert.equal(manifest.lodCount, 3);
    assert.equal(manifest.provenance.realBrands, false); assert.deepEqual(manifest.provenance.externalAssets, []);
    assert.ok(manifest.tiers[0].triangles <= manifest.budget.nearTriangles);
    assert.ok(manifest.tiers[0].drawCalls <= manifest.budget.nearDrawCalls);
    assert.ok(manifest.tiers[1].triangles <= manifest.budget.middleTriangles);
    assert.ok(manifest.tiers[2].triangles <= manifest.budget.farTriangles);
    assert.ok(manifest.tiers[2].triangles < manifest.tiers[0].triangles * .12);
    const camera = new THREE.PerspectiveCamera(); camera.position.z = 350; camera.updateMatrixWorld(true);
    vehicle.userData.updateLOD(camera); assert.equal(lod.levels.findIndex(level => level.object.visible), 2);
    assert.ok(vehicle.userData.cabinLights.every(light => !light.visible), 'distant cabins do not add point-light loops');
    camera.position.z = 4; camera.updateMatrixWorld(true); vehicle.userData.updateLOD(camera);
    assert.equal(lod.levels.filter(level => level.object.visible).length, 1); assert.equal(lod.levels[0].object.visible, true);
    const near = meshes(lod.levels[0].object), material = name => near.find(mesh => mesh.material.name === name).material;
    assert.ok(material('harbor-metal').metalness > .8); assert.ok(material('harbor-upholstery').roughness > .8);
    assert.ok(material('harbor-glass').thickness > 0 && material('harbor-glass').opacity < .5);
    assert.equal(material('harbor-ivory').side, THREE.DoubleSide, 'interior roof must have an inward face');
    const peer = createHarborVehicle(THREE, kind); vehicle.userData.update(0, { night: 1, doorsOpen: true });
    assert.ok(material('harbor-cabin-light').emissiveIntensity > 1);
    assert.equal(peer.userData.night, 0); assert.equal(peer.userData.doorOpenness, 0);
    assert.ok(peer.userData.cabinLights.every(light => !light.visible), 'daytime point lights must be invisible, not merely intensity zero');
    assert.equal(vehicle.userData.cabinLights.length, 2);
    assert.ok(vehicle.userData.cabinLights.every(light => light.visible));
    camera.position.z = 30; camera.updateMatrixWorld(true); vehicle.userData.updateLOD(camera);
    assert.ok(vehicle.userData.cabinLights.every(light => !light.visible), 'night cabin lighting is restricted to nearby vehicles');
    vehicle.userData.setDetail(0); assert.ok(vehicle.userData.cabinLights.every(light => light.visible));
    vehicle.userData.setCabinLightingEnabled(false); assert.ok(vehicle.userData.cabinLights.every(light => !light.visible));
    vehicle.userData.setDetail(0); assert.ok(vehicle.userData.cabinLights.every(light => !light.visible), 'caller lighting override survives detail changes');
  }
});

test('instance disposal is idempotent and preserves shared geometry used by remaining vehicles and all LODs', () => {
  for (const kind of kinds) {
    const first = createHarborVehicle(THREE, kind), peer = createHarborVehicle(THREE, kind), before = meshes(first), after = meshes(peer);
    let geometryDisposals = 0, materialDisposals = 0;
    assert.equal(before.length, after.length);
    for (let i = 0; i < before.length; i++) {
      assert.equal(before[i].geometry, after[i].geometry); assert.notEqual(before[i].material, after[i].material);
      before[i].geometry.addEventListener('dispose', () => geometryDisposals++);
    }
    for (const material of first.userData.materials) material.addEventListener('dispose', () => materialDisposals++);
    first.userData.disposeInstance(); first.userData.disposeInstance();
    assert.equal(geometryDisposals, 0); assert.equal(materialDisposals, first.userData.materials.length);
    assert.equal(first.userData.disposed, true); assert.equal(peer.userData.disposed, undefined);
    peer.userData.setNight(1); assert.ok(peer.userData.materials.some(material => material.emissiveIntensity > 1));
  }
  assert.throws(() => createHarborVehicle(THREE, 'logo-replica'), RangeError);
});
