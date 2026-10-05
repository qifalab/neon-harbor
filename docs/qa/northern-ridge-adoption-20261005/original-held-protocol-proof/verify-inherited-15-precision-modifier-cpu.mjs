import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root='/workspace/neon-candidates/transport-held-public-slow-leg-candidate-20261005';
const baseRoot='/workspace/neon-candidates/5cd-bus-native-failure-review-20261005';
const sources={base:fs.readFileSync('/workspace/neon-candidates/5cd-tram-native-failure-and-precision-modifier-20261005/base-pointer-origin-current-frame-2fdc.mjs','utf8'),candidate:fs.readFileSync(`${root}/payload/tools/native-review/methods/transport/native-transport-high.mjs`,'utf8')};
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const extract=(s,a,b)=>{const x=s.indexOf(a),y=s.indexOf(b,x);assert.ok(x>=0&&y>x);return s.slice(x,y);};
const main=fs.readFileSync(`${baseRoot}/executed-5cd-src-main.js`,'utf8');
const inputSource=extract(main,'function inputState(){',"window.addEventListener('blur'");
const tram=JSON.parse(fs.readFileSync('/workspace/neon-evidence/5cd-tram-original-fail-11328275235/extracted/native/authored/tram/case.json'));
const motion=tram.motion.at(-1),cycles=motion.samples.filter(x=>Number.isInteger(x.n));
const rows=[];
async function exercise({method='candidate',precision=true,fail=null,endpoint=false,expired=false,wrongHeight=false,badRevision=false,badRadius=false,expectError=null}) {
  const local={...motion.initialLocal};const steps=cycles.slice(0,3).map(x=>({...x.after}));
  const target=endpoint?{...local}:{...steps.at(-1)};if(wrongHeight)target.y=9;
  let sim=motion.samples[0].simulationTime,now=1000,index=0,reads=0,waits=0;const events=[],keys=new Set(),listeners={};
  const context=vm.createContext({assert,Math,Date:{now:()=>now},Number,structuredClone,
    record:{motion:[],secondaryErrors:[]},remaining:cap=>expired?0:cap,
    distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),transit:s=>s.city.sample.transit,
    vehicle:s=>s.city.sample.transit.vehicles[0],err:(e,stage)=>({stage,name:e.name,message:e.message}),
    keys,touchHeld:new Set(),cameraYaw:Math.PI,started:true,paused:false,panel:{open:false},
    action:()=>{throw Error('Z must not trigger interaction')},toggleView:()=>{throw Error('Z must not toggle view')},
    window:{addEventListener:(name,fn)=>listeners[name]=fn},
  });
  const snapshot=()=>({started:true,paused:false,teleportRevision:badRevision&&index?4:3,simulationTime:sim,
    city:{sample:{transit:{passengerLocal:{...local},vehicles:[{id:'harbor-tram-1',yaw:Math.PI}],ridingVehicleId:'harbor-tram-1'}}}});
  context.read=async()=>{reads++;now+=10;return snapshot();};
  context.aim=async()=>{now+=10;return snapshot();};
  const eventFor=key=>({code:'Key'+key.toUpperCase(),repeat:false,target:{matches:()=>false},preventDefault(){}});
  context.page={keyboard:{
    down:async key=>{now+=10;events.push({action:'down',key});if(fail==='z-down-before'&&key==='z')throw Error('z-down-before');listeners.keydown(eventFor(key));if(fail==='z-down-after'&&key==='z')throw Error('z-down-after');if(fail==='w-down'&&key==='w')throw Error('w-down');},
    up:async key=>{now+=10;events.push({action:'up',key});if((fail==='z-up'||fail==='wait-and-z-up')&&key==='z')throw Error('z-up');if(fail==='w-up'&&key==='w')throw Error('w-up');listeners.keyup(eventFor(key));},
  },waitForFunction:async(fn,arg)=>{waits++;now+=10;if(fail==='wait'||fail==='wait-and-z-up')throw Error('wait');
    const input=context.actualInputState();assert.equal(input.slow,true,'unchanged public Z slow modifier during physical movement');assert.equal(input.sprint,false);assert.equal(input.forward,1);
    // This replay advances only an isolated CPU fixture through actual original
    // native recorded endpoints; it is not an actual browser or timing model.
    Object.assign(local,steps[index++]);sim+=.25;if(badRadius)local.x=30;
    const yes=vm.runInNewContext(`(${fn.toString()})(arg)`,{arg,Math,window:{__NEON__:{snapshot}}});assert.ok(yes);
  }};
  vm.runInContext(inputSource+'\nglobalThis.actualInputState=inputState;',context);
  const zero=context.actualInputState();assert.equal(zero.slow,false);assert.equal(zero.forward,0);
  const kernel=extract(sources[method],'  function radiusGuard(', '  async function waitBerth(');
  vm.runInContext(kernel+'\nglobalThis.actualWalkLocal=walkLocal;',context);
  const layout={passengerRadius:.22,passengerHeight:1.72,decks:[{y:.44,minX:-3,maxX:3}],blockers:[]};
  let error=null;try{await context.actualWalkLocal(target,{},layout,'CPU-original-native-first-three-steps',{precision});}catch(e){error=e.message;}
  if(expectError)assert.ok(error&&error.includes(expectError),`${fail}: ${error}`);else assert.equal(error,null);
  if(!error&&!endpoint)assert.equal(waits,3);const m=context.record.motion.at(-1);assert.ok(m);
  assert.equal(m.localBudget,150000);assert.equal(m.maxIterations,1800);
  if(method==='candidate'&&precision&&!endpoint&&!expired){assert.equal(events.filter(e=>e.action==='down'&&e.key==='z').length,1);assert.equal(events.filter(e=>e.action==='up'&&e.key==='z').length,1);}
  if(!error&&!endpoint){assert.equal(events.filter(e=>e.action==='down'&&e.key==='w').length,3);assert.equal(events.filter(e=>e.action==='up'&&e.key==='w').length,3);assert.ok(m.samples.slice(1).every(c=>c.releaseConfirmed));}
  if(fail==='wait-and-z-up'){assert.equal(m.firstError.message,'wait');assert.equal(context.record.secondaryErrors.at(-1).message,'z-up');}
  if(fail==='z-up'){assert.equal(m.firstError.message,'z-up');assert.equal(m.precisionModifier.releaseConfirmed,false);}
  if(!['z-up','wait-and-z-up'].includes(fail))assert.equal(keys.has('KeyZ'),false,'modifier actually released even after down RPC rejection');
  if(endpoint||expired)assert.equal(events.some(e=>e.action==='down'&&e.key==='z'),false,'no unnecessary Z input for complete/expired leg');
  rows.push({method,precision,fail,endpoint,expired,wrongHeight,badRevision,badRadius,expectedError:expectError,error,events,reads,waits,
    originalGait:.3,localBudgetMs:m.localBudget,maxIterations:m.maxIterations,modifier:m.precisionModifier??null,
    movementReleaseConfirmed:!keys.has('KeyW'),modifierReleaseConfirmed:!keys.has('KeyZ'),secondaryErrors:context.record.secondaryErrors,
    boundary:'Actual extracted walkLocal/radiusGuard/public inputState and key handlers; isolated recorded CPU endpoints, no browser/RPC timing or live state mutation.'});
}
await exercise({method:'base'});
await exercise({});
await exercise({precision:false});
for(const fail of ['z-down-before','z-down-after','w-down','wait','w-up','z-up'])await exercise({fail,expectError:fail});
await exercise({fail:'wait-and-z-up',expectError:'wait'});
await exercise({endpoint:true});
await exercise({expired:true,expectError:'Date.now()'});
await exercise({wrongHeight:true,expectError:'Math.abs'});
await exercise({badRevision:true,expectError:'equal'});
await exercise({badRadius:true,expectError:'original full passenger radius'});
assert.equal(rows[0].events.filter(e=>e.key==='z').length,6);
assert.equal(rows[1].events.filter(e=>e.key==='z').length,2);
assert.equal(rows[2].events.filter(e=>e.key==='z').length,6,'nonprecision legacy modifier lifecycle unchanged');
const receipt={status:'ACTUAL_LOCAL_FUNCTION_AND_PUBLIC_MODIFIER_INPUT_CPU_REPLAY_PASSED_NATIVE_REQUIRED',
  baseMethodSha256:hash(sources.base),candidateMethodSha256:hash(sources.candidate),publicMainSha256:hash(main),testCount:rows.length,tests:rows,
  noProductionSourceOrBrowserMutation:true,noNativeTimingSavingsClaim:true,
  limits:'CPU mock uses original recorded first-three physical endpoints, synthetic awaited RPC costs and injected faults. It neither proves 150s native completion nor unobserved stair/upper/return/exit or art acceptance.'};
fs.writeFileSync(`${root}/inherited-15-precision-modifier-cpu-receipt.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,testCount:rows.length,receiptSha256:hash(fs.readFileSync(`${root}/inherited-15-precision-modifier-cpu-receipt.json`))}));
