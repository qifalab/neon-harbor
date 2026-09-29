import { DistrictStreamer, validateCityChunk } from './city-streaming.js';
import { METROPOLIS_BUILDINGS, METROPOLIS_DISTRICTS, METROPOLIS_ROADS } from './metropolis-catalog.js';
import { createMetropolisMaterials } from './metropolis-materials.js';

/** North shore: permanent terrain/collision/silhouettes, independently fetched detail. */
export function createMetropolisWorld(THREE, scene, {
  quality = 'high', streaming = true,
  assetBase = new URL('../assets/metropolis/chunks/', import.meta.url).href,
} = {}) {
  const root = new THREE.Group(); root.name = 'North Shore · 48 addresses'; scene.add(root);
  const colliders = [], staticPool = new Map(), detailPools = new Map();
  const baseMaterials = createMetropolisMaterials(THREE), materials = new Map();
  const geometries = { box: new THREE.BoxGeometry(1, 1, 1), cylinder: new THREE.CylinderGeometry(1, 1, 1, 16),
    sphere: new THREE.SphereGeometry(1, 14, 8), cone: new THREE.ConeGeometry(1, 1, 12),
    arch: archGeometry(THREE), roof: gableGeometry(THREE), dome: new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
  };
  const chunks = [], chunkByBuilding = new Map(), dummy = new THREE.Object3D();
  let interiorId = null, currentQuality = quality;
  for (let row = 0; row < 3; row++) for (let column = 0; column < 4; column++) {
    const id = `north-${column}-${row}`;
    const metadata = { id, x: -480 + column * 320, z: -560 - row * 280, hx: 160, hz: 140, file: `${id}.json` };
    chunks.push(metadata); detailPools.set(id, new Map());
  }
  for (const b of METROPOLIS_BUILDINGS) chunkByBuilding.set(b.id, `north-${Math.floor((b.index % 8) / 2)}-${Math.floor(b.index / 16)}`);

  const palette = {
    stone: '#bfbba8', sidewalk: '#bdb6a5', plaster: '#c9bca6', concrete: '#999d94', roof: '#6a746e',
    asphalt: '#46504f', line: '#dfd4a9', metal: '#536767', brass: '#b49d6b', glass: '#6d959d', glassDark: '#344c56',
    light: '#e4c696', wood: '#9e7b56', brick: '#af8468', dark: '#354344', leaves: '#526e59', trunk: '#79634d',
    water: '#287f8d', sand: '#b4a886', red: '#a87257', awning: '#b79b76', white: '#d6d5c5',
  };
  function material(key) {
    if (materials.has(key)) return materials.get(key);
    const b = key.startsWith('facade:') ? METROPOLIS_BUILDINGS.find(b => b.id === key.slice(7)) : null;
    const base = b ? 'plaster' : key === 'water' ? 'glass' : ['line','white','sand','sidewalk'].includes(key) ? 'stone' : ['brick','red','awning'].includes(key) ? 'plaster' : key === 'trunk' ? 'wood' : key === 'dark' ? 'metal' : key;
    const m = (baseMaterials[base] || baseMaterials.stone).clone();
    if (b) m.color.set(b.color); else if (palette[key]) m.color.set(palette[key]);
    if (key === 'line') { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1; }
    if (key === 'water') { m.roughness = 0.25; m.metalness = 0.5; }
    materials.set(key, m); return m;
  }
  // Payload transforms share the existing validated nine-number chunk schema.
  // Building IDs travel beside transforms so a single interior can hide its shell.
  function stamp(kind, key, x, y, z, sx, sy, sz, { rx = 0, ry = 0, rz = 0, building = null, detail = false } = {}) {
    if (detail && streaming) return;
    const pool = detail ? detailPools.get(chunkByBuilding.get(building)) : staticPool;
    const batchKey = `${kind}|${key}`;
    if (!pool.has(batchKey)) pool.set(batchKey, { kind, material: key, transforms: [], buildings: [] });
    const batch = pool.get(batchKey);
    batch.transforms.push([x,y,z,sx,sy,sz,rx,ry,rz]); batch.buildings.push(building);
  }
  const box = (key, x,y,z, w,h,d, opts) => stamp('box',key,x,y,z,w,h,d,opts);
  const solid = (kind, x,z,hx,hz,minY,maxY, buildingId = null) => {
    const item = { id: `metropolis-${kind}-${colliders.length}`, kind, x,z,hx,hz,minY,maxY,physics:true,camera:true, buildingId };
    colliders.push(item); return item;
  };
  function buildingBox(b, key, x,y,z,w,h,d, detail = false, rotation = 0) {
    box(key,x,y,z,w,h,d,{building:b.id,detail,ry:rotation});
  }
  function beam(b, key, a, c, thickness, detail = true) {
    const dx = c[0]-a[0], dy=c[1]-a[1], dz=c[2]-a[2], length=Math.hypot(dx,dy,dz);
    // Facade trusses sit in an XY plane; Y-axis boxes rotate into their span.
    stamp('box',key,(a[0]+c[0])/2,(a[1]+c[1])/2,(a[2]+c[2])/2,thickness,length,thickness,
      {building:b.id,detail,rz:-Math.atan2(dx,dy),rx:Math.atan2(dz,Math.hypot(dx,dy))});
  }

  // A single dark ground plane is the road surface. Separate block pavements
  // never overlap roads, eliminating coplanar intersection flicker.
  box('asphalt',0,-0.16,-885,1480,0.3,990);
  for (const b of METROPOLIS_BUILDINGS) box('sidewalk',b.x,-0.045,b.z,134,0.09,114);
  box('sidewalk',0,-0.04,-1333,1450,0.08,116);
  box('sidewalk',-704,-0.04,-878,68,0.08,960);
  box('sidewalk',704,-0.04,-878,68,0.08,960);
  for (const x of METROPOLIS_ROADS.vertical) {
    for (let z=-1286; z<-406; z+=17) if (METROPOLIS_ROADS.horizontal.every(r=>Math.abs(r-z)>21)) box('line',x,0.014,z,0.18,0.012,6.5);
    for (const z of METROPOLIS_ROADS.horizontal) for(let i=-4;i<=4;i++) {
      box('white',x+i*1.15,0.02,z+19,0.55,0.012,5);
      box('white',x+i*1.15,0.02,z-19,0.55,0.012,5);
    }
  }
  for(const z of METROPOLIS_ROADS.horizontal) {
    for(let x=-706;x<720;x+=17) if(METROPOLIS_ROADS.vertical.every(r=>Math.abs(r-x)>21)) box('line',x,0.015,z,6.5,0.012,0.18);
    for(const x of METROPOLIS_ROADS.vertical) for(let i=-4;i<=4;i++) {
      box('white',x+20,0.022,z+i*1.15,5,0.012,0.55);
      box('white',x-20,0.022,z+i*1.15,5,0.012,0.55);
    }
  }

  // Harbor crossing has a continuous analytical deck and separate guardrails.
  // Its slope is gentle enough for the existing ground-following car controller.
  const bridgeSegments = 28, bridgeMin=-420, bridgeMax=-280;
  const bridgeHeight = z => 8*Math.sin(Math.PI*(z-bridgeMin)/(bridgeMax-bridgeMin))**2;
  for(let i=0;i<bridgeSegments;i++) {
    const z0=bridgeMin+i*5,z1=z0+5, y0=bridgeHeight(z0), y1=bridgeHeight(z1);
    const slope=Math.atan2(y1-y0,5), mid=(y0+y1)/2;
    box('asphalt',0,mid-0.12,(z0+z1)/2,28,0.24,Math.hypot(5,y1-y0),{rx:-slope});
    for(const x of (z0 >= -405 && z1 <= -295 ? [-15,15] : [])) {
      box('stone',x,mid+0.45,(z0+z1)/2,1.2,0.9,Math.hypot(5,y1-y0),{rx:-slope});
      solid('bridge-rail',x,(z0+z1)/2,0.6,2.6,mid,mid+1.2);
    }
    box('line',0,mid+0.019,(z0+z1)/2,0.16,0.014,2.6,{rx:-slope});
  }
  // Two cable pylons create a readable landmark even from the old city.
  for(const z of [-380,-320]) for(const x of [-17,17]) {
    box('stone',x,24,z,2.5,48,3); solid('bridge-pylon',x,z,1.25,1.5,-2,48);
    for(const dz of [-26,-16,16,26]) {
      const a=new THREE.Vector3(x,43,z),c=new THREE.Vector3(x,bridgeHeight(z+dz)+2,z+dz);
      const direction=c.clone().sub(a),o=new THREE.Object3D();o.position.copy(a).add(c).multiplyScalar(0.5);
      o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.clone().normalize());
      stamp('cylinder','metal',o.position.x,o.position.y,o.position.z,0.09,direction.length(),0.09,{rx:o.rotation.x,ry:o.rotation.y,rz:o.rotation.z});
    }
  }

  // The old harbor sea starts east of x=297; this connects the two shores
  // beneath the actual bridge and ferry route, including the western channel.
  box('water',0,-.38,-347,1480,.12,114);

  // Water margins and cliffs define a coherent island boundary. They have
  // collision independent of the detail chunks, so unloading never opens holes.
  for(const side of [-1,1]) {
    box('stone',side*737,0.8,-885,6,2,990); solid('seawall',side*739,-885,3,495,-5,5);
    box('water',side*922,-0.38,-885,360,0.12,1160);
    for(let i=0;i<10;i++) stamp('cone','leaves',side*(860+i%3*55),35+i%4*12,-580-i*86,70+i%3*18,95+i%4*28,85);
  }
  box('stone',0,0.8,-1378,1480,2,6); solid('mountain-boundary',0,-1382,744,4,-4,35);
  for(let i=0;i<12;i++) stamp('cone','leaves',-780+i*142,30+(i%3)*14,-1490-(i%2)*35,132,140+(i%4)*30,148);
  // Leave real openings for the ferry berth and bridge, including their apron.
  for(const [a,c] of [[-740,-178],[-142,-20],[20,740]]) {
    box('stone',(a+c)/2,.65,-391,c-a,1.3,3);
    solid('harbor-wall',(a+c)/2,-389,(c-a)/2,1.5,-8,2);
  }

  function entrance(b) {
    const z=b.z+b.depth/2, detail={building:b.id,detail:true};
    // Doors sit at the real street-facing plane, with a flush walk-in threshold.
    box('dark',b.x,2.9,z+0.12,10,5.8,0.3,detail);
    // Human-scale double doors sit inside a taller glazed vestibule. Transoms,
    // side lights and shoulder-height pulls make the threshold readable nearby.
    for(const x of [-3.55,3.55]) box('glass',b.x+x,2.55,z+0.34,2.2,5.1,0.12,detail);
    for(const x of [-1.06,1.06]) box('glassDark',b.x+x,1.62,z+0.4,2.02,3.24,.12,detail);
    box('glass',b.x,4.4,z+.34,4.4,2.05,.12,detail);
    for(const x of [-4.8,-2.25,2.25,4.8]) box('brass',b.x+x,2.8,z+0.48,0.16,5.5,0.14,detail);
    box('brass',b.x,1.65,z+.49,.14,3.3,.14,detail);
    box('brass',b.x,3.32,z+.49,4.55,.16,.14,detail);
    for(const x of [-.32,.32]) box('brass',b.x+x,1.35,z+.66,.07,.72,.13,detail);
    box('brass',b.x,5.6,z+0.45,10,0.16,0.2,detail);
    box('metal',b.x,6.2,z+2.6,15,0.32,6,detail);
    box('light',b.x,5.94,z+2.6,12,0.08,0.5,detail);
    for(const x of [-7.2,7.2]) box('stone',b.x+x,2.85,z+3.2,0.4,5.7,0.4,detail);
    // Number plate remains legible even when the name label is out of range.
    box('brass',b.x+8.5,2.6,z+0.36,1.7,1.2,0.2,detail);
  }

  function architecture(b) {
    const {x,z,width:w,depth:d,height:h,style}=b,facade=`facade:${b.id}`;
    const shells=[];
    const B=(key,dx,y,dz,bw,bh,bd,detail=false,rot=0)=>{
      buildingBox(b,key,x+dx,y,z+dz,bw,bh,bd,detail,rot);
      if(key===facade&&!detail&&!rot)shells.push({x:dx,z:dz,w:bw,d:bd,bottom:y-bh/2,top:y+bh/2});
    };
    const S=(kind,key,dx,y,dz,bw,bh,bd,opts={})=>stamp(kind,key,x+dx,y,z+dz,bw,bh,bd,{building:b.id,...opts});
    // Ground-level shell is split around a 12m opening. Roofs and upper shells
    // disappear per address when entering; neighboring buildings stay visible.
    B(facade,-(w+12)/4,3,0,(w-12)/2,6,d);
    B(facade,(w+12)/4,3,0,(w-12)/2,6,d);
    B('dark',0,3,-d/2+1,12,6,2);
    const tiered=['terrace','hotel','spire','crown','lantern','observatory'];
    let facadeTop=h-4;
    if(tiered.includes(style)) {
      const tiers=style==='terrace'?5:style==='spire'?4:3;
      const podium=style==='hotel'?12:8;
      B(facade,0,(podium+6)/2,0,w,podium-6,d);
      for(let level=0;level<tiers;level++) {
        const shrink=style==='terrace'?level*0.12:level*0.085;
        const th=(h-podium-4)/tiers,tw=w*(0.9-shrink),td=d*(0.9-shrink);
        const yy=podium+th*(level+0.5);
        B(facade,0,yy,-level*(style==='terrace'?2:0),tw,th,td);
        B('stone',0,yy+th/2,-level*(style==='terrace'?2:0),tw+1.8,0.6,td+1.8);
        if(style==='terrace') {
          B('leaves',0,yy+th/2+0.8,td/2-level*2,tw-3,1.5,2.1,true);
          for(const xx of [-tw/2+2,tw/2-2])B('leaves',xx,yy+th/2+0.8,-level*2,2,1.5,td,true);
        }
      }
      if(style==='spire') {
        S('cone','metal',0,h+7,0,w*0.2,22,d*0.2);
        B('brass',0,h+25,0,0.7,26,0.7);
      } else if(style==='crown'||style==='lantern') {
        const tw=w*0.5;
        B('glassDark',0,h-2,0,tw,12,d*0.5);
        for(let i=0;i<12;i++) {
          const a=i/12*Math.PI*2;
          B('brass',Math.cos(a)*tw*0.6,h+6,Math.sin(a)*d*0.29,1.1,style==='crown'?18:14,1.1);
        }
        B('light',0,h+8,0,tw,0.7,d*0.5);
      } else if(style==='observatory') {
        S('dome','metal',0,h-2,0,w*0.27,18,d*0.3);
        B('glassDark',0,h-2,d*0.21,3,12,3,false,-0.2);
      } else B('metal',0,h+1,0,w*0.23,3,d*0.25);
    } else if(style==='twin') {
      B(facade,0,9,0,w,6,d);
      for(const dx of [-w*0.29,w*0.29]) {
        B(facade,dx,h/2+4,0,w*0.35,h-8,d*0.82);
        B('metal',dx,h+0.4,0,w*0.37,1,d*0.84);
      }
      B('glass',0,h*0.64,0,w*0.56,8,d*0.45);
      B('leaves',0,h*0.64+4.8,0,w*0.5,1.5,d*0.38,true);
    } else if(['convention','theatre','stadium'].includes(style)) {
      B(facade,0,10,0,w,8,d); facadeTop=16;
      const waves=style==='convention'?4:3;
      for(let i=0;i<waves;i++) {
        const span=w/waves,dx=-w/2+span*(i+0.5);
        S('arch',i%2?'stone':'metal',dx,15,0,span/2,h-15,d,{detail:false});
        for(let q=-2;q<=2;q++)S('arch','brass',dx,15,q*d/5,span/2+0.2,h-14.7,0.4,{detail:true});
      }
      B('glass',0,9,d/2+0.1,w-5,10,0.25,true);
    } else if(style==='sail') {
      for(let i=0;i<8;i++) {
        const ww=w*(1-i*0.085),yy=6+(h-6)/8*(i+0.5);
        B(facade,w*0.03*i,yy,0,ww,(h-6)/8,d*(1-i*0.06));
      }
      beam(b,'brass',[x-w/2,7,z+d/2+.7],[x+w*.15,h,z+d*.28],1.2,false);
      B('brass',w*.15,h+3,0,0.65,12,0.65);
    } else if(style==='dome') {
      B(facade,0,18,0,w,24,d); facadeTop=29;
      S('dome','glassDark',0,30,0,w*0.37,h-30,d*0.42);
      for(let i=-2;i<=2;i++)B('stone',i*w/6,17,d/2+1,2,24,2,true);
    } else if(style==='temple') {
      B(facade,0,11,0,w*.82,10,d*.76);facadeTop=16;
      S('roof','roof',0,18,0,w+5,8,d+5);
      S('roof','roof',0,26,0,w*.6,7,d*.62);
      for(let i=-3;i<=3;i++)B('red',i*w/9,8,d*.43,1,16,1,true);
      B('brass',0,30,0,w*.65,0.6,0.6);
    } else if(['market','industrial'].includes(style)) {
      B(facade,0,(h+4)/2-2,0,w,h-10,d);facadeTop=h-7;
      for(let i=0;i<5;i++) {
        const dz=-d/2+(i+.5)*d/5;
        S('roof','roof',0,h-5,dz,w+1,8,d/5+1);
        B('glass',0,h-4,dz+d/10,w-3,4,0.25,true);
      }
      if(style==='industrial') {
        S('cylinder','brick',w*.38,h*.8,-d*.33,3,h*1.6,3);
        S('cylinder','metal',w*.38,h*1.6,-d*.33,3.4,1,3.4);
      }
    } else if(style==='brutalist') {
      B(facade,0,13,0,w*.7,14,d*.7);
      B(facade,-w*.08,h*.54,0,w,h*.53,d);
      B(facade,w*.13,h*.87,-d*.07,w*.7,h*.23,d*.78);
      B('dark',-w*.38,h*.58,d/2+.1,2,h*.4,.25,true);
    } else if(style==='museum') {
      B(facade,-w*.28,h*.44,0,w*.4,h*.72,d*.95);
      B(facade,w*.28,h*.53,-d*.05,w*.4,h*.9,d*.85);
      B('glass',0,h*.36,0,w*.26,h*.55,d*.65);
      B('brass',w*.28,h+1,-d*.05,w*.41,1.8,d*.86);
      facadeTop=h*.6;
    } else {
      B(facade,0,(h+6)/2-1,0,w,h-8,d);
      B('stone',0,h-1,0,w+1.5,2,d+1.5);
      if(['colonial','clock','campus'].includes(style)) {
        const th=style==='clock'?h*.5:8;
        B(facade,0,h+th/2,-d*.17,w*.23,th,d*.27);
        S('roof','roof',0,h+th+2,-d*.17,w*.29,6,d*.33);
        S('cylinder','white',0,h+th*.65,-d*.17+d*.145,w*.064,0.25,w*.064,{rx:Math.PI/2,detail:true});
        B('dark',0,h+th*.65,-d*.17+d*.15,0.16,w*.07,0.16,true);
      } else if(style==='artdeco') {
        for(let i=0;i<3;i++)B(facade,0,h+i*3,0,w*(.44-i*.09),6,d*(.6-i*.12));
      } else if(style==='civic') {
        B('stone',0,h+1,0,w+7,3,d+7);
        B('brass',0,h+3,0,w*.8,.6,d*.8);
      }
    }

    // The browser never authors all of the detailed facades up front. Only the
    // build pipeline executes this block; runtime obtains its transforms from
    // the requested district JSON. Persistent silhouettes/physics stay above.
    if(!streaming) {
      // Differentiated street fronts: individual bays, inset windows, sills,
      // floor bands and balcony railings all unload with this address's chunk.
      const floorSpacing=h>120?5.2:['shophouse','arcade','residential'].includes(style)?4.5:5.8;
      const levels=Math.max(2,Math.floor((facadeTop-7)/floorSpacing));
      for(let level=0;level<levels;level++) {
        const y=8+level*floorSpacing,bh=Math.min(3.1,floorSpacing*.64);
        const active=shells.filter(part=>y-bh/2>part.bottom&&y+bh/2<part.top);
        // Fenestration follows the authored solid at this exact elevation. This
        // keeps glazing attached on shifted terraces, double towers and museums.
        for(const part of active) {
          const covered=(px,pz)=>active.some(other=>other!==part&&px>other.x-other.w/2-.01&&px<other.x+other.w/2+.01&&pz>other.z-other.d/2-.01&&pz<other.z+other.d/2+.01);
          const count=Math.max(2,Math.floor(part.w/6.8));
          for(let bay=0;bay<count;bay++) {
            const dx=part.x-part.w/2+part.w*(bay+.5)/count,bw=part.w/count*.64;
            const pane=((bay*7+level*11+b.index)%9<2)?'light':(bay+level)%3?'glassDark':'glass';
            for(const side of [-1,1]) {
              const front=part.z+side*(part.d/2+.13);
              if(covered(dx,front))continue;
              B(pane,dx,y,front,bw,bh,.16,true);
              B('stone',dx,y-bh/2-.22,front+side*.2,bw+.45,.3,.65,true);
              if(['residential','shophouse'].includes(style)) {
                B('stone',dx,y-bh/2-.3,front+side*.87,bw+1.4,.24,2.4,true);
                B('metal',dx,y-bh/2+.5,front+side*1.97,bw+1.2,.14,.12,true);
                for(const edge of [-1,1])B('metal',dx+edge*(bw/2+.55),y-bh/2+.1,front+side*1.97,.1,1,.1,true);
                if((bay+level)%3===0)B('leaves',dx,y-bh/2+.02,front+side*1.37,bw*.6,.5,.7,true);
              }
            }
          }
          const sideCount=Math.max(2,Math.floor(part.d/8));
          for(const side of [-1,1])for(let bay=0;bay<sideCount;bay++) {
            const dx=part.x+side*(part.w/2+.14),dz=part.z-part.d/2+part.d*(bay+.5)/sideCount;
            if(!covered(dx,dz))B((bay+level+b.index)%8===0?'light':'glassDark',dx,y,dz,.18,3,Math.min(4,part.d/sideCount*.62),true);
          }
          if(['artdeco','colonial','clock','arcade','exchange'].includes(style))B('stone',part.x,y+2,part.z,part.w+.5,.32,part.d+.5,true);
        }
      }
      if(['fins','diagrid','civic','exchange','artdeco'].includes(style))for(let i=-4;i<=4;i++) {
        const dx=i*w/10;
        B(style==='fins'?'brass':'stone',dx,h*.5,d/2+.7,style==='civic'?2:.8,h-7,1.2,true);
      }
      if(style==='diagrid')for(let i=0;i<5;i++)for(const side of [-1,1]) {
        const yy=7+i*(h-9)/5;
        beam(b,'metal',[x-w/2,yy,z+side*(d/2+1)],[x+w/2,yy+(h-9)/5,z+side*(d/2+1)],.65);
        beam(b,'metal',[x+w/2,yy,z+side*(d/2+1)],[x-w/2,yy+(h-9)/5,z+side*(d/2+1)],.65);
      }
      if(['colonial','arcade','clock','exchange','shophouse'].includes(style))for(let i=-3;i<=3;i++) {
        const dx=i*w/8;
        if(Math.abs(dx)<7)continue;
        B('stone',dx,2.8,d/2+2.1,.8,5.6,.8,true);
        S('arch','stone',dx+w/16,4.5,d/2+2.1,w/16-.3,2.1,.7,{detail:true});
      }
      // Rooftop plant reads as a serviced building rather than a blank toy block.
      if(!['convention','theatre','stadium','dome','temple'].includes(style)) {
        for(const dx of [-w*.12,w*.12]) {
          B('metal',dx,h+1,-d*.12,5,2,6,true);
          S('cylinder','dark',dx,h+2.3,-d*.12,1.65,.5,1.65,{detail:true});
        }
      }
      entrance(b);
      streetscape(b);
    }
    // Collision shells leave the doorway channel open to the interaction point.
    solid('building',x-(w+12)/4,z,(w-12)/4,d/2,0,h,b.id);
    solid('building',x+(w+12)/4,z,(w-12)/4,d/2,0,h,b.id);
    solid('building-back',x,z-d/2+1,6,1,0,h,b.id);
    solid('building-upper',x,z,w/2,d/2,6,h,b.id);
  }

  function streetscape(b) {
    const {x,z,width:w,depth:d}=b,opts={building:b.id,detail:true};
    // Keep both the 12m doorway and the fixed pedestrian perimeter clear.
    for(const side of [-1,1]) {
      const tx=x+side*57,tz=z+45;
      box('stone',tx,.3,tz,5,.6,5,opts);box('leaves',tx,.75,tz,4.5,.9,4.5,opts);
      stamp('cylinder','trunk',tx,3.8,tz,.35,7,.35,opts);
      stamp('sphere','leaves',tx,8,tz,3.4,4,3.4,opts);
      stamp('sphere','leaves',tx+1.8,7.7,tz+.7,2.7,3.2,2.6,opts);
      const lx=x+side*57,lz=z-44;
      stamp('cylinder','metal',lx,4.5,lz,.12,9,.12,opts);
      box('metal',lx+side*.9,8.8,lz,2.3,.14,.22,opts);
      box('light',lx+side*1.7,8.68,lz,.9,.14,.48,opts);
      const bx=x+side*Math.min(w/2+7,60),bz=z+9;
      box('wood',bx,.55,bz,1.1,.14,3.4,opts);box('wood',bx+side*.5,1,bz,.14,.9,3.4,opts);
      for(const dz of [-1.25,1.25])box('metal',bx,.25,bz+dz,.7,.5,.12,opts);
    }
    if(['market','arcade','shophouse','industrial'].includes(b.style))for(const dx of [-w*.3,w*.3]) {
      box(b.index%2?'red':'awning',x+dx,3.5,z+d/2+2.8,9,.25,5,opts);
      box('wood',x+dx,1.1,z+d/2+2.5,7.5,2,1.5,opts);
      for(let n=-2;n<=2;n++)stamp('sphere',n%2?'leaves':'red',x+dx+n*1.1,2.3,z+d/2+2.5,.4,.4,.4,opts);
    }
    // Twin kiosks and waste bins are visual only outside the vehicle lane.
    box('metal',x-w/2-5,0.7,z-d/2-3,1.2,1.4,1.1,opts);
    if(b.index%4===0) {
      box('metal',x+w/2+5,1.5,z-d/2-3,1.7,3,.6,opts);
      box('light',x+w/2+5,1.8,z-d/2-2.65,1.3,1.4,.1,opts);
    }
  }
  for(const b of METROPOLIS_BUILDINGS)architecture(b);

  function buildBatches(batches, name) {
    const group=new THREE.Group();group.name=name;let instances=0;
    for(const batch of batches) {
      const geo=geometries[batch.kind];if(!geo)throw new Error(`Unknown metropolis geometry ${batch.kind}`);
      if(batch.buildings && (batch.buildings.length!==batch.transforms.length||batch.buildings.some(id=>id!==null&&!chunkByBuilding.has(id))))throw new Error('Invalid metropolis building membership');
      const mesh=new THREE.InstancedMesh(geo,material(batch.material),batch.transforms.length);
      // Window panes/paint and streamed trim do not need their own shadow map
      // pass; the permanent shell supplies the building's full silhouette.
      mesh.userData.noShadow=['glass','glassDark','light','line','white','water'].includes(batch.material)||(name!=='North shore silhouettes'&&!['leaves','trunk'].includes(batch.material));
      mesh.castShadow=currentQuality==='high'&&!mesh.userData.noShadow;mesh.receiveShadow=true;mesh.name=`${name} · ${batch.kind} · ${batch.material}`;
      mesh.userData.buildings=batch.buildings||batch.transforms.map(()=>null);
      mesh.userData.originalTransforms=batch.transforms;
      for(let index=0;index<batch.transforms.length;index++) {
        const t=batch.transforms[index];dummy.position.set(t[0],t[1],t[2]);dummy.scale.set(t[3],t[4],t[5]);dummy.rotation.set(t[6],t[7],t[8]);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);
      }
      mesh.computeBoundingSphere();group.add(mesh);instances+=batch.transforms.length;
    }
    group.userData.instances=instances;return group;
  }
  const permanent=buildBatches([...staticPool.values()],'North shore silhouettes');root.add(permanent);
  const liveGroups=new Map();
  function applyInteriorVisibility(group) {
    group.traverse(mesh=>{
      if(!mesh.isInstancedMesh)return;
      const labels=mesh.userData.buildings,transforms=mesh.userData.originalTransforms;
      for(let i=0;i<labels.length;i++) {
        if(!labels[i])continue;
        const t=transforms[i];dummy.position.set(t[0],t[1],t[2]);dummy.rotation.set(t[6],t[7],t[8]);
        dummy.scale.set(...(labels[i]===interiorId?[0,0,0]:t.slice(3,6)));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
    });
  }
  const streamer=streaming?new DistrictStreamer({ chunks,loadRadius:230,unloadRadius:420,prefetchDistance:180,concurrency:3,maxResidentChunks:7,unloadDelay:2.5,
    load:async(meta,signal)=>{
      const response=await fetch(new URL(meta.file,assetBase),{signal});
      if(!response.ok)throw new Error(`North shore ${meta.id}: HTTP ${response.status}`);
      const source=await response.text(),payload=validateCityChunk(JSON.parse(source),meta.id);
      const node=buildBatches(payload.batches,meta.id);return {node,bytes:new TextEncoder().encode(source).length,instances:node.userData.instances,meshes:node.children.length};
    },
    attach:(node,meta)=>{root.add(node);liveGroups.set(meta.id,node);applyInteriorVisibility(node);},
    detach:(node,meta)=>{if(!node)return 0;root.remove(node);liveGroups.delete(meta.id);node.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();});return node.userData.instances||0;},
  }):null;
  if(!streaming)for(const [id,pool]of detailPools) {const node=buildBatches([...pool.values()],id);root.add(node);liveGroups.set(id,node);}

  const labels=typeof document!=='undefined'?createLabels(THREE,METROPOLIS_BUILDINGS):[];
  for(const label of labels)root.add(label);
  return {
    root,colliders,buildings:METROPOLIS_BUILDINGS,districts:METROPOLIS_DISTRICTS,
    landmarks:METROPOLIS_BUILDINGS.map(b=>({id:b.id,name:b.name,x:b.entrance.x,z:b.entrance.z,y:0,type:'building'})),
    groundHeightAt(x,z) {
      if(Math.abs(x)<=14&&z>=bridgeMin&&z<=bridgeMax)return bridgeHeight(z);
      if(x>=-740&&x<=740&&z>=-1380&&z<=-390)return 0;
      return null;
    },
    prepare:position=>streamer?streamer.prepare(position):Promise.resolve({ready:true,failed:[],loaded:12}),
    retry:position=>streamer?streamer.retry(position):Promise.resolve({ready:true,failed:[],loaded:12}),
    update(position,velocity,dt=0) {
      streamer?.update(position,velocity,dt);
      for(const label of labels)label.visible=label.userData.buildingId!==interiorId&&Math.hypot(label.position.x-position.x,label.position.z-position.z)<155;
    },
    setInteriorBuilding(id) {
      if(id===interiorId)return;
      if(id!==null&&!chunkByBuilding.has(id))throw new Error(`Unknown building ${id}`);
      interiorId=id;applyInteriorVisibility(permanent);for(const group of liveGroups.values())applyInteriorVisibility(group);
      for(const label of labels)if(label.userData.buildingId===id)label.visible=false;
    },
    setQuality(value) {currentQuality=value;root.traverse(mesh=>{if(mesh.isMesh)mesh.castShadow=value==='high'&&!mesh.userData.noShadow;});},
    get streamingStats(){return streamer?streamer.stats:{ready:true,loaded:12,pending:0,failed:0,residentInstances:[...liveGroups.values()].reduce((n,g)=>n+g.userData.instances,0),activeChunks:chunks.map(c=>c.id)};},
    exportCity(){return {version:1,chunkSize:320,chunks,payloads:[...detailPools].map(([id,pool])=>({version:1,id,batches:[...pool.values()]}))};},
    dispose(){streamer?.dispose();root.removeFromParent();root.traverse(mesh=>{if(mesh.isInstancedMesh)mesh.dispose();});for(const geo of Object.values(geometries))geo.dispose();for(const m of materials.values())m.dispose();for(const label of labels){label.material.map?.dispose();label.material.dispose();}},
  };
}

