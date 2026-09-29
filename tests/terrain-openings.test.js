import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { cutGroundGeometry, subtractGroundRect } from '../src/terrain-openings.js';
import { METRO_STAIR_OPENINGS } from '../src/metropolis-transit.js';
import { createWorld } from '../src/world.js';
import { createMetropolisWorld } from '../src/metropolis-world.js';

test('stair opening removes the terrain itself and retains adjacent sloped surface and UVs',()=>{
  const g=new THREE.PlaneGeometry(20,20,1,1);g.rotateX(-Math.PI/2);
  const a=g.getAttribute('position');for(let i=0;i<a.count;i++)a.setY(i,(a.getX(i)+10)*.025);g.computeVertexNormals();
  const result=cutGroundGeometry(THREE,g,30,50,[{minX:28,maxX:32,minZ:44,maxZ:56}]);
  const mesh=new THREE.Mesh(result,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.position.set(30,0,50);mesh.updateMatrixWorld();
  const ray=new THREE.Raycaster(new THREE.Vector3(30,3,50),new THREE.Vector3(0,-1,0));
  assert.equal(ray.intersectObject(mesh).length,0);
  ray.ray.origin.set(34,3,50);const hit=ray.intersectObject(mesh)[0];
  assert.ok(hit);assert.ok(Math.abs(hit.point.y-.35)<1e-6);assert.ok(Number.isFinite(hit.uv.x));
  const pieces=subtractGroundRect({minX:20,maxX:40,minZ:40,maxZ:60},[{minX:28,maxX:32,minZ:44,maxZ:56}]);
  assert.equal(pieces.reduce((n,p)=>n+(p.maxX-p.minX)*(p.maxZ-p.minZ),0),352);
});

test('all three real world metro stair apertures are open to the sky while adjacent pavement remains',()=>{
  const scene=new THREE.Scene();
  const south=createWorld(THREE,scene,{streaming:false,openNorth:true});
  const north=createMetropolisWorld(THREE,scene,{streaming:false});scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(const h of METRO_STAIR_OPENINGS) {
    const roots=h.minZ>0?south.root:north.root;
    for(const t of [.2,.5,.8]) {
      const x=(h.minX+h.maxX)/2,z=h.minZ+(h.maxZ-h.minZ)*t;
      ray.set(new THREE.Vector3(x,.6,z),new THREE.Vector3(0,-1,0));
      assert.equal(ray.intersectObject(roots,true).some(hit=>hit.point.y>-.8),false,`${h.stopId} has a sealed street at ${z}`);
    }
    ray.set(new THREE.Vector3(h.maxX+.5,.6,(h.minZ+h.maxZ)/2),new THREE.Vector3(0,-1,0));
    assert.ok(ray.intersectObject(roots,true).some(hit=>hit.point.y>-.8),`${h.stopId} lost adjacent pavement`);
  }
  north.dispose();
});
