import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = '/workspace/scratch/neon-harbor-art-pilot';
const artifactRoot = path.join(repo, 'docs/qa/art-pilot/native-validation-2026-10-04');
const metadata = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'metadata.json')));
const THREE = await import(path.join(repo, 'vendor/three/three.module.js'));
const { createHarborVehicle } = await import(path.join(repo, 'src/harbor-vehicle-models.js'));
const { createCar, createCharacter, CHARACTER_STYLES } = await import(path.join(repo, 'src/models.js'));
const { createCitizenCharacter } = await import(path.join(repo, 'src/citizen-appearance.js'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hash = name => digest(fs.readFileSync(path.join(repo, name)));
const actualHashes = Object.fromEntries(['src/harbor-vehicle-models.js', 'src/models.js', 'src/citizen-appearance.js', 'src/harbor-transit-renderer.js', 'src/harbor-life-renderer.js', 'src/metropolis-people.js', 'src/main.js', 'src/city-exploration.js', 'vendor/three/three.module.js'].map(name => [name, { actual: hash(name), frozen: metadata.sourceHashes[name], equal: hash(name) === metadata.sourceHashes[name] }]));
if (Object.values(actualHashes).some(x => !x.equal)) throw new Error('Frozen source mismatch');

const ids = group => {
  const geometries = new Map(); let meshes = 0;
  group.traverse(node => {
    if (!node.isMesh) return;
    meshes++;
    if (!geometries.has(node.geometry.uuid)) geometries.set(node.geometry.uuid, { uuid: node.geometry.uuid, type: node.geometry.type, meshNames: [], triangles: (node.geometry.index?.count ?? node.geometry.getAttribute('position').count) / 3 });
    geometries.get(node.geometry.uuid).meshNames.push(node.name);
  });
  return { meshes, uniqueGeometries: geometries.size, geometryReferences: [...geometries.values()] };
};
const levels = group => group.userData.lod.levels.map((level, tier) => ({ tier, distance: level.distance, hysteresis: level.hysteresis, ...ids(level.object) }));
const compareClones = (a, b) => {
  const allA = ids(a).geometryReferences.map(x => x.uuid), allB = new Set(ids(b).geometryReferences.map(x => x.uuid));
  return { first: allA.length, second: allB.size, sharedUUIDs: allA.filter(x => allB.has(x)).length, allReferencesShared: allA.every(x => allB.has(x)) && allA.length === allB.size };
};
const vehicles = {};
for (const kind of ['bus', 'tram', 'ferry']) {
  const a = createHarborVehicle(THREE, kind), b = createHarborVehicle(THREE, kind);
  const detail = levels(a); const uuidSets = detail.map(x => new Set(x.geometryReferences.map(g => g.uuid)));
  vehicles[kind] = { levels: detail, clones: compareClones(a, b), interLevelSharedUUIDs: uuidSets.map((set, i) => uuidSets.map((other, j) => i === j ? set.size : [...set].filter(uuid => other.has(uuid)).length)) };
}
const characters = {};
for (let style = 0; style < CHARACTER_STYLES.length; style++) {
  const a = createCharacter(THREE, { style }), b = createCharacter(THREE, { style });
  const citizen = createCitizenCharacter(THREE, style);
  characters[CHARACTER_STYLES[style].id] = { levels: levels(a), clones: compareClones(a, b), citizenIncludingAllAccessoryTemplates: ids(citizen) };
}
const cars = {};
for (const type of ['sport', 'sedan', 'police']) {
  const a = createCar(THREE, '#375b68', type), b = createCar(THREE, '#aaaaaa', type);
  cars[type] = { levels: levels(a), clones: compareClones(a, b) };
}
const normal = metadata.scenarios.find(x => x.name === 'normal');
const timeline = normal.events.map((event, index) => ({ index, kind: event.kind, at: event.at, simulationTime: event.simulationTime, position: event.position, camera: event.camera, buildingId: event.buildingId, roomId: event.roomId, memory: event.renderer?.memory, pilotState: event.pilot && { status: event.pilot.status, geometries: event.pilot.resources?.reduce((n, resource) => n + resource.geometries, 0), boneTextureCount: event.pilot.boneTextureCount }, lifecycleKinds: event.lifecycle?.map(x => `${x.sequence}:${x.kind}`) }));
const fullSnapshot = state => ({ simulationTime: state.simulationTime, player: state.position, camera: state.camera, memory: state.renderer.memory, mainCars: state.cars.length, northPeople: { detailed: state.city.people.detailed, pooled: state.city.people.pooled }, harborPeople: state.city.sample.renderer, sampleFleet: state.city.sample.transit.vehicles.map(v => ({ id: v.id, kind: v.kind, x: v.x, y: v.y, z: v.z, serviceTime: v.serviceTime, delay: v.delay })), renderVisibility: state.city.renderVisibility, activeChunks: state.streaming.activeChunks, residentMeshes: state.streaming.residentMeshes });
const fullSnapshots = {};
for (const name of ['normal-cycle0-vice-near-pose.json', 'normal-cycle0-chest-near-pose.json']) {
  const pose = JSON.parse(fs.readFileSync(path.join(artifactRoot, name)));
  fullSnapshots[`${name}:before`] = fullSnapshot(pose.before);
  fullSnapshots[`${name}:after`] = fullSnapshot(pose.after);
}
fullSnapshots.failure = fullSnapshot(normal.failureSnapshot);
const output = { disclaimer: 'CPU source/reference enumeration only. UUIDs here belong to newly created CPU objects, not the closed native run. Renderer geometry upload UUIDs and fleet snapshots for the +35 interval were not captured; no unique attribution or native PASS is claimed.', metadataStatus: metadata.status, sourceHashes: actualHashes, vehicles, characters, cars, timeline, fullSnapshots, memoryRecords: normal.memory };
fs.writeFileSync('/tmp/neon-art-geometry-growth-cpu-probe.json', JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ hashes: Object.values(actualHashes).every(x => x.equal), vehicles: Object.fromEntries(Object.entries(vehicles).map(([kind, value]) => [kind, { tiers: value.levels.map(x => x.uniqueGeometries), clones: value.clones, interLevelSharedUUIDs: value.interLevelSharedUUIDs }])), characters: Object.fromEntries(Object.entries(characters).map(([style, value]) => [style, { tiers: value.levels.map(x => x.uniqueGeometries), clones: value.clones, citizenAll: value.citizenIncludingAllAccessoryTemplates.uniqueGeometries }])), cars: Object.fromEntries(Object.entries(cars).map(([type, value]) => [type, { tiers: value.levels.map(x => x.uniqueGeometries), clones: value.clones }])), snapshots: Object.fromEntries(Object.entries(fullSnapshots).map(([name, value]) => [name, { simulationTime: value.simulationTime, mainCars: value.mainCars, northPeople: value.northPeople, harborPeople: value.harborPeople }])) }, null, 2));
