import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { METROPOLIS_BUILDINGS } from '../src/metropolis-catalog.js';
import { createHarborStreetLighting, streetNightFactor } from '../src/harbor-street-lighting.js';
import { createCityExploration } from '../src/city-exploration.js';
import { GameSimulation } from '../src/simulation.js';
import { SOUTH_QUAY_FIXTURES } from '../src/harbor-south-quay-fixtures.js';

test('a capped real-light pool selects physical sources at both original quay poses, fades at dawn/dusk, and disables indoors', () => {
  const scene = new THREE.Scene(), resident = new Set(['north-0-0']);
  const lighting = createHarborStreetLighting(THREE, scene, { buildings: METROPOLIS_BUILDINGS, isResident: id => resident.has(id) });
  const count = () => { let n = 0; scene.traverse(node => { if (node.isPointLight) n++; }); return n; };
  const shaderVisible = () => { let n = 0; scene.traverse(node => { if (node.isPointLight && node.visible) n++; }); return n; };
  assert.equal(shaderVisible(), 0);
  const first = { x: -568.28, y: 1.62, z: -438.2 }, second = { x: -600, y: 1.62, z: -440.8 };
  assert.equal(lighting.sources.filter(source => source.chunkId?.startsWith('north-')).length, 100, 'all original North sources remain');
  assert.equal(lighting.sources.length, 102); assert.equal(count(), 4);
  lighting.update(first, first, 21); let state = lighting.snapshot();
  assert.ok(state.slots.some(s => s.sourceId?.startsWith('tide-museum-canopy-') && s.intensity > 0));
  const identities = lighting.root.children.filter(n => n.isPointLight).map(n => n.uuid);
  lighting.update(second, second, 21); state = lighting.snapshot();
  assert.ok(state.slots.some(s => s.sourceId === 'tide-museum-tree-downlight--1' && s.intensity > 0));
  for (const slot of state.slots.filter(s => s.sourceId)) {
    const source = lighting.sources.find(s => s.id === slot.sourceId);
    assert.deepEqual([slot.x, slot.y, slot.z], [source.x, source.y, source.z]);
    assert.equal(slot.castShadow, false); assert.ok(slot.range <= 24);
  }
  assert.deepEqual(lighting.root.children.filter(n => n.isPointLight).map(n => n.uuid), identities);
  lighting.update(second, second, 18.4); const dusk = lighting.snapshot().slots.find(s => s.sourceId === 'tide-museum-tree-downlight--1').intensity;
  lighting.update(second, second, 21); assert.ok(dusk > 0 && dusk < lighting.snapshot().slots.find(s => s.sourceId === 'tide-museum-tree-downlight--1').intensity);
  assert.ok(streetNightFactor(6.2) > streetNightFactor(6.8));
  for (const [value, expected] of [['balanced', 2], ['low', 0], ['high', 4]]) {
    lighting.setQuality(value); lighting.update(second, second, 21);
    assert.equal(count(), expected); assert.equal(shaderVisible(), expected); assert.equal(lighting.snapshot().activeLights <= expected, true);
  }
  lighting.update(second, second, 12); assert.equal(lighting.snapshot().activeLights, 0); assert.equal(count(), 4); assert.equal(shaderVisible(), 0);
  lighting.update(second, second, 21, 1 / 60, false); assert.equal(lighting.snapshot().activeLights, 0); assert.equal(shaderVisible(), 0); assert.equal(count(), 4);
  resident.clear(); lighting.update(second, second, 21); assert.equal(lighting.snapshot().activeLights, 0);
  assert.equal(lighting.snapshot().fixtureDrawCalls, 0); assert.equal(shaderVisible(), 4, 'night keeps the fixed cap even when no source is assigned'); lighting.dispose(); assert.equal(shaderVisible(), 0);
});

test('the two modeled tree brackets add bounded above-head geometry and release owned resources exactly once', () => {
  const scene = new THREE.Scene(), lighting = createHarborStreetLighting(THREE, scene, { buildings: METROPOLIS_BUILDINGS, isResident: () => true });
  const meshParts = [], resources = new Set();
  lighting.root.traverse(node => { if (node.isInstancedMesh) { meshParts.push(node); resources.add(node); resources.add(node.geometry); resources.add(node.material); } });
  assert.equal(meshParts.length, 2); assert.equal(new Set(meshParts.map(m => m.material)).size, 2);
  assert.equal(meshParts.reduce((n, m) => n + m.count * m.geometry.index.count / 3, 0), 120);
  const matrix = new THREE.Matrix4(), vertex = new THREE.Vector3();
  for (const mesh of meshParts) for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, matrix);
    for (let p = 0; p < mesh.geometry.attributes.position.count; p++) {
      vertex.fromBufferAttribute(mesh.geometry.attributes.position, p).applyMatrix4(matrix);
      assert.ok(vertex.y > 3.15, 'no new ground pole or body-height obstacle');
    }
  }
  const released = new Map(); for (const resource of resources) resource.addEventListener('dispose', () => released.set(resource, (released.get(resource) || 0) + 1));
  lighting.dispose(); lighting.dispose(); assert.equal(lighting.root.parent, null);
  assert.equal(released.size, resources.size); assert.ok([...released.values()].every(count => count === 1));
  lighting.update({ x: -600, z: -440.8 }, null, 21); lighting.setQuality('high'); assert.equal(lighting.snapshot().activeLights, 0);
});

