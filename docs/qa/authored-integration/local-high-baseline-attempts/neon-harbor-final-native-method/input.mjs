import assert from 'node:assert/strict';
export const snapshot=page=>page.evaluate(()=>window.__NEON__.snapshot());
export const errorRecord=error=>({name:error?.name||null,message:error?.message||String(error),stack:error?.stack||null});
const angular=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const motion=s=>({position:s.position,camera:s.camera,simulationTime:s.simulationTime,
 teleportRevision:s.teleportRevision,buildingId:s.city.interior.buildingId,floorId:s.city.interior.floorId,roomId:s.city.interior.currentRoomId});
function axisKey(yaw,axis,positive){
 const keys=[{key:'w',x:Math.sin(yaw),z:Math.cos(yaw)},{key:'s',x:-Math.sin(yaw),z:-Math.cos(yaw)},
  {key:'d',x:-Math.cos(yaw),z:Math.sin(yaw)},{key:'a',x:Math.cos(yaw),z:-Math.sin(yaw)}];
 keys.sort((a,b)=>positive?b[axis]-a[axis]:a[axis]-b[axis]);
 assert.ok(Math.abs(keys[0][axis])>.995,'Real WASD requires the public cardinal camera orientation');return keys[0].key;
}
/** No imported legacy 24-tap retry loop. Every actual key hold is recorded.
 * A leg has one coarse hold, one precision approach and at most TWO explicitly
 * logged corrective holds. A blocked or inaccurate leg stops the case. */
