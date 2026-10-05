from pathlib import Path
root=Path('/workspace/neon-candidates/visible-western-ridge-mineral-surface-candidate-20261005/repo')
p=root/'src/metropolis-western-ridge.js';s=p.read_text()
s=s.replace("import { applySurfaceFinish } from './surface-finish.js';\n\n",'')
s=s.replace("finish: Object.freeze({ kind: 'mineral', scale: .015, strength: .45 }),\n  palette: Object.freeze({ grass: '#526849', grassWarm: '#6a7453', soil: '#82705d', rock: '#969387' }),", "surface: Object.freeze({ version: 1, mapSize: 128, textureTileMetres: 16, seed: 2026100521, maxAddedResidentBytes: 524288 }),\n  palette: Object.freeze({ grass: '#38513e', grassWarm: '#5b6745', soil: '#78664c', rock: '#948b73', rockShade: '#555d55', rockLight: '#b0aa91' }),")
a=s.index('function installMountainSurface(');b=s.index('/** One static draw',a)
s=s[:a]+'''/** Make only this owner's geometry disposal idempotent. The world owner and
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

'''+s[b:]
s=s.replace('surface=new Float32Array(vertexCount*2)','uv=new Float32Array(vertexCount*2)')
s=s.replace("const geometry=new THREE.BufferGeometry();geometry.setAttribute('position'", "const geometry=ownWesternRidgeGeometry(new THREE.BufferGeometry());geometry.setAttribute('position'")
s=s.replace("if(k>=westVertices){c.copy(sourceMaterial.color);surface[k*2]=sourceMaterial.roughness;surface[k*2+1]=0;}","if(k>=westVertices){c.copy(sourceMaterial.color);const local=(k-westVertices)%sourcePosition.count,sourceUv=sourceGeometry.getAttribute('uv');uv[k*2]=sourceUv.getX(local);uv[k*2+1]=sourceUv.getY(local);}")
a=s.index('   const outcrop=');b=s.index('  }c.toArray(colors,k*3);',a)
s=s[:a]+'''   const outcrop=clamp(smoothstep(.12,.48,slope)*.88+smoothstep(.59,.91,h)*.35),gully=westernRelief(u,v).drainage;
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
'''+s[b:]
s=s.replace("geometry.setAttribute('mountainSurface',new THREE.BufferAttribute(surface,2))","geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2))")
s=s.replace("const material=sourceMaterial.clone();material.name='metropolis-western-ridge';material.color.set('#ffffff');material.vertexColors=true;installMountainSurface(material);const mesh=new THREE.Mesh(geometry,material);", "const material=createWestMaterial(THREE),mesh=new THREE.Mesh(geometry,material);")
p.write_text(s)
p=root/'src/metropolis-northern-ridge.js';s=p.read_text().replace("import {createWesternMountainBatch}","import {createWesternMountainBatch,ownWesternRidgeGeometry}")
s=s.replace("['color',colors],['mountainSurface',surface]", "['color',colors]")
s=s.replace("const westernGeometry=new THREE.BufferGeometry();", "const westernGeometry=ownWesternRidgeGeometry(new THREE.BufferGeometry());")
s=s.replace("['position','normal','color','mountainSurface']", "['position','normal','color','uv']")
p.write_text(s)