test('city propagation reads clock/view/quality and outdoor context without changing the public player state', () => {
  const city = createCityExploration(THREE, new THREE.Scene(), { streaming: false });
  const sim = new GameSimulation({ colliders: city.colliders, bounds: city.bounds, groundHeightAt: city.groundHeightAt }); city.bind(sim);
  const playerBefore = JSON.stringify(sim.player), colliders = sim.colliders, view = { position: { x: -600, y: 0, z: -440.8 }, viewerPosition: { x: -600, y: 1.62, z: -440.8 }, velocity: { x: 0, z: 0 } };
  city.update(0, 21 / 24, view); assert.ok(city.north.streetLightingStats.activeLights > 0);
  assert.equal(JSON.stringify(sim.player), playerBefore); assert.equal(sim.colliders, colliders);
  city.setQuality('low'); city.update(0, 21 / 24, view); assert.equal(city.north.streetLightingStats.residentLightObjects, 0);
  city.setQuality('high'); sim.inCar = true; city.update(0, 21 / 24, view); assert.equal(city.north.streetLightingStats.activeLights, 0); assert.ok(city.north.streetLightingStats.slots.every(s => !s.visible));
  sim.inCar = false; city.interiors.state.buildingId = 'tide-museum'; city.update(0, 21 / 24, view); assert.equal(city.north.streetLightingStats.activeLights, 0); assert.ok(city.north.streetLightingStats.slots.every(s => !s.visible));
  city.interiors.state.buildingId = null; city.north.dispose();
});

test('the original South night quay position selects two fixed physical sources without any resident North chunk', () => {
  const scene = new THREE.Scene(), queriedChunks = [];
  const lighting = createHarborStreetLighting(THREE, scene, { buildings: METROPOLIS_BUILDINGS,
    isResident: id => { queriedChunks.push(id); return false; } });
  // Actual original public South panorama pose; its old 100 North sources
  // were all more than 260m away, leaving all four existing slots idle.
  const body = { x: 240.02666666666585, y: 0, z: -280 }, eye = { ...body, y: 1.62 }, originalBody = JSON.stringify(body);
  const originalPool = lighting.root.children.filter(node => node.isPointLight).map(node => node.uuid);
  lighting.update(body, eye, 21);
  const state = lighting.snapshot(), selected = state.slots.filter(slot => slot.intensity > .001);
  assert.equal(state.sourceCount, 102); assert.equal(state.activeLights, 2); assert.equal(state.residentLightObjects, 4);
  assert.deepEqual(selected.map(slot => slot.sourceId).sort(), ['south-ferry-signpost-light', 'south-quay-wall-light']);
  assert.ok(queriedChunks.every(id => typeof id === 'string' && id.startsWith('north-')), 'South never pretends to be a resident North chunk');
  assert.equal(state.southQuayOwner.resident, true); assert.ok(state.fixtureDrawCalls <= 2); assert.ok(state.fixtureTriangles <= 120);
  for (const slot of selected) {
    const source = lighting.sources.find(item => item.id === slot.sourceId);
    assert.deepEqual([slot.x, slot.y, slot.z], [source.x, source.y, source.z]);
    assert.ok(slot.range <= 24 && slot.intensity <= 240); assert.equal(slot.castShadow, false);
  }
  const wall = selected.find(slot => slot.sourceId === 'south-quay-wall-light');
  assert.ok(Math.hypot(wall.x - body.x, wall.y - body.y, wall.z - body.z) < wall.range, 'walking surface lies inside actual light range');
  const ferry = selected.find(slot => slot.sourceId === 'south-ferry-signpost-light');
  assert.ok(Math.hypot(ferry.x - 220, ferry.y - 1.3, ferry.z + 304) < ferry.range, 'real South boarding point lies inside actual light range');
  lighting.setQuality('balanced'); lighting.update(body, eye, 21); assert.equal(lighting.snapshot().activeLights, 2);
  assert.equal(lighting.snapshot().residentLightObjects, 2);
  lighting.setQuality('high'); lighting.update(body, eye, 12);
  assert.equal(lighting.snapshot().activeLights, 0); assert.equal(lighting.snapshot().southQuayOwner.resident, true, 'daytime retains physical fixtures');
  assert.deepEqual(lighting.root.children.filter(node => node.isPointLight).map(node => node.uuid).sort(), [...originalPool].sort());
  assert.equal(JSON.stringify(body), originalBody, 'rendering never changes public player position'); lighting.dispose();
});

