import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { METROPOLIS_BUILDINGS, METROPOLIS_DISTRICTS, METROPOLIS_ROADS } from '../src/metropolis-catalog.js';
import { createMetropolisWorld } from '../src/metropolis-world.js';
import { validateCityChunk } from '../src/city-streaming.js';

const world = createMetropolisWorld(THREE,new THREE.Scene(),{streaming:false});
const inside = (collider,x,z,y=1) => x>collider.x-collider.hx && x<collider.x+collider.hx && z>collider.z-collider.hz && z<collider.z+collider.hz && y>=collider.minY && y<=collider.maxY;

test('48 permanent addresses have unique identity, four reachable public floors, and distinct programmes',()=>{
  assert.equal(METROPOLIS_BUILDINGS.length,48);assert.equal(new Set(METROPOLIS_BUILDINGS.map(b=>b.id)).size,48);
  assert.equal(METROPOLIS_DISTRICTS.length,6);assert.ok(new Set(METROPOLIS_BUILDINGS.map(b=>b.style)).size>=18);
  for(const b of METROPOLIS_BUILDINGS) {
    assert.ok(b.description.length>15);assert.equal(b.entrance.z,b.z+b.depth/2+3);
    assert.deepEqual(b.floors.map(f=>f.type),['lobby','gallery','workplace','observation']);
    assert.deepEqual(b.floors.slice(0,3).map(f=>f.y),[0,4.2,8.4]);
    assert.ok(b.floors.slice(0,3).every(f=>f.stairs));
    assert.ok(b.floors[3].y>b.floors[2].y);
    assert.ok(b.floors.every(f=>f.y>=0&&f.y<b.height));
  }
});

test('every south entrance has a physical street approach and a door opening',()=>{
  for(const b of METROPOLIS_BUILDINGS)for(const dz of [9,5,0,-2,-4]) {
    const x=b.entrance.x,z=b.entrance.z+dz;
    assert.equal(world.colliders.some(c=>inside(c,x,z)),false,`${b.id}: entrance offset ${dz} blocked`);
    assert.equal(world.groundHeightAt(x,z),0);
  }
});

test('permanent road lanes remain free of building collision with unloaded districts',()=>{
  for(const x of METROPOLIS_ROADS.vertical)for(let z=-1270;z<=-420;z+=5)
    assert.equal(world.colliders.some(c=>inside(c,x,z)),false,`vertical road ${x},${z}`);
  for(const z of METROPOLIS_ROADS.horizontal)for(let x=-715;x<=715;x+=5)
    assert.equal(world.colliders.some(c=>inside(c,x,z)),false,`horizontal road ${x},${z}`);
});

test('bridge deck joins both shores continuously, with no abrupt end slope',()=>{
  assert.equal(world.groundHeightAt(0,-420),0);assert.ok(Math.abs(world.groundHeightAt(0,-280))<1e-10);
  assert.equal(world.groundHeightAt(0,-350),8);
  assert.ok(world.groundHeightAt(0,-419)<.01);assert.ok(world.groundHeightAt(0,-281)<.01);
  for(let z=-419;z<-280;z+=.5)assert.ok(Math.abs(world.groundHeightAt(0,z+.5)-world.groundHeightAt(0,z))<.1);
  assert.equal(world.groundHeightAt(100,-350),null);assert.equal(world.groundHeightAt(0,-1400),null);
});

test('north ferry, metro, light rail and high-speed station approaches stay open',()=>{
  for(const [x,z]of [[-160,-402],[20,-430],[660,-560],[-640,-1160]]) {
    assert.equal(world.colliders.some(c=>inside(c,x,z)),false,`station ${x},${z} blocked`);
    assert.equal(world.groundHeightAt(x,z),0);
  }
});

test('export contains twelve real validated chunks with independent detailed geometry',()=>{
  const blueprint=world.exportCity();assert.equal(blueprint.chunks.length,12);assert.equal(blueprint.payloads.length,12);
  for(const payload of blueprint.payloads) {
    assert.equal(validateCityChunk(payload,payload.id),payload);
    const members=new Set(payload.batches.flatMap(b=>b.buildings));assert.equal(members.size,4);
    const count=payload.batches.reduce((sum,b)=>sum+b.transforms.length,0);assert.ok(count>500);
  }
});

test('entering one address hides just its shell and exiting restores it',()=>{
  const id=METROPOLIS_BUILDINGS[0].id,other=METROPOLIS_BUILDINGS[1].id,matrix=new THREE.Matrix4();
  const visibility=buildingId=>{
    let zero=0,visible=0;
    world.root.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.userData.buildings.forEach((member,index)=>{
      if(member!==buildingId)return;mesh.getMatrixAt(index,matrix);if(matrix.determinant()===0)zero++;else visible++;
    });});return {zero,visible};
  };
  assert.ok(visibility(id).visible>0);world.setInteriorBuilding(id);
  assert.equal(visibility(id).visible,0);assert.ok(visibility(id).zero>0);assert.ok(visibility(other).visible>0);
  world.setInteriorBuilding(null);assert.equal(visibility(id).zero,0);assert.ok(visibility(id).visible>0);
});

test('runtime fetches nearby JSON and actually disposes detail after moving away',async()=>{
  const originalFetch=globalThis.fetch,blueprint=world.exportCity(),calls=[];
  globalThis.fetch=async(url)=>{
    const id=new URL(url).pathname.split('/').pop().replace('.json','');calls.push(id);
    const data=blueprint.payloads.find(p=>p.id===id);return {ok:true,text:async()=>JSON.stringify(data)};
  };
  const streamed=createMetropolisWorld(THREE,new THREE.Scene(),{streaming:true,assetBase:'https://example.test/chunks/'});
  try {
    const prepared=await streamed.prepare({x:-560,z:-490});assert.equal(prepared.ready,true);
    assert.ok(calls.length>0&&calls.length<12);assert.ok(streamed.streamingStats.residentInstances>0);
    const before=streamed.streamingStats.activeChunks;
    await streamed.prepare({x:560,z:-1190});streamed.update({x:560,z:-1190},{x:0,z:0},3);
    assert.ok(streamed.streamingStats.unloaded>0);assert.ok(streamed.streamingStats.disposedInstances>0);
    assert.ok(before.some(id=>!streamed.streamingStats.activeChunks.includes(id)));
    assert.ok(streamed.streamingStats.loaded<=7);
  }finally{streamed.dispose();globalThis.fetch=originalFetch;}
});

test('streaming startup retains no authored detail transforms before any fetch',()=>{
  const streamed=createMetropolisWorld(THREE,new THREE.Scene(),{streaming:true});
  const payloads=streamed.exportCity().payloads;
  assert.equal(payloads.length,12);assert.equal(payloads.reduce((n,p)=>n+p.batches.length,0),0);
  assert.equal(streamed.streamingStats.requested,0);
  assert.equal(streamed.streamingStats.residentInstances,0);
  assert.equal(streamed.colliders.length,world.colliders.length);
  streamed.dispose();
});
