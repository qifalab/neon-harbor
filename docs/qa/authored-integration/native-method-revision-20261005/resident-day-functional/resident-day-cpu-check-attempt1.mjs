import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {auditResidentDayState,auditResidentDaySave} from './payload/tools/native-review/methods/resident-extra/tools/resident-loop-functional-guards.mjs';
const clone=x=>JSON.parse(JSON.stringify(x)),fixture=JSON.parse(await readFile('/tmp/neon-harbor-one-resident-loop/evidence/120s-clock-public-16.5-cpu-observation.json','utf8'));
const rows=[];const save={harborLife:fixture.state};
const check=(name,fn,fail=false)=>{if(fail)assert.throws(fn,undefined,name);else fn();rows.push({name,expectedFailure:fail,passed:true});};
check('actual CPU991.9sim original source final state passes exact full-day guard',()=>auditResidentDaySave(save,{homeRoomId:fixture.diary.home.roomId,requireCompleted:true}));
check('aged-out final wage ledger is correctly unavailable',()=>auditResidentDaySave(save,{requirePaidPeriod:1}),true);
for(const period of [1,2]){
  const wageSave=clone(save);wageSave.harborLife.transactions.push(fixture.payments[period-1].transaction);
  check(`retained original wage${period} matches actual job receipt`,()=>auditResidentDaySave(wageSave,{requirePaidPeriod:period}));
  const tampered=clone(wageSave);tampered.harborLife.transactions.at(-1).from='unfunded-counter';
  check(`wage${period} wrong source account rejected`,()=>auditResidentDaySave(tampered,{requirePaidPeriod:period}),true);
  const early=clone(wageSave);early.harborLife.residentLoop.completedJobs[0].receipts[period-1].paidTick=1;
  check(`wage${period} paid before valid elapsed work rejected`,()=>auditResidentDaySave(early,{requirePaidPeriod:period}),true);
}
for(const [label,mutate] of [
 ['unpaid work',l=>l.residentLoop.totalWages=0],['insufficient work',l=>l.residentLoop.totalValidWorkTicks=699],
 ['no purchase',l=>l.residentLoop.purchases=0],['wrong home room',l=>l.agents.find(a=>a.id==='harbor-resident-07').roomId='wrong-room'],
 ['tram stops reversed',l=>l.residentLoop.events.find(e=>e.type==='tram-boarded').originStopId='harbor-tram-workshop'],
 ['duplicate purchase',l=>l.transactions.push(clone(l.transactions.find(t=>t.type==='purchase'&&t.agentId==='harbor-resident-07')))],
 ['money invented',l=>l.supply.money+=1],['goods invented',l=>l.supply.stock.produce+=1]
]){const x=clone(save);mutate(x.harborLife);check(label+' rejected',()=>auditResidentDaySave(x,{homeRoomId:fixture.diary.home.roomId,requireCompleted:true}),true);}
const final=fixture.state.agents.find(a=>a.id==='harbor-resident-07');const state={diary:fixture.diary,resident:final,teleportRevision:3,life:{initialMoney:2972,totalMoney:2972,initialGoods:300,totalGoods:300},ticket:null,vehicle:null};
const work={roomId:fixture.diary.workplace.roomId,anchor:fixture.payments[0].beforePose,colliders:[]};
check('completed observed state guard passes',()=>assert.equal(auditResidentDayState(state,state,work,()=>false,()=>null),true));
const working=clone(state);working.diary.stage='working';working.diary.completedCycles=0;working.diary.workSeconds=35;working.diary.currentRoomId=work.roomId;Object.assign(working.resident,work.anchor,{insideBuildingId:'south-086',floorId:'lobby'});working.actor={visible:true,legacyLODVisible:true,worldPosition:{x:working.resident.x,y:working.resident.y,z:working.resident.z}};
check('real bounded work pose/model visibility guard passes',()=>auditResidentDayState(working,state,work,()=>false,()=>null));
const missing=clone(working);missing.actor.visible=false;check('invisible actual work actor rejected',()=>auditResidentDayState(missing,state,work,()=>false,()=>null),true);
const far=clone(working);far.resident.x+=.2;check('not at actual workbench rejected',()=>auditResidentDayState(far,state,work,()=>false,()=>null),true);
check('furniture intersection rejected',()=>auditResidentDayState(working,state,work,()=>true,()=>null),true);
const jump=clone(state);jump.teleportRevision++;check('extra observer navigation rejected',()=>auditResidentDayState(jump,state,work,()=>false,()=>null),true);
const source=await readFile('/tmp/neon-native-resident-day-candidate-20261005/payload/tools/native-review/methods/resident-extra/tools/capture-resident-extra.mjs','utf8');
assert.ok(source.includes("isResidentLoop?10800:options.case==='south-parcel'?2700:1080"));assert.ok(source.includes("metadata.artAcceptance='NOT_APPLICABLE_LOW_FUNCTIONAL_ONLY'"));
assert.ok(!source.includes('window.__NEON__.set'));assert.ok(!source.includes('localStorage.setItem'));assert.ok(source.includes("page.waitForEvent('download'"));
const receipt={status:'PASSED',scope:'22 actual pure-CPU functional guard checks against original CPU-source observation and explicitly derived test fixtures; no native gameplay run or public download inferred',methodSHA256:createHash('sha256').update(source).digest('hex'),rows};
await writeFile('/tmp/neon-native-resident-day-candidate-20261005/cpu-guard-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,cases:rows.length,methodSHA256:receipt.methodSHA256}));
