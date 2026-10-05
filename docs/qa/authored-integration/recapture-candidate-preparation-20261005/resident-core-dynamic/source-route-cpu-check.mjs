import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '/workspace/scratch/neon-harbor/vendor/three/three.module.js';
import {createCityExploration} from '/workspace/scratch/neon-harbor/src/city-exploration.js';
import {GameSimulation} from '/workspace/scratch/neon-harbor/src/simulation.js';
import {circleOBB} from '/workspace/scratch/neon-harbor/src/collision.js';
const out='/tmp/neon-cc038-resident-core-dynamic-candidate-20261005',root='/workspace/scratch/neon-harbor';
const functions=await readFile(out+'/dynamic-interview-functions.mjs','utf8');
const inputFn=new Function(functions.slice(0,functions.indexOf('async function dynamicShopkeeperCapture'))+'return publicInterviewInput;')();
const rows=[],check=(name,fn)=>{fn();rows.push({name,passed:true});};
const world=createCityExploration(THREE,new THREE.Scene(),{quality:'high',streaming:true});
const colliders=world.colliders.filter(c=>c.physics!==false&&(c.minY??0)<1.8&&(c.maxY??4)>.22);
const routeProof={};
for(const [name,path] of Object.entries({worker:[{x:-560,z:-455},{x:-560,z:-440.8},{x:-571,z:-440.8}],shopFrontage:[{x:-560,z:-455},{x:-510,z:-455},{x:-498,z:-463.3}]})){
 let samples=0;const hits=[];
 for(let leg=1;leg<path.length;leg++){const a=path[leg-1],b=path[leg],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05);for(let i=0;i<=n;i++){const p={x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n,radius:.6};samples++;const c=colliders.find(c=>circleOBB(p,c));if(c)hits.push({leg,position:p,id:c.id,kind:c.kind});}}
 check(`${name} .05metre samples/radius.6 clear of all ${colliders.length} original ground colliders`,()=>assert.deepEqual(hits,[]));routeProof[name]={path,samples,hits};
}
const journeys=world.people.journeys,npc=journeys.residents.find(r=>r.id==='resident-tide-museum-1');
assert.equal(npc.identity.seed,7);assert.equal(npc.journey.dwell,21);
const dt=1/60;let simTime=0;
const advanceNPC=()=>{world.transit.update(dt);journeys.update(dt,{hour:16.5,vehicles:[]});simTime+=dt;};
while(simTime<20.5-1e-7)advanceNPC();
const simulated=new GameSimulation({colliders:world.colliders,bounds:1800,groundHeightAt:world.groundHeightAt,save:JSON.stringify({version:1,player:{x:-560,z:-455,yaw:Math.PI}})});
simulated.pedestriansAt=p=>journeys.residents.filter(r=>!r.insideBuildingId&&Math.hypot(r.x-p.x,r.z-p.z)<12).map(r=>({id:r.id,x:r.x,z:r.z,y:0,groundY:r.y,radius:.48}));
assert.equal(simulated.player.x,-560);assert.equal(simulated.player.z,-455);
let passedCorridor=false,readyTime=null,yaw=Math.PI,keys=[],slow=false,lastControl=-1,minGap=Infinity,maxGap=0,travel=0,previous={x:-560,z:-455};const trace=[];
for(let i=0;i<3600;i++){
 if(simTime-lastControl>=.25-1e-8){const input=inputFn({position:simulated.player,target:npc,camera:{yaw}},passedCorridor);passedCorridor=input.passedCorridor;keys=input.keys;slow=input.slow;lastControl=simTime;if(passedCorridor&&input.distance<=3&&readyTime===null){readyTime=simTime;yaw=Math.atan2(npc.x-simulated.player.x,npc.z-simulated.player.z);}}
 const forward=Number(keys.includes('w'))-Number(keys.includes('s')),strafe=Number(keys.includes('d'))-Number(keys.includes('a'));
 simulated._walk(dt,{forward,strafe,slow,cameraYaw:yaw});advanceNPC();
 const distance=Math.hypot(npc.x-simulated.player.x,npc.z-simulated.player.z);travel+=Math.hypot(simulated.player.x-previous.x,simulated.player.z-previous.z);previous={x:simulated.player.x,z:simulated.player.z};
 const collision=colliders.find(c=>circleOBB({...simulated.player,radius:.6},c));assert.equal(collision,undefined,'dynamic physical controller does not intersect source static geometry');
 if(readyTime!==null){minGap=Math.min(minGap,distance);maxGap=Math.max(maxGap,distance);assert.ok(!npc.insideBuildingId,'actual source target stays on pavement during bounded photographic segment');}
 if(i%15===0)trace.push({simTime,player:{x:simulated.player.x,z:simulated.player.z},npc:{x:npc.x,z:npc.z,state:npc.state,phase:npc.journey.phase},distance,keys,slow});
 if(readyTime!==null&&simTime-readyTime>=5)break;
}
await writeFile(out+'/cpu-route-final-trace.json',JSON.stringify({readyTime,minGap,maxGap,trace},null,2)+'\n');console.log(JSON.stringify({readyTime,minGap,maxGap,last:trace.slice(-3)}));
check('Exact proposed public controller reaches selected original source NPC using unchanged source physical movement',()=>assert.ok(readyTime!==null&&readyTime-20.5<20));
check('Continuous controls retain original3.5m distance for five natural simulation seconds after readiness',()=>assert.ok(maxGap<=3.5&&minGap>1.08));
check('NPC naturally leaves initial shopping phase without reset/pause during CPU check',()=>assert.equal(npc.state,'walking'));
const sources={};for(const file of ['src/city-exploration.js','src/citizen-journeys.js','src/simulation.js','src/metropolis-people.js','src/metropolis-world.js','vendor/three/three.module.js'])sources[file]=createHash('sha256').update(await readFile(root+'/'+file)).digest('hex');
const receipt={status:'PASSED',scope:'Pure original source world/physics/NPC CPU instance; no browser, render, public input RPC timing or hardware performance proof. Source transit clock advances by its own update. Motor vehicles are deliberately omitted from NPC walk fixture; original browser guards must reject any real-world obstruction/departure.',colliderCount:colliders.length,catalogueCount:world.buildings.length,routeProof,controllerStartSimulationTime:20.5,readyTime,approachSimulationSeconds:readyTime-20.5,minimumPhotographicGap:minGap,maximumPhotographicGap:maxGap,playerPhysicalTravel:travel,naturalNPCFinal:{id:npc.id,x:npc.x,z:npc.z,state:npc.state,journeyPhase:npc.journey.phase},sources,rows,trace};
await writeFile(out+'/cpu-route-receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,checks:rows.length,readyTime,approachSimulationSeconds:readyTime-20.5,minGap,maxGap}));
