import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from '/workspace/scratch/neon-harbor/vendor/three/three.module.js';
import {createCompactInteriorLayout} from '/workspace/scratch/neon-harbor/src/compact-interiors.js';
import {expansionBuilding} from '/workspace/scratch/neon-harbor/src/expansion-programmes.js';
import {applyAuthoredWorkshopLayout as baseApply} from '/workspace/scratch/neon-harbor/src/harbor-workshop-authored.js';
import {planHarborWorkshopPilot as basePlan} from '/workspace/scratch/neon-harbor/src/harbor-workshop-pilot.js';
import {applyAuthoredWorkshopLayout,createAuthoredWorkshopDetails} from './src/harbor-workshop-authored.js';
import {planHarborWorkshopPilot,createHarborWorkshopPilot} from './src/harbor-workshop-pilot.js';
import {parseWorkshopAssetCPU} from '/workspace/scratch/neon-harbor/tools/inspect-workshop-assets.mjs';
const root='/workspace/scratch/neon-harbor', out=new URL('./',import.meta.url),start=performance.now();
const building=expansionBuilding(JSON.parse(await fs.readFile(root+'/docs/qa/authored-workshop/source-building.json','utf8')),'south',85),floor=building.floors[0],base=createCompactInteriorLayout(building,floor),layout=applyAuthoredWorkshopLayout(building,floor,base),plan=planHarborWorkshopPilot(building,floor,layout);
assert.deepEqual(layout,baseApply(building,floor,base));assert.deepEqual(plan,basePlan(building,floor,layout));
const identity=crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
const d=createAuthoredWorkshopDetails(THREE,plan);let vertices=0;
for(const record of d.records){const c=plan.colliders.find(c=>c.id===record.envelope);for(let a=0;a<3;a++){const origin=[building.x,floor.y,building.z][a];const min=a===1?c.minY:[c.x-c.hx,0,c.z-c.hz][a],max=a===1?c.maxY:[c.x+c.hx,0,c.z+c.hz][a];assert.ok(record.min[a]+origin>=min-1e-6);assert.ok(record.max[a]+origin<=max+1e-6);}}
for(const mesh of d.group.children){vertices+=mesh.geometry.attributes.position.count;for(const attribute of Object.values(mesh.geometry.attributes))assert.ok(attribute.array.every(Number.isFinite));}
assert.ok(d.summary.meshes<=5);assert.ok(d.summary.triangles<=10000);assert.equal(d.summary.textures,0);
const directDisposal={geometry:0,material:0};for(const mesh of d.group.children){mesh.geometry.addEventListener('dispose',()=>directDisposal.geometry++);mesh.material.addEventListener('dispose',()=>directDisposal.material++);}d.dispose();d.dispose();assert.deepEqual(directDisposal,{geometry:5,material:5});assert.equal(d.group.children.length,0);
const assets=async id=>parseWorkshopAssetCPU(await fs.readFile(root+`/assets/harbor/workshop/${id}.glb`));
const data={building,floor,layout},owner=createHarborWorkshopPilot(THREE,{...data,enabled:true,loadAsset:assets});
const count=g=>{let meshes=0,triangles=0;g.traverseVisible(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return{meshes,triangles};};
owner.update({x:180.9,z:-114.58,groundY:floor.y});await owner.whenSettled();assert.equal(owner.snapshot().status,'ready',JSON.stringify(owner.snapshot().errors));const near={snapshot:owner.snapshot(),visible:count(owner.group)};
const detailGroup=owner.group.children.find(g=>g.name==='Workshop · repair and archive detail');assert.ok(detailGroup);
const released={geometry:0,material:0};for(const mesh of detailGroup.children){mesh.geometry.addEventListener('dispose',()=>released.geometry++);mesh.material.addEventListener('dispose',()=>released.material++);}
owner.update({x:197.7,z:-105.5,groundY:floor.y});assert.equal(owner.snapshot().lodTier,1);const middle=count(owner.group);
owner.update({x:205,z:-105,groundY:floor.y});assert.equal(owner.snapshot().lodTier,2);assert.equal(detailGroup.visible,false);const far=count(owner.group);
owner.update({x:230,z:-105,groundY:floor.y});assert.equal(owner.snapshot().details,null);assert.equal(detailGroup.parent,null);assert.deepEqual(released,{geometry:5,material:5});
owner.update({x:180.9,z:-114.58,groundY:floor.y});await owner.whenSettled();assert.equal(owner.snapshot().status,'ready');assert.notEqual(owner.group.children.find(g=>g.name===detailGroup.name),detailGroup);owner.dispose();owner.dispose();assert.equal(owner.snapshot().details,null);assert.equal(owner.group.children.length,0);
const failed=createHarborWorkshopPilot(THREE,{...data,enabled:true,loadAsset:async id=>{if(id==='wooden_bookshelf_worn')throw new Error('Expected missing model CPU fixture');return assets(id);}});failed.update(plan.centre);await failed.whenSettled();assert.equal(failed.snapshot().status,'failed');assert.equal(failed.snapshot().details,null);failed.dispose();
let release;const wait=new Promise(r=>release=r),late=createHarborWorkshopPilot(THREE,{...data,enabled:true,loadAsset:async id=>{if(id==='workshop-fittings')await wait;return assets(id);}});late.update(plan.centre);late.dispose();release();await late.whenSettled();assert.equal(late.snapshot().details,null);assert.equal(late.group.children.length,0);
const report={passed:true,scope:'Finite CPU geometry/identity/resource lifecycle; no JPEG decode, GPU, build, actual walking or art acceptance.',elapsedMs:performance.now()-start,planIdentitySha256:identity,layoutAndPlanExactEqualToRootBefore:true,existingCollidersUnchanged:true,details:d.summary,validatedVertices:vertices,allPieceBoundsInsideOriginalColliderXYZ:true,directDoubleDispose:directDisposal,ownerUnloadDisposal:released,visibleNear:near.visible,visibleMiddle:middle,visibleFar:far,loadFailureAddsNoDetails:true,lateAfterDisposeAddsNoDetails:true,records:d.records};
await fs.writeFile(new URL('cpu-proof.json',out),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,records:undefined},null,2));
