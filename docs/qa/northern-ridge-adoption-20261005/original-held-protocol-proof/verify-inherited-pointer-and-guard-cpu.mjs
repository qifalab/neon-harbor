import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root='/workspace/neon-candidates/transport-held-public-slow-leg-candidate-20261005';const baseRoot='/workspace/neon-candidates/5cd-bus-native-failure-review-20261005';
const original=fs.readFileSync(`${baseRoot}/native-transport-high-executed-original-e26.mjs`,'utf8');
const candidate=fs.readFileSync(`${root}/payload/tools/native-review/methods/transport/native-transport-high.mjs`,'utf8');
const main=fs.readFileSync(`${baseRoot}/executed-5cd-src-main.js`,'utf8');
const handlers=main.split('\n').filter(line=>line.startsWith("$('game').addEventListener('pointerdown'")||line.startsWith("$('game').addEventListener('pointermove'"));
assert.equal(handlers.length,2);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
const extract=(source,begin,end)=>{const a=source.indexOf(begin),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};
const methods=Object.fromEntries([['original',original],['candidate',candidate]].map(([key,source])=>[key,
  extract(source,'  async function pointer()', '  const progressOf =')+
  extract(source,'  async function aim(', '  async function releasePointer(')]));
const healthySource=extract(original,'  const healthy =', '  async function pointer()');
const baseline=JSON.parse(fs.readFileSync('/workspace/neon-evidence/5cd-bus-original-fail-11326904370/extracted/native/baseline/bus/case.json'));
const baselinePhoto=JSON.parse(fs.readFileSync('/workspace/neon-evidence/5cd-bus-original-fail-11326904370/extracted/native/baseline/bus/upper-pose.json'));
const authored=JSON.parse(fs.readFileSync('/workspace/neon-evidence/5cd-bus-original-fail-11326904370/extracted/native/authored/bus/case.json'));
const lastAim=baseline.aimPhases.at(-1),photoYaw=baselinePhoto.after.camera.yaw;
const driftYaw=lastAim.progress[0].observed.camera.yaw,targetYaw=lastAim.target.yaw;
const rows=[];
async function exercise({methodName,startYaw,afterInitialMoveYaw=startYaw,targetYaw,pitch=.15,
  initialPitch=.15,acceptCurrent=true,expectFailure=false,expectPointer=true,paused=false,expired=false}){
  let reads=0,drags=0,waits=0;
  const listeners={};
  const context=vm.createContext({Math,Date,Number,assert,structuredClone,
    started:true,paused,settings:{sensitivity:1,quality:'high',hour:16.5,dayCycle:false,firstPerson:true},
    cameraYaw:startYaw,cameraOrbitYaw:startYaw,cameraPitch:initialPitch,cameraDragAge:99,drag:null,
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
    $:()=>({addEventListener:(name,callback)=>listeners[name]=callback,setPointerCapture:()=>{}}),
    activePointer:null,record:{events:[],aimPhases:[]},kind:'bus',angle,
    deadline:expired?Date.now()-1:Date.now()+2400000,
    remaining:cap=>{const value=Math.min(cap,context.deadline-Date.now());assert.ok(value>0,'fixed case wall deadline');return value;},
    bounded:async callback=>callback(),err:error=>({name:error.name,message:error.message}),
    releasePointer:async()=>{},observePhaseProgress:async()=>{},progressOf:s=>structuredClone(s),
  });
  const snapshot=()=>({ready:true,started:context.started,paused:context.paused,
    settings:{...context.settings},renderer:{contextLost:false},simulationTime:69.5,teleportRevision:3,
    camera:{yaw:context.cameraYaw,pitch:context.cameraPitch,position:{x:248,y:4.02,z:60.9156}}});
  context.read=async()=>{reads++;return snapshot();};
  context.page={locator:()=>({boundingBox:async()=>({x:0,y:0,width:1280,height:800})}),
    mouse:{move:async(x,y)=>{if(context.drag){drags++;listeners.pointermove({clientX:x,clientY:y,pointerId:1});
        // Explicit synthetic presentation after the copied public pointer handler.
        context.cameraYaw=context.cameraOrbitYaw;
      }else context.cameraYaw=afterInitialMoveYaw;},
      down:async()=>listeners.pointerdown({clientX:1280*.86,clientY:800*.30,pointerId:1})},
    waitForFunction:async(fn,arg)=>{waits++;const result=vm.runInNewContext(`(${fn.toString()})(arg)`,
      {Math,arg,window:{__NEON__:{snapshot}}});if(!result)throw new Error('Synthetic native aim predicate not reached');}};
  vm.runInContext(handlers.join('\n'),context);
  vm.runInContext(`${healthySource}\n${methods[methodName]}\nglobalThis.testPointer=pointer;globalThis.testAim=aim;`,context);
  let pointer=null,returnFrame=null,failure=null;
  try{pointer=await context.testPointer();returnFrame=await context.testAim(pointer,targetYaw,pitch,{acceptCurrent});}
  catch(error){failure=error.message;}
  assert.equal(Boolean(failure),expectFailure);
  if(!expectFailure){assert.ok(Math.abs(angle(context.cameraYaw-targetYaw))<.025);assert.ok(Math.abs(context.cameraPitch-pitch)<.003);assert.equal(drags,expectPointer?1:0);}
  if(methodName==='candidate'&&!expectFailure&&!expectPointer){assert.ok(returnFrame);assert.equal(returnFrame.simulationTime,69.5);}
  if(methodName==='candidate'&&!expectFailure&&expectPointer)assert.equal(returnFrame,null,'fallback returns no reusable pre-adjustment snapshot');
  rows.push({methodName,startYaw,afterInitialMoveYaw,targetYaw,pitch,initialPitch,acceptCurrent,paused,expired,
    expectFailure,reads,drags,waits,pointerOrigin:pointer?.orbitYaw??null,actualFinalYaw:context.cameraYaw,
    actualFinalPitch:context.cameraPitch,failure,reusableFrame:Boolean(returnFrame),
    boundary:'Synthetic function/real-handler replay; not a native browser result'});
}
await exercise({methodName:'original',startYaw:photoYaw,afterInitialMoveYaw:driftYaw,targetYaw,expectFailure:true});
const oldReplay=rows.at(-1);
assert.ok(Math.abs(oldReplay.actualFinalYaw-lastAim.progress.at(-1).observed.camera.yaw)<1e-6,
  'original method plus actual copied input handler reproduces recorded wrong final yaw');
