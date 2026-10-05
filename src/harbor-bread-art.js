/** Original Morning Tin near assets. Real textures are loaded only while this
 * one shop owns its near group; public glass/light/physics remain unchanged. */
export const BREAD_CRUST_MAPS=Object.freeze([
 ['map','bread-crust-albedo.png'],['bumpMap','bread-crust-height.png'],['roughnessMap','bread-crust-roughness.png'],
].map(([channel,file])=>Object.freeze({channel,file})));
export function createBakedCrustMaterials(THREE,{loadTexture,native=typeof document!=='undefined'}={}){
 const crust=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,metalness:0,bumpScale:.0011});
 crust.name='Morning Tin · original toasted crust';
 const crumb=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,metalness:0,bumpScale:.00065});
 crumb.name='Morning Tin · integral exposed score crumb';
 for(const m of [crust,crumb])m.userData.harborArt=true;
 const textures=new Set(),loaded=new Map(),errors=[],closedImages=new Set();let disposed=false,lateDecodedImages=0;
 const load=loadTexture||((url,onLoad,onError)=>new THREE.TextureLoader().load(url,onLoad,undefined,onError));
 if(native||loadTexture)for(const {channel,file}of BREAD_CRUST_MAPS){
  const url=new URL(`../assets/harbor/bakery/${file}`,import.meta.url).href;
  const texture=load(url,t=>{
   const image=t.image||t.source?.data;
   if(disposed){if(typeof image?.close==='function'&&!closedImages.has(image)){closedImages.add(image);image.close();lateDecodedImages++;}return;}
   const width=image?.naturalWidth||image?.width,height=image?.naturalHeight||image?.height;
   if(width!==512||height!==512){errors.push(`${file}: expected original 512×512 crust / crumb atlas`);return;}
   loaded.set(channel,{file,width,height,decoderObject:image?.constructor?.name||null});
  },()=>{if(!disposed)errors.push(`${file}: failed to load original crust map`);});
  texture.name=`Morning Tin original ${channel}`;texture.colorSpace=channel==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
  crust[channel]=texture;textures.add(texture);
  crumb[channel]=texture;
 }
 return{crust,crumb,textures:[...textures],snapshot(){return{status:disposed?'disposed':errors.length?'failed':loaded.size===3?'ready':native||loadTexture?'loading':'cpu-source-only',expectedMaps:3,loadedMaps:loaded.size,pending:!disposed&&(native||!!loadTexture)&&loaded.size+errors.length<3,images:[...loaded.values()],errors:[...errors],lateDecodedImages,textureCount:textures.size,ownedTextures:[...textures].map(t=>({uuid:t.uuid,channel:t.name,imageDecoder:(t.image||t.source?.data)?.constructor?.name||null})),closedImages:closedImages.size};},dispose(){if(disposed)return;disposed=true;const images=new Set();for(const t of textures){t.dispose();const image=t.image||t.source?.data;if(image?.close)images.add(image);}for(const image of images)if(!closedImages.has(image)){closedImages.add(image);image.close();}crust.dispose();crumb.dispose();}};
}
function cleanAndFit(THREE,geometry,original){
 original.computeBoundingBox();geometry.computeBoundingBox();const old=original.boundingBox,current=geometry.boundingBox;
 for(const axis of ['x','y','z']){const os=old.max[axis]-old.min[axis],ns=current.max[axis]-current.min[axis],a=geometry.attributes.position;for(let i=0;i<a.count;i++){const value=a.getComponent(i,['x','y','z'].indexOf(axis));a.setComponent(i,['x','y','z'].indexOf(axis),ns?old.min[axis]+(value-current.min[axis])*os/ns:old.min[axis]);}}
 const p=geometry.attributes.position,indices=[],a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),ab=new THREE.Vector3(),ac=new THREE.Vector3();
 for(let i=0;i<geometry.index.count;i+=3){const ia=geometry.index.getX(i),ib=geometry.index.getX(i+1),ic=geometry.index.getX(i+2);a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic);if(ab.subVectors(b,a).cross(ac.subVectors(c,a)).lengthSq()>1e-18)indices.push(ia,ib,ic);}
 geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();original.dispose();return geometry;
}
/** Both profiles have a continuous thick rim, inner wall, closed inner floor,
 * and closed underside. Bounds are fit to the actual old 10-sided geometry. */
export function createMorningTinCup(THREE,{table=false}={}){
 const old=(table?[[.08,0],[.10,.02],[.12,.16],[.10,.18],[.092,.15],[.065,.02]]:[[.054,0],[.068,.014],[.077,.12],[.069,.135],[.060,.118],[.047,.016]]).map(([r,y])=>new THREE.Vector2(r,y));
 const innerFloor=table?.02:.016;
 const profile=[...old,new THREE.Vector2(0,innerFloor),new THREE.Vector2(0,0),old[0].clone()];
 return cleanAndFit(THREE,new THREE.LatheGeometry(profile,32),new THREE.LatheGeometry(old,10));
}
export function createMorningTinHandle(THREE){return cleanAndFit(THREE,new THREE.TorusGeometry(.040,.011,5,20),new THREE.TorusGeometry(.040,.011,5,10));}
export function createMorningTinCoffee(THREE){return cleanAndFit(THREE,new THREE.CylinderGeometry(.086,.086,.008,32),new THREE.CylinderGeometry(.086,.086,.008,10));}
