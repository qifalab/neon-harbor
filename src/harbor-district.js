import {createBakedCrustMaterials,createMorningTinCup,createMorningTinCoffee} from './harbor-bread-art.js';
import { addAuthoredGroundElevation,createCraftVesselGeometry } from './harbor-frontage-profiles.js';
import { applySurfaceFinish } from './surface-finish.js';
import { createCraftCeramicOwner } from './harbor-ceramic-art.js';
import { HARBOR_SHOP_DEFS } from './harbor-shop-defs.js';

/** Original small, walkable shopfronts fitted to the existing south-bank shells.
 * This layer does not invent buildings or replace their entrance/interior IDs.
 * A quiet facade proxy stays resident. Furniture, arches, signs and materials
 * are constructed near the walker and destroyed beyond the hysteresis band.
 */
export const HARBOR_FRONTAGES = Object.freeze([
  ['south-091', 'reed-press', '芦岸印房', 'REED PRESS', 'books', 1, '#73968d', 'PRINTS · BOOKS · LETTERS'],
  ['south-092', 'stillwater-cafe', '静潮茶室', 'STILLWATER', 'cafe', 1, '#b69a73', 'TEA · COFFEE · DAILY BAKES'],
  ['south-095', 'tideleaf-market', '潮叶果铺', 'TIDELEAF', 'market', 1, '#73908a', 'FRUIT · HERBS · LOCAL GOODS'],
  ['south-096', 'copper-reed', '铜芦小馆', 'COPPER REED', 'gallery', 1, '#b78973', 'CERAMICS · HANDMADE OBJECTS'],
  ['south-090', 'two-bowls', '双碗面家', 'TWO BOWLS', 'noodles', 0, '#927e68', 'BROTH · NOODLES · LUNCH'],
  ['south-094', 'morning-tin', '晨罐烘焙', 'MORNING TIN', 'bakery', 0, '#a3aa90', 'BREAD · BISCUITS · TEA'],
].map(([shellId,id,name,english,programme,side,color,subtitle]) => Object.freeze({ shellId,id,name,english,programme,side,color,subtitle })));

export const HARBOR_ART_LIMITS = Object.freeze({ near: 72, far: 96, maxDrawCalls: 102, maxTriangles: 110000, maxResidentFrontages: 6 });
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

/** A real rounded rectangular arch, with a closed outer profile and open inset.
 * Extrusion gives the soffit a readable thickness in oblique street views. */
export function createHarborArchGeometry(THREE, width = 4.1, height = 3.38, rim = .19, depth = .22) {
  const rounded = (p,w,h,r,reverse=false) => {
    const x=-w/2, y=0;
    if (!reverse) {
      p.moveTo(x,y); p.lineTo(x+w,y); p.lineTo(x+w,y+h-r);
      p.quadraticCurveTo(x+w,y+h,x+w-r,y+h); p.lineTo(x+r,y+h);
      p.quadraticCurveTo(x,y+h,x,y+h-r); p.lineTo(x,y);
    } else {
      p.moveTo(x,y); p.lineTo(x,y+h-r); p.quadraticCurveTo(x,y+h,x+r,y+h);
      p.lineTo(x+w-r,y+h); p.quadraticCurveTo(x+w,y+h,x+w,y+h-r);
      p.lineTo(x+w,y); p.lineTo(x,y);
    }
  };
  const shape=new THREE.Shape(); rounded(shape,width,height,.8);
  const hole=new THREE.Path(); rounded(hole,width-rim*2,height-rim*2,.61,true);
  // Leave a bottom sill in the profile, rather than overlapping coplanar edges.
  for (const c of hole.curves) { if(c.v0)c.v0.y+=rim; if(c.v1)c.v1.y+=rim; if(c.v2)c.v2.y+=rim; if(c.v3)c.v3.y+=rim; }
  shape.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:1,steps:1,curveSegments:7});
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}

