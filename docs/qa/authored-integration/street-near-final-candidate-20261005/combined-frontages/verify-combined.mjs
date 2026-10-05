import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createCanvas} from '/workspace/neon-candidates/ceramic-cpu-canvas-runtime-20261005/node_modules/@napi-rs/canvas/index.js';
import * as THREE from '/tmp/neon-harbor-street-refinement-candidate-20261005/vendor/three/three.module.js';
import {createWorld} from '/tmp/neon-harbor-street-refinement-candidate-20261005/src/world.js';
import {createHarborDistrict,HARBOR_ART_LIMITS} from '/tmp/neon-harbor-street-refinement-candidate-20261005/src/harbor-district.js';
import {createHarborDistrict as beforeDistrict} from '/tmp/neon-ceramic-close-refinement-candidate-20261005/before/src/harbor-district.js';
import {createCraftVesselGeometry} from '/tmp/neon-harbor-street-refinement-candidate-20261005/src/harbor-frontage-profiles.js';
import {createCraftVesselGeometry as beforeVessel} from '/tmp/neon-ceramic-close-refinement-candidate-20261005/before/src/harbor-frontage-profiles.js';
import {createHarborDistrict as ceramicDistrict} from '/tmp/neon-ceramic-close-refinement-candidate-20261005/repo/src/harbor-district.js';
import {createHarborDistrict as breadDistrict} from '/workspace/neon-candidates/morning-tin-bread-20261005/repo/src/harbor-district.js';
import {createCraftCeramicOwner} from '/tmp/neon-harbor-street-refinement-candidate-20261005/src/harbor-ceramic-art.js';

