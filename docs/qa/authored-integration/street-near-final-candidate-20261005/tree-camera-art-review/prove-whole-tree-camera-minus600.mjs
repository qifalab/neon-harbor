import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const project='/tmp/neon-harbor-street-refinement-candidate-20261005';
const candidate='/workspace/neon-candidates/tree-crown-density-candidate-20261005/payload';
const fromRepo=p=>import(pathToFileURL(resolve(project,p)));
const THREE=await fromRepo('vendor/three/three.module.js');
const {createCityExploration}=await fromRepo('src/city-exploration.js');
const {circleOBB,moveCircle,SpatialIndex}=await fromRepo('src/collision.js');
const {ChaseCamera}=await fromRepo('src/camera.js');
const world=createCityExploration(THREE,new THREE.Scene(),{streaming:true,quality:'high'});
const radius=.65,tolerance=.15,stand={x:-600,y:0,z:-440.8},target={x:-617,y:5.15,z:-445};
const horizontal=Math.hypot(target.x-stand.x,target.z-stand.z);
// This is the existing plans.mjs photo() expression, not an idealized atan pitch.
const controls={yaw:Math.atan2(target.x-stand.x,target.z-stand.z),pitch:.15+Math.asin((stand.y+1.62-target.y)/horizontal),firstPerson:true};
const cameraRig=new ChaseCamera();
const camera=cameraRig.update(stand,controls,1/60,world.colliders);
const blockers=world.colliders.filter(c=>c.physics!==false);
const colliderHash=createHash('sha256').update(JSON.stringify(world.colliders)).digest('hex');
function nearest(position){
 const y=world.groundHeightAt(position.x,position.z);
 let nearest=null;
 for(const c of blockers){
  if(!(c.maxY>y+.2&&c.minY<y+1.8))continue;
  const dx=position.x-c.x,dz=position.z-c.z,s=Math.sin(c.yaw||0),co=Math.cos(c.yaw||0);
  const x=dx*co-dz*s,z=dx*s+dz*co;
  const gap=Math.hypot(Math.max(Math.abs(x)-c.hx,0),Math.max(Math.abs(z)-c.hz,0));
  if(!nearest||gap<nearest.centreToSolidDistanceMetres)nearest={id:c.id,centreToSolidDistanceMetres:gap,bodyClearanceMetres:gap-radius,standingToleranceClearanceMetres:gap-radius-tolerance};
 }
 return nearest;
}
function sample(position,r=radius){
 const y=world.groundHeightAt(position.x,position.z);
 return{position:{...position,y},contacts:blockers.filter(c=>c.maxY>y+.2&&c.minY<y+1.8&&circleOBB({...position,radius:r},c)).map(c=>c.id)};
}
const legSpecs=[
 ['old-ridge-to-inspection-pavement',{x:-568.2799999999996,z:-438.20000000000675},{x:-568.2799999999996,z:-440.8}],
 ['day-new-whole-tree-approach',{x:-568.2799999999996,z:-440.8},{x:-600,z:-440.8}],
 ['old-whole-stand-to-new-whole-stand',{x:-612,z:-440.8},{x:-600,z:-440.8}],
 ['new-whole-stand-to-far-release',{x:-600,z:-440.8},{x:-720,z:-440.8}],
 ['unchanged-far-release-return',{x:-720,z:-440.8},{x:-612,z:-440.8}],
 ];