function textileAwning(THREE,width,depth) {
  const p=[],uv=[],ix=[],steps=10;
  for(let i=0;i<=steps;i++) {
    const t=i/steps,z=t*depth, y=3.72-.34*t-.20*t*t;
    p.push(-width/2,y,z,width/2,y,z);uv.push(0,t,1,t);
    if(i<steps){const n=i*2;ix.push(n,n+1,n+2,n+1,n+3,n+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
function leafGeometry(THREE) {
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,-.22,.22,.04,0,.82,0,.22,.22,.04,0,.28,.11],3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute([.5,0,0,.3,.5,1,1,.3,.5,.35],2));
  g.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]);g.computeVertexNormals();return g;
}
// Uniform texel density matches the physical plaque on both axes. Keeping
// these dimensions shared with PlaneGeometry prevents stretched letterforms.
const HARBOR_SIGN_SIZES = Object.freeze({
  shop: Object.freeze({ width: 6.74, height: .47, pixelsPerMeter: 300 }),
  menu: Object.freeze({ width: .66, height: .83, pixelsPerMeter: 1600 }),
});
function signTexture(THREE,spec,kind='shop') {
  if(typeof document==='undefined')return null;
  const size=HARBOR_SIGN_SIZES[kind];
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(size.width*size.pixelsPerMeter);
  canvas.height=Math.round(size.height*size.pixelsPerMeter);
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle=kind==='menu'?'#233b3b':'#e7dfcb';ctx.fillRect(0,0,canvas.width,canvas.height);
  const sx=canvas.width/1024,sy=canvas.height/1024;
  ctx.strokeStyle=kind==='menu'?'#c4b68e':'#8f876f';
  ctx.lineWidth=kind==='menu'?7*sy:3;
  const padX=kind==='menu'?18*sx:8,padY=kind==='menu'?18*sy:8;
  ctx.strokeRect(padX,padY,canvas.width-padX*2,canvas.height-padY*2);
  ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle=kind==='menu'?'#e1d5b9':'#293f40';
  // fitText changes font size uniformly; fillText's maxWidth would condense
  // only the horizontal axis and reintroduce distortion on longer labels.
  const fitText=(text,px,y,maxWidth,weight='400')=>{
    ctx.font=weight+' '+px+'px system-ui,sans-serif';
    const measured=ctx.measureText(text).width;
    if(measured>maxWidth)ctx.font=weight+' '+(px*maxWidth/measured)+'px system-ui,sans-serif';
    ctx.fillText(text,canvas.width/2,y);
  };
  if(kind==='menu') {
    fitText(spec.name,78*sy,145*sy,920*sx,'500');
    const shop=HARBOR_SHOP_DEFS.find(def=>def.buildingId===spec.shellId);
    fitText(shop?'DAILY / 每日供应':'DISPLAY / 店内陈列',32*sy,214*sy,920*sx);
    const lines=shop
      ?[`${shop.productName}  $${shop.price} / 份`,'按份供应  DAILY PORTIONS','现货见柜台  SEE STOCK BOARD']
      :spec.programme==='books'?['小刊  SMALL EDITIONS','旧书  SECONDHAND BOOKS','印章  LETTERPRESS']
      :spec.programme==='gallery'?['陶器  CERAMICS','手作  HANDMADE OBJECTS','釉色  GLAZED PIECES']
      :['面包  DAILY BREAD','饼干  HOUSE BISCUITS','烘焙  FRESH BAKES'];
    lines.forEach((s,i)=>fitText(s,42*sy,(360+i*165)*sy,900*sx));
    fitText(shop?'每日现货 · Served by the quay':'街坊陈列 · Neighborhood display',30*sy,930*sy,900*sx);
  } else {
    fitText(spec.name,72,81,canvas.width-48,'500');
    fitText(spec.shellId==='south-096'?spec.english+' · CERAMICS':spec.english,27,119,canvas.width-48,'600');
  }
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}

// Original generated material maps, not third-party photos. The resolution is
// intentionally low: broad mottling and weathered grout remain calm at distance.
function makeMaterialMaps(THREE,kind) {
  const size=128,color=new Uint8Array(size*size*4),relief=new Uint8Array(size*size*4),roughness=new Uint8Array(size*size*4);
  const noise=(x,y)=>{let n=Math.imul(x+51,374761393)^Math.imul(y+97,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const i=(y*size+x)*4, n=noise(x,y),broad=noise(Math.floor(x/13),Math.floor(y/17));
    const grout=kind==='tile'&&(x%32<2||y%16<2),fibre=kind==='canvas'?(x%3===0?.025:0):0;
    const c=grout?.73:clamp(.93+(broad-.5)*.09+(n-.5)*.045-fibre,0,1);
    const h=grout?.19:clamp(.52+(n-.5)*.13+(broad-.5)*.1,0,1);
    const r=clamp((kind==='tile'?.54:kind==='canvas'?.93:.85)+(n-.5)*.09,0,1);
    for(let k=0;k<3;k++){color[i+k]=Math.round(c*255);relief[i+k]=Math.round(h*255);roughness[i+k]=Math.round(r*255);}color[i+3]=relief[i+3]=roughness[i+3]=255;
  }
  const texture=(data,srgb=false)=>{const t=new THREE.DataTexture(data,size,size);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='canvas'?2:1,kind==='canvas'?2:1);t.generateMipmaps=true;t.minFilter=THREE.LinearMipmapLinearFilter;t.magFilter=THREE.LinearFilter;t.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;t.needsUpdate=true;return t;};
  return {map:texture(color,true),bumpMap:texture(relief),roughnessMap:texture(roughness),bumpScale:kind==='tile'?.013:.009};
}

