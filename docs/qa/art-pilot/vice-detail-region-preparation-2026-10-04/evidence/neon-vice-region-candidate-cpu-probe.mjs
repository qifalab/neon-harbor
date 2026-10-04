import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const file='/tmp/capture-workshop-vice-detail-region-candidate.mjs';
const source=fs.readFileSync(file,'utf8');
const chunk=source.slice(source.indexOf('function errorEvidence('),source.indexOf('async function boot('));
const context=vm.createContext({assert,Date,Math,JSON});vm.runInContext(chunk,context);
const require=createRequire('/workspace/scratch/neon-harbor/package.json');const {expect}=require('@playwright/test');
const fixture={axis:'x',target:182.8,before:{position:{x:197.8}},current:{position:{x:182.64}},samples:Array.from({length:24},(_,i)=>({value:182.64+(i%2)*.32,simulationTime:i/20})),fixtureOnly:true};
let original;
try{expect(.16).toBeLessThan(.04);}catch(error){void error.stack;error.message+='\nWalking diagnostics: '+JSON.stringify(fixture);original=error;}
const evidence=context.errorEvidence(original);
assert.equal(evidence.message.includes('Walking diagnostics:'),true);assert.equal(evidence.walkingDiagnosticsRaw,JSON.stringify(fixture));assert.equal(evidence.walkingDiagnostics.samples.length,24);assert.equal(evidence.walkingDiagnostics.fixtureOnly,true);assert.ok(evidence.stack);
const checks=[{name:'Real Playwright ExpectError keeps appended message and exact raw/parsed 24-sample CPU fixture',passed:true,messageContainsDiagnostics:true,stackContainsDiagnostics:evidence.stack.includes('Walking diagnostics:')}];
const state=x=>({position:{x,y:.215,z:-115},camera:{yaw:Math.PI},simulationTime:1,teleportRevision:2,city:{interior:{buildingId:'south-086',floorId:'lobby',currentRoomId:'room'}}});
let calls={turn:0,helper:0,snapshot:0,event:0,persist:0};
Object.assign(context,{record:{},deadline:Date.now()+10000,remaining:n=>Math.min(n,10000),turn:async()=>{calls.turn++;},snapshot:async()=>{calls.snapshot++;if(calls.snapshot>1)throw new Error('CPU after-snapshot fixture');return state(197.8);},walkAxis:async(_page,axis,target,options)=>{calls.helper++;assert.equal(options.precision,true);assert.equal(options.tolerance,.18);assert.equal(axis,'x');assert.equal(target,182.8);throw original;},event:async()=>{calls.event++;},persist:async()=>{calls.persist++;throw new Error('CPU metadata I/O fixture');}});
let caught;try{await context.walk(null,'x',182.8);}catch(error){caught=error;}
assert.equal(caught,original);assert.equal(calls.helper,1);assert.equal(calls.turn,1);assert.equal(calls.event,0);const attempt=context.record.walkAttempts[0];assert.equal(attempt.result,'failed');assert.equal(attempt.firstError.message,original.message);assert.equal(attempt.firstError.walkingDiagnosticsRaw,JSON.stringify(fixture));assert.ok(attempt.afterSnapshotError.message.includes('after-snapshot'));assert.ok(attempt.persistenceError.message.includes('I/O'));assert.equal(attempt.before.position.x,197.8);assert.equal(attempt.effectiveBudget.walkTimeoutMs,10000);
checks.push({name:'One unchanged helper call; snapshot and metadata I/O failures preserve the original movement error identity and samples',passed:true,calls});
calls={turn:0,helper:0,snapshot:0,event:0,persist:0};Object.assign(context,{record:{},deadline:Date.now()+10000,snapshot:async()=>{calls.snapshot++;return state(calls.snapshot===1?197.8:182.8);},walkAxis:async()=>{calls.helper++;},event:async()=>{calls.event++;return state(182.8);},persist:async()=>{calls.persist++;}});
const after=await context.walk(null,'x',182.8);assert.equal(after.position.x,182.8);assert.equal(context.record.walkAttempts[0].actualAfter.position.x,182.8);assert.equal(context.record.walkAttempts[0].result,'passed');assert.equal(calls.helper,1);assert.equal(calls.turn,1);assert.equal(calls.event,1);
checks.push({name:'Successful CPU adapter records before/actualAfter/budget/result with one helper call and no recovery',passed:true,calls});
const malformed=context.errorEvidence(new Error('Walking diagnostics: {bad'));assert.equal(malformed.walkingDiagnosticsRaw,'{bad');assert.equal(malformed.walkingDiagnostics,null);assert.ok(malformed.walkingDiagnosticsParseError);
checks.push({name:'Malformed diagnostic JSON preserves raw text and real parse error without fabricating a parsed object',passed:true});
const result={status:'CPU_ADAPTER_PASS_NOT_BROWSER_OR_PATH_PROOF',sourceSha256:createHash('sha256').update(source).digest('hex'),checks,limits:['Synthetic motion fixtures; no browser/server/GPU/key input.','Independent legal-region proof and native capture remain separate.']};fs.writeFileSync('/tmp/neon-vice-region-candidate-cpu-probe.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