const index=new SpatialIndex(world.colliders),options={index,bounds:world.bounds,groundHeightAt:world.groundHeightAt};
const legs=[];
for(const[label,start,end]of legSpecs){
 const distance=Math.hypot(end.x-start.x,end.z-start.z),count=Math.ceil(distance/.1),samples=[];
 let minGround=Infinity,maxGround=-Infinity,nearestGap=Infinity;
 for(let i=0;i<=count;i++){
  const position={x:start.x+(end.x-start.x)*i/count,z:start.z+(end.z-start.z)*i/count},s=sample(position);
  assert.equal(s.contacts.length,0,label+' static contact');assert.equal(s.position.y,0,label+' ground changed');
  minGround=Math.min(minGround,s.position.y);maxGround=Math.max(maxGround,s.position.y);nearestGap=Math.min(nearestGap,nearest(position).centreToSolidDistanceMetres);
  if(i===0||i===count)samples.push(s);
 }
 const pose={...start,y:0};const moved=moveCircle(pose,end.x-start.x,end.z-start.z,radius,options);
 assert.ok(Math.abs(pose.x-end.x)<1e-7&&Math.abs(pose.z-end.z)<1e-7,label+' real source sweep did not arrive');
 assert.equal(moved.contacts.length,0,label+' real source sweep collision');
 legs.push({label,start,end,distanceMetres:distance,staticSampleCount:count+1,minGround,maxGround,nearestBodyClearanceMetres:nearestGap-radius,samples,actualSourceMoveCircleFinal:pose,actualSourceMoveCircleReport:moved});
}
const standing=sample(stand,radius+tolerance);assert.equal(standing.contacts.length,0);
const foot=[];
for(let i=0;i<16;i++){const a=i*Math.PI/8,x=stand.x+Math.cos(a)*(radius+tolerance),z=stand.z+Math.sin(a)*(radius+tolerance),y=world.groundHeightAt(x,z);assert.equal(y,0);foot.push({x,z,y});}
const manifest=JSON.parse(await readFile(resolve(candidate,'assets/harbor/vegetation/asset-manifest.json')));
const asset=manifest.assets.find(a=>a.id==='quay-banyan-a');
const actualBounds={min:asset.bounds.bark.min.map((v,i)=>Math.min(v,asset.bounds.leaves.min[i])),max:asset.bounds.bark.max.map((v,i)=>Math.max(v,asset.bounds.leaves.max[i]))};
const makeCorners=b=>[...Array(8)].map((_,i)=>new THREE.Vector3((i&1?b.max:b.min)[0]-617,(i&2?b.max:b.min)[1],(i&4?b.max:b.min)[2]-445));
function projectCorners(bounds,position=stand,yaw=controls.yaw,pitch=controls.pitch){
 const rig=new ChaseCamera(),view=rig.update(position,{...controls,yaw,pitch},1/60,world.colliders);
 const cam=new THREE.PerspectiveCamera(65,1280/800,.1,3500);cam.position.set(view.position.x,view.position.y,view.position.z);cam.lookAt(view.target.x,view.target.y,view.target.z);cam.updateMatrixWorld();
 return makeCorners(bounds).map(worldCorner=>{const ndc=worldCorner.clone().project(cam),inView=Math.abs(ndc.x)<1&&Math.abs(ndc.y)<1&&ndc.z>-1&&ndc.z<1;return{world:worldCorner.toArray(),ndc:ndc.toArray(),pixel:[(ndc.x+1)*640,(1-ndc.y)*400],inView};});
}
const actualCorners=projectCorners(actualBounds),envelopeCorners=projectCorners(manifest.oldEnvelope);
if(!actualCorners.every(c=>c.inView)||!envelopeCorners.every(c=>c.inView)){
 await writeFile(new URL('./whole-tree-camera-minus600-rejected.json',import.meta.url),JSON.stringify({status:'CPU_BBOX_FOV_FIRST_MINUS600_REJECTED',stand,target,controls,camera,actualBounds,actualCorners,envelopeCorners,legs,standing,nearest:nearest(stand),nativeExecuted:false},null,2)+'\n');
 console.log(JSON.stringify({status:'CPU_BBOX_FOV_FIRST_MINUS600_REJECTED',stand,target,controls,camera,actualCorners,envelopeCorners}));
}
assert.ok(actualCorners.every(c=>c.inView));assert.ok(envelopeCorners.every(c=>c.inView));
const perturbations=[];
for(const dx of[-tolerance,tolerance])for(const dz of[-tolerance,tolerance])for(const dyaw of[-.004,.004])for(const dpitch of[-.004,.004]){
 const c=projectCorners(manifest.oldEnvelope,{...stand,x:stand.x+dx,z:stand.z+dz},controls.yaw+dyaw,controls.pitch+dpitch);
 assert.ok(c.every(v=>v.inView),'Endpoint/camera tolerance clips old AABB');
 perturbations.push({offset:{dx,dz,dyaw,dpitch},maxAbsNdcX:Math.max(...c.map(v=>Math.abs(v.ndc[0]))),maxAbsNdcY:Math.max(...c.map(v=>Math.abs(v.ndc[1])))});
}
const sourceHashes={};for(const p of['src/city-exploration.js','src/collision.js','src/camera.js','src/metropolis-world.js','src/metropolis-western-ridge.js','src/harbor-sample-trees.js','src/harbor-district.js','src/harbor-frontage-profiles.js','src/metropolis-infrastructure.js'])sourceHashes[p]=createHash('sha256').update(await readFile(resolve(project,p))).digest('hex');
const result={status:'CPU_SOURCE_GROUND_ROUTE_AND_ALL_BBOX_CAMERA_CORNERS_PASS_NATIVE_PENDING',project,sourceHashes,colliders:{count:world.colliders.length,sha256:colliderHash},bodyRadius:radius,axisTolerance:tolerance,stand,target,publicCameraControls:{yaw:controls.yaw,pitch:controls.pitch,fov:65},actualSourceChaseCamera:camera,viewport:{width:1280,height:800},wholePhotoPlan:{kind:'photo',label:'06-near-quay-tree-whole',position:stand,target,axisTolerance:tolerance,hud:'compact',camera:{yaw:controls.yaw,pitch:controls.pitch,fov:65},expectTrees:[0]},dayWalkDelta:{oldTargetX:-612,newTargetX:-600,oldApproachMetres:43.72000000000037,newApproachMetres:31.72000000000037,oldFarLegMetres:108,newFarLegMetres:120,farReturnXPreserved:-612,oldRidgeReferenceUnchanged:true},routeLegs:legs,standing,standingNearestBlocker:nearest(stand),standingFootprintSupportedSamples:foot,actualCandidateBounds:actualBounds,actualCandidateGLBSha256:asset.sha256,actualCandidateBBoxCorners:actualCorners,originalConservativeEnvelopeBBoxCorners:envelopeCorners,toleranceCornerCases:perturbations,limitations:['Actual source CPU world, collision sweeps, supported ground and actual camera implementation; no GPU, native pixel, moving NPC/traffic or hardware performance evidence.','All candidate actual AABB and conservative original-envelope corners fit the frozen public FOV; this does not establish artistic composition, lighting or native street owner release.','ROOT/NEXT, prior methods and original baselines unchanged.']};
await writeFile(new URL('./whole-tree-camera-minus600-proof.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,stand,target,camera:result.publicCameraControls,standingNearestBlocker:result.standingNearestBlocker,routeCount:legs.length,maxNdcX:Math.max(...envelopeCorners.map(v=>Math.abs(v.ndc[0]))),maxNdcY:Math.max(...envelopeCorners.map(v=>Math.abs(v.ndc[1]))),maxPerturbedNdcY:Math.max(...perturbations.map(v=>v.maxAbsNdcY))}));
world.south.dispose?.();world.north.dispose?.();world.harbor.dispose?.();world.sample.district.dispose?.();world.people.dispose?.();
