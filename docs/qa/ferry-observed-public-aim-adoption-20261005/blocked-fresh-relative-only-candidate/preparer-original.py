from pathlib import Path
import json,hashlib,subprocess
P=Path('/workspace/neon-candidates/harbor-combined-transit-art-final-20261005')
D=Path('/workspace/neon-candidates/ferry-fresh-relative-public-aim-candidate-20261005')
D.mkdir(exist_ok=False)
H=lambda b:hashlib.sha256(b).hexdigest()
old=(P/'tools/native-review/methods/transport/native-transport-high.mjs').read_bytes()
assert H(old)=='2e9c11fbc4fc959e4074fa45effd7f17b5cea8d391436095586e43a46fe2ca94'
assert subprocess.check_output(['git','-C',str(P),'rev-parse','HEAD'],text=True).strip()=='15c692eae329b8eaa8d5aba9ada4149e6b5bec79'
(D/'original-15c-active-2e9-native-transport-high.mjs').write_bytes(old)
(D/'original-15c-active-method-manifest.json').write_bytes((P/'tools/native-review/methods/transport/method-manifest.json').read_bytes())
helper='''  // Ferry cabin only: serialize the original consumed control fields rather
  // than the city's resource catalogue. The game snapshot itself is read-only.
  function ferryCabinControlSnapshot() {
    const s=window.__NEON__.snapshot(),t=s.city.sample.transit,v=t.vehicles.find(v=>v.id===t.ridingVehicleId);
    return {ready:s.ready,started:s.started,paused:s.paused,settings:s.settings,renderer:{contextLost:s.renderer.contextLost},
      position:s.position,camera:s.camera,timing:s.timing,simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,
      city:{sample:{transit:{stationId:t.stationId,riding:t.riding,ridingVehicleId:t.ridingVehicleId,passengerLocal:t.passengerLocal,
        passengerDeck:t.passengerDeck,phase:t.phase,vehicles:v?[v]:[]}}}};
  }
  function ferryCabinRelativeAimObservation(a) {
    const s=window.__NEON__.snapshot(),t=s.city.sample.transit,p=t.passengerLocal,v=t.vehicles.find(v=>v.id===t.ridingVehicleId);
    const state={ready:s.ready,started:s.started,paused:s.paused,settings:s.settings,renderer:{contextLost:s.renderer.contextLost},
      position:s.position,camera:s.camera,timing:s.timing,simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,
      city:{sample:{transit:{stationId:t.stationId,riding:t.riding,ridingVehicleId:t.ridingVehicleId,passengerLocal:p,
        passengerDeck:t.passengerDeck,phase:t.phase,vehicles:v?[v]:[]}}}};
    if(Date.now()>=a.phaseDeadline||Date.now()>=a.localDeadline||Date.now()>=a.wholeDeadline)return {status:'FAILED',failure:'original finite Ferry aim/local/whole deadline',state};
    if(s.teleportRevision!==a.revision)return {status:'FAILED',failure:'original cabin teleport revision',state};
    if(!t.riding||t.ridingVehicleId!==a.vehicleId||!p||!v)return {status:'FAILED',failure:'original riding vehicle/passenger unavailable',state};
    if(!['x','y','z'].every(k=>Number.isFinite(p[k]))||!Number.isFinite(v.yaw)||!Number.isFinite(s.simulationTime))return {status:'FAILED',failure:'actual finite passenger/elapsed snapshot',state};
    const angle=n=>Math.atan2(Math.sin(n),Math.cos(n)),localHeading=Math.atan2(a.target.x-p.x,a.target.z-p.z),desired=v.yaw+localHeading-a.offset;
    if(Number.isFinite(s.camera?.yaw)&&Number.isFinite(s.camera?.pitch)&&Math.abs(angle(s.camera.yaw-desired))<.025&&Math.abs(s.camera.pitch-a.pitch)<.003)return {status:'MATCHED_FRESH_RELATIVE',state,localHeading,desired};
    // A moving ship can invalidate the requested absolute camera before it
    // settles. Return only for another real mouse aim; never for movement.
    if(Math.abs(angle(desired-a.requestedYaw))>=.025)return {status:'PUBLIC_RELATIVE_REAIM_REQUIRED',state,localHeading,desired};
    return false;
  }
  async function aimFerryCabin(p,target,key,{revision,vehicleId,layout,localDeadline}) {
    const pitch=.15,offset={w:0,s:Math.PI,a:Math.PI/2,d:-Math.PI/2}[key],phaseDeadline=Math.min(Date.now()+remaining(60000),localDeadline),
      phase={type:'ferry-relative-cabin-aim',target:{local:target,key,pitch},budgetMs:60000,startedAt:new Date().toISOString(),status:'RUNNING',progress:[],diagnosticErrors:[],firstError:null};record.aimPhases.push(phase);
    const checked=s=>{healthy(s);assert.ok(s.started&&!s.paused,'actual unpaused Ferry cabin aim');assert.equal(s.teleportRevision,revision,'original cabin teleport revision');assert.ok(transit(s).riding&&transit(s).ridingVehicleId===vehicleId&&vehicle(s,vehicleId),'original riding vehicle/passenger unavailable');radiusGuard(s,layout);assert.ok(Number.isFinite(s.simulationTime)&&Number.isFinite(vehicle(s,vehicleId).yaw),'actual finite Ferry control state');};
    try {
      let matched=null;
      await bounded(async()=>{
        let s=await page.evaluate(ferryCabinControlSnapshot);checked(s);
        while(!matched) {
          const cap=Math.min(phaseDeadline-Date.now(),localDeadline-Date.now(),deadline-Date.now());assert.ok(cap>0,'original finite Ferry aim/local/whole deadline');
          const before=transit(s).passengerLocal,localHeading=Math.atan2(target.x-before.x,target.z-before.z),desired=vehicle(s,vehicleId).yaw+localHeading-offset;
          phase.progress.push({when:'fresh-relative-before-public-input',status:'OBSERVED',at:new Date().toISOString(),desired,localHeading,observed:progressOf(s,vehicleId)});
          if(Number.isFinite(s.camera?.yaw)&&Number.isFinite(s.camera?.pitch)&&Math.abs(angle(s.camera.yaw-desired))<.025&&Math.abs(s.camera.pitch-pitch)<.003){phase.satisfiedBy='same-fresh-frame-original-relative-camera-predicate';matched=s;break;}
          p.x-=angle(desired-p.orbitYaw)/(.005*s.settings.sensitivity);p.y+=(pitch-s.camera.pitch)/(.003*s.settings.sensitivity);
          await page.mouse.move(p.x,p.y);p.orbitYaw=desired;
          const waitCap=Math.min(phaseDeadline-Date.now(),localDeadline-Date.now(),deadline-Date.now());assert.ok(waitCap>0,'original finite Ferry aim/local/whole deadline');
          const handle=await page.waitForFunction(ferryCabinRelativeAimObservation,{target,offset,pitch,requestedYaw:desired,revision,vehicleId,phaseDeadline,localDeadline,wholeDeadline:deadline},{polling:'raf',timeout:waitCap});
          let observed;try{observed=await handle.jsonValue();}finally{await handle.dispose();}
          assert.ok(Date.now()<phaseDeadline&&Date.now()<localDeadline&&Date.now()<deadline,'original finite Ferry aim/local/whole deadline');
          assert.ok(!observed.failure,observed.failure||'fresh-relative Ferry aim');s=observed.state;checked(s);
          phase.progress.push({when:'fresh-relative-readonly-waiter',status:observed.status,at:new Date().toISOString(),desired:observed.desired,localHeading:observed.localHeading,observed:progressOf(s,vehicleId)});
          if(observed.status==='MATCHED_FRESH_RELATIVE'){assert.ok(Math.abs(angle(s.camera.yaw-observed.desired))<.025&&Math.abs(s.camera.pitch-pitch)<.003,'original relative-camera predicate on returned control frame');matched=s;}
          else assert.equal(observed.status,'PUBLIC_RELATIVE_REAIM_REQUIRED','wrong camera requires public reaim before any movement');
        }
      },Math.max(1,Math.min(phaseDeadline-Date.now(),localDeadline-Date.now(),deadline-Date.now())),'finite Ferry relative aim phase');
      phase.status='SATISFIED';return matched;
    }catch(error){phase.firstError=err(error,'Ferry relative cabin aim');phase.status='FAILED';await releasePointer(error);await observePhaseProgress(phase,'timeout',vehicleId,null,error);throw error;}
    finally{phase.finishedAt=new Date().toISOString();}
  }
'''
text=old.decode()
changes=[('  async function releasePointer(primary) {',helper+'  async function releasePointer(primary) {'),
("assert.ok(Date.now()<localDeadline);const before=transit(current).passengerLocal,v=vehicle(current,transit(current).ridingVehicleId),dx=target.x-before.x,dz=target.z-before.z;", "assert.ok(Date.now()<localDeadline);let before=transit(current).passengerLocal,v=vehicle(current,transit(current).ridingVehicleId),dx=target.x-before.x,dz=target.z-before.z;"),
("const desired=v.yaw+Math.atan2(dx,dz)-offset;const reusedFrame=await aim(p,desired,.15,{acceptCurrent:true});", "let desired=v.yaw+Math.atan2(dx,dz)-offset;const reusedFrame=kind==='ferry'?await aimFerryCabin(p,target,key,{revision,vehicleId:transit(current).ridingVehicleId,layout,localDeadline}):await aim(p,desired,.15,{acceptCurrent:true});\n        if(kind==='ferry'){current=reusedFrame;before=transit(current).passengerLocal;v=vehicle(current,transit(current).ridingVehicleId);dx=target.x-before.x;dz=target.z-before.z;desired=v.yaw+Math.atan2(dx,dz)-offset;}")]
for oldh,newh in changes:
 assert text.count(oldh)==1,(oldh,text.count(oldh));text=text.replace(oldh,newh)
reversedtext=text
for oldh,newh in reversed(changes):
 assert reversedtext.count(newh)==1;reversedtext=reversedtext.replace(newh,oldh)
assert reversedtext.encode()==old
payload=D/'payload/tools/native-review/methods/transport';payload.mkdir(parents=True)
(payload/'native-transport-high.mjs').write_text(text)
(D/'EXACT_SOURCE_REVERSAL.json').write_text(json.dumps({'status':'LITERAL_FULL_EXECUTABLE_REVERSAL_TO_ACTUAL_15C_2E9','parentHEAD':'15c692eae329b8eaa8d5aba9ada4149e6b5bec79','parentMethodSHA256':H(old),'candidateMethodSHA256':H(text.encode()),'restoredWholeMethodSHA256':H(reversedtext.encode()),'changeCount':len(changes),'changes':[{'old':a,'new':b}for a,b in changes]},indent=2)+'\n')
print(json.dumps({'directory':str(D),'candidateSHA256':H(text.encode()),'bytes':len(text.encode()),'parent':H(old),'changes':len(changes)}))
