import { applySurfaceFinish } from './surface-finish.js';

/** Original editable continuous western channel ridge. Decorative only:
 * preserve the original union envelope and original twelve northern source
 * cones, never change collision, ground support or streaming. */
export const WESTERN_RIDGE_RECIPE = Object.freeze({
  version: 2, xSegments: 32, zSegments: 112, sourceWesternHills: 10,
  minX: -1076, maxX: -790, minZ: -1439, maxZ: -495, minY: -18.5, maxY: 160.5,
  maxHillTriangles: 3000, maxWesternTriangles: 30000, maxPreparedBytes: 300000,
  finish: Object.freeze({ kind: 'mineral', scale: .015, strength: .45 }),
  palette: Object.freeze({ grass: '#526849', grassWarm: '#6a7453', soil: '#82705d', rock: '#969387' }),
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

function installMountainSurface(material) {
  applySurfaceFinish(material, WESTERN_RIDGE_RECIPE.finish.kind, WESTERN_RIDGE_RECIPE.finish);
  const previousCompile = material.onBeforeCompile, previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = shader => {
    previousCompile(shader);
    shader.vertexShader = shader.vertexShader.replace('#include <common>',
      '#include <common>\nattribute vec2 mountainSurface;\nvarying vec2 vMountainSurface;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvMountainSurface = mountainSurface;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>',
      '#include <common>\nvarying vec2 vMountainSurface;');
    // Surface response is per vertex. Northern originals have mask zero,
    // so their uniform .93 response receives no extra grain/tone/relief.
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = vMountainSurface.x;');
    shader.fragmentShader = shader.fragmentShader.replace('roughnessFactor = clamp(roughnessFactor +',
      'roughnessFactor = clamp(roughnessFactor + vMountainSurface.y *');
    shader.fragmentShader = shader.fragmentShader.replace('diffuseColor.rgb *= 1.0 +',
      'diffuseColor.rgb *= 1.0 + vMountainSurface.y *');
    shader.fragmentShader = shader.fragmentShader.replace('float nhRelief = nhDetail *',
      'float nhRelief = vMountainSurface.y * nhDetail *');
  };
  material.customProgramCacheKey = () => `${previousKey}:western-ridge-v2:surface-mask`;
  material.userData.westernMountainSurface = { recipeVersion: 2, worldBaked: true, northernFinishMask: 0 };
  material.needsUpdate = true;
}

/** One static draw for the connected West surface and exact original North
 * source cones. Northern owner extracts the explicit westernRange and replaces
 * those twelve source cones with its existing, unchanged independent ridge. */
export function createWesternMountainBatch(THREE,batch,sourceGeometry,sourceMaterial){
 validateSourceBatch(batch,sourceGeometry);
 const r=WESTERN_RIDGE_RECIPE,nx=r.xSegments,nz=r.zSegments,grid=(nx+1)*(nz+1),edgeCount=2*(nx+nz),westVertices=grid+edgeCount+1;
 const sourcePosition=sourceGeometry.getAttribute('position'),sourceNormal=sourceGeometry.getAttribute('normal'),northVertices=12*sourcePosition.count,vertexCount=westVertices+northVertices,westernTriangles=nx*nz*2+edgeCount*3,triangleCount=westernTriangles+12*sourceGeometry.index.count/3;
 const positions=new Float32Array(vertexCount*3),normals=new Float32Array(vertexCount*3),colors=new Float32Array(vertexCount*3),surface=new Float32Array(vertexCount*2),indices=new Uint16Array(triangleCount*3),heights=new Float64Array(grid);
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
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeVertexNormals();
 for(const range of ranges.slice(1)){setTransform(batch.transforms[range.hill]);for(let k=0;k<sourceNormal.count;k++){n.fromBufferAttribute(sourceNormal,k).applyNormalMatrix(normalMatrix);n.toArray(normals,(range.firstVertex+k)*3);}}
 const palette=Object.fromEntries(Object.entries(r.palette).map(([key,value])=>[key,new THREE.Color(value)])),c=new THREE.Color();
 for(let k=0;k<vertexCount;k++){
  if(k>=westVertices){c.copy(sourceMaterial.color);surface[k*2]=sourceMaterial.roughness;surface[k*2+1]=0;}
  else{const x=positions[k*3],y=positions[k*3+1],z=positions[k*3+2],u=(x-r.minX)/(r.maxX-r.minX),v=(z-r.minZ)/(r.maxZ-r.minZ),h=clamp((y-r.minY)/(r.maxY-r.minY)),slope=1-Math.abs(normals[k*3+1]);
   const outcrop=clamp(smoothstep(.19,.55,slope)*.90+smoothstep(.62,.94,h)*.43),gully=westernRelief(u,v).drainage;
   const soil=clamp(gully*.60+(1-smoothstep(.04,.24,h))*.32),warm=.5+.5*Math.sin(z*.008+x*.017);
   const band=.90+.13*smoothstep(-.45,.65,Math.sin(y*.21+z*.006));
   c.copy(palette.grass).lerp(palette.grassWarm,warm*.25).lerp(palette.soil,soil).lerp(palette.rock,outcrop);c.multiplyScalar(band);
   surface[k*2]=(.98*(1-soil)+.94*soil)*(1-outcrop)+.86*outcrop;surface[k*2+1]=1;
  }c.toArray(colors,k*3);
 }
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.setAttribute('mountainSurface',new THREE.BufferAttribute(surface,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const preparedBytes=indices.byteLength+Object.values(geometry.attributes).reduce((sum,a)=>sum+a.array.byteLength,0),producerTypedArrayBytes=preparedBytes+heights.byteLength;
 if(producerTypedArrayBytes>r.maxPreparedBytes||westernTriangles>r.maxWesternTriangles){geometry.dispose();throw Error('Western ridge exceeds its original finite geometry budget');}
 const material=sourceMaterial.clone();material.name='metropolis-western-ridge';material.color.set('#ffffff');material.vertexColors=true;installMountainSurface(material);const mesh=new THREE.Mesh(geometry,material);
 mesh.userData.westernRidge={recipeVersion:2,sourceHills:22,authoredWesternHills:10,coherentSurface:true,retainedNorthernHills:12,decorativeOnly:true,preparedBytes,producerTypedArrayBytes,producerScratchBytes:heights.byteLength,triangles:triangleCount,westernTriangles,westernRange,hillRanges:ranges};return mesh;
}
