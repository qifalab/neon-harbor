import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '/tmp/harbor-life-fix-v5/vendor/three/three.module.js';
import {createCityExploration} from '/tmp/harbor-life-fix-v5/src/city-exploration.js';
import {createHarborLife} from '/tmp/harbor-life-fix-v5/src/harbor-life.js';
import {harborRoutePose} from '/tmp/harbor-life-fix-v5/src/harbor-transit.js';
import {circleOBB,VEHICLE_SHAPE} from '/tmp/harbor-life-fix-v5/src/collision.js';
import {intersectionSignal} from '/tmp/harbor-life-fix-v5/src/traffic.js';
const hash=()=>crypto.createHash('sha256').update(fs.readFileSync('/tmp/harbor-life-fix-v5/src/harbor-life.js')).digest('hex'),sourceHash=hash();
const city=createCityExploration(THREE,new THREE.Scene(),{streaming:false}),transport=city.sample.transit;
const life=createHarborLife({buildings:city.buildings,colliders:city.colliders,transport,hour:16.5});
const original=structuredClone(life.agents[0]),records=[];
function actor(x,z,id,path){
 for(const a of life.agents)a.crossingId=null;
 const a=life.agents[0];Object.assign(a,structuredClone(original),{x,y:.18,z,phase:'walking',insideBuildingId:null,pathIndex:0,crossingId:id,path:path||[]});return a;
}
function publicBody(kind,time){const v=transport.vehicle(`harbor-${kind}-1`);v.serviceTime=time;v.pose=harborRoutePose(transport.route(v.routeId),time);v.motionSpeed=v.pose.speed;return {id:v.id,kind,...v.pose,hx:kind==='bus'?1.275:1.15,hz:kind==='bus'?5.5:4.5,health:100};}
function reserve(name,body,x,z,id,endX,expected){
 const a=actor(x,z,id,[{x:endX,y:.18,z,crossingId:id}]);
 const value=life.trafficStopDistanceAt(body),padded={...body,hx:(body.hx??VEHICLE_SHAPE.hx)+(body.kind?.match(/bus|tram/)? .08:0),hz:(body.hz??VEHICLE_SHAPE.hz)+(body.kind?.match(/bus|tram/)? .08:0)};
 const record={name,x,z,body:{id:body.id,x:body.x,z:body.z,yaw:body.yaw,hx:padded.hx,hz:padded.hz},value:Number.isFinite(value)?value:'Infinity',currentContact:!!circleOBB({...a,radius:.6},padded)};records.push(record);
 assert.equal(Number.isFinite(value),expected,`${name}: direct v5 method protection/clearance`);
}
const sx='harbor-crossing-x:160:146',tx='harbor-crossing-x:240:94',t146='harbor-crossing-x:240:146';
reserve('sedan nose ahead', {id:'review-sedan',x:160,z:144,yaw:0,health:100},160,148,sx,172,true);
reserve('sedan side outside occupied run', {id:'review-sedan',x:160,z:148,yaw:0,health:100},157.8,148,sx,172,false);
reserve('sedan rear cleared', {id:'review-sedan',x:160,z:152,yaw:0,health:100},160,148,sx,172,false);
reserve('sedan 45 degree front', {id:'review-sedan',x:156,z:144,yaw:Math.PI/4,health:100},160,148,sx,172,true);
reserve('sedan nearly parallel front', {id:'review-sedan',x:152,z:144,yaw:Math.PI/2-.01,health:100},160,144,sx,172,true);
reserve('bus actual nose ahead',publicBody('bus',13.2),152,146,sx,172,true);
reserve('bus actual side outside occupied run',publicBody('bus',13.2),148,144,sx,172,false);
reserve('bus actual rear cleared',publicBody('bus',15),152,146,sx,172,false);
let b=publicBody('bus',17),plane=172,f=(plane-b.z)/Math.cos(b.yaw);
reserve('bus actual 45 degree front',b,b.x+Math.sin(b.yaw)*f,plane,'harbor-crossing-x:160:174',172,true);
// This isolated case probes arbitrary saved polyline geometry on an actual
// timetable pose; z=168 is not an authored fresh crossing lane.
b=publicBody('bus',36.20661460247669);
reserve('bus actual nearly parallel pose with forward polyline',b,226,168,'harbor-crossing-x:240:174',252,true);
reserve('tram actual nose ahead',publicBody('tram',13.2),248,92,tx,252,true);
reserve('tram actual side outside occupied run',publicBody('tram',14.2),244,94,tx,252,false);
reserve('tram actual rear cleared',publicBody('tram',16),248,94,tx,252,false);
b=publicBody('tram',111.89);plane=148;f=(plane-b.z)/Math.cos(b.yaw);
reserve('tram actual 45 degree front',b,b.x+Math.sin(b.yaw)*f,plane,t146,252,true);
reserve('tram actual nearly parallel front',publicBody('tram',112.9),248,144,t146,252,true);