export function createInput(page,{remaining,record,persist}){
 async function face(yaw,pitch=null){
  await page.waitForFunction(()=>Number.isFinite(window.__NEON__.snapshot().camera?.yaw),null,{polling:'raf',timeout:remaining(30000)});
  const before=await snapshot(page),delta=angular(yaw,before.camera.yaw),box=await page.locator('#game').boundingBox();
  assert.ok(box&&before.settings.sensitivity===1,'Fresh public settings and actual game canvas');
  const x=box.x+box.width*.72,y=box.y+box.height*.28;
  const pitchDelta=pitch===null?0:pitch-before.camera.pitch;
  if(Math.abs(delta)<.003&&Math.abs(pitchDelta)<.003)return;
  const event={kind:'real-pointer-look',yaw,pitch,before:motion(before),startedAt:new Date().toISOString(),firstError:null,secondaryErrors:[]};
  record.inputs.push(event);let first=null;
  try{
   await page.mouse.move(x,y);await page.mouse.down();
   await page.mouse.move(x-delta/.005,y+pitchDelta/.003);
   await page.mouse.up();
   await page.waitForFunction(({yaw,pitch})=>{const c=window.__NEON__.snapshot().camera;
    return Math.abs(Math.atan2(Math.sin(c.yaw-yaw),Math.cos(c.yaw-yaw)))<.003&&(pitch===null||Math.abs(c.pitch-pitch)<.004);
   },{yaw,pitch},{polling:'raf',timeout:remaining(30000)});
  }catch(error){first=error;}finally{
   try{await page.mouse.up();}catch(error){event.secondaryErrors.push({stage:'pointer-up',...errorRecord(error)});first ||=error;}
   try{event.after=motion(await snapshot(page));}catch(error){event.secondaryErrors.push({stage:'after-snapshot',...errorRecord(error)});first ||=error;}
   event.firstError=first?errorRecord(first):null;event.status=first?'failed':'completed';event.finishedAt=new Date().toISOString();
   try{await persist();}catch(error){event.secondaryErrors.push({stage:'persist',...errorRecord(error)});first ||=error;}
  }
  if(first)throw first;
 }
 async function walk(axis,target){
  assert.ok(['x','z'].includes(axis)&&Number.isFinite(target));
  const item={kind:'real-WASD-leg',axis,target,toleranceMetres:.15,maximumCorrectionHolds:2,
   startedAt:new Date().toISOString(),status:'running',holds:[],secondaryErrors:[]};
  record.inputs.push(item);let first=null,before,current,precisionStart;
  async function hold(kind,positive,predicate,args){
   current=await snapshot(page);
   const key=axisKey(current.camera.yaw,axis,positive),h={kind,key,precision:kind!=='coarse',before:motion(current),startedAt:new Date().toISOString(),secondaryErrors:[]};
   item.holds.push(h);let holdError=null;
   try{
    if(h.precision)await page.keyboard.down('z');
    await page.keyboard.down(key);
    await page.waitForFunction(predicate,args,{polling:'raf',timeout:remaining(120000)});
   }catch(error){holdError=error;}finally{
    for(const releaseKey of[key,...(h.precision?['z']:[])])try{await page.keyboard.up(releaseKey);}catch(error){h.secondaryErrors.push({stage:'keyup-'+releaseKey,...errorRecord(error)});holdError ||=error;}
    try{current=await snapshot(page);h.after=motion(current);}catch(error){h.secondaryErrors.push({stage:'hold-after-snapshot',...errorRecord(error)});holdError ||=error;}
    h.firstError=holdError?errorRecord(holdError):null;h.status=holdError?'failed':'completed';h.finishedAt=new Date().toISOString();
   }
   if(holdError)throw holdError;
   assert.equal(current.teleportRevision,before.teleportRevision,'An actual walking key must not teleport');
  }
  try{
   await face(Math.PI);before=await snapshot(page);current=before;item.before=motion(before);
   item.remainingMsAtStart=remaining();
   const initial=before.position[axis];
   if(Math.abs(target-initial)>3.2){
    const positive=target>initial;
    await hold('coarse',positive,({axis,target,positive})=>{const value=window.__NEON__.snapshot().position[axis];
     return positive?value>=target-2.2:value<=target+2.2;},{axis,target,positive});
   }
   precisionStart=current.position[axis];
   if(Math.abs(target-current.position[axis])>=.15){
    const start=current.position[axis],sign=Math.sign(target-start);
    await hold('precision-approach',sign>0,({axis,start,target,sign})=>{const value=window.__NEON__.snapshot().position[axis];
     return sign*(value-start)>.01&&(Math.abs(value-target)<.07||sign*(value-target)>=0);},{axis,start,target,sign});
   }
   for(let correction=1;Math.abs(target-current.position[axis])>=.15&&correction<=2;correction++){
    const start=current.position[axis],sign=Math.sign(target-start);
    await hold('explicit-endpoint-correction-'+correction,sign>0,({axis,start,sign})=>
     sign*(window.__NEON__.snapshot().position[axis]-start)>.01,{axis,start,sign});
   }
   assert.ok(Math.abs(target-current.position[axis])<.15,'Actual endpoint did not settle within .15 m after the two declared corrections');
   assert.equal(current.teleportRevision,before.teleportRevision,'Physical leg keeps teleport revision');
   const budget=Math.abs(precisionStart-initial)/5.6+Math.abs(target-precisionStart)/.8+5;
   item.simulationBudgetSeconds=budget;
   assert.ok(current.simulationTime-before.simulationTime<budget,'The real route stalled or exceeded its finite physical movement budget');
  }catch(error){first=error;}finally{
   // This preserves the original input failure if the diagnostic or cleanup also fails.
   for(const key of['w','a','s','d','z'])try{await page.keyboard.up(key);}catch(error){item.secondaryErrors.push({stage:'final-keyup-'+key,...errorRecord(error)});first ||=error;}
   try{item.actualAfter=motion(await snapshot(page));}catch(error){item.secondaryErrors.push({stage:'leg-after-snapshot',...errorRecord(error)});first ||=error;}
   item.firstError=first?errorRecord(first):null;item.status=first?'failed':'completed';item.finishedAt=new Date().toISOString();
   try{await persist();}catch(error){item.secondaryErrors.push({stage:'persist',...errorRecord(error)});first ||=error;}
  }
  if(first)throw first;return current;
 }
 return {face,walk};
}