test('South fixtures release on Low, indoor context and leaving; reentry owns fresh resources without deleting North resources or the light pool', () => {
  const scene = new THREE.Scene(), lighting = createHarborStreetLighting(THREE, scene, { buildings: METROPOLIS_BUILDINGS, isResident: () => false });
  const body = { x: 240, y: 0, z: -280 }, eye = { ...body, y: 1.62 };
  const pool = lighting.root.children.filter(node => node.isPointLight).map(node => node.uuid), north = new Map(), south = new Map();
  function observe(resource, map) {
    if (map.has(resource)) return;
    map.set(resource, 0); resource.addEventListener('dispose', () => map.set(resource, map.get(resource) + 1));
  }
  lighting.root.traverse(node => { if (node.isMesh) { observe(node.geometry, north); observe(node.material, north); } });
  function enter() {
    lighting.update(body, eye, 21);
    assert.equal(lighting.snapshot().activeLights, 2);
    lighting.root.traverse(node => {
      if (node.isMesh && node.userData.ownerId === 'south-quay-attached-fixtures') { observe(node.geometry, south); observe(node.material, south); }
    });
    const state = lighting.snapshot();
    assert.equal(state.residentPointLightObjects, 3); assert.equal(state.residentSpotLightObjects, 1);
    assert.equal(state.residentLightObjects, 4);
    assert.ok(lighting.root.children.filter(node => node.isPointLight).every(node => pool.includes(node.uuid)));
  }
  function released() {
    const state = lighting.snapshot(); assert.equal(state.southQuayOwner.resident, false); assert.equal(state.activeLights, 0);
    assert.ok([...south.values()].every(count => count === 1)); assert.ok([...north.values()].every(count => count === 0));
  }
  enter(); lighting.update(body, eye, 21); assert.equal(south.size, 4, 'resident frame updates allocate no duplicate geometry/materials');
  lighting.setQuality('low'); lighting.update(body, eye, 21); released(); assert.equal(lighting.snapshot().residentLightObjects, 0);
  lighting.setQuality('high'); enter(); lighting.update(body, eye, 21, 0, false); released();
  enter(); lighting.update({ x: 500, y: 0, z: -280 }, { x: 500, y: 1.62, z: -280 }, 21); released();
  enter(); assert.equal(south.size, 16); assert.equal(lighting.snapshot().southQuayOwner.generations, 4);
  lighting.dispose(); lighting.dispose();
  assert.ok([...south.values()].every(count => count === 1)); assert.ok([...north.values()].every(count => count === 1));
  assert.equal(lighting.snapshot().southQuayOwner.disposedGenerations, 4); assert.equal(lighting.snapshot().residentLightObjects, 0);
  assert.equal(scene.children.length, 0);
});


// Three's actual shader uses the inverse-square / distance cutoff and smooth
// cone attenuation below. This is a physical receiving-surface constraint, not
// a prediction that the photographed wall / pavement has passed art review.
function incidentLux(source, position, normal) {
  const toPoint = new THREE.Vector3(position.x-source.x, position.y-source.y, position.z-source.z);
  const distance = toPoint.length(); if (distance === 0) return 0;
  toPoint.divideScalar(distance);
  const axis = new THREE.Vector3(source.distribution.target.x-source.x, source.distribution.target.y-source.y,
    source.distribution.target.z-source.z).normalize();
  const cosine = axis.dot(toPoint), outer = Math.cos(source.distribution.angle),
    inner = Math.cos(source.distribution.angle * (1-source.distribution.penumbra));
  const t = Math.min(1, Math.max(0, (cosine-outer)/(inner-outer))), cone = t*t*(3-2*t);
  const cutoff = Math.max(0, 1-(distance/source.range)**4)**2;
  return source.intensity / Math.max(distance**source.distribution.decay, .01) * cutoff * cone *
    Math.max(0, -toPoint.dot(new THREE.Vector3(normal.x,normal.y,normal.z)));
}