const sha=v=>createHash('sha256').update(v).digest('hex');
const sourceBase='/tmp/neon-harbor-street-refinement-candidate-20261005';
const fullSourceSnapshot=()=>Object.fromEntries([...fs.readdirSync(sourceBase+'/src',{recursive:true}).filter(s=>fs.statSync(sourceBase+'/src/'+s).isFile()).map(s=>'src/'+s),'index.html','styles.css','package.json'].sort().map(name=>[name,sha(fs.readFileSync(sourceBase+'/'+name))]));
const actualFullSourceBefore=fullSourceSnapshot();
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const report={status:'CPU_ONLY_PASS_NATIVE_ART_PENDING',startedAt:new Date().toISOString(),canvas:'Actual @napi-rs/canvas CanvasElement with real 2D rasterization and font metrics; no browser, WebGL or GPU',scannedTextureLoader:'Existing six scanned-image loads use CPU placeholder Texture objects; no image/GPU claim',sourceHashes:{},vessels:[],otherFourShops:[],ownership:[]};
for(const name of ['harbor-district.js','harbor-frontage-profiles.js','harbor-ceramic-art.js','harbor-bread-art.js','main.js','atmosphere.js','contact-occlusion.js','surface-finish.js'])report.sourceHashes['src/'+name]=sha(fs.readFileSync('/tmp/neon-harbor-street-refinement-candidate-20261005/src/'+name));
const world=createWorld(THREE,new THREE.Scene(),{streaming:false});
const canvasImages=[];
globalThis.document={createElement(kind){assert.equal(kind,'canvas');const canvas=createCanvas(1,1);canvasImages.push(canvas);return canvas;}};
const T={...THREE,TextureLoader:class{load(url,onLoad){const texture=new THREE.Texture();if(url.includes('/bakery/')){texture.image={width:256,height:256,cpuAssetSHA256:sha(fs.readFileSync(new URL(url)))};queueMicrotask(()=>onLoad?.(texture));}return texture;}}};
const old=beforeDistrict(T,new THREE.Scene(),{buildings:world.buildings,groundHeightAt:world.groundHeightAt}),current=createHarborDistrict(T,new THREE.Scene(),{buildings:world.buildings,groundHeightAt:world.groundHeightAt});
assert.deepEqual(current.colliders,old.colliders);assert.deepEqual(current.fixtures,old.fixtures);assert.deepEqual(current.snapshot().frontages,old.snapshot().frontages);
old.update({x:220,z:161},0,16.5);current.update({x:220,z:161},0,16.5);
const before=old.snapshot(),after=current.snapshot();
assert.equal(before.drawCalls,99);assert.equal(before.triangles,84830);assert.equal(after.drawCalls,102);assert.equal(after.triangles,106814);assert.equal(after.residentFrontages.length,6);
assert.ok(after.drawCalls<=HARBOR_ART_LIMITS.maxDrawCalls);assert.ok(after.triangles<=HARBOR_ART_LIMITS.maxTriangles);
report.before={drawCalls:before.drawCalls,triangles:before.triangles};report.candidate={drawCalls:after.drawCalls,triangles:after.triangles};report.limits=HARBOR_ART_LIMITS;
const geometry=g=>Object.fromEntries(Object.entries(g.attributes).map(([key,a])=>[key,{count:a.count,itemSize:a.itemSize,sha256:sha(bytes(a.array))}]));
const texture=t=>t?.image?.cpuAssetSHA256?t.image.cpuAssetSHA256:ArrayBuffer.isView(t?.image?.data)?sha(bytes(t.image.data)):t?.image?.toBuffer?sha(t.image.toBuffer('image/png')):t?{existingCpuPlaceholder:true}:null;
const material=m=>({name:m.name,color:m.color.getHex(),roughness:m.roughness,metalness:m.metalness,opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite,emissive:m.emissive.getHex(),emissiveIntensity:m.emissiveIntensity,bumpScale:m.bumpScale,side:m.side,maps:Object.fromEntries(['map','roughnessMap','bumpMap','normalMap'].map(k=>[k,texture(m[k])]))});
const group=(api,id,near=true)=>api.root.children.find(g=>g.userData.shellId===id&&g.name.includes(near?'near street art':'far facade proxy'));
const signature=g=>g.children.map(m=>({name:m.name,geometry:geometry(m.geometry),material:material(m.material),castShadow:m.castShadow,receiveShadow:m.receiveShadow}));
for(const id of after.frontages.map(f=>f.shellId)){
 assert.deepEqual(signature(group(current,id,false)),signature(group(old,id,false)),id+' far proxy changed');
 if(['south-096','south-094'].includes(id))continue;
 const prior=signature(group(old,id)),next=signature(group(current,id));assert.deepEqual(next,prior,id+' near attributes/material/canvas bytes changed');
 report.otherFourShops.push({id,byteIdentical:true,sha256:sha(JSON.stringify(next)),drawCalls:next.length});
}
const ceramicOnly=ceramicDistrict(T,new THREE.Scene(),{buildings:world.buildings,groundHeightAt:world.groundHeightAt}),breadOnly=breadDistrict(T,new THREE.Scene(),{buildings:world.buildings,groundHeightAt:world.groundHeightAt});
ceramicOnly.update({x:220,z:161},0,16.5);breadOnly.update({x:220,z:161},0,16.5);await Promise.resolve();
for(const id of after.frontages.map(f=>f.shellId)){
 if(id!=='south-094')assert.deepEqual(signature(group(current,id)),signature(group(ceramicOnly,id)),id+' changed relative to sealed096');
 if(id!=='south-096')assert.deepEqual(signature(group(current,id)),signature(group(breadOnly,id)),id+' changed relative to sealed094');
}
report.independentCandidateCompositionIdentity={relativeToSealed096:'only south094 changed',relativeToSealed094:'only south096 changed',allOtherStoresAndResourcesByteIdentical:true};
for(const api of[ceramicOnly,breadOnly]){assert.deepEqual(api.colliders,current.colliders);assert.deepEqual(api.fixtures,current.fixtures);}
const prior096=group(old,'south-096'),near096=group(current,'south-096');
const near094=group(current,'south-094'),breadOwner=near094.userData.breadOwner;
assert.equal(breadOwner.snapshot().loadedMaps,3);let breadTextureDisposals=0,breadMaterialDisposals=0;for(const t of breadOwner.textures)t.addEventListener('dispose',()=>breadTextureDisposals++);for(const m of[breadOwner.crust,breadOwner.crumb])m.addEventListener('dispose',()=>breadMaterialDisposals++);
const allGlass=api=>after.frontages.map(f=>({id:f.shellId,mesh:group(api,f.shellId).children.find(m=>m.material.userData.displayGlass)}));
for(const row of allGlass(current)){const before=allGlass(old).find(r=>r.id===row.id);assert.deepEqual(geometry(row.mesh.geometry),geometry(before.mesh.geometry));assert.deepEqual(material(row.mesh.material),material(before.mesh.material));}
report.originalDisplayGlassAllSixIdentical=true;

