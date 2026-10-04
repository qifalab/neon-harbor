import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import * as THREE from '/workspace/scratch/neon-harbor/vendor/three/three.module.js';
import {expansionBuilding} from '/workspace/scratch/neon-harbor/src/expansion-programmes.js';
import {createInteriorLayout,createInteriorSystem} from '/workspace/scratch/neon-harbor/src/metropolis-interiors.js';
import {SpatialIndex,circleContacts,moveCircle,CHARACTER_RADIUS} from '/workspace/scratch/neon-harbor/src/collision.js';
import {PLAYER_DIMENSIONS} from '/workspace/scratch/neon-harbor/src/world-config.js';
const started=performance.now(),root='/workspace/scratch/neon-harbor/';
const hash=b=>createHash('sha256').update(b).digest('hex');
const manifestBytes=await readFile(root+'dist/build-info.json'),manifest=JSON.parse(manifestBytes);
if(hash(manifestBytes)!=='502af982ac2999fb28c395388d7d97acdf6165df803f62b3069f95cafa2dcbb3')throw Error('ROOT final manifest changed');
const paths=['src/metropolis-interiors.js','src/compact-interiors.js','src/collision.js','src/world-config.js','src/expansion-programmes.js','src/metropolis-room-designs.js','src/harbor-workshop-pilot.js'];
const sourceHashes={};for(const p of paths){sourceHashes[p]=hash(await readFile(root+p));if(sourceHashes[p]!==manifest.assets[p])throw Error('ROOT source mismatch: '+p);}
const metaPath=root+'docs/qa/art-pilot/vice-detail-native-2026-10-04/metadata.json',metaBytes=await readFile(metaPath),meta=JSON.parse(metaBytes);
if(meta.status!=='failed')throw Error('Expected archived first detail FAIL');
const actual=meta.failureSnapshot.city.buildings.find(b=>b.id==='south-086'),registered=expansionBuilding(actual,'south',85);
if(JSON.stringify(registered.floors)!==JSON.stringify(actual.floors))throw Error('Captured floor metadata changed');
const system=createInteriorSystem(THREE,new THREE.Scene(),{buildings:[registered]});system.enter('south-086');
const layout=createInteriorLayout(registered,registered.floors[0]),room=layout.rooms.find(r=>r.type==='workshop');
const colliders=system.collisionContext().colliders,ground=registered.floors[0].y,radius=CHARACTER_RADIUS,tolerance=.18;
if(radius!==.65||colliders.length!==221)throw Error('Unexpected actual body/system');
const active=colliders.filter(c=>c.physics!==false&&c.maxY>ground+1e-7&&c.minY<ground+PLAYER_DIMENSIONS.height-1e-7);
if(active.some(c=>c.yaw))throw Error('Axis aligned proof cannot accept a rotated box');
const region=(a,b=a)=>({minX:Math.min(a.x,b.x)-tolerance,maxX:Math.max(a.x,b.x)+tolerance,minZ:Math.min(a.z,b.z)-tolerance,maxZ:Math.max(a.z,b.z)+tolerance});
const margin=(r,c)=>Math.hypot(Math.max(0,c.x-c.hx-r.maxX,r.minX-c.x-c.hx),Math.max(0,c.z-c.hz-r.maxZ,r.minZ-c.z-c.hz))-radius;
const inspect=r=>({region:r,nearest:active.map(c=>({id:c.id,kind:c.kind,margin:margin(r,c),bounds:{minX:c.x-c.hx,maxX:c.x+c.hx,minZ:c.z-c.hz,maxZ:c.z+c.hz,minY:c.minY,maxY:c.maxY}})).sort((a,b)=>a.margin-b.margin).slice(0,5)});
const pose={x:180.35,y:ground,z:-113.32};
const waypoints=[{...layout.entrance,y:ground},{x:200,y:ground,z:room.entrance.z},{...room.arrival,y:ground},
 {x:182.8,y:ground,z:room.entrance.z},{x:182.8,y:ground,z:pose.z},pose];
