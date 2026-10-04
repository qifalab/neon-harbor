// Derived offline control-flow mocks. No browser, GPU, product imports, or tour entrypoint.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const candidate = '/tmp/neon-harbor-tour-first-error-candidate-2026-10-04T19-13-07-129Z/capture-harbor-tour.mjs';
const expectedSha256 = '6a0178c8fb0b099dda2a82b1bc8157206861c35bb8e00cd1b4661216450027db';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const source = await readFile(candidate, 'utf8');
assert.equal(sha256(source), expectedSha256, 'frozen candidate SHA');
const helperStart = source.indexOf('const writeCabinEvidence = async');
const helperEnd = source.indexOf('const walkLocal = async', helperStart);
const rideStart = source.indexOf('const ride = async');
const rideEnd = source.indexOf('const savePublic = async', rideStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart && rideStart > helperEnd && rideEnd > rideStart);
const helpers = source.slice(helperStart, helperEnd);
const ride = source.slice(rideStart, rideEnd);
const lineAt = index => source.slice(0,index).split('\n').length;
const root = dirname(fileURLToPath(import.meta.url));
const casesRoot = resolve(root, 'derived-mock-cases');
await mkdir(casesRoot);
const startedAt = new Date().toISOString();
const cases = [];
const sentinel = 'DERIVED OFFLINE MOCK: pre-existing evidence file must remain unchanged.\n';

