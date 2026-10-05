/** Preparation only: three single-floor layouts; no world, renderer or assets parsed. */
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const base='/workspace/scratch/neon-harbor';
const authored='/tmp/neon-harbor-authored-integration';
const here=new URL('.',import.meta.url);
const catalog=JSON.parse(await fs.readFile(new URL('evidence/captured-buildings.json',here)));
const {createCompactInteriorLayout}=await import(pathToFileURL(resolve(base,'src/compact-interiors.js')));
const {expansionBuilding}=await import(pathToFileURL(resolve(base,'src/expansion-programmes.js')));
const {planHarborWorkshopPilot:oldWorkshop}=await import(pathToFileURL(resolve(base,'src/harbor-workshop-pilot.js')));
const {applyAuthoredWorkshopLayout,extendAuthoredWorkshopPlan}=await import(pathToFileURL(resolve(authored,'src/harbor-workshop-authored.js')));
const {applyAuthoredHomeLayout}=await import(pathToFileURL(resolve(authored,'src/harbor-home-authored.js')));
const output={status:'CPU_PREPARATION_ONLY',scope:'Captured historical catalogue; three floor layouts only. No native walking, image decoding, renderer, world construction or art approval.',bodyRadius:.65,axisTolerance:.15,photos:[],routes:[],layoutSummaries:[],sourceHashes:{}};
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const [root,p]of[[base,'src/compact-interiors.js'],[base,'src/expansion-programmes.js'],[base,'src/metropolis-room-designs.js'],[base,'src/harbor-workshop-pilot.js'],[authored,'src/harbor-workshop-pilot.js'],[authored,'src/harbor-workshop-authored.js'],[authored,'src/harbor-home-authored.js']])output.sourceHashes[resolve(root,p)]=sha(await fs.readFile(resolve(root,p)));
function clearance(x,z,y,colliders){let min=Infinity,nearest=null;
 for(const c of colliders){if(c.physics===false||c.minY>=y+1.65||c.maxY<=y+.12)continue;
  const d=Math.hypot(Math.max(Math.abs(x-c.x)-c.hx,0),Math.max(Math.abs(z-c.z)-c.hz,0))-.65;
  if(d<min){min=d;nearest=c.id;}}
 return {min,nearest};}
function photo(name,p,sets){const modes=[];
 for(const [mode,colliders]of sets){let min=Infinity,nearest=null;
  for(let ix=-3;ix<=3;ix++)for(let iz=-3;iz<=3;iz++){
   const c=clearance(p.x+ix*.05,p.z+iz*.05,p.y,colliders);if(c.min<min){min=c.min;nearest=c.nearest;}}
  modes.push({mode,minBodyClearance:min,nearestCollider:nearest,clear:min>=-1e-6});}
 output.photos.push({name,position:p,samplesPerMode:49,modes});}
function route(name,points,y,sets){const modes=[];
 for(const [mode,colliders]of sets){let min=Infinity,nearest=null,samples=0;
  for(let j=0;j<points.length-1;j++){const a=points[j],b=points[j+1],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05);
   for(let i=0;i<=n;i++){
    // Prove a continuous axis-aligned .15 m tube, including bounded endpoint offsets.
    for(const [dx,dz]of [[0,0],[-.15,-.15],[-.15,.15],[.15,-.15],[.15,.15]]){
     const c=clearance(a.x+(b.x-a.x)*i/n+dx,a.z+(b.z-a.z)*i/n+dz,y,colliders);samples++;
     if(c.min<min){min=c.min;nearest=c.nearest;}}}}
  modes.push({mode,minBodyClearance:min,nearestCollider:nearest,samples,clear:min>=-1e-6});}
 output.routes.push({name,points,groundY:y,modes});}
