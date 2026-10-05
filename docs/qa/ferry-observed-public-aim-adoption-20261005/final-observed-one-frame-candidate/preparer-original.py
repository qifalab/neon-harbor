from pathlib import Path
import json,hashlib,subprocess
O=Path('/workspace/neon-candidates/ferry-fresh-relative-public-aim-candidate-20261005');D=Path('/workspace/neon-candidates/ferry-observed-one-frame-public-aim-candidate-20261005');D.mkdir(exist_ok=False)
h=lambda b:hashlib.sha256(b).hexdigest()
for n in ['original-15c-active-2e9-native-transport-high.mjs','original-15c-active-method-manifest.json']:(D/n).write_bytes((O/n).read_bytes())
text=(O/'payload/tools/native-review/methods/transport/native-transport-high.mjs').read_text()
needle='  async function aimFerryCabin(p,target,key,{revision,vehicleId,layout,localDeadline}) {'
addition='''  // The next mouse target uses only the two already observed control
  // frames. Prediction never satisfies a movement or camera assertion.
  function ferryObservedOneFrameMouseTarget(previous,current,desired,offset,target) {
    const p=transit(current).passengerLocal,v=vehicle(current,transit(current).ridingVehicleId),dt=current.timing?.dt;
    if(!previous)return {mouseYaw:desired,advance:0,compensation:0,basis:'unknown-first-sample-no-anticipation'};
    const oldP=transit(previous).passengerLocal,oldV=vehicle(previous,transit(previous).ridingVehicleId),elapsed=current.simulationTime-previous.simulationTime;
    if(!oldP||!oldV||oldV.id!==v.id||current.teleportRevision!==previous.teleportRevision||!Number.isFinite(elapsed)||elapsed<=0||elapsed>.250001||!Number.isFinite(dt)||dt<=0||dt>.250001||distance(p,oldP)>.000001)
      return {mouseYaw:desired,advance:0,compensation:0,basis:'unavailable-discontinuous-control-sample-no-anticipation'};
    const oldDesired=oldV.yaw+Math.atan2(target.x-oldP.x,target.z-oldP.z)-offset,observedDelta=angle(desired-oldDesired),limit=Math.min(Math.abs(observedDelta),.125),
      advance=Math.max(-limit,Math.min(limit,observedDelta*Math.min(1,dt/elapsed))),weight=-Math.expm1(-12*dt),forecast=desired+advance,
      correction=angle(forecast-current.camera.yaw)*(1/weight-1),compensation=Math.max(-limit,Math.min(limit,correction));
    if(!Number.isFinite(advance)||!Number.isFinite(compensation)||!(weight>0))return {mouseYaw:desired,advance:0,compensation:0,basis:'nonfinite-source-response-no-anticipation'};
    return {mouseYaw:forecast+compensation,advance,compensation,observedDelta,observedSimulationDelta:elapsed,actualFrameDt:dt,dampingWeight:weight,
      basis:'two-observed-contiguous-stationary-body-frames-one-frame-bounded-public-mouse'};
  }
'''
assert text.count(needle)==1;text=text.replace(needle,addition+needle)
a='let s=await page.evaluate(ferryCabinControlSnapshot);checked(s);';b='let s=await page.evaluate(ferryCabinControlSnapshot),previousControlFrame=null;checked(s);';assert text.count(a)==1;text=text.replace(a,b)
a='''          p.x-=angle(desired-p.orbitYaw)/(.005*s.settings.sensitivity);p.y+=(pitch-s.camera.pitch)/(.003*s.settings.sensitivity);
          await page.mouse.move(p.x,p.y);p.orbitYaw=desired;
          const waitCap='''
b='''          const mouseTarget=ferryObservedOneFrameMouseTarget(previousControlFrame,s,desired,offset,target);
          phase.progress.push({when:'bounded-observed-public-mouse-target',status:'PUBLIC_INPUT_ONLY_NOT_ACCEPTANCE',at:new Date().toISOString(),...mouseTarget,actualCurrentDesired:desired});
          previousControlFrame=s;
          p.x-=angle(mouseTarget.mouseYaw-p.orbitYaw)/(.005*s.settings.sensitivity);p.y+=(pitch-s.camera.pitch)/(.003*s.settings.sensitivity);
          await page.mouse.move(p.x,p.y);p.orbitYaw=mouseTarget.mouseYaw;
          const waitCap='''
assert text.count(a)==1;text=text.replace(a,b)
rev=json.loads((O/'EXACT_SOURCE_REVERSAL.json').read_text());restored=text
changes=rev['changes'];changes[0]['new']=addition+changes[0]['new']
# Rewrite the first insertion hunk to include the exact additional helper and
# mouse policy while keeping the other two original walk substitutions.
start=text.index('  // Ferry cabin only:');end=text.index('  async function releasePointer(primary) {',start)
changes[0]['new']=text[start:end]+'  async function releasePointer(primary) {'
for c in reversed(changes):assert restored.count(c['new'])==1;restored=restored.replace(c['new'],c['old'])
old=(D/'original-15c-active-2e9-native-transport-high.mjs').read_bytes();assert restored.encode()==old
payload=D/'payload/tools/native-review/methods/transport';payload.mkdir(parents=True);(payload/'native-transport-high.mjs').write_text(text)
(D/'EXACT_SOURCE_REVERSAL.json').write_text(json.dumps({'status':'LITERAL_FULL_EXECUTABLE_REVERSAL_TO_ACTUAL_15C_2E9','parentHEAD':'15c692eae329b8eaa8d5aba9ada4149e6b5bec79','parentMethodSHA256':h(old),'candidateMethodSHA256':h(text.encode()),'restoredWholeMethodSHA256':h(restored.encode()),'changeCount':len(changes),'changes':changes},indent=2)+'\n')
for n in ['verify-actual-ferry-relative-aim-source-cpu.mjs','verify-bus-tram-literal-public-action-and-motion-cpu.mjs']:
 s=(O/n).read_text().replace(str(O),str(D));(D/n).write_text(s)
print(json.dumps({'directory':str(D),'sha256':h(text.encode()),'bytes':len(text.encode())}))