async function scenario(config) {
  const output = resolve(casesRoot, config.name);
  await mkdir(output);
  const primary = new Error('MOCK_PRIMARY:' + config.name);
  const cleanup = new Error('MOCK_MOUSE_RELEASE:' + config.name);
  const label = 'derived-mock-' + config.name;
  const indexFile = label + '-cabin-segments.json';
  if(config.writeCollision) await writeFile(resolve(output,indexFile),sentinel,{flag:'wx'});
  const metadata = {cabinSegments:[{file:'mock-before-this-ride.json',status:'passed',derivedMock:true}],
    cabinRides:[],cabinEvidenceErrors:[],cabinCleanupErrors:[],destinationWaitWallMilliseconds:900000};
  const counters = {state:0,focus:0,wait:0,press:0,pointer:0,walk:0,mouseUp:0,phase:0};
  const dispatched = [];
  let attemptedIndex = null;
  const stair = {x:1,startZ:0,endZ:4,fromY:1.3,toY:3.7,
    bottom:{x:1,z:0,y:1.3},top:{x:1,z:4,y:3.7}};
  const inside = {x:-2.7,z:-7.2,y:1.3};
  const from = {id:'mock-south',kind:'ferry',routeId:'mock-route'};
  const to = {id:'mock-north',doorId:'mock-door',board:{x:20,y:1.3,z:0}};
  const lowerTransit = {ridingVehicleId:'mock-ferry-1',passengerDeck:'lower',vehicles:[]};
  const upperTransit = {...lowerTransit,passengerDeck:'upper',vehicles:[{
    id:'mock-ferry-1',stopId:'mock-north',doorsOpen:true,remaining:3}]};
  const makeState = (time, transit, position={x:0,y:1.3,z:0}) => ({simulationTime:time,
    teleportRevision:11,position,transit});
  const context = {
    assert,Buffer,Date,Math,JSON,resolve,output,metadata,sha256,
    methodHashes:{'tools/capture-harbor-tour.mjs':expectedSha256},manifestSha256:'DERIVED_MOCK_MANIFEST',
    remaining:cap=>cap,
    distance:(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),
    city:{sample:{transit:{route:()=>{
      if(config.failAt==='route')throw primary;
      return {duration:100};
    }}}},
    state:async()=>{
      counters.state++;
      if(config.failAt==='initial-state'&&counters.state===1)throw primary;
      if(config.failAt==='boarding-guard-state'&&counters.state===2)throw primary;
      return makeState(counters.state===1?0:counters.state===2?1:6,lowerTransit);
    },
    focusPlayable:async()=>{
      counters.focus++;
      if(config.failAt==='focus'&&counters.focus===1)throw primary;
      return makeState(0,lowerTransit);
    },
    createHarborVehicleLayout:()=>{
      if(config.failAt==='layout')throw primary;
      return {stairs:[stair],doors:[{id:'mock-door',z:-7.2,inside}]};
    },
    cabinPointer:async()=>{
      counters.pointer++;
      if(config.failAt==='pointer'&&counters.pointer===(config.pointerFailAt??1))throw primary;
      return {x:0,y:0,orbitYaw:0};
    },
    walkLocal:async(target,_pointer,options)=>{
      counters.walk++;
      const file='mock-segment-'+String(counters.walk).padStart(4,'0')+'.json';
      const failed=counters.walk===config.walkFailAt;
      metadata.cabinSegments.push({file,status:failed?'failed':'passed',derivedMock:true});
      dispatched.push({target,options,failed});
      if(failed)throw primary;
      // Mock sample only satisfies the ride's existing sample/height control-flow assertion.
      return [{local:{x:target.x,y:target.y??1.3,z:target.z},derivedMock:true}];
    },
    phase:async(name)=>{
      counters.phase++;
      if(name.endsWith('-boarded')){
        if(config.failAt==='boarded-phase')throw primary;
        return makeState(1,lowerTransit);
      }
      if(name.endsWith('-upper-deck'))return makeState(2,upperTransit);
      if(name.endsWith('-upper-deck-at-real-open-berth')||name.endsWith('-upper-landing-E-keeps-rider-on-board'))
        return makeState(3,upperTransit);
      if(name.endsWith('-lower-door-ready'))return makeState(7,lowerTransit);
      if(name.endsWith('-arrived'))return makeState(10,lowerTransit,{x:20,y:1.3,z:0});
      if(name.endsWith('-alighted'))return makeState(11,lowerTransit,to.board);
      throw new Error('Unexpected mock phase: '+name);
    },
    shot:async()=>{},
    writeFile:async(path,bytes,options)=>{
      if(path===resolve(output,indexFile))attemptedIndex=JSON.parse(bytes);
      return writeFile(path,bytes,options);
    },
    page:{
      waitForFunction:async()=>{
        counters.wait++;
        if(config.failAt==='scheduled-boarding-wait'&&counters.wait===1)throw primary;
        if(config.failAt==='riding-wait'&&counters.wait===2)throw primary;
      },
      keyboard:{press:async()=>{
        counters.press++;
        if(config.failAt==='boarding-E'&&counters.press===1)throw primary;
      }},
      mouse:{up:async()=>{
        counters.mouseUp++;
        if(counters.mouseUp===config.mouseFailAt)throw cleanup;
      }}
    }
  };
  vm.createContext(context);
  vm.runInContext(helpers+'\n'+ride+'\nglobalThis.derivedRide=ride;',context,{filename:'derived-finite-functions-only.mjs'});
  let thrown=null,returned=null;
  try{returned=await context.derivedRide(from,to,{stairs:config.stairs!==false,label});}
  catch(error){thrown=error;}
  const expectsPrimary=Boolean(config.failAt||config.walkFailAt);
  if(expectsPrimary)assert.equal(thrown,primary,'primary Error object identity retained');
  else if(config.mouseFailAt)assert.equal(thrown,cleanup,'normal mouse cleanup failure propagates');
  else if(config.writeCollision)assert.equal(thrown?.code,'EEXIST','normal evidence write failure propagates');
  else assert.equal(thrown,null,'normal mocked ride succeeds');
  assert.ok(attemptedIndex,'ride attempt index was attempted');
  assert.equal(attemptedIndex.label,label);
  assert.equal(attemptedIndex.methodSha256,expectedSha256);
  assert.equal(attemptedIndex.status,expectsPrimary||config.mouseFailAt?'failed':'passed');
  assert.equal(attemptedIndex.error?.message??null,expectsPrimary?primary.message:config.mouseFailAt?cleanup.message:null);
  assert.ok(attemptedIndex.attemptedAt&&attemptedIndex.endedAt);
  assert.ok(attemptedIndex.segments.every(s=>s.file!=='mock-before-this-ride.json'),'index excludes prior ride segment');
  if(config.expectedStage)assert.equal(attemptedIndex.rideStage,config.expectedStage);
  if(config.expectNullId)assert.equal(attemptedIndex.vehicleId,null);
  else assert.equal(attemptedIndex.vehicleId,'mock-ferry-1');
  if(config.expectedWalkCalls!=null)assert.equal(counters.walk,config.expectedWalkCalls);
  if(config.expectedMouseCalls!=null)assert.equal(counters.mouseUp,config.expectedMouseCalls);
  if(config.mouseFailAt){
    assert.equal(metadata.cabinCleanupErrors.length,1);
    const c=metadata.cabinCleanupErrors[0];
    assert.equal(c.error.message,cleanup.message);
    assert.equal(c.primary?.message??null,expectsPrimary?primary.message:null);
    assert.equal(c.primaryPreserved,expectsPrimary);
    assert.equal(c.context.scope,'mouse-up');
    assert.equal(attemptedIndex.cleanupErrors.length,1);
  }else assert.equal(metadata.cabinCleanupErrors.length,0);
  let retainedIndex=null;
  if(config.writeCollision){
    assert.equal(metadata.cabinRides.length,0);
    assert.equal(metadata.cabinEvidenceErrors.length,1);
    assert.equal(metadata.cabinEvidenceErrors[0].file,indexFile);
    assert.match(metadata.cabinEvidenceErrors[0].message,/EEXIST/);
    assert.equal(await readFile(resolve(output,indexFile),'utf8'),sentinel,'wx never overwrites collision sentinel');
  }else{
    assert.equal(metadata.cabinEvidenceErrors.length,0);
    assert.equal(metadata.cabinRides.length,1);
    const bytes=await readFile(resolve(output,indexFile));
    retainedIndex=JSON.parse(bytes);
    assert.equal(metadata.cabinRides[0].sha256,sha256(bytes));
    assert.equal(metadata.cabinRides[0].bytes,bytes.length);
    assert.equal(metadata.cabinRides[0].status,retainedIndex.status);
  }
  return {name:config.name,status:'passed',configuration:config,counters,
    thrown:thrown?{message:thrown.message,code:thrown.code??null,primaryObjectIdentityPreserved:thrown===primary,
      cleanupObjectIdentityPropagated:thrown===cleanup}:null,
    returned:Boolean(returned),attemptedIndex,retainedIndexFile:config.writeCollision?null:resolve(output,indexFile),
    collisionSentinelRetained:Boolean(config.writeCollision),metadata:{cabinRides:metadata.cabinRides,
      cabinEvidenceErrors:metadata.cabinEvidenceErrors,cabinCleanupErrors:metadata.cabinCleanupErrors},
    dispatchedMockWaypoints:dispatched};
}

