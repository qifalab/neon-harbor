import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import { createWorld } from '../src/world.js';
import { createHarborDistrict,createHarborArchGeometry,HARBOR_FRONTAGES,HARBOR_ART_LIMITS } from '../src/harbor-district.js';
import { createHarborRoomDressing } from '../src/harbor-room-dressing.js';
import { expansionBuilding } from '../src/expansion-programmes.js';
import { createInteriorLayout } from '../src/metropolis-interiors.js';
import { ROAD_CENTERS } from '../src/world-config.js';
import { circleOBB } from '../src/collision.js';
const world=createWorld(THREE,new THREE.Scene(),{streaming:false});
const make=()=>createHarborDistrict(THREE,new THREE.Scene(),{buildings:world.buildings,groundHeightAt:world.groundHeightAt});

test('authored frontages attach to six actual occupied shells and keep High the default',()=>{
 const a=make(),s=a.snapshot();assert.equal(s.quality,'high');assert.equal(s.frontages.length,6);
 for(const f of s.frontages){const b=world.buildings.find(b=>b.id===f.shellId);assert.ok(b);assert.equal(f.baseY,b.baseY);assert.ok(f.width<=(f.angle?b.depth:b.width));assert.ok(Math.abs(f.angle?f.x-b.x-b.width/2:f.z-b.z-b.depth/2)<1e-8);}
 assert.equal(new Set(HARBOR_FRONTAGES.map(f=>f.name)).size,6);a.dispose();
});

test('clear original entrance approaches, frontage walking strip and road lanes are preserved',()=>{
 const a=make();for(const f of a.snapshot().frontages){
  const b=world.buildings.find(b=>b.id===f.shellId),entrance={x:b.x,z:b.z+b.depth/2+3,radius:.36};
  assert.ok(!a.colliders.some(c=>circleOBB(entrance,c)),f.id+' original entrance obstructed');
  for(let u=-7;u<=7;u+=.5){const p={x:f.x+Math.cos(f.angle)*u+Math.sin(f.angle)*2.45,z:f.z-Math.sin(f.angle)*u+Math.cos(f.angle)*2.45,radius:.36};assert.ok(!a.colliders.some(c=>circleOBB(p,c)),f.id+' walking strip blocked');}
 }
 for(const c of a.colliders){assert.ok([c.x,c.z,c.hx,c.hz,c.minY,c.maxY].every(Number.isFinite));assert.ok(c.hx>0&&c.hz>0&&c.maxY>c.minY);for(const road of ROAD_CENTERS){assert.ok(c.x+c.hx<road-11||c.x-c.hx>road+11,'furniture occupies x road');assert.ok(c.z+c.hz<road-11||c.z-c.hz>road+11,'furniture occupies z road');}}
 a.dispose();
});

test('finite curved art geometry, metre projected scanned UVs and a bounded render budget',()=>{
 const a=make();a.update({x:220,z:161},0,.6);const s=a.snapshot();assert.equal(s.residentFrontages.length,6);assert.ok(s.drawCalls<=HARBOR_ART_LIMITS.maxDrawCalls);assert.ok(s.triangles<=HARBOR_ART_LIMITS.maxTriangles);
 let scanMeshes=0;a.root.traverse(m=>{if(!m.isMesh)return;for(const key of['position','normal','uv'])for(const n of m.geometry.getAttribute(key).array)assert.ok(Number.isFinite(n),m.name+' malformed '+key);assert.ok(Number.isFinite(m.geometry.boundingSphere.radius)&&m.geometry.boundingSphere.radius>0);
  if(m.material.userData.scanKind){scanMeshes++;const uv=m.geometry.getAttribute('uv');let max=0,min=0;for(const n of uv.array){max=Math.max(max,n);min=Math.min(min,n);}assert.ok(max-min>1,'scanned UVs must span physical metres across facade');}
 });assert.ok(scanMeshes>=18);const arch=createHarborArchGeometry(THREE);const pos=arch.getAttribute('position');assert.ok(pos.count>100,'real curved extruded frame expected');assert.ok(arch.boundingBox.max.z-arch.boundingBox.min.z>.2);arch.dispose();a.dispose();
});

