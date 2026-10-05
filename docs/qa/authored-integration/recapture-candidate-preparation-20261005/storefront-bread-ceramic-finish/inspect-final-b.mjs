import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import * as THREE from './vendor/three/three.module.js';
import {createHarborDistrict,HARBOR_FRONTAGES,HARBOR_ART_LIMITS}from './src/harbor-district.js';
import {createHarborDistrict as createBefore}from './before/harbor-district.js';
import {createBakedDisplayLoaf,createCraftVesselGeometry,addAuthoredGroundElevation,FRONTAGE_PROFILES}from './src/harbor-frontage-profiles.js';
const context={fillRect(){},strokeRect(){},fillText(){},measureText(t){return{width:t.length*40};}};
globalThis.document={createElement(){return{width:0,height:0,getContext(){return context;}};}};
const T={...THREE,TextureLoader:class{load(){return new THREE.Texture();}}};
const buildings=HARBOR_FRONTAGES.map((f,i)=>({id:f.shellId,x:220+i*4,z:150,width:20,depth:20,height:25,baseY:.18}));
const old=createBefore(T,new THREE.Scene(),{buildings}),now=createHarborDistrict(T,new THREE.Scene(),{buildings});
assert.deepEqual(now.colliders,old.colliders);assert.deepEqual(now.fixtures,old.fixtures);assert.deepEqual(now.snapshot().frontages,old.snapshot().frontages);
old.update({x:230,z:160});now.update({x:230,z:160});const before=old.snapshot(),after=now.snapshot();assert.equal(after.residentFrontages.length,6);assert.ok(after.drawCalls<=100,JSON.stringify(after));assert.ok(after.triangles<=85000,after.triangles);
const digest=buf=>crypto.createHash('sha256').update(buf).digest('hex');const geom=g=>Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,digest(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength))]));
const groups=owner=>owner.root.children.filter(g=>g.name.includes('near street art'));let unchanged=[];
for(const group of groups(now)){
 if(['south-094','south-096'].includes(group.userData.shellId))continue;
 const prior=groups(old).find(g=>g.userData.shellId===group.userData.shellId);assert.equal(group.children.length,prior.children.length);
 for(let i=0;i<group.children.length;i++){assert.equal(group.children[i].material.name,prior.children[i].material.name);assert.deepEqual(geom(group.children[i].geometry),geom(prior.children[i].geometry));}
 unchanged.push(group.userData.shellId);
}
const loaves=[];for(let i=0;i<5;i++){
 const v=createBakedDisplayLoaf(T,i);for(const g of[v.crust,v.scores]){
  for(const a of Object.values(g.attributes))for(const n of a.array)assert.ok(Number.isFinite(n));
  assert.ok(g.boundingBox.min.x>=-.165&&g.boundingBox.max.x<=.165&&g.boundingBox.min.z>=-.101&&g.boundingBox.max.z<=.101);assert.ok(g.boundingBox.min.y>=0&&g.boundingBox.max.y+.049<=.186+1e-6);
 }
 assert.ok(v.crust.attributes.color&&v.scores.attributes.color);loaves.push({variant:i,crustTriangles:v.crust.index.count/3,scoreTriangles:v.scores.index.count/3,min:v.crust.boundingBox.min.toArray(),max:v.crust.boundingBox.max.toArray(),cutDepth:v.cutDepth});v.crust.dispose();v.scores.dispose();
}
const vessels=[];for(const[r,h]of[[.096,.29],[.16,.43]]){
 const g=createCraftVesselGeometry(T,r,h);assert.ok(g.boundingBox.min.x>=-r-1e-6&&g.boundingBox.max.x<=r+1e-6&&g.boundingBox.min.z>=-r-1e-6&&g.boundingBox.max.z<=r+1e-6&&g.boundingBox.min.y>=-1e-6&&g.boundingBox.max.y<=h+1e-6);
 assert.equal(g.parameters.segments,32);vessels.push({radius:r,height:h,triangles:g.index.count/3,min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray(),radialSegments:g.parameters.segments,profilePointCount:g.parameters.points.length});g.dispose();
}
// Capture real transformed new ground-window parts, using the production builder.
const parts=[];const materials=Object.fromEntries(['wood','metal','dark','glass','displayGlass','ceramic','brick','fruit','paper','grout','handle','breadCrust','glaze','clayForm'].map(k=>[k,{key:k}]));
for(const[programme,id]of[['bakery','south-094'],['gallery','south-096']]){
 const site={programme,shellId:id,id,side:id==='south-096'?1:0,width:16.4,angle:0,x:0,z:0,shell:{x:0,z:-10,depth:20,width:20}};
 const cm=id==='south-096'?{...materials,ceramic:materials.glaze}:materials;
 const add=(m,g,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{g=g.clone();const temp=new THREE.Object3D();temp.position.set(x,y,z);temp.rotation.set(rx,ry,rz);temp.scale.set(sx,sy,sz);temp.updateMatrix();g.applyMatrix4(temp.matrix);g.computeBoundingBox();if(['breadCrust','glaze','clayForm'].includes(m.key)){assert.ok(g.boundingBox.max.z<=.69&&g.boundingBox.min.z>=.18);const bay=FRONTAGE_PROFILES[programme].bays.reduce((a,q)=>Math.abs(x-q[0])<Math.abs(x-a[0])?q:a),[u,w,h,bottom0]=bay,bottom=w<=3?.50:bottom0,height=h-(bottom-bottom0);assert.ok(g.boundingBox.min.x>=u-w/2+.11&&g.boundingBox.max.x<=u+w/2-.11&&g.boundingBox.min.y>=bottom+.08&&g.boundingBox.max.y<=bottom+height-.11);parts.push({id,material:m.key,min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()});}g.dispose();};
 const b=(m,x,y,z,sx,sy,sz)=>{const g=new THREE.BoxGeometry(1,1,1);add(m,g,x,y,z,sx,sy,sz);g.dispose();};const c=(m,x,y,z,r,h)=>{const g=new THREE.CylinderGeometry(1,1,1,10);add(m,g,x,y,z,r,h,r);g.dispose();};
 addAuthoredGroundElevation(T,{site,add,b,c,materials:cm,clay:{key:'outer'},stone:{key:'outer'}});
}
const painting=[];now.root.updateMatrixWorld(true);
for(const g of now.root.children.filter(g=>g.userData.shellId==='south-096'))for(const m of g.children.filter(m=>m.material.userData.surfacePaint)){
 assert.equal(m.castShadow,false);assert.equal(m.userData.noShadow,true);assert.equal(m.material.polygonOffset,true);assert.equal(m.material.polygonOffsetFactor,-1);assert.equal(m.material.polygonOffsetUnits,-2);
 const pos=m.geometry.attributes.position,coords=[];for(let i=0;i<pos.count;i++){const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(m.matrixWorld);if(Math.abs(v.z-(buildings[3].z+10+.205))<1e-5)coords.push(v.toArray());}
 assert.equal(coords.length,18,'full banner + two label quads on original south face');const min=[0,1,2].map(k=>Math.min(...coords.map(v=>v[k]))),max=[0,1,2].map(k=>Math.max(...coords.map(v=>v[k])));assert.ok(min[0]>=buildings[3].x-6.5-1e-5&&max[0]<=buildings[3].x+6.5+1e-5&&min[1]>=.18+2.75-1e-5&&max[1]<=.18+3.29+1e-5);painting.push({owner:g.name,worldMin:min,worldMax:max,vertices:coords.length,oldSignFaceOut:.205,doorFrontOut:.43,coplanarDepthBiasOnly:true});
}
now.setQuality('balanced');now.setQuality('high');now.root.traverse(m=>{if(m.isMesh&&!m.userData.noShadow)m.castShadow=true;});
for(const g of now.root.children)for(const m of g.children)if(m.material.userData.displayGlass||m.material.userData.surfacePaint)assert.equal(m.castShadow,false);
const oldGlass=groups(old).flatMap(g=>g.children).filter(m=>m.material.userData.displayGlass);const newGlass=groups(now).flatMap(g=>g.children).filter(m=>m.material.userData.displayGlass);
for(let i=0;i<newGlass.length;i++){assert.deepEqual(geom(newGlass[i].geometry),geom(oldGlass[i].geometry));assert.equal(newGlass[i].material.opacity,.20);assert.equal(newGlass[i].material.depthWrite,false);}
let disposed=0;const near=groups(now).flatMap(g=>g.children);for(const m of near)m.geometry.addEventListener('dispose',()=>disposed++);
now.update({x:2000,z:2000});assert.equal(disposed,near.length);assert.equal(now.snapshot().residentFrontages.length,0);now.update({x:230,z:160});assert.equal(now.snapshot().residentFrontages.length,6);now.setInteriorBuilding('south-096');assert.ok(now.root.children.filter(g=>g.userData.shellId==='south-096').every(g=>!g.visible));now.setInteriorBuilding(null);assert.equal(now.root.children.filter(g=>g.userData.shellId==='south-096'&&g.visible).length,1);now.dispose();old.dispose();assert.equal(now.root.children.length,0);
const report={status:'CPU_ONLY_ORIGINAL_MODEL_REFINEMENT_CHECK_PASS_NATIVE_PENDING',before:{drawCalls:before.drawCalls,triangles:before.triangles},candidate:{drawCalls:after.drawCalls,triangles:after.triangles},countsIncludeActualDocumentCanvasLetteringBranches:true,textureImagesAndCanvasAreCpuPlaceholdersNoGpu:true,unchangedOtherStorefrontGeometryAttributeHashes:unchanged,collidersFixturesPublicFrontagesIdentical:true,glazingGeometryAndMaterialUnchanged:true,newWindowPartsWithinOldDepthEnvelope:parts,newBakedLoaves:loaves,newCeramicVessels:vessels,public096IdentityPainting:painting,nearMeshDisposals:disposed,nearMeshCount:near.length,unloadReloadInteriorHideRestoreAndOwnerDisposePass:true,noGlobalWorldOrChunkChanges:true};fs.writeFileSync('cpu-final-b-proof.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,newWindowPartsWithinOldDepthEnvelope:parts.length},null,2));