export function createHarborDistrict(THREE,scene,{buildings=[],groundHeightAt=()=>.18,quality='high'}={}) {
  const root=new THREE.Group();root.name='Harbor sample · authored neighborhood frontages';scene.add(root);
  const resident=new Map(),colliders=[],fixtures=[],materialCache=new Map(),textureSet=new Set(),proxyGroups=new Map(),breadAssetEvents=[];
  let currentQuality=quality,interiorId=null,loads=0,disposedMeshes=0,disposedTriangles=0,night=0,lastViewer={x:0,z:0};
  let scanGeneration=0,scanStarted=false,scannedMaps={},scannedMaterials=new Set(),scanLoaded=0,scanErrors=[];
  const assetBase=new URL('../assets/harbor/materials/',import.meta.url).href;
  function startScannedMaps(){
    if(scanStarted||typeof document==='undefined')return;scanStarted=true;const generation=++scanGeneration,loader=new THREE.TextureLoader();
    for(const [kind,id,meters]of[['plaster','plastered_wall_02',2.23],['pavement','pavement_03',2]]){
      const set={};scannedMaps[kind]=set;
      for(const [channel,suffix]of[['map','diff'],['normalMap','nor_gl'],['roughnessMap','rough']]){
        const tex=loader.load(assetBase+id+'_'+suffix+'_1k.jpg',t=>{
          if(generation!==scanGeneration){t.dispose();return;}scanLoaded++;
          for(const m of scannedMaterials)if(m.userData.scanKind===kind){m[channel]=t;m.needsUpdate=true;}
        },undefined,()=>{if(generation===scanGeneration)scanErrors.push(id+' '+channel);});
        tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(1/meters,1/meters);tex.anisotropy=4;tex.colorSpace=channel==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;set[channel]=tex;textureSet.add(tex);
      }
    }
  }
  function releaseScannedMaps(){scanGeneration++;for(const set of Object.values(scannedMaps))for(const t of Object.values(set)){t.dispose();textureSet.delete(t);}scannedMaps={};scanStarted=false;scanLoaded=0;}
  function scannedMaterial(kind,color,ownedMaterials){
    startScannedMaps();const m=new THREE.MeshStandardMaterial({color,roughness:kind==='pavement'?.84:.91,metalness:0,normalScale:new THREE.Vector2(.65,.65),...(scannedMaps[kind]||maps.plaster)});
    m.name='Harbor · CC0 '+kind;m.userData.scanKind=kind;m.userData.harborArt=true;applySurfaceFinish(m,'mineral',{strength:.28});scannedMaterials.add(m);ownedMaterials.push(m);return m;
  }
  const sites=HARBOR_FRONTAGES.map(spec=>{
    const shell=buildings.find(b=>b.id===spec.shellId||b.shellId===spec.shellId);
    if(!shell)return null;
    const side=spec.side,angle=side*Math.PI/2,out=(side?shell.width:shell.depth)/2;
    const x=shell.x+Math.sin(angle)*out,z=shell.z+Math.cos(angle)*out;
    return {...spec,x,z,width:Math.min(16.4,(side?shell.depth:shell.width)-.8),angle,baseY:shell.baseY??groundHeightAt(x,z),shell};
  }).filter(Boolean);
  const maps=Object.fromEntries(['plaster','tile','canvas'].map(k=>{const m=makeMaterialMaps(THREE,k);for(const t of Object.values(m))if(t?.isTexture)textureSet.add(t);return[k,m];}));
  function mat(key,color,kind='mineral') {
    if(materialCache.has(key))return materialCache.get(key);
    const params={color,roughness:kind==='glass'?.28:kind==='metal'?.56:kind==='ceramic'?.38:.83,metalness:kind==='metal'?.46:.02};
    if(kind==='canvas')Object.assign(params,maps.canvas,{side:THREE.DoubleSide});
    else if(kind==='tile')Object.assign(params,maps.tile);
    else if(kind==='mineral')Object.assign(params,maps.plaster);
    if(kind==='glass')Object.assign(params,{emissive:'#dac39a',emissiveIntensity:.07});
    if(kind==='leaf')params.side=THREE.DoubleSide;
    const material=new THREE.MeshStandardMaterial(params);material.name=`Harbor · ${key}`;
    if(['mineral','tile','metal','canvas','wood'].includes(kind))applySurfaceFinish(material,kind==='canvas'?'cloth':kind==='metal'?'metal':'mineral',{strength:kind==='wood'?.45:.7});
    material.userData.harborArt=true;materialCache.set(key,material);return material;
  }
  const handle=mat('brushed warm brass handle','#d5bd8b','metal');
  handle.roughness=.35;handle.metalness=.55;
  const displayGlass=mat('clear display glazing','#e5eeea','display-glass');
  displayGlass.transparent=true;displayGlass.opacity=.20;displayGlass.depthWrite=false;
  displayGlass.roughness=.18;displayGlass.metalness=.02;displayGlass.emissiveIntensity=0;displayGlass.userData.displayGlass=true;
  const breadCrust=mat('matte baked crust and scored crumb','#ffffff','bread');breadCrust.vertexColors=true;breadCrust.roughness=.94;breadCrust.metalness=0;applySurfaceFinish(breadCrust,'mineral',{strength:.26});
  const glaze=mat('quiet ivory glazed stoneware','#d8c8ac','ceramic');glaze.roughness=.23;glaze.metalness=0;applySurfaceFinish(glaze,'mineral',{strength:.10});
  const clayForm=mat('unglazed warm stoneware','#a97754','clay');clayForm.roughness=.93;clayForm.metalness=0;applySurfaceFinish(clayForm,'mineral',{strength:.26});
  const baseMaterials={breadCrust,glaze,clayForm,handle,displayGlass,stone:mat('salt stone','#d7cbb5'),grout:mat('tile plinth','#66817a','tile'),metal:mat('patinated bronze','#536a64','metal'),wood:mat('oiled timber','#836146','wood'),glass:mat('warm shop glass','#415956','glass'),ceramic:mat('ivory ceramics','#e6d5b5','ceramic'),dark:mat('chalk enamel','#27433e','metal'),leaf:mat('broad subtropical leaves','#487962','leaf'),fruit:mat('ripe citrus','#c58b4f','ceramic'),paper:mat('book paper','#c6b8a0'),brick:mat('baked clay','#b78464','tile')};
  const box=new THREE.BoxGeometry(1,1,1),cylinder=new THREE.CylinderGeometry(1,1,1,10),sphere=new THREE.SphereGeometry(1,10,6),leaf=leafGeometry(THREE);
  const sharedGeometry=[box,cylinder,sphere,leaf];
  const temporary=new THREE.Object3D();
  function localToWorld(site,u,out=0,y=0){return{x:site.x+Math.cos(site.angle)*u+Math.sin(site.angle)*out,y:site.baseY+y,z:site.z-Math.sin(site.angle)*u+Math.cos(site.angle)*out};}
  function collider(site,id,u,y,out,sx,sy,sz) {
    const p=localToWorld(site,u,out,y),cs=Math.abs(Math.cos(site.angle)),sn=Math.abs(Math.sin(site.angle));
    const c={id:`${site.id}-${id}`,kind:'harbor-frontage-furniture',buildingId:site.shellId,x:p.x,z:p.z,hx:(sx*cs+sz*sn)/2,hz:(sx*sn+sz*cs)/2,minY:p.y-sy/2,maxY:p.y+sy/2,physics:true,camera:true};
    colliders.push(c);fixtures.push({id:c.id,shellId:site.shellId,u,out,y,sx,sy,sz,...p});
  }
  // Furniture sits beside the doorway, in the first 1.7 m of the frontage.
  // The outside strip and the entrance centre stay free of physical objects.
  for(const s of sites) {
    for(const u of[-s.width/2+.65,s.width/2-.65])collider(s,`planter-${u<0?'left':'right'}`,u,.36,.88,.85,.72,.82);
    if(['cafe','noodles','bakery'].includes(s.programme))for(const u of[-4.5,4.5]) {
      collider(s,`table-${u}`,u,.42,1.10,1.1,.84,.86);
      for(const d of[-.70,.70])collider(s,`chair-${u}-${d}`,u+d,.44,1.07,.44,.88,.49);
    }
    else for(const u of[-4.55,4.55])collider(s,`display-${u}`,u,.63,.81,2.3,1.26,.94);
  }
  function buildSite(site,detail) {
    const breadOwner=detail&&site.shellId==='south-094'?createBakedCrustMaterials(THREE):null;
    const craftOwner=detail&&site.shellId==='south-096'?createCraftCeramicOwner(THREE):null;
    const siteMaterials=breadOwner?{...baseMaterials,breadCrust:breadOwner.crust,breadCrumb:breadOwner.crumb}:site.shellId==='south-096'?{...baseMaterials,ceramic:glaze,brick:clayForm,...(craftOwner?{glaze:craftOwner.glaze,clayForm:craftOwner.clay}: {})}:baseMaterials;
    const group=new THREE.Group();group.name=`${site.name} · ${detail?'near street art':'far facade proxy'}`;group.userData.shellId=site.shellId;group.position.set(site.x,site.baseY,site.z);group.rotation.y=site.angle;
    const buckets=new Map(),ownedTextures=[],ownedMaterials=[];group.userData.breadOwner=breadOwner;group.userData.craftCeramicOwner=craftOwner;let craftIdentityMaterial=null;
    const add=(material,geometry,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{
      if(!buckets.has(material))buckets.set(material,[]);temporary.position.set(x,y,z);temporary.rotation.set(rx,ry,rz);temporary.scale.set(sx,sy,sz);temporary.updateMatrix();buckets.get(material).push({geometry,matrix:temporary.matrix.clone()});
    };
    const b=(m,x,y,z,sx,sy,sz)=>add(m,box,x,y,z,sx,sy,sz);
    const c=(m,x,y,z,r,h,rx=0,rz=0)=>add(m,cylinder,x,y,z,r,h,r,rx,0,rz);
    const clay=detail?scannedMaterial('plaster',site.color,ownedMaterials):mat(`aged facade ${site.id}`,site.color),canvas=mat(`canvas ${site.programme}`,site.color,'canvas');
    const stone=detail?scannedMaterial('plaster','#ddd1ba',ownedMaterials):siteMaterials.stone;
    if(detail){const paving=scannedMaterial('pavement','#d5c7ad',ownedMaterials);b(paving,0,.015,1.54,site.width,.022,2.47);}
    // Ground panel masks the existing generic shop skin, while the actual
    // original shell remains the collision and interior owner.
    if(!detail){b(clay,0,1.58,.34,site.width,3.12,.20);b(siteMaterials.grout,0,.29,.49,site.width,.58,.12);}
    b(stone,0,3.51,.43,site.width+.15,.21,.35);
    if(!detail) {
      b(siteMaterials.dark,0,2.98,.56,site.width-.65,.56,.11);
      for(const u of[-4.8,0,4.8])b(siteMaterials.glass,u,1.7,.51,3.75,2.35,.08);
    } else {
      group.userData.elevationStyle=addAuthoredGroundElevation(THREE,{site,add,b,c,materials:siteMaterials,clay,stone});
      const awning=textileAwning(THREE,site.width-.3,1.82);add(canvas,awning,0,0,.31);
      // A scalloped fabric valance has a real curved lower edge.
      const scallop=new THREE.Shape();const w=site.width-.3,segments=22;scallop.moveTo(-w/2,0);scallop.lineTo(w/2,0);
      for(let i=segments;i>0;i--){const x=-w/2+i*w/segments;scallop.quadraticCurveTo(x-w/segments/2,-.27,x-w/segments,-.12);}scallop.closePath();
      const sg=new THREE.ShapeGeometry(scallop,5);add(canvas,sg,0,3.18,2.135);
      for(const u of[-site.width/2+.38,site.width/2-.38]){
        c(siteMaterials.metal,u,3.40,1.03,.035,1.85,Math.PI/2-.2);
        b(siteMaterials.metal,u,3.82,.32,.085,.28,.18);
      }
      b(siteMaterials.dark,0,3.02,2.165,6.94,.52,.075);
      const tex=signTexture(THREE,site);if(tex){textureSet.add(tex);ownedTextures.push(tex);const sm=new THREE.MeshStandardMaterial({map:tex,roughness:.75,emissive:'#e2c693',emissiveIntensity:.08,color:'#fff'});if(site.shellId==='south-096'){sm.emissiveIntensity=0;sm.polygonOffset=true;sm.polygonOffsetFactor=-1;sm.polygonOffsetUnits=-2;sm.userData.surfacePaint=true;craftIdentityMaterial=sm;}ownedMaterials.push(sm);add(sm,new THREE.PlaneGeometry(HARBOR_SIGN_SIZES.shop.width,HARBOR_SIGN_SIZES.shop.height),0,3.025,2.208);}
      // Quiet uppercase street numbers and a small menu beside the doorway.
      const menu=signTexture(THREE,site,'menu');if(menu){textureSet.add(menu);ownedTextures.push(menu);const mm=new THREE.MeshStandardMaterial({map:menu,roughness:.85,color:'#fff'});ownedMaterials.push(mm);add(mm,new THREE.PlaneGeometry(HARBOR_SIGN_SIZES.menu.width,HARBOR_SIGN_SIZES.menu.height),2.10,1.54,.79);}
      // A balcony, louvers and rainwater downpipe make the first occupied floor
      // feel connected to the market frontage, rather than a repeated tower tile.
      b(clay,0,5.43,.28,site.width,3.48,.10);
      for(const u of[-4.8,0,4.8]) {
        b(siteMaterials.dark,u,5.3,.38,2.79,2.36,.12);b(siteMaterials.glass,u,5.3,.45,2.48,2.08,.055);
        for(const q of[-1,1])b(siteMaterials.wood,u+q*1.28,5.3,.54,.10,2.24,.13);
        b(siteMaterials.wood,u,5.3,.54,.065,2.21,.13);
        b(stone,u,4.15,.64,2.96,.11,.41);
        for(let i=0;i<6;i++)b(siteMaterials.metal,u-1.12+i*.45,4.64,.84,.026,.91,.035);
        b(siteMaterials.metal,u,5.08,.84,2.74,.042,.055);b(siteMaterials.metal,u,4.2,.84,2.74,.042,.055);
      }
      c(siteMaterials.metal,-site.width/2+.20,3.60,.66,.043,6.99);
      // Slatted blind on one upper bay, with a slightly uneven bottom roll.
      for(let i=0;i<11;i++)b(siteMaterials.wood,-4.8,6.33-i*.092,.61,2.42,.048,.07);
      b(stone,site.width/2-1.16,6.37,.60,1.55,.59,.48);
      for(let i=0;i<6;i++)b(siteMaterials.metal,site.width/2-1.76+i*.23,6.37,.862,.04,.37,.027);
      for(const u of[-site.width/2+.65,site.width/2-.65]) {
        add(siteMaterials.brick,new THREE.CylinderGeometry(.40,.34,.68,12),u,.36,.88);c(siteMaterials.dark,u,.69,.88,.34,.04);
        for(let i=0;i<8;i++){const a=i*Math.PI/4;add(siteMaterials.leaf,leaf,u+.04*Math.cos(a),.69,.88+.04*Math.sin(a),.92,1.08,.92,-.30, a,-.28);}
      }
      function cup(x,y,z){if(site.shellId==='south-094'){add(siteMaterials.ceramic,createMorningTinCup(THREE,{table:true}),x,y,z);add(siteMaterials.dark,createMorningTinCoffee(THREE),x,y+.15,z);return;}const g=new THREE.LatheGeometry([new THREE.Vector2(.08,0),new THREE.Vector2(.10,.02),new THREE.Vector2(.12,.16),new THREE.Vector2(.10,.18),new THREE.Vector2(.092,.15),new THREE.Vector2(.065,.02)],10);add(siteMaterials.ceramic,g,x,y,z);c(siteMaterials.dark,x,y+.15,z,.086,.008);}
      function chair(x,z,turn=0) {
        c(siteMaterials.wood,x,.47,z,.235,.06);
        for(const dx of[-.145,.145])for(const dz of[-.145,.145])c(siteMaterials.metal,x+dx,.24,z+dz,.026,.46);
        const back=new THREE.TorusGeometry(.21,.026,5,12,Math.PI);add(siteMaterials.wood,back,x,.69,z+.19,1,1,1,0,turn,0);
        c(siteMaterials.wood,x-.21,.60,z+.19,.023,.31);c(siteMaterials.wood,x+.21,.60,z+.19,.023,.31);
      }
      if(['cafe','noodles','bakery'].includes(site.programme)) {
        for(const u of[-4.5,4.5]) {
          c(stone,u,.82,1.10,.49,.055);c(siteMaterials.metal,u,.42,1.10,.052,.79);c(siteMaterials.metal,u,.07,1.10,.28,.055);
          chair(u-.70,1.07);chair(u+.70,1.07);
          cup(u-.18,.85,1.03);cup(u+.18,.85,1.17);c(siteMaterials.ceramic,u,.855,1.1,.15,.018);
          if(site.programme==='noodles'){const bowl=new THREE.SphereGeometry(.14,10,6,0,Math.PI*2,Math.PI/2,Math.PI/2);add(siteMaterials.ceramic,bowl,u,.94,1.09);b(siteMaterials.wood,u,.99,1.08,.32,.013,.018);}
        }
      } else {
        for(const u of[-4.55,4.55]) {
          for(const y of[.26,.76,1.20])b(siteMaterials.wood,u,y,.81,2.3,.09,.94);
          for(const d of[-1.1,1.1])b(siteMaterials.metal,u+d,.67,.81,.055,1.3,.88);
          if(site.programme==='market'){
            for(const y of[.82,1.27])for(let i=0;i<6;i++){const x=u-.85+i*.34;c(siteMaterials.wood,x,y-.035,.89,.13,.04);add(siteMaterials.fruit,sphere,x,y+.12,.90,.13,.12,.14);add(siteMaterials.leaf,leaf,x,y+.21,.90,.19,.26,.19,0,0,.4);}
            for(const d of[-1,1])b(siteMaterials.wood,u+d,1.01,.99,.11,.37,.54);
          }else if(site.programme==='books'){
            const bookMaterials=[siteMaterials.brick,siteMaterials.grout,siteMaterials.paper,siteMaterials.dark];
            for(let i=0;i<13;i++){const bm=bookMaterials[i%4],h=.21+(i%3)*.05;b(bm,u-.98+i*.16,.84+h/2,.91,.115,h,.25);b(siteMaterials.paper,u-.98+i*.16,.84+h/2,1.045,.078,h-.045,.015);}
            for(let i=0;i<5;i++)b(bookMaterials[i%4],u-.66+i*.34,1.28,.91,.27,.065,.36);
          }else if(site.shellId==='south-096')for(let i=0;i<2;i++)add(i?siteMaterials.clayForm:siteMaterials.glaze,createCraftVesselGeometry(THREE,.16,.43),u+(i?.50:-.50),1.245,.88,1,i?1:.88,1);
          else for(let i=0;i<4;i++){
            const vase=new THREE.LatheGeometry([new THREE.Vector2(.10,0),new THREE.Vector2(.16,.10),new THREE.Vector2(.15,.27),new THREE.Vector2(.065,.38),new THREE.Vector2(.075,.43)],10);add(i%2?siteMaterials.brick:siteMaterials.ceramic,vase,u-.75+i*.50,1.25,.88,1,.70+(i%2)*.35,1);
          }
        }
      }
      // Bent-wire hanging lights sit under the awning; no floating light boxes.
      for(const u of[-4.8,0,4.8]){c(siteMaterials.metal,u,3.13,1.01,.025,.46);add(siteMaterials.ceramic,new THREE.ConeGeometry(.17,.16,10,1,true),u,2.89,1.01);}
    }
    if(site.shellId==='south-096') {
      if(!craftIdentityMaterial){const tex=signTexture(THREE,site);if(tex){textureSet.add(tex);ownedTextures.push(tex);craftIdentityMaterial=new THREE.MeshStandardMaterial({map:tex,roughness:.83,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});craftIdentityMaterial.userData.surfacePaint=true;ownedMaterials.push(craftIdentityMaterial);}}
      if(craftIdentityMaterial){
        // Repaint only this original south sign face from world.facadeDetails.
        // It is coplanar at out+.205; depth bias avoids z-fighting, not doors.
        const width=Math.min(site.shell.width-1.2,13),parts=[];
        const panel=(w,h,x,plain=false)=>{const g=new THREE.PlaneGeometry(w,h);if(plain){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,.03,.50);}g.translate(x,0,0);parts.push(g);};
        panel(width,.54,0,true);const half=(width-2.5)/2,letterHeight=half/HARBOR_SIGN_SIZES.shop.width*HARBOR_SIGN_SIZES.shop.height;
        panel(half,letterHeight,-(width+2.5)/4);panel(half,letterHeight,(width+2.5)/4);
        const dx=site.shell.x-site.x,dz=site.shell.z+site.shell.depth/2+.205-site.z,co=Math.cos(site.angle),si=Math.sin(site.angle);
        for(const g of parts)add(craftIdentityMaterial,g,co*dx-si*dz,3.02,si*dx+co*dz,1,1,1,0,-site.angle);
      }
    }
    // Collapse the actual curved meshes, props and facade parts by material.
    for(const [material,parts]of buckets){
      const pos=[],norm=[],uvs=[],colors=[];
      for(const {geometry,matrix}of parts){const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.applyMatrix4(matrix);const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');for(let i=0;i<p.count;i++){pos.push(p.getX(i),p.getY(i),p.getZ(i));norm.push(n?.getX(i)??0,n?.getY(i)??1,n?.getZ(i)??0);if(material.vertexColors){const tint=g.getAttribute('color');colors.push(tint?.getX(i)??1,tint?.getY(i)??1,tint?.getZ(i)??1);}if(material.userData.scanKind){const ax=Math.abs(n?.getX(i)||0),ay=Math.abs(n?.getY(i)||0),az=Math.abs(n?.getZ(i)||0);uvs.push(ay>ax&&ay>az?p.getX(i):ax>az?p.getZ(i):p.getX(i),ay>ax&&ay>az?p.getZ(i):p.getY(i));}else uvs.push(uv?.getX(i)??0,uv?.getY(i)??0);}g.dispose();}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(norm,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));if(material.vertexColors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,material);mesh.name=`${site.id} · ${material.name||'original lettering'}`;mesh.castShadow=currentQuality==='high'&&detail&&!material.userData.displayGlass&&!material.userData.surfacePaint;mesh.receiveShadow=true;mesh.userData.noShadow=!detail||!!material.userData.displayGlass||!!material.userData.surfacePaint;group.add(mesh);
    }
    for(const g of new Set([...buckets.values()].flat().map(p=>p.geometry)))if(!sharedGeometry.includes(g))g.dispose();
    group.userData.ownedTextures=ownedTextures;group.userData.ownedMaterials=ownedMaterials;group.userData.triangles=[...buckets.values()].flat().reduce((n,{geometry:g})=>n+(g.index?g.index.count:g.getAttribute('position').count)/3,0);
    group.visible=site.shellId!==interiorId;return group;
  }
  for(const s of sites){const proxy=buildSite(s,false);proxyGroups.set(s.id,proxy);root.add(proxy);}
  function unload(id){const g=resident.get(id);if(!g)return;if(g.userData.breadOwner){const before=g.userData.breadOwner.snapshot();g.userData.breadOwner.dispose();breadAssetEvents.push({kind:'bakery-crust-owner-released',before,after:g.userData.breadOwner.snapshot()});if(breadAssetEvents.length>8)breadAssetEvents.shift();}g.traverse(m=>{if(m.isMesh){disposedMeshes++;disposedTriangles+=m.geometry.getAttribute('position').count/3;m.geometry.dispose();}});for(const t of g.userData.ownedTextures){t.dispose();textureSet.delete(t);}for(const m of g.userData.ownedMaterials){scannedMaterials.delete(m);m.dispose();}g.userData.craftCeramicOwner?.dispose();g.removeFromParent();g.clear();resident.delete(id);proxyGroups.get(id).visible=sites.find(s=>s.id===id).shellId!==interiorId;if(!resident.size)releaseScannedMaps();}
  function update(viewer,dt=0,time=.6){
    const v=viewer?.position||viewer;if(v&&Number.isFinite(v.x)&&Number.isFinite(v.z))lastViewer={x:v.x,z:v.z};
    const hour=time<=1?time*24:time;night=1-clamp(Math.sin((hour-6)/12*Math.PI)*4,0,1);baseMaterials.glass.emissiveIntensity=.025+night*.18;
    for(const s of sites){const d=Math.hypot(lastViewer.x-s.x,lastViewer.z-s.z),near=currentQuality==='low'?50:HARBOR_ART_LIMITS.near;
      if(d<near&&!resident.has(s.id)){const g=buildSite(s,true);root.add(g);resident.set(s.id,g);proxyGroups.get(s.id).visible=false;loads++;}
      else if(d>HARBOR_ART_LIMITS.far&&resident.has(s.id))unload(s.id);
    }
  }
  function snapshot(){let calls=0,triangles=0;root.traverse(m=>{if(m.isMesh&&m.parent.visible){calls++;triangles+=m.geometry.getAttribute('position').count/3;}});
    return{quality:currentQuality,bakedCrust:resident.get('morning-tin')?.userData.breadOwner?.snapshot()||{status:'not-resident',expectedMaps:3,loadedMaps:0,pending:false},breadAssetEvents:[...breadAssetEvents],frontages:sites.map(s=>({id:s.id,shellId:s.shellId,name:s.name,programme:s.programme,x:s.x,z:s.z,baseY:s.baseY,width:s.width,angle:s.angle,publicDoor:{x:s.shell.x,z:s.shell.z+s.shell.depth/2+.64,y:s.baseY,yaw:0},displayFaceHasDoor:s.side===0})),residentFrontages:[...resident.keys()],loads,disposedMeshes,disposedTriangles,drawCalls:calls,triangles,night,interiorBuildingId:interiorId,near:HARBOR_ART_LIMITS.near,far:HARBOR_ART_LIMITS.far,originalMaterials:true,scannedMapsLoaded:scanLoaded,scannedMapsExpected:6,scannedMapErrors:scanErrors,materialSource:'Poly Haven CC0: plastered_wall_02 / pavement_03'};}
  const api={root,colliders,fixtures,update,snapshot,get metadata(){return snapshot();},setQuality(value){currentQuality=value;root.traverse(m=>{if(m.isMesh)m.castShadow=value==='high'&&[...resident.values()].includes(m.parent)&&!m.material.userData.displayGlass&&!m.material.userData.surfacePaint;});},setInteriorBuilding(id){interiorId=id;for(const s of sites){const near=resident.get(s.id);if(near)near.visible=s.shellId!==id;proxyGroups.get(s.id).visible=!near&&s.shellId!==id;}},dispose(){for(const id of [...resident.keys()])unload(id);root.traverse(m=>{if(m.isMesh)m.geometry.dispose();});for(const g of sharedGeometry)g.dispose();for(const t of textureSet)t.dispose();for(const m of materialCache.values())m.dispose();root.removeFromParent();root.clear();}};
  return api;
}
