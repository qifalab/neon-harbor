import { writeFile } from 'node:fs/promises';
import * as THREE from '/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/native-validation-2026-10-04/frozen-source/vendor/three/three.module.js';
import { createCityExploration } from '/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/native-validation-2026-10-04/frozen-source/src/city-exploration.js';
import { createInteriorLayout, createInteriorSystem } from '/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/native-validation-2026-10-04/frozen-source/src/metropolis-interiors.js';
import { createHarborRoomDressing } from '/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/native-validation-2026-10-04/frozen-source/src/harbor-room-dressing.js';
import { HARBOR_FRONTAGES } from '/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/native-validation-2026-10-04/frozen-source/src/harbor-district.js';
const city = createCityExploration(THREE, new THREE.Scene(), { quality: 'low', streaming: true });
const building = city.buildings.find(item => item.id === 'south-086');
const dressing = createHarborRoomDressing(THREE, { building, floor: building.floors[0], layout: createInteriorLayout(building, building.floors[0]) });
const scene = new THREE.Scene();
const system = createInteriorSystem(THREE, scene, { buildings: city.buildings });
const records = [];
for (let cycle = 0; cycle < 4; cycle++) {
  system.enter(building.id);
  const geometries = new Map();
  system.root.traverse(object => { if (object.geometry) geometries.set(object.geometry.uuid, { type: object.geometry.type, references: 1 + (geometries.get(object.geometry.uuid)?.references || 0) }); });
  records.push({ cycle, geometryObjects: geometries.size, geometryUUIDs: [...geometries.keys()].sort(), geometryDetails: [...geometries], pilotEnabled: system.snapshot().workshopPilot.enabled });
  system.exit();
}
const result = { scope: 'CPU scene reference enumeration from immutable first-failure served source; no renderer/browser/GPU/fetch/formal tests',
  address: building.id, dressing: dressing.snapshot(), dressingMeshes: dressing.group.children.length,
  frontageAddresses: HARBOR_FRONTAGES.map(item => item.shellId), records,
  sameGeometryReferencesAllCycles: records.slice(1).every(item => JSON.stringify(item.geometryUUIDs) === JSON.stringify(records[0].geometryUUIDs)),
  limitation: 'No document means Canvas signs are not created and GLB loading is disabled. The native source signGeometry is a single system-scoped shared PlaneGeometry. This probe does not enumerate GPU-registered geometry UUIDs.' };
system.dispose(); dressing.dispose(); city.dispose?.();
await writeFile('/tmp/neon-art-native-fail-interior-geometry-proof.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ dressing: result.dressing, geometryObjects: records.map(item => item.geometryObjects), pilotEnabled: records.map(item => item.pilotEnabled), sameGeometryReferencesAllCycles: result.sameGeometryReferencesAllCycles, limitation: result.limitation }));