const configurations=[];
for(const [path,stairs,walkFailAt,mouseFailAt] of [
  ['ascent',true,1,1],['descent',true,7,2],['direct',false,1,1]]){
  configurations.push({name:path+'-primary-and-mouse-failure',stairs,walkFailAt,mouseFailAt,
    expectedStage:'cabin',expectedWalkCalls:walkFailAt,expectedMouseCalls:mouseFailAt});
  configurations.push({name:path+'-normal-mouse-failure',stairs,mouseFailAt,
    expectedStage:'cabin',expectedWalkCalls:path==='ascent'?6:path==='descent'?12:1,expectedMouseCalls:mouseFailAt});
}
for(const failAt of ['initial-state','route','focus','scheduled-boarding-wait','boarding-guard-state','boarding-E','riding-wait','boarded-phase']){
  configurations.push({name:'early-'+failAt,failAt,expectNullId:true,expectedStage:'boarding-setup',expectedWalkCalls:0,expectedMouseCalls:0});
}
configurations.push({name:'cabin-layout-failure',failAt:'layout',expectedStage:'cabin',expectedWalkCalls:0,expectedMouseCalls:0});
configurations.push({name:'ascent-pointer-setup-failure',failAt:'pointer',expectedStage:'cabin',expectedWalkCalls:0,expectedMouseCalls:0});
configurations.push({name:'descent-pointer-setup-failure',failAt:'pointer',pointerFailAt:2,expectedStage:'cabin',expectedWalkCalls:6,expectedMouseCalls:1});
configurations.push({name:'direct-pointer-setup-failure',stairs:false,failAt:'pointer',expectedStage:'cabin',expectedWalkCalls:0,expectedMouseCalls:0});
configurations.push({name:'primary-walk-and-evidence-write-failure',walkFailAt:1,writeCollision:true,expectedStage:'cabin',expectedWalkCalls:1,expectedMouseCalls:1});
configurations.push({name:'primary-setup-and-evidence-write-failure',failAt:'initial-state',writeCollision:true,expectNullId:true,expectedStage:'boarding-setup',expectedWalkCalls:0,expectedMouseCalls:0});
configurations.push({name:'primary-walk-mouse-and-evidence-write-failure',stairs:false,walkFailAt:1,mouseFailAt:1,writeCollision:true,expectedStage:'cabin',expectedWalkCalls:1,expectedMouseCalls:1});
configurations.push({name:'normal-ride-evidence-write-failure',stairs:false,writeCollision:true,expectedStage:'completed',expectedWalkCalls:1,expectedMouseCalls:1});
configurations.push({name:'normal-stairs-ride',expectedStage:'completed',expectedWalkCalls:12,expectedMouseCalls:2});
configurations.push({name:'normal-direct-ride',stairs:false,expectedStage:'completed',expectedWalkCalls:1,expectedMouseCalls:1});

