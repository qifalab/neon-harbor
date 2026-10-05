/** Bounded CPU parse/planning/owner inspection of one existing building and
 * exactly two floor layouts. No city construction, browser, render or image decode. */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {expansionBuilding} from '../src/expansion-programmes.js';
import {createCompactInteriorLayout} from '../src/compact-interiors.js';
import {applyAuthoredHomeLayout,HOME_BODIES,HOME_MODELS} from '../src/harbor-home-authored.js';
import {createHarborHomeAssets} from '../src/harbor-home-assets.js';
import {disposeWorkshopAsset} from '../src/harbor-workshop-pilot.js';
import {parseWorkshopAssetCPU,inspectScene} from './inspect-workshop-assets.mjs';

const started=performance.now(),building=JSON.parse(await fs.readFile(new URL('../docs/qa/authored-home/source-building.json',import.meta.url),'utf8'));
expansionBuilding(building,'south',78);
const manifest=JSON.parse(await fs.readFile(new URL('../assets/harbor/home/asset-manifest.json',import.meta.url),'utf8'));
const models=[];let total=0;
for(const m of manifest.models){
 const bytes=await fs.readFile(new URL('../'+m.output.path,import.meta.url)),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 assert.equal(bytes.length,m.output.bytes);assert.equal(sha,m.output.sha256);total+=bytes.length;
 const asset=await parseWorkshopAssetCPU(bytes);asset.scene.updateMatrixWorld(true);
 let meshes=0,triangles=0;asset.scene.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
  for(const a of Object.values(o.geometry.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));});
 assert.equal(meshes,HOME_MODELS[m.id].meshes);assert.equal(triangles,m.geometry.triangles);
 const b=new THREE.Box3().setFromObject(asset.scene,true);
 models.push({id:m.id,bytes:bytes.length,sha256:sha,packedTriangles:triangles,packedMeshes:meshes,
  bounds:{min:b.min.toArray(),max:b.max.toArray()},officialPBRReferences:HOME_MODELS[m.id].textured?inspectScene(asset.scene):null});disposeWorkshopAsset(asset);
}
assert.equal(total,manifest.runtimeBytes);assert.ok(total<=12000000);
const floorRecords=[],allNear={meshes:0,triangles:0},allMiddle={meshes:0,triangles:0},allFar={meshes:0,triangles:0};
const count=group=>{let meshes=0,triangles=0;group.traverseVisible(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return{meshes,triangles};};
const load=async id=>parseWorkshopAssetCPU(await fs.readFile(new URL(`../assets/harbor/home/${id}.glb`,import.meta.url)));
for(const floor of building.floors.slice(0,2)){
 const original=createCompactInteriorLayout(building,floor),layout=applyAuthoredHomeLayout(building,floor,original),plan=layout.homeAuthored;
 const removed=new Set(layout.homeReplacedPartIds);
 for(const key of['entrance','elevator','stairs','rooms','width','depth','height','groundY'])assert.deepEqual(layout[key],original[key],`Structural ${key} changed`);
 for(const c of original.colliders.filter(c=>!removed.has(c.id)))assert.deepEqual(layout.colliders.find(x=>x.id===c.id),c);
 for(const id of removed){assert.ok(!layout.parts.some(p=>p.id===id));assert.ok(!layout.colliders.some(c=>c.id===id));}
 for(const c of plan.colliders){const r=layout.rooms[c.z<building.z+3.25?0:1];assert.ok(c.x-c.hx>=r.bounds.minX-.001&&c.x+c.hx<=r.bounds.maxX+.001,'Furniture crosses room X');
  assert.ok(c.z-c.hz>=r.bounds.minZ-.04&&c.z+c.hz<=r.bounds.maxZ+.001,'Furniture crosses room Z');assert.ok(c.maxY<=floor.y+r.ceilingHeight);}
 const physical=layout.colliders.filter(c=>c.physics!==false&&c.minY<floor.y+1.65&&c.maxY>floor.y+.12);
 const aisles=plan.requiredClearAisles.map(a=>{const blockers=physical.filter(c=>Math.min(a.maxX,c.x+c.hx)-Math.max(a.minX,c.x-c.hx)>1e-7&&Math.min(a.maxZ,c.z+c.hz)-Math.max(a.minZ,c.z-c.hz)>1e-7);
  assert.equal(blockers.length,0,`${a.id}: ${blockers.map(c=>c.id)}`);assert.ok(a.maxX-a.minX>=2);return a;});
 const r0=layout.rooms[0],r1=layout.rooms[1],paths={
  room0:[{x:133,z:r0.z},{x:130.8,z:r0.z},{x:130,z:r0.z}],
  room1:[{x:133,z:r1.z},{x:130.8,z:r1.z},{x:130,z:r1.z}],
  lift:[{x:133,z:original.entrance.z},{x:133,z:original.elevator.doorZ+1.1}],
  stairApproach:[{x:133,z:original.entrance.z},{x:133,z:original.stairs[0].bottom.z},{x:original.stairs[0].bottom.x,z:original.stairs[0].bottom.z}],
 };
 if(floor.id==='lobby'){
  paths.sofaView=[{x:130,z:r0.z},{x:128.8,z:r0.z},{x:128.8,z:106.8}];
  paths.bedside=[{x:130,z:r1.z},{x:130,z:112.9},{x:126.9,z:112.9}];
 }else{
  paths.fridgeApproach=[{x:130,z:r0.z},{x:130,z:107.05},{x:127.6,z:107.05}];
  paths.openShower=[{x:130,z:r1.z},{x:130,z:113.52},{x:125.8,z:113.52}];
 }
 const pathChecks=[];
 for(const[name,points]of Object.entries(paths)){
  let nearest=Infinity,samples=0;
  for(let j=0;j<points.length-1;j++){const a=points[j],b=points[j+1],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.025);
   for(let i=0;i<=n;i++){const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n;samples++;
    for(const c of physical){const d=Math.hypot(Math.max(Math.abs(x-c.x)-c.hx,0),Math.max(Math.abs(z-c.z)-c.hz,0))-.65;nearest=Math.min(nearest,d);assert.ok(d>=-1e-6,`${floor.id}:${name} meets ${c.id} at ${x},${z} clearance ${d}`);}}}
  pathChecks.push({name,bodyRadius:.65,spacing:.025,samples,minBodyClearance:nearest});
 }
 const events=[],fallback=new THREE.Group();plan.fallbackParts.forEach(()=>fallback.add(new THREE.Object3D()));
 const owner=createHarborHomeAssets(THREE,{building,floor,layout,enabled:true,fallbackGroup:fallback,loadAsset:load,onAudit:e=>events.push(e)});
 const nearPoint={x:r0.x,z:r0.z,groundY:floor.y};owner.update(nearPoint);await owner.whenSettled();const nearSnap=owner.snapshot();
 assert.equal(nearSnap.status,'ready',JSON.stringify(nearSnap.errors));assert.equal(nearSnap.assetCount,floor.id==='lobby'?3:1);assert.equal(nearSnap.lodTier,0);
 const near=count(owner.group);assert.equal(fallback.visible,false);
 owner.update({x:138,z:107.775,groundY:floor.y});const middleSnap=owner.snapshot(),middle=count(owner.group);assert.equal(middleSnap.lodTier,1);
 owner.update({x:149,z:107.775,groundY:floor.y});const farSnap=owner.snapshot(),far=count(owner.group);assert.equal(farSnap.lodTier,2);assert.equal(fallback.visible,false);
 owner.update({x:164,z:107.775,groundY:floor.y});await owner.whenSettled();assert.equal(owner.snapshot().assetCount,0);assert.equal(fallback.visible,true);
 owner.update(nearPoint);await owner.whenSettled();assert.equal(owner.snapshot().status,'ready');owner.dispose();assert.equal(owner.snapshot().assetCount,0);
 const failureEvents=[],failed=createHarborHomeAssets(THREE,{building,floor,layout,enabled:true,fallbackGroup:new THREE.Group(),
  loadAsset:async id=>{if(id===`home-${floor.id}-fittings`)throw new Error('Expected CPU missing fixture');return load(id);},onAudit:e=>failureEvents.push(e)});
 failed.update(nearPoint);await failed.whenSettled();assert.equal(failed.snapshot().status,'failed');assert.equal(failed.snapshot().assetCount,0);assert.equal(failed.snapshot().fallbackVisible,true);
 assert.equal(failureEvents.filter(e=>e.kind==='asset-released').length,plan.placements.length-1);failed.dispose();
 let finish;const wait=new Promise(r=>finish=r),lateEvents=[];const late=createHarborHomeAssets(THREE,{building,floor,layout,enabled:true,
  loadAsset:async id=>{if(id===`home-${floor.id}-fittings`)await wait;return load(id);},onAudit:e=>lateEvents.push(e)});
 late.update(nearPoint);late.dispose();finish();await late.whenSettled();assert.equal(late.snapshot().assetCount,0);assert.equal(lateEvents.filter(e=>e.kind==='asset-released').length,plan.placements.length);
 const inactive=createHarborHomeAssets(THREE,{building,floor,layout,enabled:true,loadAsset:load});inactive.update(nearPoint);await inactive.whenSettled();inactive.update(nearPoint,{active:false});assert.equal(inactive.snapshot().assetCount,0);inactive.dispose();
 for(const key of['meshes','triangles']){allNear[key]+=near[key];allMiddle[key]+=middle[key];allFar[key]+=far[key];}
 floorRecords.push({floorId:floor.id,roomIds:layout.rooms.map(r=>r.id),originalFurnitureRemoved:[...removed],originalColliders:original.colliders.length,candidateColliders:layout.colliders.length,
  physicalBodies:HOME_BODIES[floor.id],clearAisles:aisles,pathChecks,placements:plan.placements,readyWorldAABBs:nearSnap.bounds,near,middle,far,
  lifecycle:{normalLoads:events.filter(e=>e.kind==='asset-decoded').length,normalReleases:events.filter(e=>e.kind==='asset-released').length,
   failureReleases:failureEvents.filter(e=>e.kind==='asset-released').length,lateAfterDisposeReleases:lateEvents.filter(e=>e.kind==='asset-released').length,inactiveFloorReleased:true}});
}
assert.ok(allNear.meshes<=35);assert.ok(allNear.triangles<=150000);
const report={scope:'One actual building, two original room layouts and four packed assets. CPU texture placeholders: native decode, WebGL, real movement and visual judgement excluded',passed:true,
 elapsedMs:performance.now()-started,runtimeBytes:total,strictByteLimit:12000000,wholeHomeVisibleNear:allNear,wholeHomeVisibleMiddle:allMiddle,wholeHomeVisibleFar:allFar,
 packedAllTriangles:models.reduce((n,m)=>n+m.packedTriangles,0),packedAllMeshes:models.reduce((n,m)=>n+m.packedMeshes,0),models,floors:floorRecords,
 evidenceLimits:'No native art/walking acceptance. Textures use CPU placeholders. GPU allocation and actual owner VRAM release are unmeasured. Room labels/IDs/life/save are unaltered.'};
await fs.writeFile(new URL('../docs/qa/authored-home/integration-static-inspection.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,models:undefined,floors:floorRecords.map(r=>({floorId:r.floorId,roomIds:r.roomIds,pathChecks:r.pathChecks,lifecycle:r.lifecycle}))},null,2));
