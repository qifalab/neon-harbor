import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createCityExploration } from '../src/city-exploration.js';
import { createInteriorLayout } from '../src/metropolis-interiors.js';
import { GameSimulation } from '../src/simulation.js';
import { circleContacts,SpatialIndex,CHARACTER_RADIUS } from '../src/collision.js';
import { createCar,createCharacter } from '../src/models.js';
import { applySurfaceFinish } from '../src/surface-finish.js';
import { cleanPose } from '../src/multiplayer-protocol.js';

const city=createCityExploration(THREE,new THREE.Scene(),{streaming:false});

test('all 220 actual building shells have unique enterable addresses and clear outdoor arrival/exit positions',()=>{
  assert.equal(city.buildings.length,220);assert.equal(new Set(city.buildings.map(b=>b.id)).size,220);
  assert.equal(city.south.buildings.length,96);assert.equal(city.harbor.buildings.length,76);
  assert.equal(city.buildings.reduce((sum,b)=>sum+b.floors.length,0),4374);
  const index=new SpatialIndex(city.colliders);
  for(const b of city.buildings)for(const offset of [0,3.2]) {
    const pose={x:b.entrance.x,z:b.entrance.z+offset,y:city.groundHeightAt(b.entrance.x,b.entrance.z+offset)};
    assert.deepEqual(circleContacts(pose,CHARACTER_RADIUS,{index,bounds:city.bounds}),[],`${b.id}: blocked arrival/exit`);
    assert.equal(city.interiors.getPrompt(b.entrance)?.buildingId,b.id);
  }
});

test('every one of 4374 floors has finite furnished geometry and a continuous stair/lift programme',()=>{
  for(const b of city.buildings)for(const f of b.floors) {
    const layout=createInteriorLayout(b,f);
    assert.equal(layout.rooms.length,b.compact?2:4);
    assert.ok(layout.parts.length>45,`${b.id}/${f.id}: empty floor`);
    assert.ok(layout.stairs.length===b.floors.length-1);
    for(const p of layout.parts) {
      assert.ok([p.x,p.y,p.z,p.sx,p.sy,p.sz].every(Number.isFinite));
      assert.ok(p.sx>0&&p.sy>0&&p.sz>0);
    }
    assert.ok(f.y<b.baseY+b.height||!b.id.startsWith('south-')&&!b.id.startsWith('east-'));
    for(const r of layout.rooms)assert.ok(r.width>3&&r.depth>2.4,`${b.id}/${f.id}: room scale`);
  }
});

test('each newly opened address enters, rides to its real roof and exits while retaining only three floors',()=>{
  for(const b of city.buildings.slice(48)) {
    assert.ok(city.interiors.enter(b.id));
    const initial=city.interiors.snapshot();
    const p={...initial.cabin,groundY:b.floors[0].y,y:b.floors[0].y,yaw:Math.PI};
    city.interiors.update(0,p);
    assert.ok(city.interiors.selectFloor('observation'),b.id);
    for(let i=0;i<260&&city.interiors.state.moving;i++) {
      city.interiors.update(.25,p);p.groundY=city.interiors.state.elevator.y;p.y=p.groundY;
    }
    const roof=city.interiors.snapshot();assert.equal(roof.floorId,'observation',b.id);assert.equal(roof.moving,false);
    assert.equal(roof.activeFloors,3);assert.equal(roof.elevator.y,b.floors.at(-1).y);
    assert.ok(city.interiors.exit({force:true}));assert.equal(city.interiors.snapshot().buildingId,null);
  }
});

test('compact old-town stair and furnished-room paths work through normal simulation walking',async()=>{
  const sim=new GameSimulation({colliders:city.colliders,bounds:city.bounds,groundHeightAt:city.groundHeightAt});city.bind(sim);
  async function walk(target) {
    for(let i=0;i<1600&&Math.hypot(sim.player.x-target.x,sim.player.z-target.z)>.04;i++) {
      const dx=target.x-sim.player.x,dz=target.z-sim.player.z;
      city.step(Math.min(1/60,Math.hypot(dx,dz)/5.6),{forward:1,cameraYaw:Math.atan2(dx,dz)});
    }
    assert.ok(Math.hypot(sim.player.x-target.x,sim.player.z-target.z)<.06,JSON.stringify({target,player:sim.player}));
  }
  for(const b of [city.buildings.find(b=>b.id==='south-home-026'),city.buildings.find(b=>b.id==='south-home-001')]) {
    await city.travelTo(b);assert.equal(city.interact().handled,true);assert.equal(city.interiors.state.buildingId,b.id);
    const entry=city.interiors.snapshot();const s=entry.stairs[0];
    await walk({x:b.x,z:s.bottom.z});await walk(s.bottom);await walk({x:s.x,z:(s.startZ+s.endZ)/2});await walk(s.top);
    assert.equal(city.interiors.snapshot().floorId,'gallery');
    for(const point of s.bypass)await walk(point);
    const room=city.interiors.snapshot().rooms[0];await walk({x:b.x,z:room.entrance.z});await walk(room.arrival);
    assert.equal(city.interiors.snapshot().currentRoomId,room.id);
    await city.travelTo(city.buildings[0]);
  }
});

test('hero paint clones retain shader detail and skin, fabric and leather have distinct material responses',()=>{
  const car=createCar(THREE,'#778899'),paint=car.getObjectByName('coachwork').material;
  assert.equal(paint.userData.surfaceFinish.kind,'paint');assert.ok(paint.clearcoatRoughness>=.2);
  const shader={vertexShader:'#include <project_vertex>',fragmentShader:'#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>'};
  paint.onBeforeCompile(shader);assert.ok(shader.fragmentShader.includes('finishHeight'));
  const kinds=new Map();createCharacter(THREE).traverse(n=>{if(n.isMesh&&n.material.userData.surfaceFinish)kinds.set(n.material.userData.surfaceFinish.kind,n.material.roughness);});
  assert.ok(kinds.has('skin')&&kinds.has('fabric')&&kinds.has('leather'));assert.ok(kinds.get('fabric')>kinds.get('skin'));
  assert.throws(()=>applySurfaceFinish(paint,'imaginary'));
});

test('multiplayer accepts the new far-shore roofs and still rejects non-finite/out-of-world poses',()=>{
  assert.ok(cleanPose({x:1525,z:-379,y:366,yaw:0}));assert.equal(cleanPose({x:1801,z:0,y:0,yaw:0}),null);
  assert.equal(cleanPose({x:0,z:0,y:461,yaw:0}),null);assert.equal(cleanPose({x:NaN,z:0,y:0,yaw:0}),null);
});
