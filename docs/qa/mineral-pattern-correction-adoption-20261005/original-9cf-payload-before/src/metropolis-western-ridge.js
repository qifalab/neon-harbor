/** Original editable continuous western channel ridge. Decorative only:
 * preserve the original union envelope and original twelve northern source
 * cones, never change collision, ground support or streaming. */
export const WESTERN_RIDGE_RECIPE = Object.freeze({
  version: 2, xSegments: 32, zSegments: 112, sourceWesternHills: 10,
  minX: -1076, maxX: -790, minZ: -1439, maxZ: -495, minY: -18.5, maxY: 160.5,
  maxHillTriangles: 3000, maxWesternTriangles: 30000, maxPreparedBytes: 300000,
  surface: Object.freeze({ version: 1, mapSize: 128, textureTileMetres: 16, seed: 2026100521, maxAddedResidentBytes: 524288 }),
  palette: Object.freeze({ grass: '#38513e', grassWarm: '#5b6745', soil: '#78664c', rock: '#948b73', rockShade: '#555d55', rockLight: '#b0aa91' }),
});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smoothstep=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t);};
const gauss=(v,w)=>Math.exp(-((v/w)**2));
/** One wandering longitudinal mass; unequal broad outcrops share elevated
 * saddles. Branching oblique drainage and stepped east shoulders break the
 * silhouette without reproducing the former ten separate radial hills. */
function westernRelief(u,v){
 const spine=.42+.085*Math.sin(v*7.3+.4)+.045*Math.sin(v*18.1-.8);
 const height=.26+.24*gauss(v-.12,.12)+.34*gauss(v-.44,.17)+.56*gauss(v-.84,.16);
 const ridge=height*gauss(u-spine,.225);
 const east=.26*gauss(u-.70-.03*Math.sin(v*13),.18)*(.50+.50*gauss(v-.75,.40));
 const back=.18*gauss(u-.22,.19)*(.65+.35*Math.sin(v*10.4+.9)**2);
 let drainage=0;
 for(const [centre,width,depth,bend]of [[.17,.028,.12,.16],[.37,.022,.10,-.15],[.58,.035,.18,.21],[.77,.022,.14,-.11],[.93,.026,.11,.12]]){
  const line=centre+bend*(u-spine)+.009*Math.sin(u*11+centre*13);
  drainage+=depth*gauss(v-line,width)*gauss(u-.65,.25);
 }
 const raw=Math.max(0,.04+ridge+east+back-drainage);
 const stepped=raw+.016*Math.sin(raw*31+v*4.3)*smoothstep(.23,.55,u);
 const envelope=smoothstep(0,.075,u)*smoothstep(0,.075,1-u)*smoothstep(0,.04,v)*smoothstep(0,.04,1-v);
 return {height:Math.max(0,stepped)*envelope,drainage:clamp(drainage/.18)};
}
function expectedTransform(i) {
  return i < 10
    ? [-860 - i % 3 * 55, 35 + i % 4 * 12, -580 - i * 86, 70 + i % 3 * 18, 95 + i % 4 * 28, 85, 0, 0, 0]
    : [-780 + (i - 10) * 142, 30 + (i - 10) % 3 * 14, -1490 - (i - 10) % 2 * 35, 132, 140 + (i - 10) % 4 * 30, 148, 0, 0, 0];
}

function validateSourceBatch(batch, sourceGeometry) {
  if (batch.kind !== 'cone' || batch.material !== 'leaves' || batch.transforms.length !== 22 ||
      !Array.isArray(batch.buildings) || batch.buildings.length !== 22 || batch.buildings.some(id => id !== null) || sourceGeometry.type !== 'ConeGeometry' ||
      sourceGeometry.parameters.radius !== 1 || sourceGeometry.parameters.height !== 1 ||
      sourceGeometry.parameters.radialSegments !== 12 || sourceGeometry.parameters.heightSegments !== 1 ||
      sourceGeometry.parameters.openEnded || sourceGeometry.parameters.thetaStart !== 0 ||
      sourceGeometry.parameters.thetaLength !== Math.PI * 2 || sourceGeometry.index.count !== 72)
    throw new Error('Western ridge requires the original permanent 22-hill cone/leaves batch');
  for (let i = 0; i < 22; i++) {
    const expected = expectedTransform(i), actual = batch.transforms[i];
    if (actual.length !== 9 || actual.some((n, j) => !Number.isFinite(n) || Math.abs(n - expected[j]) > 1e-9))
      throw new Error(`Western ridge source transform changed at hill ${i}`);
  }
}

