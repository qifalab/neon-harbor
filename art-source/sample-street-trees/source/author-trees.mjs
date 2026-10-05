/** Editable original metric tree source, CC0-1.0. No external mesh/image inputs.
 * Each variant has a tapered curved trunk, real branches/twigs and the original 576 folded,
 * closed thin blades plus 1,152 independently seeded inner/mid-crown blades.
 * Original bark and original 1728 leaf attribute bytes remain unchanged.
 * Another 1728 blades connect inner crown, neighbouring branches and lateral shoulders. */
import fs from 'node:fs/promises';import crypto from 'node:crypto';import * as T from '../../../vendor/three/three.module.js';
const base=new URL('./',import.meta.url),out=new URL('../../../assets/harbor/vegetation/',import.meta.url);const spec=JSON.parse(await fs.readFile(new URL('recipes.json',base),'utf8'));
const rngFor=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const merge=gs=>{const p=[],n=[],u=[],c=[];for(const g0 of gs){const g=g0.index?g0.toNonIndexed():g0;for(const v of g.attributes.position.array)p.push(v);for(const v of g.attributes.normal.array)n.push(v);for(const v of g.attributes.uv?.array||new Float32Array(g.attributes.position.count*2))u.push(v);for(const v of g.attributes.color?.array||new Float32Array(g.attributes.position.count*3).fill(1))c.push(v);g.dispose();if(g!==g0)g0.dispose();}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('uv',new T.Float32BufferAttribute(u,2));g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.computeBoundingBox();return g;};
function limb(points,radius,segments=10,radial=6){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),frames=curve.computeFrenetFrames(segments,false),p=[],u=[],ix=[];for(let j=0;j<=segments;j++){const at=curve.getPoint(j/segments),r=radius*(1-.87*j/segments);for(let i=0;i<=radial;i++){const a=i/radial*Math.PI*2,v=at.clone().addScaledVector(frames.normals[j],Math.cos(a)*r).addScaledVector(frames.binormals[j],Math.sin(a)*r);p.push(...v.toArray());u.push(i/radial,j/segments*curve.getLength()/.6);if(j<segments&&i<radial){const k=j*(radial+1)+i;ix.push(k,k+1,k+radial+1,k+1,k+radial+2,k+radial+1);}}}for(const[end,sign]of[[0,-1],[segments,1]]){const centre=p.length/3;p.push(...curve.getPoint(end/segments).toArray());u.push(.5,.5);for(let i=0;i<radial;i++){const a=end*(radial+1)+i;ix.push(centre,...(sign<0?[a+1,a]:[a,a+1]));}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(u,2));g.setIndex(ix);g.computeVertexNormals();return g;}
function leaf(pos,random){const len=.29+random()*.14,w=.13+random()*.08,th=.0016;const p=[],u=[],ix=[],colors=[],yaw=random()*Math.PI*2,pitch=(random()-.5)*1.5,roll=(random()-.5)*1.2,o=new T.Object3D();o.position.copy(pos);o.rotation.set(pitch,yaw,roll);o.updateMatrix();const shape=[[0,0,-len/2],[-w/2,-.014,-len*.08],[0,.023,len/2],[w/2,-.014,-len*.08]],tone=new T.Color().setRGB(.10+random()*.05,.21+random()*.07,.105+random()*.055);for(let face=0;face<2;face++)for(let i=0;i<4;i++){const v=new T.Vector3(...shape[i]);v.y+=face?-th:0;v.applyMatrix4(o.matrix);p.push(...v.toArray());u.push(i===1?0:i===3?1:.5,i===0?0:i===2?1:.43);const shade=(face?.78:1)*(.91+random()*.09);colors.push(tone.r*shade,tone.g*shade,tone.b*shade);}ix.push(0,1,2,0,2,3,4,6,5,4,7,6);for(let i=0;i<4;i++){const j=(i+1)%4;ix.push(i,i+4,j,j,i+4,j+4);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(u,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(ix);g.computeVertexNormals();return g;}
// New blades retain metric shape / size / thickness, with naturally varied steeper tilts.
function crownLeaf(pos,random){const len=.29+random()*.14,w=.13+random()*.08,th=.0016;const p=[],u=[],ix=[],colors=[],yaw=random()*Math.PI*2,pitch=(random()-.5)*2.7,roll=(random()-.5)*2.9,o=new T.Object3D();o.position.copy(pos);o.rotation.set(pitch,yaw,roll);o.updateMatrix();const shape=[[0,0,-len/2],[-w/2,-.014,-len*.08],[0,.023,len/2],[w/2,-.014,-len*.08]],tone=new T.Color().setRGB(.10+random()*.05,.21+random()*.07,.105+random()*.055);for(let face=0;face<2;face++)for(let i=0;i<4;i++){const v=new T.Vector3(...shape[i]);v.y+=face?-th:0;v.applyMatrix4(o.matrix);p.push(...v.toArray());u.push(i===1?0:i===3?1:.5,i===0?0:i===2?1:.43);const shade=(face?.78:1)*(.91+random()*.09);colors.push(tone.r*shade,tone.g*shade,tone.b*shade);}ix.push(0,1,2,0,2,3,4,6,5,4,7,6);for(let i=0;i<4;i++){const j=(i+1)%4;ix.push(i,i+4,j,j,i+4,j+4);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(u,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(ix);g.computeVertexNormals();return g;}
function create(v){const rand=rngFor(v.seed),bark=[],leaves=[],bend=v.bend;const trunk=[[0,.33,0],[.04,2.2,.05],[-.05,4.1,.08],[bend,6.6,-.12],[bend+.2,8.7,.10]];const trunkCurve=new T.CatmullRomCurve3(trunk.map(p=>new T.Vector3(...p)));bark.push(limb(trunk,.28,16,10));for(let k=0;k<v.branches.length;k++){const end=new T.Vector3(...v.branches[k]),start=trunkCurve.getPoint(.54+k*.059),mid=start.clone().lerp(end,.53);mid.y-=.38;bark.push(limb([start.toArray(),mid.toArray(),end.toArray()],.105-k*.009,10,6));const branchCurve=new T.CatmullRomCurve3([start,mid,end]);for(let fan=0;fan<3;fan++){const at=branchCurve.getPoint(.63+fan*.14),twig=end.clone().add(new T.Vector3((rand()-.5)*.64,-.10+rand()*.34,(rand()-.5)*.62));bark.push(limb([at.toArray(),at.clone().lerp(twig,.50).toArray(),twig.toArray()],.018,4,5));for(let n=0;n<32;n++){const theta=n*2.399963+fan*1.4,spread=Math.sqrt((n+.5)/32),loc=twig.clone().add(new T.Vector3(Math.cos(theta)*spread*.46,(rand()-.5)*.29,Math.sin(theta)*spread*.48));loc.x=Math.max(-3.10,Math.min(4.12,loc.x));loc.z=Math.max(-3.07,Math.min(3.07,loc.z));loc.y=Math.max(4.30,Math.min(11.68,loc.y));leaves.push(leaf(loc,rand));}}}
// Append only after every original bark/twig/leaf is authored. This separate RNG
// cannot change later original twigs or any of the first 576 leaf attribute bytes.
const crownRand=rngFor((v.seed^spec.crownDensity.independentSeedSalt)>>>0);
for(let k=0;k<v.branches.length;k++){
 const end=new T.Vector3(...v.branches[k]),start=trunkCurve.getPoint(.54+k*.059),mid=start.clone().lerp(end,.53);mid.y-=.38;
 const curve=new T.CatmullRomCurve3([start,mid,end]);
 for(let band=0;band<spec.crownDensity.branchFractions.length;band++){
  const fraction=spec.crownDensity.branchFractions[band],centre=curve.getPoint(fraction),tangent=curve.getTangent(fraction).normalize();
  const side=new T.Vector3(-tangent.z,0,tangent.x).normalize();
  const up=new T.Vector3().crossVectors(tangent,side).normalize();
  const radius=spec.crownDensity.clusterRadii[band];
  // Small irregular 3-D clusters along the actual curved branch: several
  // overlapping layers, open gaps between branch systems, never terminal discs.
  for(let n=0;n<spec.crownDensity.leavesPerCluster;n++){
   const azimuth=n*2.399963229728653+band*1.17+k*.83;
   const ring=Math.sqrt((n+.5)/spec.crownDensity.leavesPerCluster);
   const along=(crownRand()-.5)*radius*1.32;
   const loc=centre.clone().addScaledVector(side,Math.cos(azimuth)*ring*radius)
    .addScaledVector(up,Math.sin(azimuth)*ring*radius*.88)
    .addScaledVector(tangent,along);
   loc.x=Math.max(-3.10,Math.min(4.12,loc.x));loc.z=Math.max(-3.07,Math.min(3.07,loc.z));loc.y=Math.max(5.80,Math.min(11.68,loc.y));
   leaves.push(leaf(loc,crownRand));
  }
 }
}
// Final continuous-crown layer is authored after the entire immutable 1728-blade prefix.
const denseRand=rngFor((v.seed^spec.continuousCrown.independentSeedSalt)>>>0),clusters=[];
const branches=v.branches.map((q,k)=>{const end=new T.Vector3(...q),start=trunkCurve.getPoint(.54+k*.059),mid=start.clone().lerp(end,.53);mid.y-=.38;return new T.CatmullRomCurve3([start,mid,end]);});
const order=v.branches.map((q,i)=>({i,angle:Math.atan2(q[2],q[0])})).sort((a,b)=>a.angle-b.angle).map(q=>q.i);
// Adjacent branch bridges populate previously empty sky holes rather than branch tips.
for(let k=0;k<order.length;k++)for(const t of[.64,.86]){
 const a=branches[order[k]].getPoint(t),b=branches[order[(k+1)%order.length]].getPoint(t),c=a.clone().lerp(b,.50);
 c.y=Math.max(8.15,c.y+.12);clusters.push({kind:'adjacent-branch-bridge',centre:c,radii:[.78,.57,.80]});
}
// Inner crown overlaps bridges and the high trunk, preserving open lower branch lines.
for(let k=0;k<branches.length;k++)for(const t of[.69,.92]){
 const c=branches[k].getPoint(t);c.x*=.46;c.z*=.46;c.y=Math.max(8.35,c.y+.17);
 clusters.push({kind:'inner-crown',centre:c,radii:[.78,.57,.80]});
}
// Lateral shoulders are broad in Z for both sides of the street tree. Three
// staggered layers taper toward the top and vary in X, without a shell surface.
for(const sign of[-1,1])for(const x of[-2.4,-.85,.90,2.6])for(let layer=0;layer<3;layer++){
 const z=sign*([2.94,3.12,2.58][layer]-.12*Math.abs(x)),y=[8.75,9.50,10.33][layer]-.08*Math.abs(x);
 const c=new T.Vector3(x+(denseRand()-.5)*.22,y+(denseRand()-.5)*.20,z+(denseRand()-.5)*.16);
 clusters.push({kind:'lateral-shoulder-layer',centre:c,radii:[.78,.54,.74]});
}
for(let k=0;k<6;k++){
 const angle=k*2.399963229728653,c=new T.Vector3(.18+Math.cos(angle)*.94,10.78+(k%3)*.19,Math.sin(angle)*1.05);
 clusters.push({kind:'upper-central-crown',centre:c,radii:[.74,.57,.76]});
}
if(clusters.length!==spec.continuousCrown.clusterCount)throw Error('Unexpected continuous crown cluster count');
for(let ci=0;ci<clusters.length;ci++){
 const cl=clusters[ci];
 for(let n=0;n<spec.continuousCrown.leavesPerCluster;n++){
  // Irrregular filled ellipsoid, not a radial disc or skin around a sphere.
  const zUnit=1-2*(n+.5)/spec.continuousCrown.leavesPerCluster,radial=Math.sqrt(1-zUnit*zUnit),azimuth=n*2.399963229728653+ci*.731;
  const fill=.35+.65*Math.cbrt(denseRand()),loc=cl.centre.clone().add(new T.Vector3(Math.cos(azimuth)*radial*cl.radii[0]*fill,zUnit*cl.radii[1]*fill,Math.sin(azimuth)*radial*cl.radii[2]*fill));
  loc.x=Math.max(-3.59,Math.min(4.20,loc.x));loc.z=Math.max(-3.95,Math.min(3.95,loc.z));loc.y=Math.max(7.95,Math.min(11.68,loc.y));
  leaves.push(crownLeaf(loc,denseRand));
 }
}
return{bark:merge(bark),leaves:merge(leaves),leafCount:leaves.length};}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function glb(id,geometry){const bins=[],views=[],accessors=[];let length=0;const append=b=>{b=Buffer.from(b);const i=views.length;views.push({buffer:0,byteOffset:length,byteLength:b.length});bins.push(b);length+=b.length;const pad=(4-length%4)%4;if(pad){bins.push(Buffer.alloc(pad));length+=pad;}return i;};const materials=[{name:'Original ridged bark',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicRoughnessTexture:{index:1},metallicFactor:0,roughnessFactor:1}},{name:'Original folded leaf blades',pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicRoughnessTexture:{index:2},metallicFactor:0,roughnessFactor:1}}];const meshes=[];for(const[name,g]of Object.entries(geometry)){if(!g?.isBufferGeometry)continue;const attrs={};for(const[key,semantic]of[['position','POSITION'],['normal','NORMAL'],['uv','TEXCOORD_0'],['color','COLOR_0']]){const a=g.attributes[key];if(!a)continue;const ac={bufferView:append(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)),componentType:5126,count:a.count,type:a.itemSize===2?'VEC2':'VEC3'};if(key==='position'){ac.min=g.boundingBox.min.toArray();ac.max=g.boundingBox.max.toArray();}attrs[semantic]=accessors.length;accessors.push(ac);}meshes.push({name,primitives:[{attributes:attrs,material:name==='bark'?0:1,mode:4}]});}const images=[];for(const file of['original-bark-albedo.png','original-bark-roughness.png','original-leaf-roughness.png'])images.push({bufferView:append(await fs.readFile(new URL(file,base))),mimeType:'image/png',name:file});const json={asset:{version:'2.0',generator:'Neon Harbor original editable tree source / CC0-1.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:meshes.map((m,i)=>({name:m.name,mesh:i})),meshes,materials,buffers:[{byteLength:length}],bufferViews:views,accessors,images,textures:images.map((_,i)=>({source:i,sampler:0})),samplers:[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}],extras:{license:'CC0-1.0',creator:spec.creator,variant:id,units:'metres',closedLeafBlades:true,crownDensity:spec.crownDensity,continuousCrown:spec.continuousCrown,foliageEnvelope:spec.foliageEnvelope}};let j=Buffer.from(JSON.stringify(json));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);const bin=Buffer.concat(bins),head=Buffer.alloc(20),bh=Buffer.alloc(8);head.writeUInt32LE(0x46546c67);head.writeUInt32LE(2,4);head.writeUInt32LE(28+j.length+bin.length,8);head.writeUInt32LE(j.length,12);head.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([head,j,bh,bin]);}
await fs.mkdir(out,{recursive:true});const assets=[];for(const v of spec.variants){const geometry=create(v);for(const g of[geometry.bark,geometry.leaves]){const envelope=g===geometry.bark?spec.oldEnvelope:spec.foliageEnvelope;if(!g.boundingBox.min.toArray().every((n,i)=>n>=envelope.min[i]-1e-6)||!g.boundingBox.max.toArray().every((n,i)=>n<=envelope.max[i]+1e-6))throw Error('Explicit bark/foliage envelope exceeded '+v.id+' '+JSON.stringify({min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()}));for(const a of Object.values(g.attributes))for(const n of a.array)if(!Number.isFinite(n))throw Error('Nonfinite authored geometry');}const triangles=(geometry.bark.attributes.position.count+geometry.leaves.attributes.position.count)/3;if(triangles>45000)throw Error('Tree triangle cap exceeded');const bytes=await glb(v.id,geometry);await fs.writeFile(new URL(v.id+'.glb',out),bytes);assets.push({id:v.id,file:v.id+'.glb',bytes:bytes.length,sha256:sha(bytes),triangles,meshes:2,leafCount:geometry.leafCount,barkTriangles:geometry.bark.attributes.position.count/3,leafTriangles:geometry.leaves.attributes.position.count/3,bounds:{bark:{min:geometry.bark.boundingBox.min.toArray(),max:geometry.bark.boundingBox.max.toArray()},leaves:{min:geometry.leaves.boundingBox.min.toArray(),max:geometry.leaves.boundingBox.max.toArray()}}});geometry.bark.dispose();geometry.leaves.dispose();}const manifest={schema:'original-six-near-street-trees-v1',license:'CC0-1.0',creator:spec.creator,source:'art-source/sample-street-trees/source/author-trees.mjs',editableRecipe:'art-source/sample-street-trees/source/recipes.json',oldEnvelope:spec.oldEnvelope,foliageEnvelope:spec.foliageEnvelope,crownDensity:spec.crownDensity,continuousCrown:spec.continuousCrown,assets};manifest.editableSourceFiles=[];
for(const relative of ['../LICENSE.txt','author-trees.mjs','make-original-tree-textures.py','original-bark-albedo.png','original-bark-roughness.png','original-leaf-roughness.png','recipes.json']){
 const bytes=await fs.readFile(new URL(relative,base));
 manifest.editableSourceFiles.push({path:'art-source/sample-street-trees/'+(relative==='../LICENSE.txt'?'LICENSE.txt':'source/'+relative),bytes:bytes.length,sha256:sha(bytes)});
}
manifest.runtimeOwner='src/harbor-sample-trees.js';
manifest.physicalDetail='3456 closed actual folded leaf blades per variant with 1.6mm thickness; previous 1728 leaves and all bark attributes byte-preserved. Final independent 1728 additions connect crown centre, adjacent branch spans and broad Z shoulders in 54 filled 3D clusters. Old bark envelope is unchanged; expanded foliage-only envelope is declared explicitly. No alpha planes, enlarged leaf cards or crown sphere meshes.';
await fs.writeFile(new URL('asset-manifest.json',out),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