for(const id of ['south-079','south-086']){
 const b=catalog.buildings[id];expansionBuilding(b,'south',Number(id.slice(-3))-1);
 for(const f of b.floors.filter(f=>f.id==='lobby'||id==='south-079'&&f.id==='gallery')){
  const old=createCompactInteriorLayout(b,f),newLayout=id==='south-079'?applyAuthoredHomeLayout(b,f,old):applyAuthoredWorkshopLayout(b,f,old);
  let oldColliders=old.colliders,newColliders=newLayout.colliders;
  if(id==='south-086'){
   const oldPlan=oldWorkshop(b,f,old),newPlan=extendAuthoredWorkshopPlan(b,f,newLayout,oldPlan);
   // Match the production replacement filtering. Removed legacy boxes are not ghost colliders.
   const replaced=new Set(newPlan.replacePartIds);
   oldColliders=[...old.colliders,...oldPlan.colliders];
   newColliders=[...newLayout.colliders.filter(c=>!replaced.has(c.id)),...newPlan.colliders];
  }
  const sets=[['baseline',oldColliders],['authored',newColliders]];
  output.layoutSummaries.push({id,floorId:f.id,entrance:old.entrance,rooms:old.rooms,stairs:old.stairs,elevator:old.elevator,colliderCounts:{baseline:oldColliders.length,authored:newColliders.length}});
  if(id==='south-079'){
   const [r0,r1]=old.rooms,door0={x:130.3,z:r0.entrance.z},door1={x:130.3,z:r1.entrance.z};
   photo('home-'+r0.type,{...door0,y:f.y},sets);photo('home-'+r1.type,{...door1,y:f.y},sets);
   route('home-'+f.id+'-two-doors',[old.entrance,{x:133,z:r1.z},door1,{x:133,z:r1.z},{x:133,z:r0.z},door0,{x:133,z:r0.z},{x:133,z:old.stairs[0].bottom.z},old.stairs[0].bottom],f.y,sets);
   if(f.id==='lobby'){
    photo('home-sofa-close',{x:128.9,z:r0.z,y:f.y},sets);
    photo('home-bed-close',{x:127.5,z:112.9,y:f.y},sets);
    route('home-sofa-close',[door0,{x:128.9,z:r0.z}],f.y,sets);
    route('home-bed-close',[door1,{x:130.3,z:112.9},{x:127.5,z:112.9}],f.y,sets);
   }else{
    photo('home-bath-close',{x:127.5,z:113.42,y:f.y},sets);
    route('home-bath-close',[door1,{x:130.3,z:113.42},{x:127.5,z:113.42}],f.y,sets);
    route('home-gallery-top-to-doors',[old.stairs[0].top,{x:133,z:old.stairs[0].top.z},{x:133,z:r0.z},door0],f.y,sets);
   }
  }else{
   photo('workshop-whole',{x:197.6,z:-115,y:f.y},sets);
   photo('workshop-assembly-close',{x:188.3,z:-112,y:f.y},sets);
   photo('archive-whole',{x:196.7,z:-106,y:f.y},sets);
   photo('archive-retrieval-close',{x:189.4,z:-104,y:f.y},sets);
   route('workshop-whole-and-assembly',[old.entrance,{x:200,z:-115},{x:197.6,z:-115},{x:188.3,z:-115},{x:188.3,z:-112}],f.y,sets);
   route('archive-whole-and-retrieval',[{x:200,z:-115},{x:200,z:-104.5},{x:196.7,z:-104.5},{x:196.7,z:-106},{x:189.4,z:-106},{x:189.4,z:-104}],f.y,sets);
  }
 }
}
// One home stair only, using the existing discrete tread support formula.
// This is a body-clearance tube, never a claim that browser walking passed.
const hb=catalog.buildings['south-079'],hl=createCompactInteriorLayout(hb,hb.floors[0]),hg=createCompactInteriorLayout(hb,hb.floors[1]),flight=hl.stairs[0];
const stairSets=[['baseline',[...hl.colliders,...hg.colliders]],['authored',[...applyAuthoredHomeLayout(hb,hb.floors[0],hl).colliders,...applyAuthoredHomeLayout(hb,hb.floors[1],hg).colliders]]];
output.stairPreparation={flightId:flight.id,ascendingAndDescendingSameTube:true,support:'ceil(clamp((startZ-z)/run,0,1)*treadCount-1e-7)*rise/treadCount+fromY',modes:[]};
for(const[mode,colliders]of stairSets){let min=Infinity,nearest=null,samples=0;
 for(let z=flight.top.z;z<=flight.bottom.z+1e-8;z+=.025)for(const[dx,dz]of[[0,0],[-.15,-.15],[-.15,.15],[.15,-.15],[.15,.15]]){
  const zz=z+dz,t=Math.max(0,Math.min(1,(flight.startZ-zz)/flight.run)),y=flight.fromY+Math.ceil(t*flight.treadCount-1e-7)*flight.rise/flight.treadCount;
  const c=clearance(flight.x+dx,zz,y,colliders);samples++;if(c.min<min){min=c.min;nearest=c.nearest;}}
 output.stairPreparation.modes.push({mode,minBodyClearance:min,nearestCollider:nearest,samples,clear:min>=-1e-6});}
output.clear=output.photos.every(p=>p.modes.every(m=>m.clear))&&output.routes.every(p=>p.modes.every(m=>m.clear))&&output.stairPreparation.modes.every(m=>m.clear);
await fs.writeFile(new URL('evidence/common-pose-proof.json',here),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({status:output.status,clear:output.clear,failedPhotos:output.photos.filter(p=>p.modes.some(m=>!m.clear)),failedRoutes:output.routes.filter(p=>p.modes.some(m=>!m.clear)),layout:output.layoutSummaries.map(s=>({id:s.id,floorId:s.floorId,entrance:s.entrance,rooms:s.rooms.map(r=>({id:r.id,z:r.z,entrance:r.entrance})),stairs:s.stairs.slice(0,1)}))},null,2));
assert.ok(output.clear,'Adjust only prepared fixed routes, never game geometry or native player state');
