import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import * as THREE from '/workspace/scratch/neon-harbor-art-pilot/vendor/three/three.module.js';
import { expansionBuilding } from '/workspace/scratch/neon-harbor-art-pilot/src/expansion-programmes.js';
import { createInteriorLayout, createInteriorSystem } from '/workspace/scratch/neon-harbor-art-pilot/src/metropolis-interiors.js';
import { SpatialIndex, circleContacts, moveCircle, CHARACTER_RADIUS } from '/workspace/scratch/neon-harbor-art-pilot/src/collision.js';
const started = performance.now(), root='/workspace/scratch/neon-harbor-art-pilot/';
const posePath=root+'docs/qa/art-pilot/native-validation-owned-release-2026-10-04/normal-cycle0-vice-near-pose.json';
const poseBytes=await readFile(posePath), prior=JSON.parse(poseBytes), actual=prior.after.city.buildings.find(b=>b.id==='south-086');
// Register only this captured exact building's warehouse programme. No world,
// other address, texture decoder, GLB parser, renderer or browser is constructed.
const registered=expansionBuilding(actual,'south',85);
if(JSON.stringify(registered.floors)!==JSON.stringify(actual.floors))throw Error('Captured floors differ');
const system=createInteriorSystem(THREE,new THREE.Scene(),{buildings:[registered]});
system.enter('south-086');
const layout=createInteriorLayout(registered,registered.floors[0]);
const context=system.collisionContext(), colliders=context.colliders;
const index=new SpatialIndex(colliders), floorY=registered.floors[0].y;
const options={index,bounds:1800,groundHeightAt:()=>floorY};
const room=layout.rooms.find(r=>r.type==='workshop');
const target=prior.target, proposed={x:180.35,z:-113.45,y:floorY};
const waypoints=[{...layout.entrance,y:floorY},{x:200,z:room.entrance.z,y:floorY},
  {...room.arrival,y:floorY},{x:182.8,z:room.entrance.z,y:floorY},
  {x:182.8,z:proposed.z,y:floorY},proposed];
const routes=[];
for(const radius of [CHARACTER_RADIUS,.43]){
 const body={...waypoints[0],groundY:floorY}, segments=[];
 for(const point of waypoints.slice(1)){
  const before={...body}, result=moveCircle(body,point.x-body.x,point.z-body.z,radius,options);
  segments.push({from:before,to:point,actualEnd:{...body},contactIds:result.contacts.map(c=>c.obstacle.id),endpointError:Math.hypot(point.x-body.x,point.z-body.z)});
 }
 routes.push({radius,segments,reachable:segments.every(s=>s.contactIds.length===0&&s.endpointError<1e-6),endpointContacts:circleContacts(body,radius,options).map(c=>c.obstacle.id)});
}
const active=colliders.filter(c=>c.physics!==false&&c.maxY>floorY+1e-7&&c.minY<floorY+1.8-1e-7);
const signedClearance=c=>Math.hypot(Math.max(0,Math.abs(proposed.x-c.x)-c.hx),Math.max(0,Math.abs(proposed.z-c.z)-c.hz))-CHARACTER_RADIUS;
const nearest=active.map(c=>({id:c.id,kind:c.kind,clearance:signedClearance(c),bounds:{minX:c.x-c.hx,maxX:c.x+c.hx,minZ:c.z-c.hz,maxZ:c.z+c.hz,minY:c.minY,maxY:c.maxY}})).sort((a,b)=>a.clearance-b.clearance).slice(0,5);
const eye={x:proposed.x,y:floorY+1.62,z:proposed.z};
const horizontalDistance=Math.hypot(eye.x-target.x,eye.z-target.z), eyeDistance=Math.hypot(horizontalDistance,eye.y-target.y);
const yaw=Math.atan2(target.x-eye.x,target.z-eye.z), aimPitch=.15+Math.asin(Math.max(-1,Math.min(1,(eye.y-target.y)/10)));
const result={kind:'Single-address CPU layout/capsule preparation only; no detail capture executed',poseSource:posePath,
 poseSourceSha256:createHash('sha256').update(poseBytes).digest('hex'),sourceManifest:prior.after.renderer?.manifest||null,
 capturedBuilding:actual,activeFloors:system.snapshot().residentFloors,colliderCount:colliders.length,bodyHeight:1.8,
 actualPlayerRadius:CHARACTER_RADIUS,layoutEntrance:layout.entrance,room,workbench:layout.parts.find(p=>p.kind==='workbench'),
 proposed,eye,target,horizontalDistance,eyeDistance,ordinaryCameraDragAim:{yaw,pitch:aimPitch,fov:65},waypoints,routes,nearest,
 recommendation:'Use real E entry then these cardinal WASD/Z legs; keep position tolerance <=0.04m for the final two legs and verify actual snapshot. Camera aim numbers are targets for ordinary pointer drags, not debug writes.',
 oldCaptureHorizontalDistance:prior.targetDistanceXZ,oldCaptureEyeDistance:prior.eyeDistance,elapsedMilliseconds:performance.now()-started};
system.dispose();
await writeFile('/tmp/neon-workshop-vice-close-pose.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({elapsedMilliseconds:result.elapsedMilliseconds,radius:CHARACTER_RADIUS,colliders:colliders.length,proposed,target,horizontalDistance,eyeDistance,routes:routes.map(r=>({radius:r.radius,reachable:r.reachable,endpointContacts:r.endpointContacts})),nearest}));