for(const config of configurations){
  try{cases.push(await scenario(config));}
  catch(error){cases.push({name:config.name,status:'failed',configuration:config,error:{message:error.message,stack:error.stack}});}
}
const finalSha256=sha256(await readFile(candidate));
const proof={schema:'neon-harbor-derived-offline-ride-mock-proof-v1',startedAt,completedAt:new Date().toISOString(),
  candidate,expectedSha256,finalSha256,candidateUnchanged:finalSha256===expectedSha256,node:process.version,
  script:resolve(root,'derived-ride-mocks.mjs'),scriptSha256:sha256(await readFile(resolve(root,'derived-ride-mocks.mjs'))),
  scope:'Only exact extracted writeCabinEvidence, retainCabinCleanupError, and ride definitions; all browser, product, waypoint movement, clock and phase dependencies are derived mocks. This is control-flow evidence, never live route, collision, rendering, duration, or product-test evidence.',
  extractedFunctions:[{names:['writeCabinEvidence','retainCabinCleanupError'],startLine:lineAt(helperStart),endLine:lineAt(helperEnd)-1,sha256:sha256(helpers)},
    {names:['ride'],startLine:lineAt(rideStart),endLine:lineAt(rideEnd)-1,sha256:sha256(ride)}],
  total:cases.length,passed:cases.filter(x=>x.status==='passed').length,failed:cases.filter(x=>x.status==='failed').length,cases};
await writeFile(resolve(root,'derived-ride-proof.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({proof:resolve(root,'derived-ride-proof.json'),total:proof.total,passed:proof.passed,failed:proof.failed,candidateUnchanged:proof.candidateUnchanged,
  failures:cases.filter(x=>x.status==='failed').map(x=>({name:x.name,message:x.error.message}))}));
if(proof.failed||!proof.candidateUnchanged)process.exitCode=1;