const strips=waypoints.slice(1).map((q,i)=>({from:waypoints[i],to:q,...inspect(region(waypoints[i],q))}));
const end=inspect(region(pose));
if(end.nearest[0].margin<0||strips.some(s=>s.nearest[0].margin<0))throw Error('Entire .18 region or route tube is blocked');
const index=new SpatialIndex(colliders),options={index,bounds:1800,groundHeightAt:()=>ground};
const actualPoint=meta.failureSnapshot.position,actualContacts=circleContacts({...actualPoint,groundY:ground},radius,options).map(c=>c.obstacle.id);
const actualMargins=inspect({minX:actualPoint.x,maxX:actualPoint.x,minZ:actualPoint.z,maxZ:actualPoint.z});
const body={...waypoints[0],groundY:ground},movements=[];
for(const q of [...waypoints.slice(1),...waypoints.slice(0,-1).reverse()]){
 const before={...body},m=moveCircle(body,q.x-body.x,q.z-body.z,radius,options);
 movements.push({from:before,target:q,actual:{...body},contactIds:m.contacts.map(c=>c.obstacle.id),error:Math.hypot(q.x-body.x,q.z-body.z)});
}
if(movements.some(m=>m.contactIds.length||m.error>1e-6))throw Error('Nominal actual continuous forward/return sweep blocked');
const bound=meta.failureSnapshot.city.interior.workshopPilot.bounds.find(b=>b.id==='bench_vice_01');
const target=Object.fromEntries(['x','y','z'].map((axis,i)=>[axis,(bound.min[i]+bound.max[i])/2]));
const eyeY=ground+1.62,eye=p=>Math.hypot(p.x-target.x,p.z-target.z,eyeY-target.y);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),r=end.region;
const nearestPoint={x:clamp(target.x,r.minX,r.maxX),z:clamp(target.z,r.minZ,r.maxZ)};
const farthestPoint={x:Math.abs(target.x-r.minX)>Math.abs(target.x-r.maxX)?r.minX:r.maxX,z:Math.abs(target.z-r.minZ)>Math.abs(target.z-r.maxZ)?r.minZ:r.maxZ};
const result={kind:'ROOT final single-address CPU geometry proof, not a native repair or executed photograph',manifestSha256:hash(manifestBytes),runtimeAssets:Object.keys(manifest.assets).length,sourceModules:Object.keys(manifest.assets).filter(p=>p.startsWith('src/')).length,sourceHashes,
 firstFailedMetadataSha256:hash(metaBytes),actualPlayerRadius:radius,actualPlayerHeight:PLAYER_DIMENSIONS.height,colliderCount:colliders.length,heightRelevantPhysicsColliders:active.length,activeFloors:system.snapshot().residentFloors,
 pose,tolerance,end,waypoints,forwardAndReverseSafeStrips:strips,nominalActualSweepMovements:movements,target,eyeY,nominalEyeDistance:eye(pose),minimumEyeDistanceWithinRegion:eye(nearestPoint),maximumEyeDistanceWithinRegion:eye(farthestPoint),eyeExtrema:{nearestPoint,farthestPoint},
 actualFailedPoint:actualPoint,actualFailedPointContacts:actualContacts,actualFailedPointMargins:actualMargins,
 caveat:'Rectangular route tube is a conservative static proof for ordinary cardinal motion whose centres stay in that tube. Native helper/input samples are unavailable; this does not reconstruct the failed path or uniquely attribute its error. Final native pose must independently satisfy both X and Z region bounds.',elapsedMilliseconds:performance.now()-started};
system.dispose();
for(const p of paths)if(hash(await readFile(root+p))!==sourceHashes[p])throw Error('ROOT source changed during read');
await writeFile('/tmp/neon-vice-safe-region-018-proof.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({manifest:result.manifestSha256,runtime:result.runtimeAssets,sources:result.sourceModules,radius,colliders:colliders.length,elapsedMilliseconds:result.elapsedMilliseconds,pose,endpointRegion:end.region,minEndpointMargin:end.nearest[0].margin,legMinimumMargins:strips.map(s=>s.nearest[0].margin),nominalEyeDistance:result.nominalEyeDistance,eyeRange:[result.minimumEyeDistanceWithinRegion,result.maximumEyeDistanceWithinRegion],actualFailedPoint:actualPoint,actualContacts,actualPointMinimumMargin:actualMargins.nearest[0].margin}));