test('near detail uses hysteresis, actually destroys buffers and restores far proxies',()=>{
 const a=make(),f=a.snapshot().frontages[0];a.update({x:f.x,z:f.z});const near=a.root.children.find(g=>g.userData.shellId===f.shellId&&g.name.includes('near street art'));assert.ok(near);let disposed=0;near.traverse(m=>{if(m.isMesh)m.geometry.addEventListener('dispose',()=>disposed++);});
 a.update({x:f.x+83,z:f.z});assert.ok(a.snapshot().residentFrontages.includes(f.id),'middle band should retain loaded details');a.update({x:f.x+97,z:f.z});assert.ok(!a.snapshot().residentFrontages.includes(f.id));assert.ok(disposed>8,'merged GPU geometry must be disposed, not merely hidden');assert.ok(a.root.children.find(g=>g.name.startsWith(f.name)&&g.name.includes('far facade')).visible);
 a.update({x:f.x+83,z:f.z});assert.ok(!a.snapshot().residentFrontages.includes(f.id),'middle band should retain unloaded state');a.update({x:f.x,z:f.z});assert.ok(a.snapshot().residentFrontages.includes(f.id));a.dispose();assert.equal(a.root.children.length,0);assert.equal(a.root.parent,null);
});

test('shared interior shell IDs hide both proxy and resident art, including later streamed loads',()=>{
 const a=make(),f=a.snapshot().frontages[0];a.setInteriorBuilding(f.shellId);a.update({x:f.x,z:f.z});for(const g of a.root.children.filter(g=>g.userData.shellId===f.shellId))assert.equal(g.visible,false);
 a.setInteriorBuilding(null);const groups=a.root.children.filter(g=>g.userData.shellId===f.shellId);assert.equal(groups.filter(g=>g.visible).length,1);a.update({x:1000,z:1000});assert.equal(groups.filter(g=>g.parent&&g.visible).length,1);a.dispose();
});

test('locally served scanned material maps have recorded CC0 provenance and verified hashes',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../assets/harbor/material-manifest.json',import.meta.url)));assert.equal(manifest.assets.length,6);let total=0;for(const asset of manifest.assets){assert.equal(asset.license,'CC0-1.0');assert.equal(asset.width,1024);assert.equal(asset.height,1024);assert.ok(asset.physicalMeters>=1.9&&asset.physicalMeters<2.3);const b=await readFile(new URL('../assets/harbor/'+asset.file,import.meta.url));assert.equal(b.length,asset.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),asset.sha256);total+=b.length;}assert.ok(total<2_000_000);
});


test('sample room craft fits actual furniture and overhead walls without adding circulation obstacles',()=>{
 for(const spec of HARBOR_FRONTAGES){const i=world.buildings.findIndex(b=>b.id===spec.shellId),b=expansionBuilding(world.buildings[i],'south',i);for(const floor of b.floors.slice(0,3)){
  const layout=createInteriorLayout(b,floor),d=createHarborRoomDressing(THREE,{building:b,floor,layout}),snap=d.snapshot();assert.equal(snap.enabled,true);assert.equal(d.colliders.length,0);assert.ok(snap.drawCalls<=15);assert.ok(snap.triangles<=12000);
  for(const p of snap.details){if(p.zone==='existing furniture top')assert.ok(layout.parts.some(q=>q.id===p.ownerPartId));if(p.minY!==undefined)assert.ok(p.minY>=floor.y+2.1);}
  let disposed=0;d.group.updateMatrixWorld(true);d.group.traverse(m=>{if(!m.isMesh)return;m.geometry.addEventListener('dispose',()=>disposed++);const p=m.geometry.getAttribute('position');for(let v=0;v<p.count;v++){const x=p.getX(v)+b.x,y=p.getY(v)+floor.y,z=p.getZ(v)+b.z;assert.ok([x,y,z].every(Number.isFinite));if(y<floor.y+1.8)for(const room of layout.rooms)assert.ok(Math.hypot(x-room.arrival.x,z-room.arrival.z)>.50,'new craft intrudes into room arrival');}});d.dispose();assert.ok(disposed>0);assert.equal(d.group.children.length,0);
 }}
});
