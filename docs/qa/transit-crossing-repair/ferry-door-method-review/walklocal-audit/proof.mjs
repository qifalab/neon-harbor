// DERIVED OFFLINE MOCK PROOF. Does not import or execute the full tour.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {writeFile as realWriteFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const outputRoot=dirname(fileURLToPath(import.meta.url));
const candidate='/tmp/neon-harbor-tour-first-error-candidate-2026-10-04T19-13-07-129Z/capture-harbor-tour.mjs';
const base='/tmp/neon-harbor-tour-first-error-candidate-2026-10-04T19-13-07-129Z/base-capture-harbor-tour.mjs';
const expected='6a0178c8fb0b099dda2a82b1bc8157206861c35bb8e00cd1b4661216450027db';
const sha256=b=>createHash('sha256').update(b).digest('hex');
const source=readFileSync(candidate,'utf8'),baseline=readFileSync(base,'utf8');
assert.equal(sha256(source),expected);
assert.equal(sha256(baseline),'60436d2fe8db8af646c1a02d93f9e70fc3e1ce34181d257a1c3ea39aae850702');
const proof={schema:'derived-offline-cabin-mock-proof-v1',startedAt:new Date().toISOString(),candidate,candidateSha256:expected,fullTourExecuted:false,browserCreated:false,originalArtifactsWritten:false,checks:[],cases:[]};
const check=(name,detail={})=>proof.checks.push({name,status:'passed',...detail});
const suffix='const savePublic =';
assert.equal(source.slice(source.indexOf(suffix)),baseline.slice(baseline.indexOf(suffix)));
check('entire route/save/reload/browser/90-minute/cleanup suffix byte-identical to 60436');
const prefix='const cabinState =';
const removeMetadata=s=>s.replace(/^  cabinSegments:.*\n/m,'');
assert.equal(removeMetadata(source.slice(0,source.indexOf(prefix))),baseline.slice(0,baseline.indexOf(prefix)));
check('planning/source/assets/global timing prefix unchanged except four evidence arrays');
const oldPointer=baseline.slice(baseline.indexOf(prefix),baseline.indexOf('const walkLocal ='));
const newPointer=source.slice(source.indexOf(prefix),source.indexOf('let cabinSegmentSequence='));
assert.equal(newPointer,oldPointer);
check('cabinState and cabinPointer action functions byte-identical');
for(const statement of [
  'distance(target,current.local)>=.06&&n<1800',
  "const key=Math.abs(dx)>Math.abs(dz)?dx>0?'a':'d':dz>0?'w':'s';",
  'const offset={w:0,s:Math.PI,a:Math.PI/2,d:-Math.PI/2}[key], desired=current.vehicle.yaw+Math.atan2(dx,dz)-offset;',
  'pointer.x-=delta/(.005*current.sensitivity); await page.mouse.move(pointer.x,pointer.y); pointer.orbitYaw=desired;',
  'current=await cabinState(); heldSeconds+=Math.max(0,current.time-keydown.time); geometricMetres+=distance(start,current.local);',
  "assert.equal(current.revision,initial.revision,'cabin walking preserves transition revision');",
  "assert.ok(heldSeconds<geometricMetres/.3+3,'held cabin inputs do not stall against seats or walls');",
  "assert.ok(distance(target,current.local)<.06,'the actual cabin waypoint is reached');",
  "if(target.y!=null)assert.ok(Math.abs(current.local.y-target.y)<.15,'actual stair support height');",
  "assert.ok((await state()).simulationTime-waitStart<route.duration*2+120,'a real scheduled boarding eventually arrives');",
  "assert.ok(arrived.simulationTime-boarded.simulationTime<route.duration*3+180,'a live route does not remain stalled indefinitely');"
]) {assert.ok(source.includes(statement));assert.ok(baseline.includes(statement));}
check('dominant keys/mouse/.06/.15/revision/held-input/n1800 and simulation guards retained verbatim');
const optsStart=source.indexOf('const localOptions = target =>');
const optsEnd=source.indexOf('\n  if(stairs)',optsStart);
const makeOptions=new Function('from','to','door','label','id',source.slice(optsStart,optsEnd)+'\nreturn localOptions;');
let capChecks=0,extended=[];
for(const kind of ['bus','tram','ferry'])for(const direction of ['outbound','return']) {
  const door={id:'door',inside:{x:-2.7,y:1.3,z:-7.2}},fn=makeOptions({kind,id:'from'},{id:'to'},door,direction,'vehicle');
  for(const [name,target]of [['actual-door-object',door.inside],['equal-coordinate-copy',{...door.inside}],['other-cabin-target',{x:0,z:-7.2}]]) {
    const options=fn(target);assert.equal(options.wallBudgetMilliseconds,kind==='ferry'&&target===door.inside?300000:150000);
    assert.equal(options.precision,kind!=='ferry'||target.x!==0);capChecks++;
    if(options.wallBudgetMilliseconds===300000)extended.push({kind,direction,target:name});
  }
}
assert.equal((source.match(/walkLocal\(target,pointer,localOptions\(target\)\)/g)||[]).length,2);
assert.ok(source.includes('walkLocal(door.inside,pointer,localOptions(door.inside))'));
check('18 cap cases: only actual ferry door object in each direction extends; up/down/no-stairs share wrapper',{capChecks,extended});
const chunk=source.slice(source.indexOf('let cabinSegmentSequence='),source.indexOf('const ride ='));
const dependencyNames=['assert','writeFile','resolve','output','sha256','methodHashes','manifestSha256','metadata','remaining','distance','angle','cabinState','page'];
const factory=new Function(...dependencyNames,chunk+'\nreturn walkLocal;');
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
function snapshot(z,time,revision=11){return {local:{x:0,y:1.3,z,yaw:0},vehicle:{yaw:0},cameraYaw:0,sensitivity:1,time,revision,deck:'lower'};}
async function run(name,config={}) {
  const output=resolve(outputRoot,name);mkdirSync(output);
  const metadata={cabinSegments:[],cabinRides:[],cabinEvidenceErrors:[],cabinCleanupErrors:[]};
  const trace=[],primary=new Error('PRIMARY_INPUT_FAILURE'),cleanup=new Error('CLEANUP_FAILURE'),readFailure=new Error('KEYDOWN_READ_FAILURE'),observationFailure=new Error('HELD_SNAPSHOT_UNAVAILABLE'),ioFailure=new Error('EVIDENCE_WRITE_FAILURE');
  let calls=0,position=0,time=0,writeCount=0;
  const cabinState=async()=>{
    calls++;trace.push('snapshot:'+calls);
    if(config.initialReadFail&&calls===1)throw primary;
    if(config.keydownReadFail&&calls===2)throw readFailure;
    const terminalCall=config.keydownReadFail?3:3;
    if(config.terminalUnavailable&&calls===terminalCall)throw observationFailure;
    return snapshot(position,time,config.revisionFail&&calls>=3?12:11);
  };
  const page={mouse:{move:async()=>trace.push('mouse.move')},keyboard:{
    down:async key=>{trace.push('down:'+key);if(config.downFail&&key==='w')throw primary;},
    up:async key=>{trace.push('up:'+key);if(config.upFail&&key===(config.upKey??'w'))throw cleanup;}
  },waitForFunction:async(fn,arg)=>{
    if(typeof arg==='number'){trace.push('heading.wait');if(config.headingFail)throw primary;return;}
    trace.push('movement.wait');time=config.stallGuard?10:.2;position=config.inputFail ? .04 : .1;
    if(config.inputFail)throw primary;
  }};
  const writeFile=async(...args)=>{writeCount++;trace.push('evidence.write');assert.equal(args[2].flag,'wx');if(config.writeFail)throw ioFailure;return realWriteFile(...args);};
  const remaining=cap=>Math.max(1,Math.min(cap,config.remainingBudget??5400000));
  const walk=factory(assert,writeFile,resolve,output,sha256,{'tools/capture-harbor-tour.mjs':expected},'frozen-manifest',metadata,remaining,distance,angle,cabinState,page);
  let caught=null;try{await walk({x:0,y:config.heightFail?2:1.3,z:.1},{x:100,y:100,orbitYaw:config.headingFail ? .5 : 0},{precision:true,wallBudgetMilliseconds:config.extended?300000:150000,context:{label:name,kind:config.extended?'ferry':'bus',role:config.extended?'lower-door-approach':'cabin-waypoint'}});}catch(error){caught=error;}
  assert.equal(writeCount,1,'exactly one evidence write after the segment');
  let record=null;if(!config.writeFail)record=JSON.parse(readFileSync(resolve(output,'cabin-segment-0001.json'),'utf8'));
  const result={name,trace,thrown:caught?.message??null,recordFile:record?resolve(output,'cabin-segment-0001.json'):null,recordStatus:record?.status??null,cleanupErrors:metadata.cabinCleanupErrors,evidenceErrors:metadata.cabinEvidenceErrors};
  const expectedPrimary=config.keydownReadFail?readFailure:primary;
  if(config.inputFail||config.keydownReadFail||config.initialReadFail||config.headingFail||config.downFail){assert.equal(caught,expectedPrimary);if(record)assert.equal(record.error.message,expectedPrimary.message);}
  else if(config.upFail){assert.equal(caught,cleanup);assert.equal(record.error.message,cleanup.message);}
  else if(config.writeFail){assert.equal(caught,ioFailure);assert.equal(metadata.cabinEvidenceErrors.length,1);}
  else if(config.revisionFail||config.heightFail||config.stallGuard){assert.ok(caught);assert.equal(record.status,'failed');}
  else {assert.equal(caught,null);assert.equal(record.status,'passed');}
  if(record){assert.equal(record.methodSha256,expected);if(record.startedAt)assert.equal(Date.parse(record.deadlineAt)-Date.parse(record.startedAt),config.remainingBudget??(config.extended?300000:150000));}
  if(config.upFail){assert.equal(metadata.cabinCleanupErrors.length,1);assert.equal(metadata.cabinCleanupErrors[0].primaryPreserved,Boolean(config.inputFail||config.keydownReadFail));}
  if(config.initialReadFail){assert.equal(record.completedInputIterations.count,0);assert.equal(record.initial,null);assert.equal(record.firstInput,null);}
  if(record&&(config.inputFail||config.keydownReadFail)){
    assert.equal(record.lastInput.keyDownDispatched,true);assert.equal(record.lastInput.slowDownDispatched,true);assert.equal(record.completedInputIterations.count,0);assert.equal(record.completedInputIterations.heldSeconds,0);assert.equal(record.completedInputIterations.geometricMetres,0);
    const terminal=record.lastInput.terminalHeldObservation;
    assert.equal(terminal.status,config.terminalUnavailable?'unavailable':config.keydownReadFail?'observed-state-start-unavailable':'observed-interval');
    if(config.keydownReadFail&&!config.terminalUnavailable)assert.equal(terminal.elapsedSimulationSeconds,null);
    if(!config.terminalUnavailable){assert.ok(terminal.scope.includes('not a complete terminal input duration'));assert.ok(trace.indexOf('snapshot:3')<trace.indexOf('up:w'));}
  }
  if(config.downFail){assert.equal(record.lastInput.keyDownDispatched,false);assert.equal(record.lastInput.terminalHeldObservation,null);}
  if(config.headingFail){assert.equal(record.lastInput,null);assert.ok(record.lastCommand);assert.equal(trace.filter(x=>x.startsWith('down:')).length,0);}
  if(!caught&&record){assert.equal(record.completedInputIterations.count,1);assert.equal(record.lastInput.guardsPassed,true);assert.equal(record.lastInput.releaseCompleted,true);assert.deepEqual(trace.filter(x=>x.startsWith('down:')||x.startsWith('up:')),['down:z','down:w','up:w','up:z']);}
  if(config.writeFail&&(config.inputFail||config.keydownReadFail))assert.equal(metadata.cabinEvidenceErrors.length,1);
  proof.cases.push(result);
}
for(const [name,config]of [
  ['normal-input-success',{}],['input-primary-plus-keyup-failure',{inputFail:true,upFail:true}],['normal-keyup-failure-is-fail',{upFail:true}],
  ['input-primary-plus-slowkeyup-failure',{inputFail:true,upFail:true,upKey:'z'}],['normal-slowkeyup-failure-is-fail',{upFail:true,upKey:'z'}],
  ['keydown-read-failure-observed-state',{keydownReadFail:true}],['keydown-read-failure-unavailable-state',{keydownReadFail:true,terminalUnavailable:true}],
  ['wait-failure-unavailable-state',{inputFail:true,terminalUnavailable:true}],['initial-read-failure-zero-count',{initialReadFail:true}],
  ['keydown-dispatch-failure-no-invented-observation',{downFail:true}],['heading-failure-camera-command-only',{headingFail:true}],
  ['successful-motion-evidence-write-failure',{writeFail:true}],['input-primary-plus-evidence-write-failure',{inputFail:true,writeFail:true}],
  ['revision-guard-still-fails',{revisionFail:true}],['height-guard-still-fails',{heightFail:true}],['held-input-guard-still-fails',{stallGuard:true}],
  ['ferry-final-300000-effective-budget',{extended:true}],['global-budget-caps-local-budget',{extended:true,remainingBudget:50}]
])await run(name,config);
assert.equal(sha256(readFileSync(candidate)),expected);proof.completedAt=new Date().toISOString();proof.status='passed';
writeFileSync(resolve(outputRoot,'proof.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:proof.status,checks:proof.checks.length,cases:proof.cases.length,proof:resolve(outputRoot,'proof.json'),script:fileURLToPath(import.meta.url),candidateSha256:expected,scope:'isolated extracted functions with Node mocks; no live tour claim'}));
