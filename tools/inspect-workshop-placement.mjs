import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';
import { expansionBuilding } from '../src/expansion-programmes.js';
import { createInteriorLayout, createInteriorSystem } from '../src/metropolis-interiors.js';
import { createHarborWorkshopPilot } from '../src/harbor-workshop-pilot.js';
import { parseWorkshopAssetCPU } from './inspect-workshop-assets.mjs';

const world = createWorld(THREE, new THREE.Scene(), { streaming: true });
const building = expansionBuilding(world.buildings[85], 'south', 85), floor = building.floors[0];
const layout = createInteriorLayout(building, floor);
const pilot = createHarborWorkshopPilot(THREE, { building, floor, layout, enabled: true,
  loadAsset: async id => parseWorkshopAssetCPU(await readFile(new URL(`../assets/harbor/workshop/${id}.glb`, import.meta.url))) });
pilot.update(pilot.plan.centre); await pilot.whenSettled();
const snapshot = pilot.snapshot();
if (snapshot.status !== 'ready') throw new Error(JSON.stringify(snapshot.errors));
const system = createInteriorSystem(THREE, new THREE.Scene(), { buildings: [building] });
system.enter(building.id);
const context = system.collisionContext(), original = new Map(layout.colliders.map(collider => [collider.id, collider]));
const preserve = layout.colliders.every(collider => JSON.stringify(context.colliders.find(item => item.id === collider.id)) === JSON.stringify(collider));
const manifest = JSON.parse(await readFile(new URL('../assets/harbor/workshop/asset-manifest.json', import.meta.url), 'utf8'));
const evidence = { kind: 'CPU-only placement, no browser, renderer, JPEG decode or visual judgement', threeRevision: THREE.REVISION,
  building: { id: building.id, x: building.x, z: building.z, width: building.width, depth: building.depth },
  floor: { id: floor.id, y: floor.y }, room: layout.rooms.find(item => item.type === 'workshop'),
  originalCollidersUnchanged: preserve, originalFloorColliderCount: original.size,
  addedCollider: pilot.colliders[0], placements: snapshot.placementPlan.placements, worldAABBs: snapshot.bounds,
  modelBudget: { triangles: 16224, potentialMainColourDrawCalls: 11, uniqueMaterials: 2,
    uniqueEmbeddedTextures: 6, runtimeGlbBytes: manifest.runtimeBytes,
    estimatedRgbaMipTextureBytes: 6 * 1024 * 1024 * 4 * 4 / 3,
    note: 'Texture estimate excludes geometry, shadow/AO buffers, driver/decode overhead; total GPU budget unmeasured' },
  sourceHashes: manifest.models.map(item => ({ id: item.id, glbSha256: item.output.sha256 })),
  rootStructuralCollisionHash: createHash('sha256').update(JSON.stringify(layout.colliders)).digest('hex') };
await writeFile(new URL('../docs/qa/art-pilot/placement-evidence.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
pilot.dispose(); system.dispose();
console.log(JSON.stringify({ originalCollidersUnchanged: preserve, worldAABBs: snapshot.bounds, budget: evidence.modelBudget }, null, 2));