/** Make only this owner's geometry disposal idempotent. The world owner and
 * all other geometry families keep their existing lifecycle. */
export function ownWesternRidgeGeometry(geometry) {
  const original = geometry.dispose.bind(geometry); let disposed = false;
  geometry.dispose = () => { if (disposed) return; disposed = true; original(); };
  return geometry;
}

/** Original periodic dry mineral sheet, expressed in metres rather than
 * screen pixels. Unequal ~2.5m stone cells, shallow fractured margins and
 * warped ~2.3m strata form one continuous physical height field. Its finite
 * differences generate tangent normals; the same fractures drive roughness.
 * No photographs, downloaded textures, random per-frame samples or shader hooks. */
function createOriginalWesternMaps(THREE) {
  const r=WESTERN_RIDGE_RECIPE.surface,size=r.mapSize,tile=r.textureTileMetres;
  const normalPixels=new Uint8Array(size*size*4),roughPixels=new Uint8Array(normalPixels.length),heights=new Float32Array(size*size),fractures=new Float32Array(size*size);
  let state=r.seed>>>0;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const cells=Array.from({length:40},()=>[random(),random(),random()]);
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const u=i/size,v=j/size,k=j*size+i;let nearest=Infinity,second=Infinity,stone=0;
    for(const cell of cells){let x=Math.abs(u-cell[0]),y=Math.abs(v-cell[1]);x=Math.min(x,1-x);y=Math.min(y,1-y);const d=Math.hypot(x,y);if(d<nearest){second=nearest;nearest=d;stone=cell[2];}else if(d<second)second=d;}
    const fracture=Math.exp(-(second-nearest)/.018),warp=.13*Math.sin(v*4*Math.PI)+.075*Math.sin(u*6*Math.PI);
    const strata=Math.sin((v*7+warp)*2*Math.PI),sheet=Math.sin((u*3+v*2)*2*Math.PI),grain=Math.sin((u*29-v*23)*2*Math.PI)*Math.cos((u*17+v*19)*2*Math.PI);
    heights[k]=.045*strata+.025*sheet-.050*fracture+.006*grain+.010*(stone-.5)*(1-fracture);fractures[k]=fracture;
  }
  const sample=(i,j)=>heights[((j+size)%size)*size+(i+size)%size],step=tile/size;
  for(let j=0;j<size;j++)for(let i=0;i<size;i++){
    const at=j*size+i,k=at*4,dx=(sample(i+1,j)-sample(i-1,j))/(2*step),dy=(sample(i,j+1)-sample(i,j-1))/(2*step),inv=1/Math.hypot(dx,dy,1);
    normalPixels[k]=Math.round((-.5*dx*inv+.5)*255);normalPixels[k+1]=Math.round((-.5*dy*inv+.5)*255);normalPixels[k+2]=Math.round((.5*inv+.5)*255);normalPixels[k+3]=255;
    // Three's standard roughnessmap_fragment consumes G, multiplied by the
    // material scalar1. Dry crevices are rougher than the exposed mineral sheet.
    const rough=Math.round(clamp(.84+.11*fractures[at]+.025*Math.sin((i*5+j*3)/size*2*Math.PI),.80,.98)*255);
    roughPixels[k]=roughPixels[k+1]=roughPixels[k+2]=rough;roughPixels[k+3]=255;
  }
  const normal=new THREE.DataTexture(normalPixels,size,size),roughness=new THREE.DataTexture(roughPixels,size,size);
  for(const [name,t]of[['normal',normal],['roughness',roughness]]){t.name=`Western ridge original dry mineral ${name}`;t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.anisotropy=4;t.needsUpdate=true;}
  return {normal,roughness};
}
function createWestMaterial(THREE) {
  const maps=createOriginalWesternMaps(THREE),material=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,metalness:0,normalMap:maps.normal,roughnessMap:maps.roughness,normalMapType:THREE.TangentSpaceNormalMap,normalScale:new THREE.Vector2(1,1)});
  material.name='metropolis-western-ridge';
  const size=WESTERN_RIDGE_RECIPE.surface.mapSize,mipPixels=Array.from({length:Math.log2(size)+1},(_,i)=>(size>>i)**2).reduce((a,b)=>a+b,0),baseBytes=2*size*size*4,fullMipBytes=2*mipPixels*4;
  material.userData.westernMineralSurface={recipeVersion:1,originalProceduralMaps:true,mapSize:size,textureTileMetres:WESTERN_RIDGE_RECIPE.surface.textureTileMetres,basePixelCpuBytes:baseBytes,fullMipGpuTheoreticalBytes:fullMipBytes,addedResidentCpuAndGpuTheoreticalBytes:baseBytes+fullMipBytes,uvReplacesUnusedMountainSurface:true};
  if(baseBytes+fullMipBytes>WESTERN_RIDGE_RECIPE.surface.maxAddedResidentBytes)throw Error('Western mineral maps exceed the added resident budget');
  const original=material.dispose.bind(material);let disposed=false;
  material.dispose=()=>{if(disposed)return;disposed=true;maps.normal.dispose();maps.roughness.dispose();original();};
  return material;
}