const newer='harbor-crossing-x:160:174',older='harbor-crossing-z:160:146';
const crossing=life.navigation.crossings.find(c=>c.id===newer);
let red=0;while(intersectionSignal(red,crossing.x,crossing.z,crossing.axis)==='green')red++;
let green=red;while(intersectionSignal(green,crossing.x,crossing.z,crossing.axis)!=='green')green++;
let a=actor(146,172,older,[{x:172,y:.18,z:172,crossingId:newer}]);
life.trafficTime=red;life._walk(a,.1,[]);
assert.equal(a.x,146);assert.equal(a.crossingId,null);assert.equal(a.activity,'在斑马线前等灯');records.push({name:'finished old leg verifies new red',red,claim:a.crossingId});
life.trafficTime=green;life._walk(a,.1,[]);assert.ok(a.x>146);assert.equal(a.crossingId,newer);records.push({name:'new leg resumes on its green',green,x:a.x});
const c=life.navigation.crossings.find(c=>c.id===sx);
let greenX=0;while(intersectionSignal(greenX,c.x,c.z,c.axis)!=='green')greenX++;
life.trafficTime=greenX;
const occupied=[{x:160,z:144,y:0,yaw:0,hx:VEHICLE_SHAPE.hx,hz:VEHICLE_SHAPE.hz,health:100}, {...publicBody('bus',13.2),hx:1.355,hz:5.58}, {...publicBody('tram',112.9),hx:1.23,hz:4.58}];
for(const body of occupied){
 const road=body.kind==='tram'?240:160,id=body.kind==='tram'?t146:sx,start=road-14,end=road+12,z=144;
 const crossing=life.navigation.crossings.find(c=>c.id===id);let at=0;while(intersectionSignal(at,crossing.x,crossing.z,crossing.axis)!=='green')at++;
 a=actor(start,z,null,[{x:end,y:.18,z,crossingId:id}]);life.trafficTime=at;life._walk(a,.1,[body]);
 assert.equal(a.x,start);assert.equal(a.crossingId,null);assert.equal(a.activity,'在路缘等占线车辆清空');records.push({name:`${body.kind||'sedan'} existing full body holds new entrant at curb`,x:a.x,claim:a.crossingId});
 life._walk(a,.1,[]);assert.ok(a.x>start);assert.equal(a.crossingId,id);records.push({name:`${body.kind||'sedan'} entrant proceeds after actual blocker removed`,x:a.x});
}
// The final real carriageway leg is occupied even though its first two path
// segments are clear, including a null crossing flag at the turn.
a=actor(146,148,null,[{x:154,y:.18,z:148,crossingId:sx},{x:154,y:.18,z:144,crossingId:null},{x:172,y:.18,z:144,crossingId:sx}]);
life.trafficTime=greenX;life._walk(a,.1,[{x:164,z:144,y:0,yaw:0,health:100,hx:1.18,hz:2.32}]);
assert.equal(a.x,146);assert.equal(a.crossingId,null);records.push({name:'full zigzag run admission detects blocker after null middle segment'});
a=actor(154,148,sx,[{x:154,y:.18,z:144,crossingId:null},{x:172,y:.18,z:144,crossingId:sx}]);
life._walk(a,.1,[]);assert.equal(a.crossingId,sx);assert.ok(a.z<148);records.push({name:'claim persists across null flag inside carriageway'});
assert.equal(life.totalMoney,2972);assert.equal(life.totalGoods,300);assert.equal(hash(),sourceHash);
fs.writeFileSync('/tmp/harbor-life-v5-method-cases-review.json',JSON.stringify({sourceHash,cases:records.length,records},null,2));
console.log(JSON.stringify({sourceHash,cases:records.length,records},null,2));