await exercise({methodName:'candidate',startYaw:photoYaw,afterInitialMoveYaw:driftYaw,targetYaw});
for(const delta of [0,.001,.024,.026,-.3,Math.PI-1e-6]){
  await exercise({methodName:'candidate',startYaw:1,targetYaw:1+delta,expectPointer:Math.abs(delta)>=.025});
}
await exercise({methodName:'candidate',startYaw:1,targetYaw:1,acceptCurrent:false,expectPointer:true});
await exercise({methodName:'candidate',startYaw:1,targetYaw:1,initialPitch:.2,pitch:.15,expectPointer:true});
await exercise({methodName:'candidate',startYaw:1,targetYaw:1,paused:true,expectFailure:true});
await exercise({methodName:'candidate',startYaw:1,targetYaw:1,expired:true,expectFailure:true});
const cycleGuards=[];
const reusedAims=authored.aimPhases.slice(-26);
for(const [index,phase]of reusedAims.entries()){
  if(!phase.skippedPointerInput)continue;
  const sample=authored.motion.at(-1).samples[index+1],state=phase.progress[0].observed;
  // The candidate uses this exact, source-recorded fresh read as the same
  // conservative before-action clock baseline. It never updates a game clock.
  const oldStart=sample.guardBaseline.simulationTime,newStart=state.simulationTime;
  assert.ok(newStart<=oldStart);
  const conservativeExtra=oldStart-newStart;
  const oldHeld=sample.heldSeconds;
  if(oldHeld!=null)assert.ok(oldHeld+conservativeExtra<sample.geometricMetres/.3+3);
  cycleGuards.push({n:sample.n,newStart,oldStart,sameActualSimulationFrame:newStart===oldStart,
    conservativeExtraSeconds:conservativeExtra,oldHeld,geometricMetres:sample.geometricMetres??null,
    originalStallGuardIntact:true,originalReleaseEvents:sample.inputs});
}
assert.equal(cycleGuards.length,25);assert.equal(cycleGuards.filter(x=>x.sameActualSimulationFrame).length,24);
const receipt={status:'REAL_PROTOCOL_FUNCTION_AND_PUBLIC_HANDLER_CPU_REPLAY_PASSED_NATIVE_RECAPTURE_REQUIRED',
  sourceHashes:{executedMethod:hash(original),candidateMethod:hash(candidate),executedMain:hash(main)},
  actualWrongYawReproduced:oldReplay.actualFinalYaw,observedWrongYaw:lastAim.progress.at(-1).observed.camera.yaw,
  testCount:rows.length,tests:rows,cycleGuardCount:cycleGuards.length,cycleGuards,
  noRuntimeSourceMutation:true,noClockOrActorMutation:true,
  limits:'Mocked transport protocol uses byte-exact executed5cd public pointer handlers and actual trace endpoints. It neither measures RPC latency savings nor proves real150s movement, later steps, screenshots, boarding/berths or High art quality.'};
fs.writeFileSync(`${root}/protocol-cpu-replay-receipt.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,testCount:rows.length,guardCycles:cycleGuards.length,
  sameFrameGuardCycles:cycleGuards.filter(x=>x.sameActualSimulationFrame).length,
  originalWrongYawReplayed:receipt.actualWrongYawReproduced,observedWrongYaw:receipt.observedWrongYaw,
  receiptSHA256:hash(fs.readFileSync(`${root}/protocol-cpu-replay-receipt.json`))}));
