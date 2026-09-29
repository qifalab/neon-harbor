import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { METROPOLIS_BUILDINGS } from '../src/metropolis-catalog.js';
import { METROPOLIS_ARCHITECTURE, architectureDesignFor } from '../src/metropolis-architecture-designs.js';
import { createMetropolisWorld } from '../src/metropolis-world.js';

const authored=createMetropolisWorld(THREE,new THREE.Scene(),{streaming:false});
const payloads=authored.exportCity().payloads;
const records=payloads.flatMap(p=>p.batches.flatMap(batch=>batch.transforms.map((transform,index)=>({
  kind:batch.kind,material:batch.material,building:batch.buildings[index],transform,
}))));

test('every address has an explicit entrance, frontage, roof, and unique physical signature',()=>{
  assert.equal(Object.keys(METROPOLIS_ARCHITECTURE).length,48);
  assert.equal(new Set(Object.values(METROPOLIS_ARCHITECTURE).map(d=>d.signature)).size,48);
  for(const b of METROPOLIS_BUILDINGS) {
    const design=architectureDesignFor(b);
    for(const field of ['entryUse','podium','facade','roof','fenestration','signature'])assert.ok(design[field].length>2,`${b.id}: missing ${field}`);
    assert.equal(design.clearApproachWidth,12);assert.equal(design.shopfronts.length,4);
    assert.equal(new Set(design.shopfronts).size,4);
    assert.equal(architectureDesignFor(b.id),design);
  }
  assert.throws(()=>architectureDesignFor('unknown'),/No architecture design/);
});

test('all 192 authored display fronts are visible chunk geometry and clear the central approach',()=>{
  const signs=records.filter(r=>r.material.startsWith('shop:'));
  assert.equal(signs.length,192);
  for(const b of METROPOLIS_BUILDINGS) {
    const memberSigns=signs.filter(r=>r.building===b.id);assert.equal(memberSigns.length,4);
    for(const [index,sign] of memberSigns.entries()) {
      assert.equal(sign.material,`shop:${b.id}:${index}`);
      const [x,y,z,sx,sy]=sign.transform;
      assert.ok(Math.abs(x-b.x)-sx/2>=6,`${b.id}: display overlaps doorway`);
      assert.ok(y-sy/2>3,`${b.id}: sign is below safe headroom`);
      assert.ok(z>b.z+b.depth/2,`${b.id}: sign hidden inside building`);
    }
  }
});

test('human-scale motifs and curved components survive actual chunk export',()=>{
  for(const b of METROPOLIS_BUILDINGS) {
    const components=records.filter(r=>r.building===b.id);
    assert.ok(components.some(r=>r.kind==='roundedBox'),`${b.id}: missing filleted entrance canopy`);
    assert.ok(components.some(r=>r.material==='metal'&&r.transform[4]<.2),`${b.id}: missing small joinery`);
  }
  for(const [id,kind] of [['tide-museum','ring'],['red-brick-post','disc'],['science-forum','ring'],['civic-hall','cylinder'],['golden-cinema','roundedBox'],['temple-court','sphere']])
    assert.ok(records.some(r=>r.building===id&&r.kind===kind),`${id}: signature geometry ${kind} absent`);
  // Distinct programs must not collapse to the same decoration transforms.
  const signatures=METROPOLIS_BUILDINGS.map(b=>JSON.stringify(records.filter(r=>r.building===b.id).map(r=>[
    r.kind,r.material.replace(b.id,'address'),...r.transform.map((n,i)=>i===0?n-b.x:i===2?n-b.z:n),
  ])));
  assert.equal(new Set(signatures).size,48);
});

test('additional architectural detail stays streamed and within bounded chunk budgets',()=>{
  const streamed=createMetropolisWorld(THREE,new THREE.Scene(),{streaming:true});
  try {
    assert.equal(streamed.exportCity().payloads.reduce((n,p)=>n+p.batches.length,0),0);
    assert.equal(streamed.colliders.length,authored.colliders.length);
    for(const p of payloads) {
      assert.ok(p.batches.length<70,`${p.id}: unexpectedly many draw batches`);
      assert.ok(p.batches.reduce((n,b)=>n+b.transforms.length,0)<18000,`${p.id}: detail budget exceeded`);
    }
  } finally {streamed.dispose();}
});

test('architectural refinement retains the full wide lobby approach at every address',()=>{
  for(const b of METROPOLIS_BUILDINGS)for(const dx of [-4.8,-2.4,0,2.4,4.8])for(const dz of [8,4,0,-2]) {
    const x=b.entrance.x+dx,z=b.entrance.z+dz;
    assert.equal(authored.colliders.some(c=>x>c.x-c.hx&&x<c.x+c.hx&&z>c.z-c.hz&&z<c.z+c.hz&&1>=c.minY&&1<=c.maxY),false,`${b.id}: approach ${dx},${dz} blocked`);
  }
});

test('address-specific sign materials are disposed along with their streamed district',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async url=>{
    const id=new URL(url).pathname.split('/').pop().replace('.json','');
    return {ok:true,text:async()=>JSON.stringify(payloads.find(p=>p.id===id))};
  };
  const streamed=createMetropolisWorld(THREE,new THREE.Scene(),{streaming:true,assetBase:'https://example.test/chunks/'});
  let signCount=0,disposed=0;
  try {
    await streamed.prepare({x:-560,z:-490});
    streamed.root.traverse(mesh=>{
      if(mesh.material?.userData.streamedSignKey) {signCount++;mesh.material.addEventListener('dispose',()=>disposed++);}
    });
    assert.ok(signCount>=16);
    await streamed.prepare({x:560,z:-1190});streamed.update({x:560,z:-1190},{x:0,z:0},3);
    assert.ok(disposed>0,'unloaded facade signs retained their GPU materials');
  } finally {streamed.dispose();globalThis.fetch=originalFetch;}
});
