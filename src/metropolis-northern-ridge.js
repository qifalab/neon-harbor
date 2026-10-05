import {createWesternMountainBatch} from './metropolis-western-ridge.js';
import {applySurfaceFinish} from './surface-finish.js';

/** Original decorative northern backdrop. It never supplies ground/collision,
 * changes streaming, or declares the rendered slopes explorable. */
export const NORTHERN_RIDGE_RECIPE=Object.freeze({version:1,xSegments:192,zSegments:40,sourceNorthernHills:12,minX:-912,maxX:914,minZ:-1673,maxZ:-1342,minY:-57,maxY:173,maxNorthernTriangles:18000,maxPreparedBytes:1100000,mapSize:256,textureTileMetres:24,seed:2026100512});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(v)=>{v=clamp(v);return v*v*(3-2*v);};
const gauss=(v,w)=>Math.exp(-((v/w)**2));
/** One wandering lateral spine with unequal broad summit masses and front
 * shoulders. Drainage incises branching oblique gullies, not repeated cones. */
function relief(x,z){
 const r=NORTHERN_RIDGE_RECIPE,t=(x-r.minX)/(r.maxX-r.minX),v=(z-r.minZ)/(r.maxZ-r.minZ),spine=.49+.073*Math.sin(t*8.7+.6)+.034*Math.sin(t*19.2);
 const large=.50+.30*gauss(t-.18,.15)+.48*gauss(t-.62,.19)+.28*gauss(t-.87,.08);
 const ridge=large*gauss(v-spine,.20),shoulder=.30*gauss(v-.75-.025*Math.sin(t*16),.18)*( .64+.36*Math.cos(t*11-.7)**2);
 const back=.19*gauss(v-.20,.14)*( .70+.30*Math.sin(t*17+.9)**2);
 let gullies=0;for(const [centre,width,depth,bend]of [[.075,.018,.13,.12],[.28,.025,.20,-.15],[.43,.015,.12,.18],[.55,.020,.18,-.11],[.76,.026,.22,.15],[.93,.017,.12,-.10]]){const line=centre+bend*(v-spine)+.011*Math.sin(v*11+centre*17);gullies+=depth*gauss(t-line,width)*gauss(v-.71,.25);}
 const shoulderRipple=.018*Math.sin(t*99+v*17)+.012*Math.sin(t*173-v*41);
 const edge=smooth(t/.035)*smooth((1-t)/.035)*smooth(v/.11)*smooth((1-v)/.11);
 return Math.max(0,.06+ridge+shoulder+back-gullies+shoulderRipple)*edge;
}
function createOriginalNorthernMaps(THREE){
 const size=NORTHERN_RIDGE_RECIPE.mapSize,n=new Uint8Array(size*size*4),r=new Uint8Array(n.length);
 const sample=(u,v)=>{const warp=.20*Math.sin(v*8*Math.PI)+.09*Math.sin(u*12*Math.PI);return .32*Math.sin((v*13+warp)*2*Math.PI)+.15*Math.sin((u*29-v*17)*2*Math.PI)+.08*Math.cos((u*67+v*53)*2*Math.PI);};
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){const u=i/size,v=j/size,k=(j*size+i)*4,h=sample(u,v),dx=(sample(u+1/size,v)-sample(u-1/size,v))*.30,dy=(sample(u,v+1/size)-sample(u,v-1/size))*.30,inv=1/Math.hypot(dx,dy,1);n[k]=Math.round((-.5*dx*inv+.5)*255);n[k+1]=Math.round((-.5*dy*inv+.5)*255);n[k+2]=Math.round((.5*inv+.5)*255);n[k+3]=255;const rough=Math.round(clamp(.90+h*.075,.81,.96)*255);r[k]=r[k+1]=r[k+2]=rough;r[k+3]=255;}
 const normal=new THREE.DataTexture(n,size,size),roughness=new THREE.DataTexture(r,size,size);for(const [name,t]of[['normal',normal],['roughness',roughness]]){t.name=`Northern ridge original ${name}`;t.colorSpace=THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.needsUpdate=true;}return{normal,roughness};
}
function createNorthMaterial(THREE,maps){
 const material=new THREE.MeshStandardMaterial({color:'#ffffff',vertexColors:true,roughness:1,metalness:0,normalMap:maps.normal,roughnessMap:maps.roughness,normalScale:new THREE.Vector2(.65,.65)});
 material.name='metropolis-original-northern-ridge';applySurfaceFinish(material,'mineral',{scale:.015,strength:.30});
 let disposed=false;const dispose=()=>{if(disposed)return;disposed=true;maps.normal.dispose();maps.roughness.dispose();};material.addEventListener('dispose',dispose);return{material,maps,dispose};
}
/** Preserve the first ten western surfaces byte-for-byte, replace only the
 * twelve northern cone ranges, and use one separate standard-material draw for the northern ridge. */
