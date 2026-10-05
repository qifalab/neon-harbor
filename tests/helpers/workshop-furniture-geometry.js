/** Semantic test view of actual authored geometry. It is never a render part,
 * production collider, native decoder or visual-acceptance assertion. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as THREE from '../../vendor/three/three.module.js';
import {parseWorkshopAssetCPU,inspectScene} from '../../tools/inspect-workshop-assets.mjs';
const root=new URL('../../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex');
const json=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
let cache;
export async function verifiedWorkshopGeometry(){
 if(cache)return cache;
 const manifest=await json('assets/harbor/workshop/asset-manifest.json'),models=new Map(),bytesById=new Map();
 for(const record of manifest.models){
  const bytes=await readFile(new URL(record.output.path,root));
  assert.equal(bytes.length,record.output.bytes,record.id);assert.equal(hash(bytes),record.output.sha256,record.id+' actual GLB identity');
  bytesById.set(record.id,bytes);
  if(record.id==='workshop-fittings'){
   assert.match(record.license,/MIT.*CC0-1\.0/);assert.ok(record.authors.QifaLab&&record.authors['Rob Tuytel']);
   assert.match(await readFile(new URL('assets/harbor/workshop/LICENSE-NEON-AUTHORED.txt',root),'utf8'),/MIT License/);
  }else{
   assert.equal(record.license,'CC0-1.0');assert.equal(record.sourcePage,'https://polyhaven.com/a/'+record.id);
   const infoRecord=record.metadataDownloads.find(m=>m.url==='https://api.polyhaven.com/info/'+record.id);assert.ok(infoRecord);
   const infoBytes=await readFile(new URL(infoRecord.path,root));assert.equal(hash(infoBytes),infoRecord.sha256);
   const info=JSON.parse(infoBytes);assert.equal(info.type,2);assert.deepEqual(record.authors,info.authors);
  }
  const asset=await parseWorkshopAssetCPU(bytes);let inspection;
  if(record.id==='workshop-fittings'){
   let meshes=0,triangles=0;asset.scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
   inspection={meshes,triangles,bounds:null};
  }else inspection=inspectScene(asset.scene); // Preserve original four CC0 PBR requirements.
  assert.ok(inspection.meshes>0&&inspection.triangles>0,'Actual geometry, not merely a GLB id');
  models.set(record.id,{record,asset,inspection});
 }
 const source=await json('docs/qa/authored-workshop/authored-source/fittings-export.json');
 const fittingsBytes=bytesById.get('workshop-fittings');assert.equal(source.bytes,fittingsBytes.length);assert.equal(source.sha256,hash(fittingsBytes));
 const jsonLength=fittingsBytes.readUInt32LE(12),packed=JSON.parse(fittingsBytes.subarray(20,20+jsonLength).toString()),binary=fittingsBytes.subarray(28+jsonLength);
 assert.equal(packed.materials.length,6);assert.equal(packed.textures.length,4);
 assert.ok(packed.materials[0].pbrMetallicRoughness.baseColorTexture&&packed.materials[0].normalTexture&&packed.materials[0].pbrMetallicRoughness.metallicRoughnessTexture,'Actual CC0 wood PBR within original mixed-material fittings');
 let total=0;
 // Verify every named authoring contributor against its exact range in the
 // packed material/tier vertex stream, including all near/far contributors.
 for(const mesh of packed.meshes){const primitive=mesh.primitives[0],tier=mesh.name.split(' / ')[0],a=packed.accessors[primitive.attributes.POSITION],v=packed.bufferViews[a.bufferView];
  assert.equal(a.type,'VEC3');assert.equal(a.componentType,5126);assert.equal(primitive.indices,undefined);
  const records=source.details.filter(d=>d.tier===tier&&d.material===primitive.material);let first=0;
  for(const detail of records){const count=detail.triangles*3,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
   for(let i=first;i<first+count;i++)for(let k=0;k<3;k++){const value=binary.readFloatLE((v.byteOffset||0)+(a.byteOffset||0)+i*12+k*4);min[k]=Math.min(min[k],value);max[k]=Math.max(max[k],value);}
   assert.deepEqual(min,detail.min,detail.name+' actual packed vertex minimum');assert.deepEqual(max,detail.max,detail.name+' actual packed vertex maximum');first+=count;
  }
  assert.equal(first,a.count,'Complete contributor vertex coverage');total+=first/3;
 }
 assert.equal(total,source.totalPackedTriangles);assert.equal(total,17784);
 const labels=await json('docs/qa/authored-workshop/authored-source/labels-source.json');
 assert.ok(labels.rows[0][1].includes('RECEIVING')&&labels.rows[2][1].includes('COMPLETED')&&labels.rows[3][1].includes('REFERENCE')&&labels.rows[4][1].includes('LOG'));
 const core=source.details.filter(d=>d.tier==='core'),count=name=>core.filter(d=>d.name===name).length;
 assert.equal(count('repair bench separate plank'),3);assert.equal(count('repair bench enamel leg'),4);
 assert.equal(count('tool shaft'),4);assert.equal(count('tool grip'),4);assert.equal(count('tool head'),4);
 assert.equal(count('box bottom board'),2);assert.equal(count('box supporting lid'),2);assert.equal(count('service box side slat'),16);assert.equal(count('service box end slat'),16);
 assert.equal(count('service station top'),2);assert.equal(count('job folder / sorted spares'),6);
 assert.equal(count('archive vertical folder'),90);assert.equal(count('open receiving ledger'),1);assert.equal(count('reference folder'),1);assert.equal(count('outgoing ordered file'),4);
 cache={manifest,models,source,labels,core};return cache;
}
const semantic=name=>/repair bench|bench stretcher|lower slatted shelf/.test(name)?'workbench':/tool shaft|tool grip|tool head/.test(name)?'workshop-tool':/service box|box supporting lid|box bottom board|box ground cleat/.test(name)?'freight-crate':name==='open receiving ledger'?'reference-ledger':/archive vertical folder|reference folder|outgoing ordered file/.test(name)?'reference-folder':name;
function part(kind,bounds,source,roomId){return {kind,roomId,source,x:(bounds.min[0]+bounds.max[0])/2,y:(bounds.min[1]+bounds.max[1])/2,z:(bounds.min[2]+bounds.max[2])/2,
 sx:bounds.max[0]-bounds.min[0],sy:bounds.max[1]-bounds.min[1],sz:bounds.max[2]-bounds.min[2],bounds};}
function supportTriangles(scene){const result=[];scene.updateMatrixWorld(true);scene.traverse(o=>{if(!o.isMesh)return;
 const p=o.geometry.attributes.position,index=o.geometry.index,n=index?.count||p.count;
 for(let i=0;i<n;i+=3){const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(o.matrixWorld));
  const normal=new THREE.Vector3().subVectors(points[1],points[0]).cross(new THREE.Vector3().subVectors(points[2],points[0])).normalize();
  if(normal.y>.85)result.push(points);}});return result;}
function supported(x,z,minY,triangles){return triangles.some(([a,b,c])=>{
 const den=(b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);if(Math.abs(den)<1e-9)return false;
 const u=((b.z-c.z)*(x-c.x)+(c.x-b.x)*(z-c.z))/den,v=((c.z-a.z)*(x-c.x)+(a.x-c.x)*(z-c.z))/den,w=1-u-v;
 return u>=-1e-6&&v>=-1e-6&&w>=-1e-6&&Math.abs(u*a.y+v*b.y+w*c.y-(minY-.002))<.007;
});}
export function authoredWorkshopFurniture(layout,plan,data){
 assert.ok(plan?.authored&&layout.workshopAuthored,'Production owner plan must be genuinely authored');
 const furniture=[],shelfTriangles=[];
 const roomAt=bounds=>{const z=(bounds.min[2]+bounds.max[2])/2;const room=layout.rooms.find(r=>z>=r.bounds.minZ&&z<=r.bounds.maxZ);assert.ok(room,'Actual mesh contribution has an existing room');return room.id;};
 for(const placement of plan.placements){const model=data.models.get(placement.id);assert.ok(model&&placement.purpose?.length>15,'Actual source plus meaningful owner purpose');
  if(placement.id==='workshop-fittings'){
   for(const detail of data.source.details.filter(d=>d.tier!=='far')){
    const bounds={min:detail.min.map((v,i)=>v+[placement.position.x,placement.position.y,placement.position.z][i]),max:detail.max.map((v,i)=>v+[placement.position.x,placement.position.y,placement.position.z][i])};
    furniture.push(part(semantic(detail.name),bounds,{modelId:placement.id,contributor:detail.name,tier:detail.tier,triangles:detail.triangles,purpose:placement.purpose,license:model.record.license},roomAt(bounds)));
   }
  }else{
   for(const [i,offset]of(placement.instances||[{x:0,y:0,z:0}]).entries()){
    // A SkinnedMesh.clone shares its source Skeleton; use the actual parsed
    // skinned scene and update its own bones, exactly as the owner does.
    const scene=model.inspection.skinnedMeshes?model.asset.scene:model.asset.scene.clone(true);scene.position.set(placement.position.x+offset.x,placement.position.y+offset.y,placement.position.z+offset.z);
    scene.scale.setScalar(placement.scale);scene.rotation.y=placement.rotationY;scene.updateMatrixWorld(true);
    scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
    const box=new THREE.Box3().setFromObject(scene,true),bounds={min:box.min.toArray(),max:box.max.toArray()};
    const kind=placement.id==='wooden_bookshelf_worn'?'archive-shelf':placement.id==='metal_office_desk'?'reading-table':placement.id==='bench_vice_01'?'bench-vice':'tool-chest';
    furniture.push(part(kind,bounds,{modelId:placement.id,instance:i,purpose:placement.purpose,license:model.record.license,sourcePage:model.record.sourcePage,sha256:model.record.output.sha256},roomAt(bounds)));
    if(kind==='archive-shelf'||kind==='reading-table'){
     const id=kind==='archive-shelf'?`south-086:lobby:reference-shelf-${i}`:'south-086:lobby:retrieval-desk',collider=plan.colliders.find(c=>c.id===id);assert.ok(collider);
     for(const[a,b]of[[bounds.min[0],collider.x-collider.hx],[bounds.max[0],collider.x+collider.hx],[bounds.min[2],collider.z-collider.hz],[bounds.max[2],collider.z+collider.hz],[bounds.min[1],collider.minY],[bounds.max[1],collider.maxY]])assert.ok(Math.abs(a-b)<1e-5,'Official furniture collision matches visible GLB bounds');
    }
    if(kind==='archive-shelf')shelfTriangles.push(...supportTriangles(scene));
   }
  }
 }
 const folders=furniture.filter(p=>p.source.contributor==='archive vertical folder');assert.equal(folders.length,90);
 for(const folder of folders)for(const x of[folder.bounds.min[0],folder.bounds.max[0]])for(const z of[folder.bounds.min[2],folder.bounds.max[2]])assert.ok(supported(x,z,folder.bounds.min[1],shelfTriangles),'Each real folder bottom corner is supported on actual shelf triangles');
 assert.equal(furniture.filter(p=>p.kind==='archive-shelf').length,3);assert.equal(furniture.filter(p=>p.kind==='reading-table').length,1);
 return furniture;
}
