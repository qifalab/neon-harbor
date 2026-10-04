import assert from 'node:assert/strict';
import * as THREE from '/workspace/scratch/neon-harbor/vendor/three/three.module.js';
import {createCityExploration} from '/workspace/scratch/neon-harbor/src/city-exploration.js';
import {GameSimulation} from '/workspace/scratch/neon-harbor/src/simulation.js';
import {HARBOR_VEHICLE_SPECS} from '/workspace/scratch/neon-harbor/src/harbor-vehicle-models.js';
import {intersectionSignal} from '/workspace/scratch/neon-harbor/src/traffic.js';
import {harborRoutePose} from '/workspace/scratch/neon-harbor/src/harbor-transit.js';
import {circleOBB,moveVehicle} from '/workspace/scratch/neon-harbor/src/collision.js';
// CPU-only scene. No rendering, source mutation, test mutation, or ambient-car override.
const city=createCityExploration(THREE,new THREE.Scene(),{streaming:false});
const sim=new GameSimulation({colliders:city.colliders,bounds:city.bounds,groundHeightAt:city.groundHeightAt});
city.bind(sim,{hour:8});
for(let n=0;n<260;n++)city.step(.05,{});
const service=city.sample.transit,life=city.sample.life,bus=service.vehicle('harbor-bus-1');
const crossing=life.navigation.crossings.find(c=>c.axis==='x'&&c.x===160&&c.z===160&&c.lane===146);
const resident=life.agents[0];
Object.assign(resident,{x:148,y:.18,z:146,phase:'walking',insideBuildingId:null,floorId:null,roomId:null,transit:null,crossingId:crossing.id,goal:{kind:'work',id:resident.work.employer,anchor:{...resident.work.anchor}},path:[{x:174,y:.18,z:146,crossingId:crossing.id}],pathIndex:0});
const capture=n=>{
 const body=service.trafficBodies.find(b=>b.id===bus.id),gap=life.trafficStopDistanceAt(body);
 console.log(JSON.stringify({n,time:service.time,bus:{x:bus.pose.x,z:bus.pose.z,yaw:bus.pose.yaw,speed:bus.pose.speed,trafficState:bus.trafficState,held:bus.held},gap:Number.isFinite(gap)?gap:'Infinity',resident:{x:resident.x,z:resident.z,id:resident.crossingId,path:resident.path,index:resident.pathIndex,activity:resident.activity,goal:resident.goal},signal:intersectionSignal(service.time,160,160,'x'),run:life._crossingRun(resident,crossing)}));
};
capture(0);
const spec=HARBOR_VEHICLE_SPECS.bus;
for(let n=1;n<=80;n++){
 city.step(.05,{});
 assert.equal(intersectionSignal(service.time,160,160,'z'),'green');
 const front=bus.pose.z+spec.halfLength*Math.abs(Math.cos(bus.pose.yaw))+spec.halfWidth*Math.abs(Math.sin(bus.pose.yaw));
 assert.ok(front<resident.z-1.7,'existing front-clearance assertion stays true at each exact original tick');
 if(n<5||n%10===0)capture(n);
}
const raw=service.trafficBodies.find(v=>v.id===bus.id),body={...raw,hx:raw.hx+.08,hz:raw.hz+.08};
const next=harborRoutePose(service.route(bus.routeId),bus.serviceTime+.05);
const currentOverlap=!!circleOBB({...resident,radius:.6},body),nextOverlap=!!circleOBB({...resident,radius:.6},{...body,...next});
const sweepContacts=moveVehicle({...body},next.x-body.x,next.z-body.z,Math.atan2(Math.sin(next.yaw-body.yaw),Math.cos(next.yaw-body.yaw)),{bounds:3000,circles:[{x:resident.x,z:resident.z,groundY:resident.y,y:0,radius:.6}]}).contacts.length;
const projected=life._crossingRun(resident,crossing).map(p=>({forward:(p.x-body.x)*Math.sin(body.yaw)+(p.z-body.z)*Math.cos(body.yaw),side:(p.x-body.x)*Math.cos(body.yaw)-(p.z-body.z)*Math.sin(body.yaw)}));
console.log(JSON.stringify({finalGeometry:{body:{x:body.x,z:body.z,yaw:body.yaw,hx:body.hx,hz:body.hz},currentOverlap,nextOverlap,sweepContacts,projected,sideLimit:body.hx+.6,claimStillPresent:resident.crossingId===crossing.id}}));
assert.equal(currentOverlap,false);assert.equal(nextOverlap,false);assert.equal(sweepContacts,0);
assert.equal(life.trafficStopDistanceAt(raw),Infinity);
assert.equal(resident.crossingId,crossing.id);
assert.equal(bus.trafficState,'cruise');
