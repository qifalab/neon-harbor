import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {createCraftVesselGeometry} from '../src/harbor-frontage-profiles.js';
import {createCraftCeramicOwner} from '../src/harbor-ceramic-art.js';

test('thrown ceramics preserve the old window envelope and expose a real cavity above a closed foot',()=>{
 for(const[r,h,extent]of[[.096,.29,.0953618660569191],[.16,.43,.15893644094467163]]){
  const g=createCraftVesselGeometry(THREE,r,h),p=g.attributes.position;
  assert.deepEqual(g.boundingBox.min.toArray(),[-extent,0,-extent]);
  assert.deepEqual(g.boundingBox.max.toArray(),[extent,Math.fround(h),extent]);
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<g.index.count;i+=3){a.fromBufferAttribute(p,g.index.getX(i));b.fromBufferAttribute(p,g.index.getX(i+1));c.fromBufferAttribute(p,g.index.getX(i+2));assert.ok(b.sub(a).cross(c.sub(a)).lengthSq()>1e-20,'zero-area vessel triangle');}
  const material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(g,material);
  mesh.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new THREE.Vector3(r*.08,h+.1,r*.06),new THREE.Vector3(0,-1,0));
  const hit=ray.intersectObject(mesh)[0];assert.ok(hit,'cavity has no closed inner bottom');assert.ok(Math.abs(hit.point.y-h*.035)<1e-6,'the mouth has been capped over the cavity');
  g.dispose();material.dispose();
 }
});

test('UV seams keep continuous ceramic normals and all submitted normals are usable',()=>{
 const g=createCraftVesselGeometry(THREE,.16,.43),n=g.attributes.normal,rows=g.parameters.points.length,last=32*rows;
 for(let j=0;j<rows;j++)assert.deepEqual([n.getX(j),n.getY(j),n.getZ(j)],[n.getX(last+j),n.getY(last+j),n.getZ(last+j)]);
 for(const index of new Set(g.index.array)){const length=Math.hypot(n.getX(index),n.getY(index),n.getZ(index));assert.ok(Number.isFinite(length)&&Math.abs(length-1)<1e-5,'invalid submitted normal');}
 g.dispose();
});

test('resident ceramic pigment and physical maps separate glazed clay and release once',()=>{
 const owner=createCraftCeramicOwner(THREE),textures=Object.values(owner.maps).flatMap(s=>Object.values(s).filter(t=>t?.isTexture));
 assert.equal(textures.length,6);
 for(const kind of['glaze','clay']){const m=owner[kind],maps=owner.maps[kind];assert.equal(m.metalness,0);assert.equal(m.roughness,1);assert.equal(m.color.getHex(),0xffffff);assert.equal(maps.map.colorSpace,THREE.SRGBColorSpace);for(const name of['bumpMap','roughnessMap'])assert.equal(maps[name].colorSpace,THREE.NoColorSpace);}
 const range=t=>{const values=[];for(let i=1;i<t.image.data.length;i+=4)values.push(t.image.data[i]/255);return[Math.min(...values),Math.max(...values)];};
 assert.ok(range(owner.maps.glaze.roughnessMap)[1]<range(owner.maps.clay.roughnessMap)[0],'roughness does not separate fired glaze from porous clay');
 assert.ok(range(owner.maps.glaze.roughnessMap)[1]-range(owner.maps.glaze.roughnessMap)[0]>.05,'glaze roughness is uniform');
 let textureDisposals=0,materialDisposals=0;for(const t of textures)t.addEventListener('dispose',()=>textureDisposals++);for(const m of[owner.glaze,owner.clay])m.addEventListener('dispose',()=>materialDisposals++);
 owner.dispose();owner.dispose();assert.equal(textureDisposals,6);assert.equal(materialDisposals,2);
});