test('the wall optic excludes its entire backing wall and bounds a modest warm receiving-ground pool', () => {
  const source = SOUTH_QUAY_FIXTURES.find(fixture => fixture.id==='south-quay-wall-light').source;
  assert.deepEqual([source.x,source.y,source.z],[240,.69,-289.595]);
  assert.equal(source.distribution.type, 'spot'); assert.equal(source.distribution.decay, 2);
  assert.equal(source.intensity,12); assert.equal(source.range,12);
  const axis = new THREE.Vector3(0, source.distribution.target.y-source.y, source.distribution.target.z-source.z).normalize();
  assert.ok(axis.z>0 && axis.y<0);
  // For every vector pointing to the plane behind the source (negative z),
  // the maximum dot product with this axis is |axis.y|, even for unlimited
  // vertical displacement. It is strictly below the outer cone cosine.
  assert.ok(Math.abs(axis.y)<Math.cos(source.distribution.angle));
  for (let x=230;x<=250;x+=.5) for(let y=-.03;y<=.87;y+=.03)
    assert.equal(incidentLux(source,{x,y,z:-289.7},{x:0,y:0,z:1}),0);
  let maximum=0, illuminated=0;
  for(let x=237;x<=243;x+=.05) for(let z=-289.6;z<=-284;z+=.05) {
    const lux=incidentLux(source,{x,y:.03,z},{x:0,y:1,z:0});maximum=Math.max(maximum,lux);if(lux>1)illuminated++;
    assert.ok(Number.isFinite(lux) && lux>=0 && lux<18,'no 450 lx flood or near-source singularity');
  }
  assert.ok(maximum>6 && maximum<18); assert.ok(illuminated>100);
  assert.ok(incidentLux(source,{x:240,y:.03,z:-280},{x:0,y:1,z:0})<.001,'camera-side distant road stripe illumination is negligible');
  const ferry=SOUTH_QUAY_FIXTURES.find(f=>f.id==='south-ferry-signpost-light').source;
  assert.equal(ferry.intensity,220);assert.equal(ferry.range,24);assert.equal(ferry.distribution,undefined);
});

test('one owned wall SpotLight replaces a rendered pool slot, survives frame updates, and releases at every owner boundary', () => {
  const scene=new THREE.Scene(),lighting=createHarborStreetLighting(THREE,scene,{buildings:METROPOLIS_BUILDINGS,isResident:()=>false});
  const points=lighting.root.children.filter(node=>node.isPointLight),pointIds=points.map(node=>node.uuid).sort();
  const body={x:240,y:0,z:-280},eye={...body,y:1.62};let previousGeneration=0;
  const disposed=[];
  function enter(quality='high') {
    lighting.setQuality(quality);lighting.update(body,eye,21);
    const spots=lighting.root.children.filter(node=>node.isSpotLight);assert.equal(spots.length,1);
    const spot=spots[0],target=spot.target,state=lighting.snapshot();
    assert.equal(state.residentLightObjects,quality==='high'?4:2);
    assert.equal(state.residentPointLightObjects,quality==='high'?3:1);
    assert.equal(state.residentSpotLightObjects,1);assert.equal(points.length,4,'no extra PointLight is allocated');
    assert.equal(state.wallDistribution.generations,++previousGeneration);
    assert.deepEqual([target.position.x,target.position.y,target.position.z],[240,.03,-288.8]);
    assert.ok(target.parent===lighting.root);assert.equal(spot.castShadow,false);
    let count=0;spot.addEventListener('dispose',()=>count++);disposed.push(()=>count);
    for(let i=0;i<10;i++)lighting.update(body,eye,21,.25);
    assert.equal(lighting.root.children.find(node=>node.isSpotLight),spot,'frame updates reuse the cached optic');
    assert.equal(lighting.snapshot().wallDistribution.generations,previousGeneration);
    return {spot,target};
  }
  function assertReleased(owned) {
    assert.equal(owned.spot.parent,null);assert.equal(owned.target.parent,null);
    assert.equal(lighting.snapshot().residentSpotLightObjects,0);assert.equal(lighting.snapshot().wallDistribution.allocated,false);
    assert.ok(disposed.every(count=>count()===1));
  }
  let owned=enter();lighting.setQuality('low');assertReleased(owned);
  owned=enter('balanced');lighting.update(body,eye,21,0,false);assertReleased(owned);
  owned=enter();lighting.update({x:500,y:0,z:-280},{x:500,y:1.62,z:-280},21);assertReleased(owned);
  assert.deepEqual(lighting.root.children.filter(node=>node.isPointLight).map(node=>node.uuid).sort(),pointIds);
  owned=enter();lighting.update(body,eye,12);assertReleased(owned);
  assert.deepEqual(lighting.root.children.filter(node=>node.isPointLight).map(node=>node.uuid).sort(),pointIds);
  owned=enter();lighting.dispose();lighting.dispose();assertReleased(owned);
  assert.equal(lighting.snapshot().wallDistribution.disposedGenerations,previousGeneration);assert.equal(scene.children.length,0);
});
