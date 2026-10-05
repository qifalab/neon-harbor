import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from '../vendor/three/three.module.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { createResidentAssetLibrary, createNearResident } from '../src/resident-core-assets.js';
import { createCitizenCharacter } from '../src/citizen-appearance.js';
const source = new URL('../art-source/near-resident/editable/',import.meta.url);
const gltf = JSON.parse(await readFile(new URL('worker.gltf',source),'utf8'));
const binary = await readFile(new URL('worker.bin',source));
const flush=async()=>{await new Promise(ok=>setImmediate(ok));await new Promise(ok=>setImmediate(ok));};
async function template() {
  const data=structuredClone(gltf);data.images=[];data.textures=[];
  for(const material of data.materials){delete material.pbrMetallicRoughness.baseColorTexture;delete material.pbrMetallicRoughness.metallicRoughnessTexture;delete material.normalTexture;delete material.occlusionTexture;}
  data.buffers=[{uri:`data:application/octet-stream;base64,${binary.toString('base64')}`,byteLength:binary.length}];
  globalThis.ProgressEvent ||= class ProgressEvent{constructor(type,options){this.type=type;Object.assign(this,options);}};
  const parsed=await new GLTFLoader().parseAsync(JSON.stringify(data),'');
  const bitmap={width:1024,height:2048,closed:0,close(){this.closed++;}}, textures=[new THREE.Texture(bitmap),new THREE.Texture(bitmap)];
  let index=0;parsed.scene.traverse(mesh=>{if(mesh.isMesh){mesh.material.map=textures[index++%2];mesh.material.normalMap=textures[0];}});
  return {parsed,bitmap,textures};
}
const libraryReview=library=>library.snapshot({includeReview:true}).review;

test('owner probe counts actual shared template references and closes one bitmap only after final instance + unpaused cooldown',async()=>{
  const loads=[];const library=createResidentAssetLibrary(THREE,{loadGLTF:async()=>{const t=await template();loads.push(t);return t.parsed;},residencyCooldown:12});
  await library.ensureLoaded('worker');const first=library.acquire('worker'),second=library.acquire('worker');
  let review=libraryReview(library);assert.equal(review.templateOwners.geometries,4);assert.equal(review.templateOwners.materials,4);
  assert.equal(review.templateOwners.textures,2);assert.equal(review.templateOwners.images,1);assert.equal(review.templateOwners.imageBitmaps,1);
  assert.equal(review.instanceOwners.skeletons,2);assert.equal(review.instanceOwners.bones,142);assert.equal(review.instanceOwners.boneTextures,0);
  library.release(first);library.updateResidency(60);assert.equal(loads[0].bitmap.closed,0);assert.equal(library.snapshot().roles.worker.loaded,true);
  library.release(second);library.updateResidency(0);assert.equal(library.snapshot().roles.worker.loaded,true,'paused dt cannot evict');
  library.updateResidency(11.9);assert.equal(loads[0].bitmap.closed,0);library.updateResidency(.2);
  review=libraryReview(library);assert.equal(loads[0].bitmap.closed,1);assert.equal(review.templateOwners.imageBitmaps,0);
  assert.equal(review.disposeCalls.imageBitmapCloseCalls,1);assert.equal(review.disposeCalls.textures,2);assert.equal(review.disposeCalls.instanceSkeletons,2);
  await library.ensureLoaded('worker');assert.equal(library.snapshot().roles.worker.requests,2);assert.equal(libraryReview(library).templateOwners.imageBitmaps,1);
  library.setQuality('low');assert.equal(loads[1].bitmap.closed,1);assert.equal(libraryReview(library).templateOwners.geometries,0);
  library.dispose();library.dispose();assert.equal(libraryReview(library).disposeCalls.imageBitmapCloseCalls,2,'repeat dispose does not close twice');
});

