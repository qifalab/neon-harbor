/** Source-only additive storefront view. The original plans and close photos
 * are retained verbatim. Authorized fixture legs are explicit; mode never
 * changes the added path or camera. */
const walk=(axis,target)=>({kind:'walk',axis,target});
const shops=new Set(['south-090','south-091','south-092','south-094','south-095','south-096']);
const sideLegShops=new Set(['south-091','south-095']);
const publicDoorPlaneDistance=9;
const eastPublicStreetX=234.5;
// Same public camera preparation formula as original plans.mjs:8–14.
function photo(label,x,z,y,target,roomId=null){
 const eye={x,y:y+1.62,z}, horizontal=Math.hypot(target.x-x,target.z-z);
 const pitch=.15+Math.asin((eye.y-target.y)/horizontal);
 if(!Number.isFinite(pitch)||pitch<-.75||pitch>1.05)throw new Error('Prepared camera exceeds actual public pitch limits: '+label);
 return {kind:'photo',label,position:{x,y,z},axisTolerance:.15,target,roomId,
   nominalEye:eye,camera:{yaw:Math.atan2(target.x-x,target.z-z),pitch,fov:65},
   nominalEyeDistance:Math.hypot(target.x-eye.x,target.y-eye.y,target.z-eye.z)};
}
export function compileWideFrontagePlan(building,original){
 if(!building||!shops.has(building.id)||original?.id!==building.id)throw new Error('Wide storefront requires an original six-shop public plan');
 if(original.budgetMinutes!==12)throw new Error('Original storefront whole case budget changed');
 const face=building.z+building.depth/2,doorZ=face+.64,closeZ=face+2;
 const originalDoorIndex=original.steps.findIndex(step=>step.kind==='door');
 if(originalDoorIndex<0)throw new Error('Original public-door checkpoint missing');
 let route=original.steps,fixtureDetour=null;
 if(['south-092','south-096'].includes(building.id)){
  // These two original east-return stations intersect real street lamps.
  // Use actual cardinal walking on a clear face+1.8 outside-corner line,
  // both approaching and returning. All original photograph objects stay.
  const photoIndex=route.findIndex(step=>step.kind==='photo'&&step.label==='east-display-face-close');
  const outboundIndex=photoIndex-2,returnIndex=photoIndex+1;
  if(photoIndex<2||route[outboundIndex].kind!=='walk'||route[outboundIndex].axis!=='x'||
    route[returnIndex]?.kind!=='walk'||route[returnIndex].axis!=='z'||
    route[returnIndex].target!==building.entrance.z)throw new Error('Original east-photo fixture legs changed');
  const outwardWaypoints=[walk('z',face+1.8)];
  const returnWaypoints=[walk('z',face+1.8),walk('x',building.x),walk('z',building.entrance.z)];
  fixtureDetour={label:building.id+'-real-outside-lamp-corner-detour',
   outbound:{insertedBeforeOriginalStep:outboundIndex,originalStep:route[outboundIndex],waypoints:outwardWaypoints,
    originalEntranceAlignmentRetained:true},
   returning:{replacesOriginalStep:returnIndex,originalStep:route[returnIndex],waypoints:returnWaypoints},
   standingGround:building.baseY,sourceFaceOffset:1.8,
   reason:'Original cardinal approach/return target region intersects a real lamp. No lamp/physics disable or assumption of collision-driven sideways escape.'};
  route=route.flatMap((step,index)=>index===outboundIndex?[...outwardWaypoints,step]:index===returnIndex?returnWaypoints:[step]);
 }
 const doorIndex=route.findIndex(step=>step.kind==='door');
 const priorPhoto=route.slice(0,doorIndex).findLast(step=>step.kind==='photo');
 if(!priorPhoto)throw new Error('Original door camera baseline missing');
 const sideLeg=sideLegShops.has(building.id),wideX=sideLeg?eastPublicStreetX:building.x,wideZ=doorZ+publicDoorPlaneDistance;
 const outward=sideLeg?[walk('x',wideX),walk('z',wideZ)]:[walk('z',wideZ)];
 const returning=sideLeg?[walk('z',closeZ),walk('x',building.x)]:[walk('z',closeZ)];
 // These new standing points lie on the ordinary road surface (ground 0),
 // not the original frontage pavement (baseY .18). Static proof is pinned
 // separately; actual capture still checks the real ground and endpoint.
 const widePhoto=photo('public-door-frontage-wide',wideX,wideZ,0,
   {x:building.x,y:building.baseY+2.1,z:doorZ});
 const restoreLook={kind:'look',label:'wide-return-original-door-look',yaw:Math.PI,pitch:priorPhoto.camera.pitch};
 const added=[...outward,widePhoto,...returning,restoreLook];
 // South092 completed the original route at23m54s, leaving only5.681s
 // for its supported35s owner close. Keep all local guards; use a finite30m
 // whole cap in both modes. The original24m authored result remains FAIL.
 const wholeCaseMinutes=sideLeg||building.id==='south-092'?30:24;
 return {...original,budgetMinutes:wholeCaseMinutes,
  originalWholeCaseBudgetMinutes:original.budgetMinutes,
  scope:original.scope+' One additional publicly walked wide public-door frontage view and exact return to the original door route. The oblique cases are not a straight-on display-facade view.',
  steps:[...route.slice(0,doorIndex),...added,...route.slice(doorIndex)],
  ...(fixtureDetour?{fixtureDetour}:{}),
  wideExtension:{schema:'public-frontage-wide-v1',originalStepCount:original.steps.length,
   originalPhotoLabels:original.steps.filter(step=>step.kind==='photo').map(step=>step.label),
   insertedBeforeOriginalStep:originalDoorIndex,addedSteps:added.length,addedPhotos:1,
   bodyRadiusForStaticProof:.65,axisTolerance:.15,publicDoorPlaneDistanceMetres:publicDoorPlaneDistance,
   actualHorizontalDoorPointDistanceMetres:Math.hypot(wideX-building.x,wideZ-doorZ),
   view:sideLeg?'oblique from east public street':'south-facing public-door front',
   publicDoor:{x:building.x,y:building.baseY,z:doorZ,yaw:0},
   originalDoorStation:{x:building.x,y:building.baseY,z:closeZ},
   wideStanding:{x:wideX,y:0,z:wideZ},restoreLook,
   budgets:{wholeCaseMinutes,originalWholeCaseMinutes:12,
    reason:'Finite preparation cap from original wall evidence plus new real distance/photo processing. No validated completion upper bound.',
    perPhaseDefaultMs:180000,perHoldMs:120000,maximumCorrectionHolds:2,localInputHelperUnchanged:true}}};
}
