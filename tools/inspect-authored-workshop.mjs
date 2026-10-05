/** Bounded CPU inspection of one building/layout and five assets. No world,
 * renderer, image decoder, browser, GPU, full tests or production build. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import {createCompactInteriorLayout} from '../src/compact-interiors.js';
import {expansionBuilding} from '../src/expansion-programmes.js';
import {applyAuthoredWorkshopLayout} from '../src/harbor-workshop-authored.js';
import {planHarborWorkshopPilot,createHarborWorkshopPilot,disposeWorkshopAsset} from '../src/harbor-workshop-pilot.js';
import {parseWorkshopAssetCPU} from './inspect-workshop-assets.mjs';

const started=performance.now(),building=JSON.parse(await fs.readFile(new URL('../docs/qa/authored-workshop/source-building.json',import.meta.url),'utf8'));
// Register this single shell's existing warehouse use, as production does.
expansionBuilding(building,'south',85);
const floor=building.floors[0],original=createCompactInteriorLayout(building,floor),layout=applyAuthoredWorkshopLayout(building,floor,original),plan=planHarborWorkshopPilot(building,floor,layout);
assert.equal(plan.placements.length,5);
const old=planHarborWorkshopPilot(building,floor,original);
assert.deepEqual(plan.placements.slice(0,2),old.placements,'Reviewed vice and chest placement must remain exact');
for(const key of['entrance','elevator','stairs','rooms','width','depth','height','groundY'])assert.deepEqual(layout[key],original[key],`Structural ${key} changed`);
const removedIds=new Set(layout.workshopAuthored.replacedArchiveParts.map(p=>p.id));
for(const c of original.colliders.filter(c=>!removedIds.has(c.id)))assert.deepEqual(layout.colliders.find(x=>x.id===c.id),c,'Unrelated structural/furniture collider changed');
const colliders=[...layout.colliders,...plan.colliders];
let viceRegionMinimum=Infinity,viceRegionSamples=0;
for(let ix=0;ix<=36;ix++)for(let iz=0;iz<=36;iz++){
  const x=180.35-.18+ix*.01,z=-113.32-.18+iz*.01;viceRegionSamples++;
  for(const c of colliders){if(c.physics===false||c.minY>=floor.y+1.65||c.maxY<=floor.y+.12)continue;
    const d=Math.hypot(Math.max(Math.abs(x-c.x)-c.hx,0),Math.max(Math.abs(z-c.z)-c.hz,0))-.65;
    viceRegionMinimum=Math.min(viceRegionMinimum,d);assert.ok(d>=-1e-6,'Reviewed vice camera standing region must remain clear');
  }
}
const aisleChecks=plan.requiredClearAisles.map(a=>{
  const blockers=colliders.filter(c=>c.physics!==false&&c.minY<floor.y+1.65&&c.maxY>floor.y+.12&&
    Math.min(a.maxX,c.x+c.hx)-Math.max(a.minX,c.x-c.hx)>1e-7&&Math.min(a.maxZ,c.z+c.hz)-Math.max(a.minZ,c.z-c.hz)>1e-7);
  assert.equal(blockers.length,0,`${a.id} has blockers: ${blockers.map(c=>c.id)}`);
  assert.ok(a.maxZ-a.minZ>=2);return {...a,blockers:[]};
});
const pathChecks=[];
const paths={workshop:[{x:200,z:-115},{x:197.6,z:-115},{x:184,z:-115}],
  archive:[{x:200,z:-104.5},{x:196.7,z:-104.5},{x:196.7,z:-106},{x:185,z:-106}],
  lift:[{x:200,z:-104.5},{x:200,z:original.elevator.doorZ+1.1}],
  stairApproach:[{x:200,z:-98.42},{x:200,z:original.stairs[0].bottom.z},{x:original.stairs[0].bottom.x,z:original.stairs[0].bottom.z}]};
for(const[name,points]of Object.entries(paths)){
  let nearest=Infinity,total=0;
  for(let j=0;j<points.length-1;j++){
    const a=points[j],b=points[j+1],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05);
    for(let i=0;i<=n;i++){const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n;total++;
      for(const c of colliders){if(c.physics===false||c.minY>=floor.y+1.65||c.maxY<=floor.y+.12)continue;
        const d=Math.hypot(Math.max(Math.abs(x-c.x)-c.hx,0),Math.max(Math.abs(z-c.z)-c.hz,0))-.65;nearest=Math.min(nearest,d);
        assert.ok(d>=-1e-6,`${name} intersects ${c.id} at ${x},${z}: ${d}`);
      }
    }
  }
  pathChecks.push({name,actualBodyRadius:.65,spacing:.05,samples:total,minBodyClearance:nearest});
}
let assetLoads=0;
const load=async id=>{assetLoads++;return parseWorkshopAssetCPU(await fs.readFile(new URL(`../assets/harbor/workshop/${id}.glb`,import.meta.url)));};
const fallbackGroup=new THREE.Group();for(const p of plan.fallbackParts){const o=new THREE.Object3D();o.userData.workshopFallbackKind=p.kind;fallbackGroup.add(o);}
const audit=[],owner=createHarborWorkshopPilot(THREE,{building,floor,layout,enabled:true,fallbackGroup,loadAsset:load,onAudit:e=>audit.push(e)});
const nearPoint={x:180.9,z:-114.58,groundY:floor.y};owner.update(nearPoint);await owner.whenSettled();
assert.equal(owner.snapshot().status,'ready',JSON.stringify(owner.snapshot().errors));assert.equal(owner.snapshot().assetCount,5);assert.equal(owner.snapshot().lodTier,0);
const bounds=owner.snapshot().bounds,ready=owner.snapshot();
const countVisible=group=>{let meshes=0,triangles=0;group.traverseVisible(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});return{meshes,triangles};};
const nearCount=countVisible(owner.group);
const shelfScene=owner.group.children.find(c=>c.userData.workshopAssetId==='wooden_bookshelf_worn');
const shelfMeshes=[];shelfScene.traverse(o=>{if(o.isMesh)shelfMeshes.push(o);});
assert.equal(shelfMeshes.length,3);assert.equal(new Set(shelfMeshes.map(o=>o.geometry)).size,1);
assert.equal(new Set(shelfMeshes.map(o=>o.material)).size,1);
const sharedShelf={instances:shelfMeshes.length,geometryOwners:1,materialOwners:1,sourceTextureOwners:3};
owner.update({x:197.7,z:-105.5,groundY:floor.y});const middle={snapshot:owner.snapshot(),visible:countVisible(owner.group)};assert.equal(middle.snapshot.lodTier,1);
owner.update({x:205,z:-105,groundY:floor.y});const far={snapshot:owner.snapshot(),visible:countVisible(owner.group)};assert.equal(far.snapshot.lodTier,2);
owner.update({x:210,z:-95,groundY:floor.y});await owner.whenSettled();assert.equal(owner.snapshot().assetCount,0);assert.equal(owner.snapshot().fallbackVisible,true);
assert.ok(fallbackGroup.children.every(c=>c.visible),'Every fallback must restore after unload');
owner.update(nearPoint);await owner.whenSettled();assert.equal(owner.snapshot().status,'ready');owner.dispose();assert.equal(owner.snapshot().assetCount,0);
const failureFallback=new THREE.Group();for(const p of plan.fallbackParts){const o=new THREE.Object3D();o.userData.workshopFallbackKind=p.kind;failureFallback.add(o);}
const failureAudit=[],failed=createHarborWorkshopPilot(THREE,{building,floor,layout,enabled:true,fallbackGroup:failureFallback,loadAsset:async id=>{if(id==='wooden_bookshelf_worn')throw new Error('Expected CPU failure fixture');return load(id);},onAudit:e=>failureAudit.push(e)});
failed.update(nearPoint);await failed.whenSettled();assert.equal(failed.snapshot().status,'failed');assert.equal(failed.snapshot().assetCount,0);assert.equal(failed.snapshot().fallbackVisible,true);assert.ok(failureFallback.children.every(c=>c.visible));assert.equal(failureAudit.filter(e=>e.kind==='asset-released').length,4);failed.dispose();
let releaseWait;const delayedReady=new Promise(r=>releaseWait=r),delayAudit=[];
const delayed=createHarborWorkshopPilot(THREE,{building,floor,layout,enabled:true,loadAsset:async id=>{if(id==='workshop-fittings')await delayedReady;return load(id);},onAudit:e=>delayAudit.push(e)});
delayed.update(nearPoint);delayed.dispose();releaseWait();await delayed.whenSettled();assert.equal(delayed.snapshot().assetCount,0);assert.equal(delayAudit.filter(e=>e.kind==='asset-released').length,5);
const manifest=JSON.parse(await fs.readFile(new URL('../assets/harbor/workshop/asset-manifest.json',import.meta.url),'utf8'));
const models=[];for(const placement of plan.placements){const b=await fs.readFile(new URL(`../assets/harbor/workshop/${placement.id}.glb`,import.meta.url));models.push({id:placement.id,bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')});}
for(const model of models){const declared=manifest.models.find(x=>x.id===model.id);assert.equal(declared?.output.bytes,model.bytes,'Asset manifest byte mismatch');assert.equal(declared?.output.sha256,model.sha256,'Asset manifest hash mismatch');}
const total=models.reduce((n,m)=>n+m.bytes,0);assert.ok(total<=12000000);assert.ok(nearCount.meshes<=35);assert.ok(nearCount.triangles<=150000);
assert.equal(total,manifest.runtimeBytes);
const authoredExport=JSON.parse(await fs.readFile(new URL('../docs/qa/authored-workshop/authored-source/fittings-export.json',import.meta.url),'utf8'));
const report={scope:'One-building bounded CPU metadata, geometry, visibility and cleanup. JPEG/PNG decode, WebGL, actual walking and visual judgement excluded',passed:true,elapsedMs:performance.now()-started,
  modelBytes:total,strictRoomByteLimit:12000000,visibleNear:nearCount,visibleMiddle:middle.visible,visibleFar:far.visible,
  nearTier:ready.lodTier,middleTier:middle.snapshot.lodTier,farTier:far.snapshot.lodTier,packedUniqueTriangles:33228+authoredExport.totalPackedTriangles,
  additionalFarFallbackMeshes:2,totalFarMainPassDrawCallEstimate:far.visible.meshes+2,failureFallbackMeshEstimate:plan.fallbackParts.length,
  sharedShelf,textureBudgetEstimate:{uniqueTextures:16,rgbaMipBytes:16*1024*1024*4*4/3,scope:'Uncompressed RGBA plus full mip-chain estimate; actual GPU/decode overhead unmeasured'},
  preservedViceCameraStandingRegion:{centre:{x:180.35,z:-113.32},halfExtent:.18,samplingStep:.01,samples:viceRegionSamples,bodyRadius:.65,minBodyClearance:viceRegionMinimum},
  unchangedViceAndChestPlacements:true,structuralCoreUnchanged:true,archiveReplacementPartIds:[...removedIds],aisleChecks,pathChecks,
  worldAABBs:bounds,models,originalColliderCount:original.colliders.length,candidateColliderCount:colliders.length,
  lifecycle:{normalLoads:audit.filter(e=>e.kind==='asset-decoded').length,normalReleases:audit.filter(e=>e.kind==='asset-released').length,partialFailureDecodedReleases:failureAudit.filter(e=>e.kind==='asset-released').length,lateAfterDisposeReleases:delayAudit.filter(e=>e.kind==='asset-released').length,
    GPUReleaseConclusion:'Unmeasured; CPU parse placeholders never allocate GPU or decode images'},assetLoads};
await fs.writeFile(new URL('../docs/qa/authored-workshop/integration-static-inspection.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,worldAABBs:undefined,archiveReplacementPartIds:undefined,models:undefined},null,2));