test('actual original North book phone cup and explicit cargo report same objects at real hands; probe is read-only through near/far/Low',async()=>{
  const loaded=await template();const library=createResidentAssetLibrary(THREE,{loadGLTF:async()=>loaded.parsed});
  const actor=createCitizenCharacter(THREE,'courier',{characterFactory:(T,options)=>createNearResident(T,{...options,role:'worker',assetLibrary:library,allowHeadlessAssetLoad:true,presentationId:'test-north'})});
  actor.userData.setCitizen({height:1,build:1,prop:'book',glasses:false,hat:false});actor.userData.residentId='resident-real-current-id';
  const scene=new THREE.Scene();scene.add(actor);await library.ensureLoaded('worker');await flush();actor.userData.setDetail(0);await flush();
  const ids={};
  for(const [state,name] of [['reading','book'],['waiting-transit','phone'],['refreshments','cup']]){
    actor.userData.updateCitizenProps(state,2);actor.userData.setDetail(0);scene.updateMatrixWorld(true);
    const before={matrix:[...actor.matrixWorld.elements],position:actor.position.toArray(),rotation:actor.rotation.toArray()};
    const snapshot=actor.userData.residentCoreReview();assert.deepEqual({matrix:[...actor.matrixWorld.elements],position:actor.position.toArray(),rotation:actor.rotation.toArray()},before,'probe must not update transform matrices');
    const visible=snapshot.props.filter(prop=>prop.name===`Citizen ${name}`&&prop.effectivelyVisible);assert.equal(visible.length,1);
    assert.equal(visible[0].hand,'left');assert.equal(snapshot.legacyLODVisible,false);assert.equal(snapshot.coreVisible,true);
    assert.equal(snapshot.props.some(prop=>prop.name==='Citizen occupational accessories'),false);
    ids[name]=visible[0].uuid;assert.ok(Math.hypot(visible[0].position.x-snapshot.hands.left.anchor.x,visible[0].position.y-snapshot.hands.left.anchor.y,visible[0].position.z-snapshot.hands.left.anchor.z)<.3);
    actor.userData.setDetail(1);scene.updateMatrixWorld(true);const far=actor.userData.residentCoreReview();assert.equal(far.coreVisible,false);assert.equal(far.legacyLODVisible,true);
    assert.equal(far.props.filter(prop=>prop.name===`Citizen ${name}`&&prop.effectivelyVisible).length,1);
    actor.userData.setDetail(0);await flush();scene.updateMatrixWorld(true);
    assert.equal(actor.userData.residentCoreReview().props.find(prop=>prop.name===`Citizen ${name}`&&prop.effectivelyVisible).uuid,ids[name]);
  }
  const cargo=new THREE.Group();cargo.name='Actual delivery cargo';cargo.position.set(0,.95,.43);actor.add(cargo);actor.userData.bindResidentHandProp(cargo,{side:'left',position:[0,-.15,.09]});
  scene.updateMatrixWorld(true);let review=actor.userData.residentCoreReview();let item=review.props.find(p=>p.uuid===cargo.uuid);
  assert.equal(item.source,'explicit-original-cargo');assert.equal(item.hand,'left');assert.equal(item.effectivelyVisible,true);
  assert.equal(libraryReview(library).actors[0].id,'resident-real-current-id');assert.ok(!('library' in libraryReview(library).actors[0]),'read-only review must not recursively embed shared library');
  library.setQuality('low');actor.userData.setPresentation({quality:'low'});scene.updateMatrixWorld(true);review=actor.userData.residentCoreReview();
  item=review.props.find(p=>p.uuid===cargo.uuid);assert.equal(item.hand,null);assert.equal(cargo.parent,actor);assert.deepEqual(cargo.position.toArray(),[0,.95,.43]);assert.equal(review.coreVisible,false);
  assert.equal(libraryReview(library).templateOwners.imageBitmaps,0);assert.equal(loaded.bitmap.closed,1);actor.userData.disposeInstance();library.dispose();
});

test('late GLB completion after Low is actually closed and cannot refill owners or resurrect actors',async()=>{
  let complete;const pending=new Promise(ok=>{complete=ok;});const library=createResidentAssetLibrary(THREE,{loadGLTF:()=>pending});
  const actor=createNearResident(THREE,{style:'courier',role:'worker',assetLibrary:library,allowHeadlessAssetLoad:true,presentationId:'late'});
  const scene=new THREE.Scene();scene.add(actor);actor.userData.setDetail(0);const awaited=library.ensureLoaded('worker');
  library.setQuality('low');actor.userData.setPresentation({quality:'low'});actor.userData.disposeInstance();
  const loaded=await template();complete(loaded.parsed);await assert.rejects(awaited,/superseded/);await flush();
  const state=library.snapshot({includeReview:true});assert.equal(state.instances,0);assert.equal(state.review.templateOwners.imageBitmaps,0);
  assert.equal(loaded.bitmap.closed,1);assert.equal(state.review.disposeCalls.imageBitmapCloseCalls,1);assert.equal(state.review.actors.length,0);
  library.dispose();assert.equal(loaded.bitmap.closed,1);
});