function archGeometry(THREE) {
  const shape=new THREE.Shape();shape.moveTo(1,0);shape.absarc(0,0,1,0,Math.PI,false);shape.lineTo(-.84,0);shape.absarc(0,0,.84,Math.PI,0,true);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,curveSegments:14});geometry.translate(0,0,-.5);return geometry;
}
function gableGeometry(THREE) {
  const shape=new THREE.Shape();shape.moveTo(-.5,-.5);shape.lineTo(.5,-.5);shape.lineTo(0,.5);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false});geometry.translate(0,0,-.5);return geometry;
}
function createLabels(THREE,buildings) {
  return buildings.map(b=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=144;
    const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(22,37,40,.92)';ctx.fillRect(0,0,640,144);ctx.fillStyle='#d5bd8c';ctx.fillRect(0,0,7,144);
    ctx.textAlign='center';ctx.fillStyle='#efe6d3';ctx.font='500 38px system-ui, sans-serif';ctx.fillText(b.name,324,59);
    ctx.fillStyle='#aec7c5';ctx.font='22px system-ui, sans-serif';ctx.fillText(`${String(b.index+1).padStart(2,'0')}  ${b.englishName}`,324,101);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:true,depthWrite:false}));
    sprite.position.set(b.x,6.9,b.z+b.depth/2+3.5);sprite.scale.set(13,2.925,1);sprite.userData.buildingId=b.id;sprite.visible=false;return sprite;
  });
}
