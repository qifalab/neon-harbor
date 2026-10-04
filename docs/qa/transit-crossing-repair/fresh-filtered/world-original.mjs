import fs from 'node:fs';
import * as THREE from '/workspace/scratch/neon-harbor/vendor/three/three.module.js';
import {createCityExploration} from '/tmp/harbor-life-fix-v5/src/city-exploration.js';
import {createHarborLife} from '/tmp/harbor-life-fix-v5/src/harbor-life.js';
import {HarborTransitService} from '/workspace/scratch/neon-harbor/src/harbor-transit.js';
import {GameSimulation} from '/workspace/scratch/neon-harbor/src/simulation.js';
import {circleOBB} from '/workspace/scratch/neon-harbor/src/collision.js';
const city=createCityExploration(THREE,new THREE.Scene(),{streaming:false});
const sim=new GameSimulation({colliders:city.colliders,bounds:city.bounds,groundHeightAt:city.groundHeightAt});
city.bind(sim,{hour:16.5});
const transit=city.sample.transit;
const life=city.sample.life;
const records=[], overlaps=[], bufferOverlaps=[];
let marketArrivals=0, previousStop=null;

function diagnostic(bus) {
 const body=transit.trafficBodies.find(b=>b.id===bus.id);
 return life.agents.filter(a=>a.crossingId).map(a=> {
  const f=(a.x-bus.pose.x)*Math.sin(bus.pose.yaw)+(a.z-bus.pose.z)*Math.cos(bus.pose.yaw);
  const side=Math.abs((a.x-bus.pose.x)*Math.cos(bus.pose.yaw)-(a.z-bus.pose.z)*Math.sin(bus.pose.yaw));
  const t=a.path[a.pathIndex];const gap=t?Math.hypot(t.x-a.x,t.z-a.z,(t.y??.18)-a.y):Infinity;
  const ratio=t?Math.min(.1*a.speed,gap)/gap:0;
  const next=t?{x:a.x+(t.x-a.x)*ratio,z:a.z+(t.z-a.z)*ratio,y:a.y+((t.y??.18)-a.y)*ratio}:a;
  const collisions=transit.trafficBodies.filter(v=>Math.hypot(v.x-next.x,v.z-next.z)<7&&circleOBB({...next,radius:.6},v)).map(v=>v.id);
  return {id:a.id,x:a.x,z:a.z,crossingId:a.crossingId,phase:a.phase,activity:a.activity,blockedFor:a.blockedFor,goal:a.goal,pathIndex:a.pathIndex,target:t,next,forward:f,side,claim:f>-3&&f<50&&side<5,overlapCurrentBus:!!circleOBB({...a,radius:.6},body),collisions};
 });
}
for(let tick=0;tick<12000;tick++){
 city.step(1/60,{cameraYaw:0});
 const bus=transit.vehicle('harbor-bus-2');
 if(bus.pose.stopId==='harbor-bus-market' && previousStop!==bus.pose.stopId)marketArrivals++;
 previousStop=bus.pose.stopId;
 for(const a of life.agents)if(!a.insideBuildingId&&!a.transit)for(const v of [...sim.cars,...transit.trafficBodies])if(v.health>0&&Math.abs((v.y||0)-a.y)<1.5&&Math.hypot(v.x-a.x,v.z-a.z)<7&&circleOBB({...a,radius:.43},v))overlaps.push({tick,id:a.id,vehicle:v.id,x:a.x,z:a.z});
 for(const a of life.agents)if(!a.insideBuildingId&&!a.transit)for(const v of [...sim.cars,...transit.trafficBodies])if(v.health>0&&Math.abs((v.y||0)-a.y)<1.5&&Math.hypot(v.x-a.x,v.z-a.z)<7&&circleOBB({...a,radius:.6},v))bufferOverlaps.push({tick,id:a.id,vehicle:v.id,x:a.x,z:a.z});
 if(tick%600===599){const b=transit.vehicle('harbor-bus-2');records.push({time:transit.time,bus:{...b.pose,delay:b.delay,held:b.held,junction:b.junction},control:transit.streetControl(b,x=>life.trafficStopDistanceAt(x)),agents:diagnostic(b)});}
}
fs.writeFileSync('/tmp/harbor-life-bus-fixed-v5-fullstate.json',JSON.stringify({harborLife:life.snapshot(),harborTransit:transit.exportState(),cars:sim.cars,player:sim.player,elapsed:sim.elapsed}));
fs.writeFileSync('/tmp/harbor-life-bus-fixed-v5-world.json',JSON.stringify(records,null,2));
fs.writeFileSync('/tmp/harbor-life-bus-fixed-v5-world-summary.json',JSON.stringify({marketArrivals,overlapCount:overlaps.length,bufferOverlapCount:bufferOverlaps.length,bufferOverlaps:bufferOverlaps.slice(0,20),overlaps:overlaps.slice(0,20),final:{fleet:transit.time,life:life.summary(),bus:transit.vehicle('harbor-bus-2').pose}},null,2));
console.log(JSON.stringify({marketArrivals,overlapCount:overlaps.length,bufferOverlapCount:bufferOverlaps.length,bufferOverlaps:bufferOverlaps.slice(0,20),final:records.at(-1).bus}));
console.log(JSON.stringify(records.filter(r=>r.bus.held==='pedestrian').map(r=>({time:r.time,x:r.bus.x,z:r.bus.z,yaw:r.bus.yaw,delay:r.bus.delay,control:r.control,claims:r.agents.filter(a=>a.claim).map(a=>({id:a.id,x:a.x,z:a.z,crossingId:a.crossingId,activity:a.activity,blockedFor:a.blockedFor,forward:a.forward,side:a.side,collisions:a.collisions}))})),null,2));
