const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root='/tmp/neon-native-transport-high-finite-phases-candidate-20261005';
const source=fs.readFileSync(root+'/payload/tools/native-review/methods/transport/native-transport-high.mjs','utf8');
const block=source.slice(source.indexOf('  const progressOf ='),source.indexOf('  async function releasePointer'));
const berth=source.slice(source.indexOf('  async function waitBerth('),source.indexOf('  function observedResources'));
const finallyGuard=source.split('\n').find(x=>x.includes("if(record.progressDiagnosticFailures.length&&!record.firstError)"));
assert.ok(block&&berth&&finallyGuard);
const passed=[];
async function scenario(name,options,verify){
  let now=1000;const deadline=now+(options.whole??2400000),primary=new Error('actual original wait error'),diagError=new Error('actual diagnostic rejected');
  const calls=[],record={aimPhases:[],berthWaits:[],secondaryErrors:[],progressDiagnosticFailures:[],firstError:null};
  const state={ready:true,started:true,paused:false,simulationTime:13,timing:{dt:.25},teleportRevision:3,position:{x:1,y:.44,z:2},camera:{yaw:0,pitch:.15},settings:{sensitivity:1},city:{sample:{transit:{vehicles:[{id:'tram1',kind:'tram',stopId:null,doorsOpen:false,remaining:10,nextStopId:'workshop',secondsToArrival:17}],ridingVehicleId:'tram1',passengerLocal:{x:0,y:.44,z:-3.45},passengerDeck:'lower'}}}};
  const context={assert,Date:class extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}},Math,Number,Object,Infinity,record,deadline,activePointer:options.releaseUnconfirmed?{}:null,
    err:(error,stage)=>({stage,name:error.name,message:error.message,stack:error.stack}),
    transit:s=>s.city.sample.transit,vehicle:(s,id)=>s.city.sample.transit.vehicles.find(v=>v.id===id),angle:n=>Math.atan2(Math.sin(n),Math.cos(n)),
    remaining:cap=>Math.min(cap,deadline-now),read:async()=>{calls.push('read');return state;},
    bounded:async(operation,cap,label)=>{calls.push({bounded:label,cap});return await operation();},
    page:{mouse:{move:async()=>{calls.push('mouse.move');}},evaluate:async()=>{calls.push('evaluate');now+=options.diagAdvance??0;if(options.diagReject)throw diagError;return {simulationTime:13,paused:false};},
      waitForFunction:async(predicate,args,settings)=>{calls.push({wait:settings.timeout,args,predicate:String(predicate)});if(options.waitReject){now+=options.consumeWait?settings.timeout:0;throw primary;}}},
    releasePointer:async(error)=>{calls.push('releasePointer');if(!options.releaseUnconfirmed)context.activePointer=null;},
    keep:(error,stage)=>{record.firstError ||= {name:error.name,message:error.message,stage};},
  };
  vm.createContext(context);vm.runInContext(block+'\n'+berth+'\nthis.helpers={aim,waitBerth};',context);
  let thrown=null;try{if(options.aim)await context.helpers.aim({x:10,y:10,orbitYaw:0},0,.15);else await context.helpers.waitBerth(options.anyVehicle?null:'tram1',options.anyVehicle?'lantern':null);}catch(error){thrown=error;}
  verify({calls,record,thrown,primary,context,now});passed.push(name);
}
(async()=>{
  await scenario('berth before diagnostic shares exact600s phase',{diagAdvance:1000},s=>{assert.equal(s.thrown,null);assert.equal(s.calls.find(x=>x.wait).wait,599000);assert.equal(s.record.berthWaits[0].status,'SATISFIED');assert.equal(s.calls.filter(x=>x==='evaluate').length,1);});
  await scenario('initial anyvehicle retains same actualstop open remaining>2',{anyVehicle:true},s=>{const w=s.calls.find(x=>x.wait);assert.equal(w.args.id,null);assert.equal(w.args.stopId,'lantern');assert.match(w.predicate,/stopId===stopId&&v.doorsOpen&&v.remaining>2/);});
  await scenario('whole clamp beats shared600s phase',{whole:5000},s=>{assert.equal(s.calls.find(x=>x.wait).wait,5000);assert.equal(s.calls.find(x=>x.bounded?.includes('progress')).cap,5000);});
  await scenario('actual wait first error survives failed postdiagnostic',{waitReject:true,diagReject:true},s=>{assert.equal(s.thrown,s.primary);assert.equal(s.record.berthWaits[0].firstError.message,s.primary.message);assert.ok(s.record.secondaryErrors.some(x=>x.message==='actual diagnostic rejected'));assert.ok(s.calls.indexOf('releasePointer')<s.calls.lastIndexOf('evaluate'));});
  await scenario('unconfirmed pointerrelease prevents timeout browser RPC',{waitReject:true,releaseUnconfirmed:true},s=>{assert.equal(s.thrown,s.primary);assert.equal(s.calls.filter(x=>x==='evaluate').length,1);assert.equal(s.record.berthWaits[0].progress.at(-1).status,'SKIPPED_POINTER_RELEASE_UNCONFIRMED');});
  await scenario('whole-expired timeout has no diagnostic RPC',{whole:5000,waitReject:true,consumeWait:true},s=>{assert.equal(s.thrown,s.primary);assert.equal(s.calls.filter(x=>x==='evaluate').length,1);assert.equal(s.record.berthWaits[0].progress.at(-1).status,'SKIPPED_DEADLINE');});
  await scenario('successful wait missing beforeevidence cannot silentlypass',{diagReject:true},s=>{assert.equal(s.thrown,null);assert.equal(s.record.progressDiagnosticFailures.length,1);vm.runInContext(finallyGuard,s.context);assert.equal(s.record.firstError.stage,'phase-progress-diagnostics');});
  await scenario('aim60 exact original yaw andpitch guards with no new successRPC',{aim:true},s=>{assert.equal(s.thrown,null);const w=s.calls.find(x=>x.wait);assert.equal(w.wait,60000);assert.match(w.predicate,/<\.025/);assert.match(w.predicate,/<\.003/);assert.equal(s.calls.filter(x=>x==='evaluate').length,0);assert.equal(s.record.aimPhases[0].progress[0].when,'before-input');});
  await scenario('aimtimeout first preserved diagnostic release first',{aim:true,waitReject:true,diagReject:true},s=>{assert.equal(s.thrown,s.primary);assert.equal(s.record.aimPhases[0].firstError.message,s.primary.message);assert.ok(s.calls.indexOf('releasePointer')<s.calls.indexOf('evaluate'));});
  await scenario('aim samewhole clamp',{aim:true,whole:20000},s=>{assert.equal(s.calls.find(x=>x.wait).wait,20000);assert.equal(s.calls.find(x=>x.bounded==='finite aim phase').cap,20000);});
  const receipt={status:'PURE_CPU_SHIM_PASS',sourceSHA256:require('node:crypto').createHash('sha256').update(source).digest('hex'),cases:passed.length,passed,actualBrowserExecuted:false,productModuleImported:false,rootWritten:false};
  fs.writeFileSync(path.join(root,'finite-phase-cpu-shim-receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
})().catch(error=>{console.error(error);process.exitCode=1;});
