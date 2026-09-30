import test from 'node:test';
import assert from 'node:assert/strict';
import { laneLoop, trafficFleet, northernVehicles, trafficTargetSpeed, intersectionSignal } from '../src/traffic.js';
import { GameSimulation } from '../src/simulation.js';
import { overlapOBB } from '../src/collision.js';

test('traffic uses opposite separated lanes and follows rounded corners without getting stuck',()=>{
  const corners=[{x:-80,z:80},{x:80,z:80},{x:80,z:-80},{x:-80,z:-80}];
  const forward=laneLoop(corners),reverse=laneLoop([...corners].reverse());
  assert.ok(forward.some(p=>p.z===76));assert.ok(reverse.some(p=>p.z===84));
  const sim=new GameSimulation();sim.cars=trafficFleet('round',corners,4,11);sim.player.x=280;sim.player.z=280;
  const starts=sim.cars.map(c=>({x:c.x,z:c.z})),travel=new Map(sim.cars.map(c=>[c.id,0]));
  for(let frame=0;frame<120*30;frame++){
    const old=sim.cars.map(c=>({...c}));sim.update(1/30);
    for(const [i,car] of sim.cars.entries())travel.set(car.id,travel.get(car.id)+Math.hypot(car.x-old[i].x,car.z-old[i].z));
    if(frame%30===0)for(let i=0;i<sim.cars.length;i++)for(let j=i+1;j<sim.cars.length;j++)assert.equal(overlapOBB(sim.cars[i],sim.cars[j]),null);
  }
  for(const car of sim.cars)assert.ok(travel.get(car.id)>400,`${car.id} traveled only ${travel.get(car.id)}m`);
});
test('drivers brake for a queue before collision, let another lane pass and do not enter a blocked junction',()=>{
  const car={id:'a',x:-35,z:-4,yaw:Math.PI/2,speed:12,cruise:12,health:100};
  const leader={id:'b',x:-23,z:-4,yaw:Math.PI/2,speed:0,health:100};
  assert.ok(trafficTargetSpeed(car,[car,leader],0).speed<6);
  assert.ok(trafficTargetSpeed(car,[car,{...leader,z:4}],0).speed>6);
  const exit={...leader,x:16};
  const control=trafficTargetSpeed({...car,x:-16},[car,exit],0);
  assert.equal(control.reason,'exit-blocked');assert.ok(control.speed<4);
  const parked={id:'parking',x:4,z:0,yaw:0,speed:0,health:100};
  assert.equal(trafficTargetSpeed(car,[car,parked],0).speed,12,'a parked car clear of the running lane does not reserve the intersection');
  const inside=trafficTargetSpeed({...car,x:-10},[car],13);
  assert.equal(inside.speed,12,'an admitted car clears the box after green ends');
});
test('each junction has mutually exclusive green phases and an all-red clearance interval',()=>{
  let allRed=false;
  for(let t=0;t<28;t+=.1){const x=intersectionSignal(t,0,0,'x'),z=intersectionSignal(t,0,0,'z');assert.ok(!(x==='green'&&z==='green'));allRed ||= x==='red'&&z==='red';}
  assert.ok(allRed);assert.equal(new Set(northernVehicles().map(c=>c.id)).size,18);
});

test('the complete southern fleet keeps moving past parked intersection cars for three simulated minutes',()=>{
  const sim=new GameSimulation({bounds:1450});Object.assign(sim.player,{x:1400,z:1400});
  const travel=new Map(sim.cars.filter(c=>c.traffic).map(c=>[c.id,0]));
  for(let frame=0;frame<180*30;frame++){
    const before=sim.cars.map(c=>({x:c.x,z:c.z}));sim.update(1/30);
    for(const [i,car] of sim.cars.entries())if(travel.has(car.id))travel.set(car.id,travel.get(car.id)+Math.hypot(car.x-before[i].x,car.z-before[i].z));
  }
  for(const [id,meters] of travel)assert.ok(meters>700,`${id} got stranded after ${meters.toFixed(1)}m`);
});
