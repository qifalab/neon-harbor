import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readFileSync} from 'node:fs';
import {readFile as readBytes} from 'node:fs/promises';
import * as THREE from '../vendor/three/three.module.js';
import {expansionBuilding} from '../src/expansion-programmes.js';
import {createInteriorSystem} from '../src/metropolis-interiors.js';
import {parseWorkshopAssetCPU} from '../tools/inspect-workshop-assets.mjs';

// One historical south-079 record. No createWorld, global city, renderer,
// browser, image decoder or actual GPU counters are constructed/read.
const captured=JSON.parse(readFileSync(new URL('../docs/qa/authored-home/source-building.json',import.meta.url),'utf8'));
const building=()=>expansionBuilding(JSON.parse(JSON.stringify(captured)),'south',78);
async function readySystem(readRendererMemory,attachCounters=()=>{}){
 const home=building(),system=createInteriorSystem(THREE,new THREE.Scene(),{buildings:[home],readRendererMemory,
  homeAssetLoader:async id=>{const asset=await parseWorkshopAssetCPU(await readBytes(new URL(`../assets/harbor/home/${id}.glb`,import.meta.url)));attachCounters(asset);return asset;}});
 system.enter(home.id);system.update(1/60,{x:128.08378674783745,z:107.77537614060566,groundY:home.floors[0].y});
 let owner;system.root.traverse(object=>{if(object.userData.homeAssets?.plan?.placements.length===3)owner=object.userData.homeAssets;});
 assert.ok(owner,'Actual integrated lobby floor owns the real three-model home');await owner.whenSettled();
 assert.equal(owner.snapshot().status,'ready');assert.equal(owner.snapshot().assetCount,3);return{system,owner};
}
test('home system snapshot cannot rewrite its saved before/after/difference audit counters',async()=>{
 // This adapter emulates synchronous Three dispose callbacks only. It is
 // deliberately not evidence of native uploads, decode or VRAM release.
 const memory={geometries:99,textures:101};let reads=0;
 const attach=asset=>{const geometries=new Set(),textures=new Set();asset.scene.traverse(object=>{
  if(object.geometry)geometries.add(object.geometry);
  for(const material of object.material?Array.isArray(object.material)?object.material:[object.material]:[])
   for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
 });memory.geometries+=geometries.size;memory.textures+=textures.size;
 for(const geometry of geometries)geometry.addEventListener('dispose',()=>memory.geometries--);
 for(const texture of textures)texture.addEventListener('dispose',()=>memory.textures--);
 };
 const {system,owner}=await readySystem(()=>{reads++;return memory;},attach);
 for(let i=0;i<10;i++)system.snapshot();assert.equal(reads,0,'Snapshots do not read counters on the hot path');
 system.exit();assert.equal(owner.snapshot().assetCount,0);assert.equal(reads,6);assert.deepEqual(memory,{geometries:99,textures:101});
 const before=system.snapshot().homeAssetEvents.filter(e=>e.kind==='asset-released');assert.equal(before.length,3);
 assert.ok(before.every(e=>e.rendererRelease.available));
 assert.deepEqual(before.map(e=>e.rendererRelease.difference),[{geometries:2,textures:6},{geometries:1,textures:3},{geometries:14,textures:7}]);
 const expected=JSON.parse(JSON.stringify(before));
 for(const event of before){event.rendererRelease.before.geometries=-11;event.rendererRelease.before.textures=-12;
  event.rendererRelease.after.geometries=-21;event.rendererRelease.after.textures=-22;
  event.rendererRelease.difference.geometries=-31;event.rendererRelease.difference.textures=-32;
  event.rendererRelease.readErrors.push({stage:'caller',message:'mutation'});event.resourceRelease.geometries=-41;}
 assert.deepEqual(system.snapshot().homeAssetEvents.filter(e=>e.kind==='asset-released'),expected,'Caller mutation must not replace original audit evidence');
 assert.equal(reads,6);system.dispose();
});
test('home unavailable diagnostic counters stay null and readErrors snapshots stay independent',async()=>{
 let reads=0;const {system,owner}=await readySystem(()=>{reads++;throw new Error('Expected home diagnostic reader failure');});
 system.exit();assert.equal(owner.snapshot().assetCount,0);assert.equal(reads,6);
 const releases=system.snapshot().homeAssetEvents.filter(e=>e.kind==='asset-released');assert.equal(releases.length,3);
 for(const event of releases){const r=event.rendererRelease;assert.equal(r.available,false);assert.equal(r.before,null);assert.equal(r.after,null);assert.equal(r.difference,null);
  assert.deepEqual(r.readErrors,[{stage:'before',message:'Expected home diagnostic reader failure'},{stage:'after',message:'Expected home diagnostic reader failure'}]);r.readErrors[0].message='caller rewrite';}
 assert.ok(system.snapshot().homeAssetEvents.filter(e=>e.kind==='asset-released').every(e=>e.rendererRelease.readErrors[0].message==='Expected home diagnostic reader failure'));
 assert.equal(reads,6);system.dispose();
});
