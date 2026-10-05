import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from './vendor/three/three.module.js';
import { FRONTAGE_PROFILES,addAuthoredGroundElevation } from './src/harbor-frontage-profiles.js';
import { addAuthoredGroundElevation as before } from './before/harbor-frontage-profiles.js';
const names=['stone','grout','metal','wood','glass','ceramic','dark','leaf','fruit','paper','brick','handle','displayGlass','clay'];
const materials=Object.fromEntries(names.map(name=>[name,{name}]));
const sha=b=>createHash('sha256').update(b).digest('hex');
const record=(fn,site)=>{
 let currentBay=-1;const records=[];
 const displayBays=FRONTAGE_PROFILES[site.programme].bays.filter(([u])=>!(site.side===0&&Math.abs(u)<.01)).map(([u,w,h,originalBottom])=>{const bottom=w<=3?.5:originalBottom;return{u,w,bottom,height:h-(bottom-originalBottom)};});
 const add=(m,g,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{
  const helper=new Error().stack.includes('addWindowDisplay');
  if(helper&&m.name==='dark'&&z===.20)currentBay++;
  const o=new THREE.Object3D();o.position.set(x,y,z);o.scale.set(sx,sy,sz);o.rotation.set(rx,ry,rz);o.updateMatrix();
  g.computeBoundingBox();const bounds=g.boundingBox.clone().applyMatrix4(o.matrix);assert.ok([bounds.min.x,bounds.min.y,bounds.min.z,bounds.max.x,bounds.max.y,bounds.max.z].every(Number.isFinite));
  const p=g.getAttribute('position'), signature=sha(Buffer.from(p.array.buffer,p.array.byteOffset,p.array.byteLength));
  records.push({material:m.name,type:g.type,helper,bay:helper?currentBay:null,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},shapeSignature:signature,transform:[x,y,z,sx,sy,sz,rx,ry,rz]});g.dispose();
 };
 const box=new THREE.BoxGeometry(1,1,1),cyl=new THREE.CylinderGeometry(1,1,1,10);
 const b=(m,x,y,z,sx,sy,sz)=>add(m,box,x,y,z,sx,sy,sz);
 const c=(m,x,y,z,r,h,rx=0,rz=0)=>add(m,cyl,x,y,z,r,h,r,rx,0,rz);
 fn(THREE,{site,add,b,c,materials,clay:materials.clay,stone:materials.stone});
 box.dispose();cyl.dispose();return {records,displayBays};
};
const result={sourceHashes:{},cases:[],scope:'CPU geometry inspection only; no GPU, screenshot or art acceptance'};
for(const file of ['src/harbor-frontage-profiles.js','src/harbor-district.js'])result.sourceHashes[file]=sha(readFileSync(file));
for(const programme of Object.keys(FRONTAGE_PROFILES)){
 const side=['noodles','bakery'].includes(programme)?0:1;
 const site={programme,side,width:16.4,angle:side*Math.PI/2,x:8,z:10,shell:{x:0,z:0,width:16,depth:20}};
 const prev=record(before,site),next=record(addAuthoredGroundElevation,site);
 const added=next.records.filter(r=>r.helper);
 assert.ok(added.length>10);
 for(const r of added){const bay=next.displayBays[r.bay];assert.ok(bay);const [mn,mx]=[r.bounds.min,r.bounds.max];const eps=1e-7;assert.ok(mn[0]>=bay.u-(bay.w-.17)/2-eps&&mx[0]<=bay.u+(bay.w-.17)/2+eps,programme+' width '+JSON.stringify(r));assert.ok(mn[1]>=bay.bottom-eps&&mx[1]<=bay.bottom+bay.height+eps,programme+' height');assert.ok(mn[2]>=.18-eps&&mx[2]<=.69+eps,programme+' depth '+JSON.stringify(r));}
 const canonical=r=>JSON.stringify({material:r.material==='handle'?'metal':r.material,type:r.type,shape:r.shapeSignature,transform:r.transform});
 const oldUnchanged=prev.records.filter(r=>!((r.material==='dark'&&r.transform[2]===.43||r.material==='glass'&&r.transform[2]===.505)&&next.displayBays.some(b=>Math.abs(r.transform[0]-b.u)<1e-9&&Math.abs(r.transform[1]-(b.bottom+b.height/2))<1e-9))).map(canonical);
 const newUnchanged=next.records.filter(r=>!r.helper).map(canonical);
 assert.deepEqual(newUnchanged,oldUnchanged,programme+' outside-display geometry or hardware positions changed');
 result.cases.push({programme,side,displayWindows:next.displayBays.length,addedParts:added.length,depthMin:Math.min(...added.map(r=>r.bounds.min[2])),depthMax:Math.max(...added.map(r=>r.bounds.max[2])),unchangedOtherParts:newUnchanged.length,allAddedGeometryInsideOldWindowEnvelope:true,publicDoorAndHardwareGeometryUnchanged:true,displayParts:added});
}
const oldDistrict=readFileSync('before/harbor-district.js','utf8'),newDistrict=readFileSync('src/harbor-district.js','utf8');
const colliderBlock=s=>s.slice(s.indexOf('  function localToWorld('),s.indexOf('  function buildSite('));
assert.equal(colliderBlock(newDistrict),colliderBlock(oldDistrict));result.colliderAndFixtureSourceSha256=sha(colliderBlock(newDistrict));
writeFileSync('display-bounds-proof.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({cases:result.cases.map(({displayParts,...r})=>r),colliderAndFixtureSourceSha256:result.colliderAndFixtureSourceSha256,sourceHashes:result.sourceHashes},null,2));
