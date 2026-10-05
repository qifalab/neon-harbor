import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root='/tmp/neon-6ad1-native-fail-readonly-review-20261005/transport-bus';
const original='/workspace/scratch/neon-harbor/tools/native-review/methods/transport/native-transport-high.mjs';
const candidate=`${root}/native-transport-high.candidate.mjs`;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const candidateSource=fs.readFileSync(candidate,'utf8');
const start=candidateSource.indexOf('  async function aim('),end=candidateSource.indexOf('  async function releasePointer(',start);
assert.ok(start>=0&&end>start);
const aimSource=candidateSource.slice(start,end);
const tests=[];
async function run({kind='bus',camera,yaw,pitch=.15,acceptCurrent=true,expectReuse,expired=false}) {
  const state={camera:{...camera},settings:{sensitivity:1},simulationTime:42};
  let mouseMoves=0,predicateWaits=0;
  const record={aimPhases:[]};
  const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
  const context={Math,Date,Number,assert,kind,record,deadline:expired?Date.now()-1:Date.now()+2400000,
    remaining:cap=>{const ms=Math.min(cap,context.deadline-Date.now());assert.ok(ms>0,'fixed case wall deadline');return ms;},
    bounded:async f=>f(),read:async()=>state,progressOf:s=>structuredClone(s),
    err:e=>({message:e.message}),releasePointer:async()=>{},observePhaseProgress:async()=>{},angle,
    page:{mouse:{move:async()=>{mouseMoves++;state.camera.yaw=yaw;state.camera.pitch=pitch;}},
      waitForFunction:async(fn,arg)=>{predicateWaits++;const result=vm.runInNewContext(`(${fn.toString()})(arg)`,
        {Math,arg,window:{__NEON__:{snapshot:()=>state}}});assert.equal(result,true);}}};
  const aim=vm.runInNewContext(`${aimSource};aim`,context);
  const before=structuredClone(state);
  let failure=null;
  try{await aim({x:100,y:100,orbitYaw:camera.yaw},yaw,pitch,{acceptCurrent});}catch(e){failure=e.message;}
  if(expired){assert.ok(failure);assert.equal(mouseMoves,0);}else{
    assert.equal(failure,null);assert.equal(mouseMoves,expectReuse?0:1);assert.equal(predicateWaits,expectReuse?0:1);
    assert.equal(record.aimPhases[0].status,'SATISFIED');
    assert.equal(Boolean(record.aimPhases[0].skippedPointerInput),expectReuse);
    if(expectReuse)assert.deepEqual(state,before,'successful reuse only reads actual state');
  }
  tests.push({kind,camera,yaw,pitch,acceptCurrent,expectReuse,expired,mouseMoves,predicateWaits,failure});
}
for(const mode of ['baseline','authored']){
  const d=JSON.parse(fs.readFileSync(`/tmp/neon-6ad1-bus-original-fail-11324952597/extracted/native/${mode}/bus/case.json`));
  const m=d.motion.at(-1);
  for(const a of d.aimPhases){const s=a.progress[0]?.observed,p=s?.passengerLocal;
    if(p&&Math.abs(p.x-m.initialLocal.x)<.05&&p.z<=m.initialLocal.z+.001&&p.z>=m.lastObservedLocal.z-.001)
      await run({camera:s.camera,yaw:a.target.yaw,pitch:a.target.pitch,expectReuse:true});
  }
}
for(const kind of ['bus','tram','ferry']){
  await run({kind,camera:{yaw:1,pitch:.15},yaw:1,expectReuse:true});
  await run({kind,camera:{yaw:1,pitch:.15},yaw:1,acceptCurrent:false,expectReuse:false});
  await run({kind,camera:{yaw:1.026,pitch:.15},yaw:1,expectReuse:false});
  await run({kind,camera:{yaw:1,pitch:.154},yaw:1,expectReuse:false});
  await run({kind,camera:{yaw:NaN,pitch:.15},yaw:1,expectReuse:false});
  await run({kind,camera:{yaw:1,pitch:NaN},yaw:1,expectReuse:false});
  await run({kind,camera:{yaw:1,pitch:.15},yaw:1,expectReuse:true,expired:true});
}
const receipt={status:'ACTUAL_CANDIDATE_AIM_FUNCTION_CPU_TESTS_PASSED_NATIVE_NOT_RUN',
  originalMethodSHA256:hash(fs.readFileSync(original)),candidateMethodSHA256:hash(fs.readFileSync(candidate)),
  testCount:tests.length,tests,limit:'Mocks exercise actual method branch and unchanged native predicate; they do not measure screenshot quality, real browser scheduling, real camera transitions, movement, or successful cabin completion.'};
fs.writeFileSync(`${root}/camera-predicate-cpu-receipt.json`,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,testCount:receipt.testCount,
  receiptSHA256:hash(fs.readFileSync(`${root}/camera-predicate-cpu-receipt.json`))}));
