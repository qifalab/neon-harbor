import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '/workspace/scratch/neon-harbor-art-pilot/vendor/three/three.module.js';
import { createCityExploration } from '/workspace/scratch/neon-harbor-art-pilot/src/city-exploration.js';
import { createInteriorSystem } from '/workspace/scratch/neon-harbor-art-pilot/src/metropolis-interiors.js';
const city = createCityExploration(THREE, new THREE.Scene(), { quality: 'low', streaming: true });
const constructed = [], disposed = [], instancedDisposals = [];
const wrapped = new Map();
const observedThree = new Proxy(THREE, { get(target, key) {
  const value = Reflect.get(target, key);
  if (typeof value !== 'function' || !(String(key).endsWith('Geometry') || key === 'InstancedMesh')) return value;
  if (!wrapped.has(key)) wrapped.set(key, new Proxy(value, { construct(fn, args) {
    const object = Reflect.construct(fn, args);
    if (object.isBufferGeometry) {
      constructed.push({ id: object.id, uuid: object.uuid, type: object.type });
      object.addEventListener('dispose', () => disposed.push({ id: object.id, type: object.type }));
    } else if (object.isInstancedMesh) object.addEventListener('dispose', () => instancedDisposals.push(object.uuid));
    return object;
  } }));
  return wrapped.get(key);
} });
let loadCalls = 0;
const system = createInteriorSystem(observedThree, new THREE.Scene(), {
  buildings: city.buildings,
  workshopAssetLoader: async () => { loadCalls++; throw new Error('No asset fetch/decode in read-only CPU lifecycle probe'); },
});
const createdAtInitialization = [...constructed];
const cycles = [];
for (let cycle = 1; cycle <= 5; cycle++) {
  const before = { constructed: constructed.length, disposed: disposed.length, instancedDisposals: instancedDisposals.length };
  const transition = system.enter('south-086');
  const meshes = [], dressing = [];
  system.root.traverse(object => {
    if (object.isMesh) meshes.push({ uuid: object.uuid, geometryId: object.geometry.id, geometryType: object.geometry.type, instanced: !!object.isInstancedMesh });
    if (object.userData.harborDressing) dressing.push(object.userData.harborDressing.snapshot());
  });
  const snap = system.snapshot();
  system.update(1 / 60, { x: transition.position.x, z: transition.position.z, groundY: transition.position.groundY });
  const afterEntry = { constructed: constructed.length, disposed: disposed.length, instancedDisposals: instancedDisposals.length };
  system.exit();
  let remainingMeshes = 0; system.root.traverse(object => { if (object.isMesh) remainingMeshes++; });
  cycles.push({ cycle, before, afterEntry,
    afterExit: { constructed: constructed.length, disposed: disposed.length, instancedDisposals: instancedDisposals.length },
    geometryIdsUsed: [...new Set(meshes.map(mesh => mesh.geometryId))].sort((a,b) => a-b),
    meshes: meshes.length, instancedMeshes: meshes.filter(mesh => mesh.instanced).length,
    residentFloors: snap.residentFloors, dressing, remainingMeshes });
}
system.dispose();
const output = { kind: 'Actual-source CPU geometry identity/dispose event probe; no renderer/browser/WebGL',
  limitation: 'No DOM means sign() returns before canvas creation; native sign meshes use the same startup signGeometry at metropolis-interiors.js:1098. No GLB is requested or decoded; existing native lifecycle records separately bind its actual releases.',
  createdAtInitialization, cycles, afterFinalSystemDispose: { constructed: constructed.length, disposed }, loadCalls,
  sourceHashes: Object.fromEntries(await Promise.all(['src/metropolis-interiors.js','src/harbor-room-dressing.js','src/harbor-district.js','src/city-exploration.js'].map(async path => [path, createHash('sha256').update(await readFile('/workspace/scratch/neon-harbor-art-pilot/' + path)).digest('hex')]))),
};
await writeFile('/tmp/neon-art-streaming-interior-growth-probe.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify(output, null, 2));
