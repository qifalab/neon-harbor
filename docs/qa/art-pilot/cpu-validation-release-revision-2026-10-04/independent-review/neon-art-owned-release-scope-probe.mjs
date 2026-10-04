import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '/workspace/scratch/neon-harbor/vendor/three/three.module.js';
import { createCityExploration } from '/workspace/scratch/neon-harbor/src/city-exploration.js';
import { createCityExploration as createPilotCity } from '/workspace/scratch/neon-harbor-art-pilot/src/city-exploration.js';
import { createInteriorLayout as oldLayout, createInteriorSystem as oldSystem } from '/workspace/scratch/neon-harbor/src/metropolis-interiors.js';
import { createInteriorLayout as newLayout, createInteriorSystem as newSystem } from '/workspace/scratch/neon-harbor-art-pilot/src/metropolis-interiors.js';
import { planHarborWorkshopPilot, WORKSHOP_PILOT } from '/workspace/scratch/neon-harbor-art-pilot/src/harbor-workshop-pilot.js';
const hash = b => createHash('sha256').update(b).digest('hex');
const canonical = v => JSON.stringify(v);
const city = createCityExploration(THREE, new THREE.Scene(), { quality: 'low', streaming: true });
// Each worktree owns its module-scoped programme registry; initialise both
// actual worlds instead of passing root building objects into an unregistered
// pilot registry and accidentally selecting the default residential design.
const pilotCity = createPilotCity(THREE, new THREE.Scene(), { quality: 'low', streaming: true });
const planPath = '/workspace/scratch/neon-harbor/docs/qa/transit-crossing-repair/continuous-tour-budget-review/route-plan.json';
const plan = JSON.parse(await readFile(planPath));
let floorCount = 0; const applicable = [];
for (const building of pilotCity.buildings) for (const floor of building.floors) {
  floorCount++;
  const layout = building.id === WORKSHOP_PILOT.buildingId && floor.id === WORKSHOP_PILOT.floorId ? newLayout(building, floor) : null;
  const pilot = planHarborWorkshopPilot(building, floor, layout);
  if (pilot) applicable.push({ building: building.id, floor: floor.id, plan: pilot });
}
const records = [];
const addresses = [plan.home.id, plan.shop.buildingId, plan.northernAddress.id, 'south-085', 'south-086', 'south-087', 'east-001'];
const old = oldSystem(THREE, new THREE.Scene(), { buildings: city.buildings });
const requests = [];
const next = newSystem(THREE, new THREE.Scene(), { buildings: pilotCity.buildings, workshopAssetLoader: async id => {
  requests.push(id); throw new Error('Read-only CPU scope probe: no fetch, texture decode or WebGL');
} });
for (const id of addresses) {
  const building = city.buildings.find(b => b.id === id);
  const pilotBuilding = pilotCity.buildings.find(b => b.id === id);
  if (!building) throw new Error('Address not found: ' + id);
  const floors = [...new Map([building.floors[0], building.floors[1], building.floors.at(-1)].filter(Boolean).map(f => [f.id, f])).values()];
  const layouts = floors.map(floor => {
    const a = oldLayout(building, floor), b = newLayout(pilotBuilding, pilotBuilding.floors.find(f=>f.id===floor.id));
    return { floor: floor.id, identical: canonical(a) === canonical(b), parts: a.parts.length, colliders: a.colliders.length,
      sha256: hash(canonical(a)), stairsSha256: hash(canonical(a.stairs)) };
  });
  old.enter(id); next.enter(id);
  const a = old.collisionContext(), b = next.collisionContext();
  const same = canonical(a.colliders) === canonical(b.colliders);
  const prior = new Map(a.colliders.map(c => [c.id, canonical(c)]));
  const changed = b.colliders.filter(c => prior.has(c.id) && prior.get(c.id) !== canonical(c)).map(c => c.id);
  const added = b.colliders.filter(c => !prior.has(c.id));
  const oldSnap = old.snapshot(), newSnap = next.snapshot(); delete newSnap.workshopPilot; delete newSnap.workshopPilotEvents;
  const startRequests = requests.length;
  next.update(1/60, { x: 180.45, z: -119.52, groundY: building.floors[0].y });
  await Promise.resolve(); await Promise.resolve();
  records.push({ address: id, pureLayouts: layouts, oldSystemColliders: a.colliders.length, newSystemColliders: b.colliders.length,
    collidersIdentical: same, changedExistingColliders: changed, addedColliders: added,
    snapshotIdenticalExceptNewDiagnostic: canonical(oldSnap) === canonical(newSnap),
    requestsWhenPositionedAtWorkshopCoordinates: requests.slice(startRequests) });
  old.exit(); next.exit();
}
old.dispose(); next.dispose();
const chest = applicable[0].plan.colliders[0];
const projectionDistance = (p,a,b) => {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(p.x-(a.x+t*dx),p.z-(a.z+t*dz));
};
const paths = Object.fromEntries(Object.entries(plan.paths).map(([id,p]) => {
  const points=[p.from,...p.waypoints];
  return [id,{ metres:p.metres, minDistanceToNewChestXZ:Math.min(...points.slice(1).map((b,i)=>projectionDistance(chest,points[i],b))) }];
}));
const result = { kind:'Independent CPU review of owned-release revision: actual source geometry/system comparison; no browser, renderer, request or formal test rerun',
  capturedAt:new Date().toISOString(), routePlanFile:planPath,routePlanSha256:hash(await readFile(planPath)),
  actualBuildingCatalogIdentical:canonical(city.buildings)===canonical(pilotCity.buildings),
  routeAddresses:{home:plan.home.id,shop:plan.shop.buildingId,north:plan.northernAddress.id},
  buildingCount:city.buildings.length,floorCount,applicable,records,paths,requestProbeNotes:'A rejecting CPU-only callback counts load triggers; it never fetches files or decodes JPEG. The workshop coordinate is supplied to each actual currently entered address to prove address gating.' };
await writeFile('/tmp/neon-art-owned-release-scope-probe.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({ buildingCount:result.buildingCount,floorCount,applicable:applicable.map(x=>[x.building,x.floor]),
  records:records.map(x=>({address:x.address,pureLayoutsIdentical:x.pureLayouts.every(y=>y.identical),collidersIdentical:x.collidersIdentical,changedExisting:x.changedExistingColliders,added:x.addedColliders.map(y=>y.id),snapshotIdenticalExceptDiagnostic:x.snapshotIdenticalExceptNewDiagnostic,requestTriggers:x.requestsWhenPositionedAtWorkshopCoordinates})), paths }));
