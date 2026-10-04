import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '/tmp/harbor-life-fix-v5/vendor/three/three.module.js';
import {createCityExploration} from '/tmp/harbor-life-fix-v5/src/city-exploration.js';
import {GameSimulation} from '/tmp/harbor-life-fix-v5/src/simulation.js';
import {HarborTransitService} from '/tmp/harbor-life-fix-v5/src/harbor-transit.js';
import {circleOBB} from '/tmp/harbor-life-fix-v5/src/collision.js';
const source='/tmp/harbor-life-fix-v5/src/harbor-life.js';
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
const sourceHash=hash(),saved=JSON.parse(fs.readFileSync('/tmp/harbor-life-deadlocked-save.json','utf8'));
function contacts(agents,bodies,radius){
 const out=[];
 for(const a of agents){if(a.insideBuildingId||['riding','boarding','alighting'].includes(a.phase))continue;
  for(const b of bodies){if(b.health===0||Math.abs(a.y-(b.y??0))>=1.5||Math.hypot(a.x-b.x,a.z-b.z)>12)continue;
   const hit=circleOBB({...a,radius},b);if(hit)out.push({key:`${a.id}/${b.id}`,agent:{id:a.id,x:a.x,z:a.z,crossingId:a.crossingId,activity:a.activity,phase:a.phase,pathIndex:a.pathIndex,target:a.path[a.pathIndex]},body:{id:b.id,x:b.x,z:b.z,yaw:b.yaw,hx:b.hx,hz:b.hz,speed:b.speed,trafficState:b.trafficState},depth:hit.depth});
  }
 }
 return out;
}
const oldFleet=new HarborTransitService();assert.equal(oldFleet.restoreState(saved.harborTransit),true);
const originalBaseline=Object.fromEntries([.43,.6].map(r=>[String(r),contacts(saved.harborLife.agents,[...saved.cars,...oldFleet.trafficBodies],r)]));
const city=createCityExploration(THREE,new THREE.Scene(),{streaming:false});
const publicSave={version:1,cash:1200,completed:[],bestTimes:{},player:saved.player,harborLife:saved.harborLife,harborTransit:saved.harborTransit};
const sim=new GameSimulation({colliders:city.colliders,bounds:city.bounds,groundHeightAt:city.groundHeightAt,save:publicSave});
city.bind(sim,{save:publicSave,hour:16.5});
const life=city.sample.life,transit=city.sample.transit,bus=transit.vehicle('harbor-bus-2');
assert.equal(life.ticks,saved.harborLife.ticks);assert.equal(transit.time,saved.harborTransit.time);
const initial=Object.fromEntries([.43,.6].map(r=>[String(r),contacts(life.agents,[...sim.cars,...transit.trafficBodies],r)]));
const metrics=Object.fromEntries([.43,.6].map(r=>[String(r),{totalContactFrames:0,newContactEpisodes:0,newContacts:[],maximumDepth:0,previous:new Set(initial[String(r)].map(c=>c.key))}]));
let marketAt=null,canonicalAt=null,moneyError=0,goodsError=0,firstNewBuffer=null;
const initialDistance=bus.distanceTravelled,samples=[];
for(let tick=0;tick<90*60;tick++){
 city.step(1/60,{cameraYaw:0});const elapsed=(tick+1)/60;
 if(marketAt===null&&bus.pose.stopId==='harbor-bus-market')marketAt=elapsed;
 const a=life.agents[17];if(canonicalAt===null&&a.crossingId===a.path[a.pathIndex]?.crossingId&&a.crossingId)canonicalAt=elapsed;
 moneyError=Math.max(moneyError,Math.abs(life.totalMoney-life.initialMoney));goodsError=Math.max(goodsError,Math.abs(life.totalGoods-life.initialGoods));
 const bodies=[...sim.cars,...transit.trafficBodies];
 for(const radius of [.43,.6]){
  const m=metrics[String(radius)],hits=contacts(life.agents,bodies,radius),now=new Set(hits.map(c=>c.key));
  m.totalContactFrames+=hits.length;
  for(const hit of hits){m.maximumDepth=Math.max(m.maximumDepth,hit.depth);
   if(!m.previous.has(hit.key)){m.newContactEpisodes++;if(m.newContacts.length<24)m.newContacts.push({elapsed,...hit});if(radius===.6&&firstNewBuffer===null){firstNewBuffer=elapsed;console.log(JSON.stringify({firstNewBufferContact:{elapsed,...hit}}));}}
  }
  m.previous=now;
 }
 if(tick%600===599)samples.push({elapsed,bus:{x:bus.pose.x,z:bus.pose.z,yaw:bus.pose.yaw,stopId:bus.pose.stopId,held:bus.held,speed:bus.pose.speed},money:life.totalMoney,goods:life.totalGoods});
}
for(const m of Object.values(metrics))delete m.previous;
const result={sourceHash,originalBaseline,publicResumeBaseline:initial,marketAt,canonicalAt,totalDistance:bus.distanceTravelled-initialDistance,money:life.totalMoney,goods:life.totalGoods,moneyError,goodsError,metrics,finalBus:{...bus.pose,held:bus.held},samples};
fs.writeFileSync('/tmp/harbor-life-v5-oldsave-recovery-review.json',JSON.stringify(result,null,2));
fs.writeFileSync('/tmp/harbor-life-v5-oldsave-recovery-finalstate.json',JSON.stringify({harborLife:life.snapshot(),harborTransit:transit.exportState(),cars:sim.cars,player:sim.player,elapsed:sim.elapsed},null,2));
console.log(JSON.stringify({sourceHash,originalBaselineCounts:Object.fromEntries(Object.entries(originalBaseline).map(([k,v])=>[k,v.length])),publicResumeBaselineCounts:Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,v.length])),marketAt,canonicalAt,totalDistance:result.totalDistance,money:result.money,goods:result.goods,moneyError,goodsError,metrics:Object.fromEntries(Object.entries(metrics).map(([k,m])=>[k,{totalContactFrames:m.totalContactFrames,newContactEpisodes:m.newContactEpisodes,maximumDepth:m.maximumDepth}])),finalBus:{x:bus.pose.x,z:bus.pose.z,held:bus.held}},null,2));
assert.equal(hash(),sourceHash,'v5 draft remains frozen');
assert.ok(marketAt!==null&&marketAt<=90,'old public save must reach actual market within 90 simulation seconds');
assert.equal(life.totalMoney,2972);assert.equal(life.totalGoods,300);assert.equal(moneyError,0);assert.equal(goodsError,0);
assert.equal(metrics['0.43'].totalContactFrames,0,'actual .43 street bodies remain clear');
assert.equal(metrics['0.6'].newContactEpisodes,0,'no new .6 avoidance-buffer contacts');
