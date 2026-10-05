import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createMetropolisWorld } from '../src/metropolis-world.js';
import { createWesternMountainBatch, WESTERN_RIDGE_RECIPE } from '../src/metropolis-western-ridge.js';

function setup() {
  const world = createMetropolisWorld(THREE, new THREE.Scene(), { streaming: true, quality: 'high' });
  let mountain;
  world.root.traverse(mesh => { if (mesh.userData.westernRidge) mountain = mesh; });
  assert.ok(mountain); return { world, mountain };
}

function hillBounds(positions, range) {
  const bounds = new THREE.Box3(), p = new THREE.Vector3();
  for (let i = range.firstVertex; i < range.firstVertex + range.vertices; i++) bounds.expandByPoint(p.fromBufferAttribute(positions, i));
  return bounds;
}

test('west mountains form one bounded connected ridge within the original union envelope', () => {
 const {world,mountain}=setup();
 try {
  const g=mountain.geometry,p=g.attributes.position,n=g.attributes.normal,r=WESTERN_RIDGE_RECIPE,m=mountain.userData.westernRidge;
  assert.equal(mountain.isInstancedMesh,undefined);assert.ok(!Array.isArray(mountain.material));assert.ok(mountain.userData.buildings.every(id=>id===null));
  assert.equal(m.coherentSurface,true);assert.equal(m.hillRanges.length,1);assert.deepEqual(m.westernRange.sourceHills,[0,1,2,3,4,5,6,7,8,9]);
  assert.deepEqual(g.boundingBox.min.toArray(),[r.minX,r.minY,r.minZ]);assert.deepEqual(g.boundingBox.max.toArray(),[r.maxX,r.maxY,r.maxZ]);
  assert.equal(m.preparedBytes,g.index.array.byteLength+Object.values(g.attributes).reduce((sum,a)=>sum+a.array.byteLength,0));assert.ok(m.producerTypedArrayBytes<=r.maxPreparedBytes);assert.ok(m.westernTriangles<=r.maxWesternTriangles);
  const rows=[13,49,95].map(row=>Array.from({length:r.xSegments+1},(_,i)=>p.getY(row*(r.xSegments+1)+i)));
  assert.ok(rows.every(h=>Math.max(...h)-Math.min(...h)>50));assert.notDeepEqual(rows[0],rows[1]);assert.notDeepEqual(rows[1],rows[2]);
  const edges=new Map();
  for(let i=0;i<g.index.count;i+=3){const ids=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)],a=new THREE.Vector3().fromBufferAttribute(p,ids[0]),b=new THREE.Vector3().fromBufferAttribute(p,ids[1]),c=new THREE.Vector3().fromBufferAttribute(p,ids[2]),cross=b.sub(a).cross(c.sub(a));assert.ok(cross.lengthSq()>1e-12,'every top/skirt/bottom triangle has real area');if(i<r.xSegments*r.zSegments*6)assert.ok(cross.y>0);for(let e=0;e<3;e++){const x=ids[e],y=ids[(e+1)%3],key=Math.min(x,y)+':'+Math.max(x,y);edges.set(key,(edges.get(key)||0)+1);}}
  assert.ok([...edges.values()].every(count=>count===2),'surface, closed skirt and bottom have exactly two incident faces per edge');
  for(let j=1;j<r.zSegments;j++)for(let i=1;i<r.xSegments;i++){const k=j*(r.xSegments+1)+i;assert.ok(n.getY(k)>0);assert.ok(Math.abs(Math.hypot(n.getX(k),n.getY(k),n.getZ(k))-1)<1e-6);}
  for(const a of Object.values(g.attributes))assert.ok(a.array.every(Number.isFinite));assert.ok(g.index.array.every(i=>i<p.count));
 }finally{world.dispose();}
});

