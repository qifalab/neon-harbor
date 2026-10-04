import fs from 'node:fs';
import * as THREE from '/workspace/scratch/neon-harbor/vendor/three/three.module.js';
import {createCityExploration} from '/workspace/scratch/neon-harbor/src/city-exploration.js';
import {createHarborLife} from '/workspace/scratch/neon-harbor/src/harbor-life.js';
import {HarborTransitService} from '/workspace/scratch/neon-harbor/src/harbor-transit.js';
import {GameSimulation} from '/workspace/scratch/neon-harbor/src/simulation.js';
import {circleOBB} from '/workspace/scratch/neon-harbor/src/collision.js';
const city=createCityExploration(THREE,new THREE.Scene(),{streaming:false});
const sim=new GameSimulation({colliders:city.colliders,bounds:city.bounds,groundHeightAt:city.groundHeightAt});
city.bind(sim,{hour:16.5});
const transit=city.sample.transit;
const life=city.sample.life;
const records=[];
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
for(let tick=0;tick<18000;tick++){
 city.step(1/60,{cameraYaw:0});
 if(tick%600===599){const b=transit.vehicle('harbor-bus-2');records.push({time:transit.time,bus:{...b.pose,delay:b.delay,held:b.held,junction:b.junction},control:transit.streetControl(b,x=>life.trafficStopDistanceAt(x)),agents:diagnostic(b)});}
}
fs.writeFileSync('/tmp/harbor-life-bus-deadlock-world.json',JSON.stringify(records,null,2));
console.log(JSON.stringify(records.filter(r=>r.bus.held==='pedestrian').map(r=>({time:r.time,x:r.bus.x,z:r.bus.z,yaw:r.bus.yaw,delay:r.bus.delay,control:r.control,claims:r.agents.filter(a=>a.claim).map(a=>({id:a.id,x:a.x,z:a.z,crossingId:a.crossingId,activity:a.activity,blockedFor:a.blockedFor,forward:a.forward,side:a.side,collisions:a.collisions}))})),null,2));