export function createNorthernHarborRidgeBatch(THREE,batch,sourceGeometry,sourceMaterial){
 const mesh=createWesternMountainBatch(THREE,batch,sourceGeometry,sourceMaterial),old=mesh.geometry,west=mesh.userData.westernRidge.hillRanges.slice(0,10),westVertices=west.at(-1).firstVertex+west.at(-1).vertices,westIndices=mesh.userData.westernRidge.westernTriangles*3,r=NORTHERN_RIDGE_RECIPE;
 const nx=r.xSegments,nz=r.zSegments,grid=(nx+1)*(nz+1),edgeVertices=2*(nx+1)+2*(nz-1),northVertices=grid+edgeVertices+1,count=westVertices+northVertices;
 const positions=new Float32Array(count*3),normals=new Float32Array(count*3),colors=new Float32Array(count*3),surface=new Float32Array(count*2),uv=new Float32Array(count*2),mask=new Float32Array(count),indices=[];
 for(const [key,array]of[['position',positions],['normal',normals],['color',colors],['mountainSurface',surface]])array.set(old.attributes[key].array.subarray(0,westVertices*old.attributes[key].itemSize));
 for(let i=0;i<westIndices;i++)indices.push(old.index.getX(i));
 const heights=new Float64Array(grid);let high=0;for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const k=j*(nx+1)+i,x=r.minX+(r.maxX-r.minX)*i/nx,z=r.minZ+(r.maxZ-r.minZ)*j/nz;heights[k]=relief(x,z);high=Math.max(high,heights[k]);}
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const local=j*(nx+1)+i,k=westVertices+local,x=r.minX+(r.maxX-r.minX)*i/nx,z=r.minZ+(r.maxZ-r.minZ)*j/nz;positions.set([x,r.minY+1+heights[local]/high*(r.maxY-r.minY-1),z],k*3);uv.set([x/r.textureTileMetres,z/r.textureTileMetres],k*2);mask[k]=1;surface.set([.90,1],k*2);}
 const tri=(a,b,c)=>indices.push(a,b,c);for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=westVertices+j*(nx+1)+i;tri(a,a+nx+1,a+1);tri(a+1,a+nx+1,a+nx+2);}
 const edge=[];for(let i=0;i<=nx;i++)edge.push(i);for(let j=1;j<=nz;j++)edge.push(j*(nx+1)+nx);for(let i=nx-1;i>=0;i--)edge.push(nz*(nx+1)+i);for(let j=nz-1;j>0;j--)edge.push(j*(nx+1));
 const bottom=westVertices+grid;for(let e=0;e<edge.length;e++){const top=westVertices+edge[e],k=bottom+e;positions.set([positions[top*3],r.minY,positions[top*3+2]],k*3);mask[k]=1;surface.set([.94,1],k*2);uv.set([positions[k*3]/r.textureTileMetres,positions[k*3+2]/r.textureTileMetres],k*2);}
 const centre=bottom+edge.length;positions.set([(r.minX+r.maxX)/2,r.minY,(r.minZ+r.maxZ)/2],centre*3);mask[centre]=1;surface.set([.94,1],centre*2);
 for(let e=0;e<edge.length;e++){const n=(e+1)%edge.length,a=westVertices+edge[e],b=westVertices+edge[n],c=bottom+e,d=bottom+n;tri(a,b,c);tri(b,d,c);tri(centre,c,d);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();const computed=geometry.attributes.normal.array;normals.set(computed.subarray(westVertices*3),westVertices*3);geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
 const grass=new THREE.Color('#536b46'),soil=new THREE.Color('#80705a'),rock=new THREE.Color('#96978a'),c=new THREE.Color();
 for(let k=westVertices;k<count;k++){const x=positions[k*3],y=positions[k*3+1],z=positions[k*3+2],slope=1-Math.abs(normals[k*3+1]),h=(y-r.minY)/(r.maxY-r.minY),rockMix=clamp((slope-.20)*1.6+smooth((h-.66)/.34)*.42),soilMix=clamp(.10+.21*Math.sin(x*.038+z*.064)**2+.35*(1-smooth(h/.18)));c.copy(grass).lerp(soil,soilMix).lerp(rock,rockMix);c.multiplyScalar(.98+.035*Math.sin(x*.065-z*.027));c.toArray(colors,k*3);}
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('mountainSurface',new THREE.BufferAttribute(surface,2));geometry.setAttribute('northernUV',new THREE.BufferAttribute(uv,2));geometry.setAttribute('northernMask',new THREE.BufferAttribute(mask,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const northernTriangles=(indices.length-westIndices)/3,preparedBytes=geometry.index.array.byteLength+Object.values(geometry.attributes).reduce((n,a)=>n+a.array.byteLength,0);if(northernTriangles>r.maxNorthernTriangles||preparedBytes>r.maxPreparedBytes){geometry.dispose();mesh.material.dispose();old.dispose();throw Error('Northern ridge geometry budget exceeded');}
 const westernGeometry=new THREE.BufferGeometry();
 for(const name of ['position','normal','color','mountainSurface']){const a=old.attributes[name];westernGeometry.setAttribute(name,new THREE.BufferAttribute(a.array.slice(0,westVertices*a.itemSize),a.itemSize));}
 westernGeometry.setIndex(Array.from(old.index.array.slice(0,westIndices)));westernGeometry.computeBoundingBox();westernGeometry.computeBoundingSphere();
 const northGeometry=new THREE.BufferGeometry();northGeometry.setAttribute('position',new THREE.BufferAttribute(positions.slice(westVertices*3),3));northGeometry.setAttribute('normal',new THREE.BufferAttribute(normals.slice(westVertices*3),3));northGeometry.setAttribute('color',new THREE.BufferAttribute(colors.slice(westVertices*3),3));northGeometry.setAttribute('uv',new THREE.BufferAttribute(uv.slice(westVertices*2),2));northGeometry.setIndex(indices.slice(westIndices).map(i=>i-westVertices));northGeometry.computeBoundingBox();northGeometry.computeBoundingSphere();
 const maps=createOriginalNorthernMaps(THREE),resources=createNorthMaterial(THREE,maps),northMesh=new THREE.Mesh(northGeometry,resources.material);northMesh.receiveShadow=true;northMesh.userData.decorativeNorthernRidge=true;northMesh.userData.noShadow=false;
 mesh.geometry=westernGeometry;geometry.dispose();old.dispose();mesh.northernRidgeMesh=northMesh;
 const westBytes=westernGeometry.index.array.byteLength+Object.values(westernGeometry.attributes).reduce((n,a)=>n+a.array.byteLength,0),northBytes=northGeometry.index.array.byteLength+Object.values(northGeometry.attributes).reduce((n,a)=>n+a.array.byteLength,0);
 mesh.userData.westernRidge={...mesh.userData.westernRidge,retainedNorthernHills:0,triangles:westIndices/3,preparedBytes:westBytes,hillRanges:west};
 northMesh.userData.northernRidge={recipeVersion:1,decorativeOnly:true,sourceNorthernCones:12,coherentSurface:true,vertices:northVertices,triangles:northernTriangles,preparedBytes:northBytes,backdropPreparedBytes:westBytes+northBytes,drawCalls:1,totalBackdropDrawCalls:2,independentStandardMaterial:true,maps:2,mapSize:256,mapRGBA8BaseBytes:2*256*256*4,mapRGBA8FullMipBytes:2*4*Array.from({length:9},(_,i)=>(256>>i)**2).reduce((a,b)=>a+b,0)};
 northMesh.userData.northernRidgeResources=resources;return mesh;
}