test('northern backdrop replaces twelve cones with a bounded continuous surface and separate standard material', () => {
 const {world,mountain}=setup();let north;world.root.traverse(m=>{if(m.userData.northernRidge)north=m;});
 try {
  assert.ok(north);assert.equal(mountain.userData.westernRidge.retainedNorthernHills,0);assert.equal(mountain.userData.westernRidge.hillRanges.length,1);
  assert.equal(north.userData.northernRidge.sourceNorthernCones,12);assert.equal(north.userData.northernRidge.decorativeOnly,true);assert.equal(north.material.isMeshStandardMaterial,true);
  assert.ok(north.material.normalMap.isDataTexture);assert.ok(north.material.roughnessMap.isDataTexture);assert.equal(north.material.metalness,0);assert.equal(north.material.roughness,1);
  const b=north.geometry.boundingBox;assert.deepEqual(b.min.toArray(),[-912,-57,-1673]);assert.deepEqual(b.max.toArray(),[914,173,-1342]);
  assert.ok(north.geometry.index.count/3>=15000&&north.geometry.index.count/3<=18000);assert.notEqual(north.material,mountain.material);
  for(const a of Object.values(north.geometry.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));
  const normals=north.geometry.attributes.normal,position=north.geometry.attributes.position;assert.equal(normals.count,position.count);
  const heights=Array.from(position.array).filter((_,i)=>i%3===1);assert.ok(new Set(heights.map(v=>Math.round(v))).size>120,'backdrop must have varied shoulder and gully elevations');
 } finally{world.dispose();}
});

test('western connected ridge has slope, soil and rock bands with the existing mineral response', () => {
  const { world, mountain } = setup();
  try {
    const colors = mountain.geometry.getAttribute('color'), surface = mountain.geometry.getAttribute('mountainSurface');
    const cutoff = colors.count;
    const roughnesses = Array.from({ length: cutoff }, (_, i) => surface.getX(i));
    assert.ok(Math.max(...roughnesses) - Math.min(...roughnesses) > .06);
    for (let i = 0; i < cutoff; i++) { assert.equal(surface.getY(i), 1); assert.ok(surface.getX(i) >= .85 && surface.getX(i) <= .99); }
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    mountain.material.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('attribute vec2 mountainSurface;'));
    assert.ok(shader.fragmentShader.includes('roughnessFactor = vMountainSurface.x;'));
    assert.ok(shader.fragmentShader.includes('roughnessFactor = clamp(roughnessFactor + vMountainSurface.y *'));
    assert.ok(shader.fragmentShader.includes('diffuseColor.rgb *= 1.0 + vMountainSurface.y *'));
    assert.ok(shader.fragmentShader.includes('float nhRelief = vMountainSurface.y * nhDetail *'));
    assert.ok(shader.fragmentShader.includes('nhSurfaceBand'));
    assert.equal(mountain.material.map, null);
  } finally { world.dispose(); }
});

test('permanent mountain ownership survives interior/quality switches and disposes geometry/material once', () => {
  const { world, mountain } = setup();
  let geometries = 0, materials = 0;
  mountain.geometry.addEventListener('dispose', () => geometries++); mountain.material.addEventListener('dispose', () => materials++);
  world.setInteriorBuilding(world.buildings[0].id); assert.equal(mountain.visible, true);
  world.setInteriorBuilding(null); assert.equal(mountain.visible, true);
  world.setQuality('low'); assert.equal(mountain.castShadow, false); assert.equal(mountain.visible, true);
  world.setQuality('high'); assert.equal(mountain.castShadow, true); assert.equal(mountain.receiveShadow, true);
  world.dispose(); assert.equal(geometries, 1); assert.equal(materials, 1);
});

test('changed source batches are rejected rather than rewriting another cone or terrain family', () => {
  const { world, mountain } = setup(), cone = new THREE.ConeGeometry(1, 1, 12);
  try {
    const good = { kind: 'cone', material: 'leaves', transforms: mountain.userData.originalTransforms, buildings: mountain.userData.buildings };
    const changed = structuredClone(good); changed.transforms[0][0] += 1;
    assert.throws(() => createWesternMountainBatch(THREE, changed, cone, mountain.material), /source transform changed/);
    assert.throws(() => createWesternMountainBatch(THREE, { ...good, material: 'brass' }, cone, mountain.material), /original permanent/);
    assert.throws(() => createWesternMountainBatch(THREE, { ...good, buildings: ['building', ...good.buildings.slice(1)] }, cone, mountain.material), /original permanent/);
    assert.throws(() => createWesternMountainBatch(THREE, { ...good, transforms: good.transforms.slice(0, 10) }, cone, mountain.material), /original permanent/);
  } finally { cone.dispose(); world.dispose(); }
});
