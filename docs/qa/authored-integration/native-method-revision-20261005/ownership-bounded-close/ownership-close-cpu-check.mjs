import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const target='/tmp/neon-native-ownership-close-candidate-20261005/payload/tools/native-review/methods/transport-owner/native-transport-ownership-extra.mjs';
const source=await readFile(target,'utf8');
const helper=source.slice(source.indexOf('function classifyOwnedBrowserClose('),source.indexOf('async function event(stage,data={})'));
const ctx={Number,Boolean};vm.createContext(ctx);vm.runInContext(helper,ctx);const classify=ctx.classifyOwnedBrowserClose;
const base={before:{pid:7001,startTicks:'90000'},current:null,apiClose:{status:'closed',elapsedMs:20,timeoutMs:35000},exitCode:0,signalCode:null,callerForceInvoked:false,hardDeadlineReached:false};
const cases=[
 ['normal exact owner exit',{...base},true,true,false],
 ['resolved official30s forced fallback',{...base,apiClose:{status:'closed',elapsedMs:30001,timeoutMs:35000},exitCode:null,signalCode:'SIGKILL'},true,false,true],
 ['nonzero exit with SIGKILL metadata rejected',{...base,exitCode:9,signalCode:'SIGKILL'},false,false,true],
 ['invalid startTicks owner metadata rejected',{...base,before:{pid:7001,startTicks:'unknown'}},false,false,false],
 ['old equal30s envelope',{...base,apiClose:{status:'closed',elapsedMs:30001,timeoutMs:30000},exitCode:null,signalCode:'SIGKILL'},false,false,true],
 ['outer35s timeout',{...base,apiClose:{status:'timed-out',elapsedMs:35001,timeoutMs:35000},exitCode:null,signalCode:'SIGKILL'},false,false,true],
 ['API rejection',{...base,apiClose:{status:'rejected',elapsedMs:4,timeoutMs:35000}},false,false,false],
 ['nonzero exit',{...base,exitCode:9},false,false,false],
 ['unexpected signal',{...base,exitCode:null,signalCode:'SIGTERM'},false,false,false],
 ['missing owner identity',{...base,before:undefined},false,false,false],
 ['unknown readback',{...base,current:undefined},false,false,false],
 ['same owner still alive',{...base,current:{pid:7001,startTicks:'90000'}},false,false,false],
 ['unobserved child exit',{...base,exitCode:null},false,false,false],
 ['caller invoked forced rescue',{...base,exitCode:null,signalCode:'SIGKILL',callerForceInvoked:true},false,false,true],
 ['whole deadline reached',{...base,hardDeadlineReached:true},false,true,false],
 ['whole deadline clamps owner cap',{...base,apiClose:{status:'closed',elapsedMs:30001,timeoutMs:19000},exitCode:null,signalCode:'SIGKILL'},false,false,true],
 ['elapsed cap not finite',{...base,apiClose:{status:'closed',elapsedMs:NaN,timeoutMs:35000}},false,true,false]
];
const rows=[];
for(const [name,input,accepted,graceful,forced] of cases){const r=classify(input);assert.equal(r.boundedCloseAccepted,accepted,name);assert.equal(r.graceful,graceful,name);assert.equal(r.forcedExit,forced,name);rows.push({name,result:r.boundedCloseAccepted,forced:r.forcedExit,graceful:r.graceful});}
assert.ok(source.includes('await captureOwnedLaunch();'));
assert.ok(source.includes('owned.browserProcess.process===owned.child&&owned.child.pid===owned.pid'));
assert.ok(source.includes('supported in-process browser.close → pinned browserProcess.close'));
assert.ok(source.includes('Math.min(deadline,begin+35000)'));
assert.ok(source.includes('if(record.firstError)process.exitCode=1;'));
assert.ok(!source.includes('process.kill('));
const receipt={status:'PASSED',scope:'17 actual pure-CPU tests of classifier extracted from candidate source plus narrow static invariants; no native browser/game/run occurred',sourceSHA256:createHash('sha256').update(source).digest('hex'),cases:rows};
await writeFile('/tmp/neon-native-ownership-close-candidate-20261005/cpu-classifier-receipt.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,cases:rows.length,sourceSHA256:receipt.sourceSHA256}));
