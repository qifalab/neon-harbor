import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import * as THREE from './vendor/three/three.module.js';
import { createHarborDistrict,HARBOR_FRONTAGES,HARBOR_ART_LIMITS } from './src/harbor-district.js';
import { createHarborDistrict as createBefore } from './before/harbor-district.js';
const buildings=HARBOR_FRONTAGES.map((f,i)=>({id:f.shellId,x:220+i*4,z:150,width:20,depth:20,height:25,baseY:.18}));
const older=createBefore(THREE,new THREE.Scene(),{buildings}),current=createHarborDistrict(THREE,new THREE.Scene(),{buildings});
assert.deepEqual(current.colliders,older.colliders);assert.deepEqual(current.fixtures,older.fixtures);assert.deepEqual(current.snapshot().frontages,older.snapshot().frontages);
older.update({x:230,z:160});current.update({x:230,z:160});
const baseline=older.snapshot(),candidate=current.snapshot();
assert.equal(candidate.residentFrontages.length,6);assert.ok(candidate.drawCalls<=HARBOR_ART_LIMITS.maxDrawCalls);assert.ok(candidate.triangles<=HARBOR_ART_LIMITS.maxTriangles);
const nearMeshes=[];current.root.traverse(o=>{if(o.isMesh&&o.parent.name.includes('near street art'))nearMeshes.push(o);});
const glazing=nearMeshes.filter(o=>o.material.userData.displayGlass),handles=nearMeshes.filter(o=>o.material.name==='Harbor · brushed warm brass handle');
assert.equal(glazing.length,6);assert.equal(handles.length,6);
for(const o of glazing){const m=o.material;assert.equal(m.transparent,true);assert.equal(m.opacity,.20);assert.equal(m.depthWrite,false);assert.equal(m.roughness,.18);assert.equal(m.metalness,.02);assert.equal(m.emissiveIntensity,0);assert.equal(m.emissive.getHex(),0);assert.equal(o.castShadow,false);assert.equal(o.userData.noShadow,true);}
for(const o of handles){assert.equal(o.material.color.getHexString(),'d5bd8b');assert.equal(o.material.roughness,.35);assert.equal(o.material.metalness,.55);assert.equal(o.material.userData.surfaceFinish.kind,'metal');}
current.setQuality('balanced');current.setQuality('high');
// Mirror the actual main.js quality traversal after world.setQuality.
current.root.traverse(o=>{if(o.isMesh&&!o.userData.noShadow)o.castShadow=true;});
for(const o of glazing)assert.equal(o.castShadow,false);
let disposedGeometries=0;for(const o of nearMeshes)o.geometry.addEventListener('dispose',()=>disposedGeometries++);
let disposedGlass=0,disposedHandle=0;glazing[0].material.addEventListener('dispose',()=>disposedGlass++);handles[0].material.addEventListener('dispose',()=>disposedHandle++);
current.update({x:2000,z:2000});assert.equal(current.snapshot().residentFrontages.length,0);assert.equal(disposedGeometries,nearMeshes.length);assert.equal(disposedGlass,0);assert.equal(disposedHandle,0);current.dispose();assert.equal(disposedGlass,1);assert.equal(disposedHandle,1);assert.equal(current.root.children.length,0);assert.equal(current.root.parent,null);older.dispose();
const receipt={scope:'CPU only on six finite synthetic shell fixtures; full actual-world regression is separately recorded',baseline:{drawCalls:baseline.drawCalls,triangles:baseline.triangles},candidate:{drawCalls:candidate.drawCalls,triangles:candidate.triangles},limits:HARBOR_ART_LIMITS,collidersUnchanged:true,fixturesUnchanged:true,publicFrontagesUnchanged:true,glazingMaterials:glazing.length,handleMaterials:handles.length,transparentGlazingSurvivesOwnAndGlobalHighQualitySwitch:true,nearGeometryDisposals:disposedGeometries,loadedNearMeshes:nearMeshes.length,dedicatedGlassFinalMaterialDisposals:disposedGlass,dedicatedHandleFinalMaterialDisposals:disposedHandle,rootDetachedAndEmpty:true};
writeFileSync('material-budget-dispose-proof.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