// Existing display glazing, lettering, lamps and potted plants stay byte exact.
const unchanged096=[],seenNames=new Map();
for(const mesh of near096.children.filter(m=>!m.material.userData.originalCeramic)){
 const name=mesh.material.name,n=seenNames.get(name)||0;seenNames.set(name,n+1);const previous=prior096.children.filter(m=>m.material.name===name)[n];assert.ok(previous,mesh.material.name);
 if(['Harbor · quiet ivory glazed stoneware','Harbor · unglazed warm stoneware'].includes(mesh.material.name))continue;
 assert.deepEqual(geometry(mesh.geometry),geometry(previous.geometry));assert.deepEqual(material(mesh.material),material(previous.material));unchanged096.push(mesh.material.name);
}
report.unchanged096NonCeramicBuckets=unchanged096;
for(const [radius,height] of [[.096,.29],[.16,.43]]){
 const prior=beforeVessel(THREE,radius,height),next=createCraftVesselGeometry(THREE,radius,height);
 assert.deepEqual(next.boundingBox.min.toArray(),prior.boundingBox.min.toArray());assert.deepEqual(next.boundingBox.max.toArray(),prior.boundingBox.max.toArray());
 let zeroArea=0,inwardWallTriangles=0,footTriangles=0;
 const p=next.attributes.position,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),cross=new THREE.Vector3(),centre=new THREE.Vector3();
 for(let i=0;i<next.index.count;i+=3){a.fromBufferAttribute(p,next.index.getX(i));b.fromBufferAttribute(p,next.index.getX(i+1));c.fromBufferAttribute(p,next.index.getX(i+2));cross.subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));if(cross.lengthSq()<=1e-20)zeroArea++;centre.copy(a).add(b).add(c).multiplyScalar(1/3);if(centre.y>height*.04&&cross.x*centre.x+cross.z*centre.z<0)inwardWallTriangles++;if(centre.y<=height*.035+1e-8)footTriangles++;}
 assert.equal(zeroArea,0);assert.ok(inwardWallTriangles>500);assert.ok(footTriangles>32);
 for(const attribute of Object.values(next.attributes))for(const value of attribute.array)assert.ok(Number.isFinite(value));
 const points=next.parameters.points;assert.ok(points.filter(p=>p.y===height).every(p=>p.x>0),'open mouth replaced by a cap');
 assert.equal(next.parameters.segments,32);assert.ok(points.length>45);
 report.vessels.push({radius,height,beforeTriangles:prior.index.count/3,triangles:next.index.count/3,profilePoints:points.length,radialSegments:32,minimum:next.boundingBox.min.toArray(),maximum:next.boundingBox.max.toArray(),sameActualPreviousFloat32AABB:true,zeroAreaTriangles:zeroArea,inwardWallTriangles,closedFootTriangles:footTriangles,openMouth:true});
 prior.dispose();next.dispose();
}
const owner=near096.userData.craftCeramicOwner;assert.ok(owner);
const firstTextures=Object.values(owner.maps).flatMap(set=>Object.values(set).filter(v=>v?.isTexture));assert.equal(firstTextures.length,6);
const textureDisposals=new Map(firstTextures.map(t=>[t.uuid,0])),materials=[owner.glaze,owner.clay],materialDisposals=new Map(materials.map(m=>[m.uuid,0]));
for(const t of firstTextures)t.addEventListener('dispose',()=>textureDisposals.set(t.uuid,textureDisposals.get(t.uuid)+1));
for(const m of materials)m.addEventListener('dispose',()=>materialDisposals.set(m.uuid,materialDisposals.get(m.uuid)+1));
const nearGeometryDisposals=new Map(near096.children.map(m=>[m.geometry.uuid,0]));for(const m of near096.children)m.geometry.addEventListener('dispose',()=>nearGeometryDisposals.set(m.geometry.uuid,nearGeometryDisposals.get(m.geometry.uuid)+1));
const textureRows=firstTextures.map(t=>({name:t.name,uuid:t.uuid,bytes:t.image.data.byteLength,sha256:sha(bytes(t.image.data)),colorSpace:t.colorSpace,generateMipmaps:t.generateMipmaps,minFilter:t.minFilter}));
report.authoredMaps={textureRows,baseLevelBytes:textureRows.reduce((n,t)=>n+t.bytes,0),fullMipChainTexelBytes:6*4*Array.from({length:9},(_,i)=>(256>>i)**2).reduce((a,b)=>a+b,0),measuredVram:false};
current.setInteriorBuilding('south-096');assert.ok(!near096.visible);assert.deepEqual([...textureDisposals.values()],[0,0,0,0,0,0]);current.setInteriorBuilding(null);assert.ok(near096.visible);
const ceramicSite=after.frontages.find(f=>f.shellId==='south-096'),breadSite=after.frontages.find(f=>f.shellId==='south-094');
const separation=Math.hypot(ceramicSite.x-breadSite.x,ceramicSite.z-breadSite.z);assert.ok(separation>0);
const farFrom=(target,keep)=>({x:keep.x+(keep.x-target.x)/separation*(96-separation*.3),z:keep.z+(keep.z-target.z)/separation*(96-separation*.3)});
current.update(farFrom(breadSite,ceramicSite));
assert.equal(breadTextureDisposals,3);assert.equal(breadMaterialDisposals,2);assert.equal(breadOwner.snapshot().status,'disposed');breadOwner.dispose();assert.equal(breadTextureDisposals,3);assert.ok(current.snapshot().residentFrontages.includes(ceramicSite.id));assert.ok(!current.snapshot().residentFrontages.includes(breadSite.id));assert.ok([...textureDisposals.values()].every(v=>v===0));assert.ok(group(current,'south-096').userData.craftCeramicOwner===owner);
report.independentStoreUnloads={breadOnlyUnloadLeavesSixCeramicTexturesLive:true};
current.update({x:220,z:161});await Promise.resolve();const intermediateBread=group(current,'south-094').userData.breadOwner;let intermediateBreadTextureDisposals=0;for(const t of intermediateBread.textures)t.addEventListener('dispose',()=>intermediateBreadTextureDisposals++);
current.update(farFrom(ceramicSite,breadSite));
assert.ok(!current.snapshot().residentFrontages.includes(ceramicSite.id));assert.ok(current.snapshot().residentFrontages.includes(breadSite.id));assert.equal(intermediateBreadTextureDisposals,0);assert.equal(group(current,'south-094').userData.breadOwner,intermediateBread);assert.ok([...textureDisposals.values()].every(v=>v===1));assert.ok([...materialDisposals.values()].every(v=>v===1));assert.ok([...nearGeometryDisposals.values()].every(v=>v===1));report.independentStoreUnloads.ceramicOnlyUnloadLeavesThreeBreadTexturesLive=true;
current.update({x:2000,z:2000});assert.equal(intermediateBreadTextureDisposals,3);assert.equal(current.snapshot().residentFrontages.length,0);assert.ok([...textureDisposals.values()].every(v=>v===1));assert.ok(group(current,'south-096',false).visible);owner.dispose();assert.ok([...textureDisposals.values()].every(v=>v===1));
report.ownership.push({operation:'distance unload + double owner dispose',sixTextureDisposalsExactlyOnce:true,twoMaterialDisposalsExactlyOnce:true,nearGeometryDisposalsExactlyOnce:true,originalFarProxyRestored:true});
current.update({x:220,z:161});await Promise.resolve();const nextBreadOwner=group(current,'south-094').userData.breadOwner;assert.equal(nextBreadOwner.snapshot().loadedMaps,3);assert.ok(nextBreadOwner.textures.every(t=>!breadOwner.textures.some(old=>old.uuid===t.uuid)));let newBreadDisposals=0;for(const t of nextBreadOwner.textures)t.addEventListener('dispose',()=>newBreadDisposals++);const nextOwner=group(current,'south-096').userData.craftCeramicOwner;assert.notEqual(nextOwner,owner);assert.ok(Object.values(nextOwner.maps).flatMap(s=>Object.values(s).filter(t=>t?.isTexture)).every(t=>!textureDisposals.has(t.uuid)));
const second=Object.values(nextOwner.maps).flatMap(s=>Object.values(s).filter(t=>t?.isTexture));const finalDisposals=new Map(second.map(t=>[t.uuid,0]));for(const t of second)t.addEventListener('dispose',()=>finalDisposals.set(t.uuid,finalDisposals.get(t.uuid)+1));
current.dispose();assert.equal(newBreadDisposals,3);old.dispose();ceramicOnly.dispose();breadOnly.dispose();assert.ok([...finalDisposals.values()].every(v=>v===1));assert.equal(current.root.children.length,0);assert.equal(current.root.parent,null);
report.ownership.push({operation:'reload + whole-owner dispose',newDisjointTextureIdentities:true,reloadedTexturesDisposedExactlyOnce:true,rootDetachedAndEmpty:true});
report.breadOwner={firstThreeTextureDisposals:breadTextureDisposals,firstTwoMaterialDisposals:breadMaterialDisposals,reloadedTexturesDisposals:newBreadDisposals,independentCeramicDisposalsUnchanged:true,scope:'Actual Three events on CPU textures with verified original PNG hashes, no native image decode or GPU'};
report.colliders={worldCount:world.colliders.length,frontageCount:current.colliders.length,unchanged:true,sha256:sha(JSON.stringify(current.colliders)),fixturesSha256:sha(JSON.stringify(current.fixtures))};
for(const name of['main.js','atmosphere.js','contact-occlusion.js','harbor-water.js','surface-finish.js'])assert.equal(sha(fs.readFileSync('/tmp/neon-harbor-street-refinement-candidate-20261005/src/'+name)),sha(fs.readFileSync('/tmp/neon-ceramic-close-refinement-candidate-20261005/before/src/'+name)),name+' lighting/output source changed');
report.lightingAndOutputSourceByteIdenticalTo5cd=true;
const actualFullSourceAfter=fullSourceSnapshot();assert.deepEqual(actualFullSourceAfter,actualFullSourceBefore,'source changed while CPU proof was running');report.actualFullSourceHashes=actualFullSourceAfter;report.actualFullSourceFiles=Object.keys(actualFullSourceAfter).length;report.allClientSourceHashesFrozenBeforeAfter=true;
report.actualCanvasObjects=canvasImages.length;report.actualCanvasRastersSha256=canvasImages.map(c=>sha(c.toBuffer('image/png')));report.finishedAt=new Date().toISOString();
fs.writeFileSync('./cpu-proof.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,actualCanvasRastersSha256:report.actualCanvasRastersSha256.length,authoredMaps:{...report.authoredMaps,textureRows:report.authoredMaps.textureRows.length}},null,2));
