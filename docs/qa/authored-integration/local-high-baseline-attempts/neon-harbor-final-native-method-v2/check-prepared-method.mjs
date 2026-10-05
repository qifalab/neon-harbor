/** Small CPU-only preparation checks. These never simulate an accepted native
 * scene: mocks exercise error preservation, not art, walking or GPU behavior. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {CORE_PLANS,compileFrontagePlan} from './plans.mjs';
import {expectedIds} from './expectations.mjs';
import {createInput} from './input.mjs';
const catalog=JSON.parse(await fs.readFile(new URL('evidence/captured-buildings.json',import.meta.url)));
test('mode selects expectations while fixed photo and physical route plans stay identical',()=>{
 for(const plan of [...Object.values(CORE_PLANS),...['south-090','south-091','south-092','south-094','south-095','south-096'].map(id=>compileFrontagePlan(catalog.buildings[id]))]){
  assert.ok(plan.steps.some(s=>s.kind==='photo'));assert.equal(plan.steps.filter(s=>s.kind==='enter').length,2);assert.equal(plan.steps.filter(s=>s.kind==='exit').length,2);
  for(const step of plan.steps.filter(s=>s.kind==='photo'))assert.ok(Number.isFinite(step.camera.yaw)&&step.camera.pitch>=-.75&&step.camera.pitch<=1.05&&step.camera.fov===65);
  assert.ok(!JSON.stringify(plan).includes('authoredHome'));
 }
 assert.equal(expectedIds('baseline','home','lobby'),null);assert.equal(expectedIds('baseline','workshop','lobby').length,2);
 assert.equal(expectedIds('authored','workshop','lobby').length,5);assert.equal(expectedIds('authored','home','lobby').length,3);assert.equal(expectedIds('authored','home','gallery').length,1);
});
test('original input error survives a second snapshot failure and final key-up failure',async()=>{
 const first=new Error('Expected actual-key hold first failure'),second=new Error('Expected cold diagnostic second failure'),keyUp=new Error('Expected cleanup key-up failure');
 const record={inputs:[]},state={position:{x:0,y:.215,z:0},camera:{yaw:Math.PI,pitch:.15},settings:{sensitivity:1},simulationTime:1,teleportRevision:4,city:{interior:{buildingId:'south-079',floorId:'lobby'}}};
 let failed=false,waits=0;
 const page={
  evaluate:async()=>{if(failed)throw second;return structuredClone(state);},
  waitForFunction:async()=>{if(++waits>1){failed=true;throw first;}},
  locator:()=>({boundingBox:async()=>({x:0,y:0,width:1280,height:800})}),
  keyboard:{down:async()=>{},up:async()=>{if(failed)throw keyUp;}},
  mouse:{move:async()=>{},down:async()=>{},up:async()=>{}},
 };
 const input=createInput(page,{remaining:()=>1000,record,persist:async()=>{}});
 await assert.rejects(input.walk('x',8),error=>error===first);
 const leg=record.inputs.find(i=>i.kind==='real-WASD-leg');assert.equal(leg.status,'failed');assert.equal(leg.firstError.message,first.message);
 assert.equal(leg.holds[0].firstError.message,first.message);assert.ok(leg.holds[0].secondaryErrors.some(e=>e.message===second.message));
 assert.ok(leg.secondaryErrors.some(e=>e.message===second.message));assert.ok(leg.secondaryErrors.some(e=>e.message===keyUp.message));
 assert.equal(leg.holds.length,1,'A failing first input is never retried');
});
test('unmet endpoint stops after exactly two visibly logged correction holds',async()=>{
 const record={inputs:[]},state={position:{x:0,y:.215,z:0},camera:{yaw:Math.PI,pitch:.15},settings:{sensitivity:1},simulationTime:1,teleportRevision:4,city:{interior:{buildingId:'south-079',floorId:'lobby'}}};
 let waits=0,held=null;
 const page={evaluate:async()=>structuredClone(state),locator:()=>({boundingBox:async()=>({x:0,y:0,width:1280,height:800})}),
  waitForFunction:async()=>{if(++waits>1&&held){state.position.x=state.position.x===0?1.4:state.position.x-.02;state.simulationTime+=.1;}},
  keyboard:{down:async key=>{if(key!=='z')held=key;},up:async key=>{if(key===held)held=null;}},mouse:{move:async()=>{},down:async()=>{},up:async()=>{}}};
 const input=createInput(page,{remaining:()=>1000,record,persist:async()=>{}});
 await assert.rejects(input.walk('x',1),/two declared corrections/);
 const leg=record.inputs.find(i=>i.kind==='real-WASD-leg');assert.deepEqual(leg.holds.map(h=>h.kind),['precision-approach','explicit-endpoint-correction-1','explicit-endpoint-correction-2']);
 assert.equal(held,null);assert.equal(leg.status,'failed');
});
test('home/workshop common standing regions and existing stair tube are recorded only as CPU preparation',async()=>{
 const proof=JSON.parse(await fs.readFile(new URL('evidence/common-pose-proof.json',import.meta.url)));
 assert.equal(proof.status,'CPU_PREPARATION_ONLY');assert.equal(proof.clear,true);assert.equal(proof.bodyRadius,.65);assert.equal(proof.axisTolerance,.15);
 for(const p of [...proof.photos,...proof.routes])for(const mode of p.modes)assert.ok(mode.clear&&mode.minBodyClearance>=.049);
 for(const mode of proof.stairPreparation.modes)assert.ok(mode.clear&&mode.minBodyClearance>=.069);
});