/** One static draw for the connected West surface and exact original North
 * source cones. Northern owner extracts the explicit westernRange and replaces
 * those twelve source cones with its existing, unchanged independent ridge. */
export function createWesternMountainBatch(THREE,batch,sourceGeometry,sourceMaterial){
 validateSourceBatch(batch,sourceGeometry);
 const r=WESTERN_RIDGE_RECIPE,nx=r.xSegments,nz=r.zSegments,grid=(nx+1)*(nz+1),edgeCount=2*(nx+nz),westVertices=grid+edgeCount+1;
 const sourcePosition=sourceGeometry.getAttribute('position'),sourceNormal=sourceGeometry.getAttribute('normal'),northVertices=12*sourcePosition.count,vertexCount=westVertices+northVertices,westernTriangles=nx*nz*2+edgeCount*3,triangleCount=westernTriangles+12*sourceGeometry.index.count/3;
 const positions=new Float32Array(vertexCount*3),normals=new Float32Array(vertexCount*3),colors=new Float32Array(vertexCount*3),uv=new Float32Array(vertexCount*2),indices=new Uint16Array(triangleCount*3),heights=new Float64Array(grid);
 let high=0;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const k=j*(nx+1)+i;heights[k]=westernRelief(i/nx,j/nz).height;high=Math.max(high,heights[k]);}
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const k=j*(nx+1)+i;positions.set([r.minX+(r.maxX-r.minX)*i/nx,r.minY+1+heights[k]/high*(r.maxY-r.minY-1),r.minZ+(r.maxZ-r.minZ)*j/nz],k*3);}
 let next=0;const tri=(a,b,c)=>{indices[next++]=a;indices[next++]=b;indices[next++]=c;};
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i;tri(a,a+nx+1,a+1);tri(a+1,a+nx+1,a+nx+2);}
 const edge=[];for(let i=0;i<=nx;i++)edge.push(i);for(let j=1;j<=nz;j++)edge.push(j*(nx+1)+nx);for(let i=nx-1;i>=0;i--)edge.push(nz*(nx+1)+i);for(let j=nz-1;j>0;j--)edge.push(j*(nx+1));
 for(let e=0;e<edge.length;e++){const top=edge[e];positions.set([positions[top*3],r.minY,positions[top*3+2]],(grid+e)*3);}
 const centre=grid+edge.length;positions.set([(r.minX+r.maxX)/2,r.minY,(r.minZ+r.maxZ)/2],centre*3);
 for(let e=0;e<edge.length;e++){const n=(e+1)%edge.length,a=edge[e],b=edge[n],c=grid+e,d=grid+n;tri(a,b,c);tri(b,d,c);tri(centre,c,d);}
 const westernRange={component:'continuous-western-ridge',sourceHills:Array.from({length:10},(_,i)=>i),firstVertex:0,vertices:westVertices,firstTriangle:0,triangles:westernTriangles};
 const ranges=[westernRange],dummy=new THREE.Object3D(),normalMatrix=new THREE.Matrix3(),p=new THREE.Vector3(),n=new THREE.Vector3();
 const setTransform=t=>{dummy.position.set(t[0],t[1],t[2]);dummy.scale.set(t[3],t[4],t[5]);dummy.rotation.set(t[6],t[7],t[8]);dummy.updateMatrix();normalMatrix.getNormalMatrix(dummy.matrix);};
 let vertex=westVertices;
 for(let hill=10;hill<22;hill++){const start=vertex,firstTriangle=next/3;setTransform(batch.transforms[hill]);for(let k=0;k<sourcePosition.count;k++){p.fromBufferAttribute(sourcePosition,k).applyMatrix4(dummy.matrix);p.toArray(positions,vertex++*3);}for(const index of sourceGeometry.index.array)indices[next++]=start+index;ranges.push({hill,firstVertex:start,vertices:sourcePosition.count,firstTriangle,triangles:next/3-firstTriangle});}
 if(vertex!==vertexCount||next!==indices.length)throw Error('Western continuous ridge producer wrote an incomplete buffer');
 const geometry=ownWesternRidgeGeometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeVertexNormals();
 for(const range of ranges.slice(1)){setTransform(batch.transforms[range.hill]);for(let k=0;k<sourceNormal.count;k++){n.fromBufferAttribute(sourceNormal,k).applyNormalMatrix(normalMatrix);n.toArray(normals,(range.firstVertex+k)*3);}}
 const palette=Object.fromEntries(Object.entries(r.palette).map(([key,value])=>[key,new THREE.Color(value)])),c=new THREE.Color();
 for(let k=0;k<vertexCount;k++){
  if(k>=westVertices){c.copy(sourceMaterial.color);const local=(k-westVertices)%sourcePosition.count,sourceUv=sourceGeometry.getAttribute('uv');uv[k*2]=sourceUv.getX(local);uv[k*2+1]=sourceUv.getY(local);}
  else{const x=positions[k*3],y=positions[k*3+1],z=positions[k*3+2],u=(x-r.minX)/(r.maxX-r.minX),v=(z-r.minZ)/(r.maxZ-r.minZ),h=clamp((y-r.minY)/(r.maxY-r.minY)),slope=1-Math.abs(normals[k*3+1]);
   const outcrop=clamp(smoothstep(.12,.48,slope)*.88+smoothstep(.59,.91,h)*.35),gully=westernRelief(u,v).drainage;
   const soil=clamp(gully*.60+(1-smoothstep(.04,.24,h))*.30),warm=.5+.5*Math.sin(z*.043+x*.027+Math.sin(z*.012)*2);
   // Terrain-scale masks span tens of metres; distant frames can read their
   // warm exposed rock / cool planted slopes even after the small maps mip out.
   const layer=.5+.5*Math.sin(y*.16+z*.019+Math.sin(x*.047)*1.8),patch=.5+.5*Math.sin(z*.051+x*.038+Math.sin(z*.021)*2.1);
   c.copy(palette.grass).lerp(palette.grassWarm,warm*.55).lerp(palette.soil,soil).lerp(palette.rock,outcrop);
   c.lerp(palette.rockShade,outcrop*smoothstep(.30,.77,layer)*.48).lerp(palette.rockLight,outcrop*smoothstep(.62,.94,patch)*.26);c.multiplyScalar(.88+.18*patch);
   const tile=r.surface.textureTileMetres,cx=(r.minX+r.maxX)/2,cz=(r.minZ+r.maxZ)/2;
   // Radially expand only below-ground skirt UVs, so vertical side triangles
   // have nonzero texture area without changing any position or normal.
   const skirt=k>=grid&&k<centre,expand=skirt?1.006:1;
   uv[k*2]=(cx+(x-cx)*expand)/tile;uv[k*2+1]=(cz+(z-cz)*expand)/tile;
  }c.toArray(colors,k*3);
 }
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const preparedBytes=indices.byteLength+Object.values(geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,0),producerTypedArrayBytes=preparedBytes+heights.byteLength;
 if(producerTypedArrayBytes>r.maxPreparedBytes||westernTriangles>r.maxWesternTriangles){geometry.dispose();throw Error('Western ridge exceeds its original finite geometry budget');}
 const material=createWestMaterial(THREE),mesh=new THREE.Mesh(geometry,material);
 mesh.userData.westernRidge={recipeVersion:2,sourceHills:22,authoredWesternHills:10,coherentSurface:true,retainedNorthernHills:12,decorativeOnly:true,preparedBytes,producerTypedArrayBytes,producerScratchBytes:heights.byteLength,triangles:triangleCount,westernTriangles,westernRange,hillRanges:ranges};return mesh;
}
