import { HARBOR_FRONTAGES } from './harbor-district.js';
import { applySurfaceFinish } from './surface-finish.js';

/** Small authored objects on the actual sample-room furniture. This layer never
 * creates a new floor obstacle: every low detail is inside its supporting part,
 * while wall objects sit above head height. World-space metadata is inspectable.
 */
export function createHarborRoomDressing(THREE,{building,floor,layout}={}) {
  const group=new THREE.Group();group.name='Harbor sample · room craft';
  const spec=HARBOR_FRONTAGES.find(s=>s.shellId===(building?.shellId||building?.id));
  if(!spec||!layout||!floor)return{group,colliders:[],snapshot:()=>({enabled:false,drawCalls:0,triangles:0,details:[]}),dispose:()=>group.clear()};
  group.position.set(building.x,floor.y,building.z);
  const geometries=new Set(),materials=new Set(),textures=new Set(),buckets=new Map(),details=[],temp=new THREE.Object3D();
  const material=(name,color,roughness=.75,kind='mineral')=>{const m=new THREE.MeshStandardMaterial({name:'Harbor room · '+name,color,roughness,metalness:kind==='metal'?.42:0});applySurfaceFinish(m,kind,{strength:.65});materials.add(m);return m;};
  const ceramic=material('cream glaze','#e3d3b5',.32),clay=material('iron clay','#aa785b',.6),brass=material('brushed brass','#a39869',.42,'metal'),wood=material('warm timber','#8b674b',.79),dark=material('tea enamel','#35534d',.63),paper=material('paper','#ddd1b6',.89),fabric=material('linen','#b9aa8d',.93,'cloth'),red=material('book cloth','#996b58',.86,'cloth'),leaf=material('herb leaves','#507b61',.87),bread=material('baked goods','#be9b60',.84);
  const box=new THREE.BoxGeometry(1,1,1),cyl=new THREE.CylinderGeometry(1,1,1,10),sphere=new THREE.SphereGeometry(1,10,6);for(const g of[box,cyl,sphere])geometries.add(g);
  const add=(m,g,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0)=>{geometries.add(g);if(!buckets.has(m))buckets.set(m,[]);temp.position.set(x-building.x,y-floor.y,z-building.z);temp.rotation.set(rx,ry,rz);temp.scale.set(sx,sy,sz);temp.updateMatrix();buckets.get(m).push({g,matrix:temp.matrix.clone()});};
  const b=(m,x,y,z,sx,sy,sz)=>add(m,box,x,y,z,sx,sy,sz),c=(m,x,y,z,r,h,rx=0,rz=0)=>add(m,cyl,x,y,z,r,h,r,rx,0,rz);
  const cup=(x,y,z,scale=1)=>{const g=new THREE.LatheGeometry([new THREE.Vector2(.075,0),new THREE.Vector2(.10,.02),new THREE.Vector2(.12,.16),new THREE.Vector2(.115,.18),new THREE.Vector2(.10,.16),new THREE.Vector2(.065,.03)],12);add(ceramic,g,x,y,z,scale,scale,scale);c(dark,x,y+.155*scale,z,.088*scale,.008);const handle=new THREE.TorusGeometry(.06,.016,5,9,Math.PI*1.7);add(ceramic,handle,x+.115*scale,y+.10*scale,z,scale,scale,scale);};
  const teapot=(x,y,z,scale=1)=>{add(dark,sphere,x,y+.16*scale,z,.20*scale,.15*scale,.19*scale);c(dark,x,y+.29*scale,z,.11*scale,.035);add(brass,sphere,x,y+.325*scale,z,.035*scale,.027*scale,.035*scale);const handle=new THREE.TorusGeometry(.15,.023,5,11,Math.PI*1.55);add(wood,handle,x,y+.23*scale,z,scale,scale,scale);const spout=new THREE.ConeGeometry(.055,.22,10);add(dark,spout,x+.19*scale,y+.19*scale,z,scale,scale,scale,0,0,-.72);};
  const book=(x,y,z,sx=.32,sz=.22,stack=0)=>{const m=stack%2?dark:red;b(m,x,y+.027,z,sx,.054,sz);b(paper,x,y+.028,z+.003,sx-.015,.034,sz-.012);b(m,x,y+.053,z,sx,.008,sz);};
  const record=(p,kind,zone)=>details.push({kind,ownerPartId:p.id,roomId:p.roomId||null,zone,bounds:{minX:p.x-p.sx/2,maxX:p.x+p.sx/2,minZ:p.z-p.sz/2,maxZ:p.z+p.sz/2},supportY:p.y+p.sy/2});
  const furniture=layout.parts.filter(p=>/coffee-table|dining-table|cafe-table|shop-counter|countertop|display-shelf|market-rack|workbench|bakery|display-table|ceramic-display/.test(p.kind));
  // Deduplicate surfaces when a countertop and its carcass share a footprint.
  const seen=new Set();for(const p of furniture){const key=[p.x.toFixed(2),p.z.toFixed(2),p.kind==='shop-counter'?'counter':p.kind].join(':');if(seen.has(key))continue;seen.add(key);const y=p.y+p.sy/2+.008;
    if(p.sy>.3&&!/counter|workbench|rack|shelf/.test(p.kind))continue;
    if(p.sx<.55||p.sz<.40)continue;
    if(p.kind==='display-shelf')continue; // Existing populated shelves already own their books and vases.
    if(p.kind==='shop-counter'&&layout.parts.some(q=>q.kind==='countertop'&&Math.hypot(q.x-p.x,q.z-p.z)<.05))continue;
    const room=layout.rooms.find(r=>r.id===p.roomId),type=room?.type||spec.programme;record(p,type,'existing furniture top');
    const lx=Math.min(.50,p.sx*.28),lz=Math.min(.19,p.sz*.25);
    if(!/produce|market|bakery/.test(type))b(fabric,p.x,y+.008,p.z,Math.min(1.15,p.sx*.78),.016,Math.min(.46,p.sz*.72));
    if(/book|workshop/.test(type)||spec.programme==='books'&&floor.id==='lobby'){
      for(let i=0;i<4;i++)book(p.x-lx+i*lx*.60,y+.02+(i%2)*.057,p.z,Math.min(.32,p.sx*.2),Math.min(.23,p.sz*.45),i);
      c(brass,p.x+lx,y+.014,p.z-lz,.10,.025);b(wood,p.x+lx,y+.07,p.z-lz,.05,.11,.04);
    }else if(/produce|market|bakery/.test(type)){
      // Existing goods and crates already occupy this counter. The price card
      // uses the clear front lip, instead of putting a second pile through them.
      const edge=p.z+p.sz/2-.035;b(brass,p.x,y+.02,edge,.38,.035,.06);b(paper,p.x,y+.095,edge,.34,.15,.018);
      for(let i=0;i<4;i++)b(dark,p.x-.12+i*.08,y+.10,edge+.012,.018,.046,.006);
      if(type==='bakery')for(const q of layout.parts.filter(q=>q.roomId===p.roomId&&q.kind==='shop-goods'&&Math.abs(q.x-p.x)<p.sx/2&&Math.abs(q.z-p.z)<p.sz/2))for(let i=0;i<3;i++)b(wood,q.x-.04+i*.04,q.y+q.sy/2+.003,q.z,.009,.006,.085);
    }else if(/cafe|dining|tea/.test(type)){
      // Detail the actual existing cups with handles, coffee and saucers.
      const existingCups=layout.parts.filter(q=>q.roomId===p.roomId&&q.material==='ceramic'&&q.geometry==='cylinder'&&q.sy<.24&&q.y>floor.y+.7&&Math.abs(q.x-p.x)<p.sx/2&&Math.abs(q.z-p.z)<p.sz/2);
      for(const q of existingCups){
        c(ceramic,q.x,q.y-q.sy/2-.004,q.z,.105,.013);c(dark,q.x,q.y+q.sy/2+.004,q.z,q.sx*.38,.006);
        const h=new THREE.TorusGeometry(.045,.013,5,9,Math.PI*1.65);add(ceramic,h,q.x+q.sx*.48,q.y,q.z);
      }
      if(!existingCups.length){teapot(p.x,y+.02,p.z+.13,.58);cup(p.x-.23,y+.02,p.z-.06,.62);cup(p.x+.23,y+.02,p.z-.06,.62);}
      const z=p.z-Math.min(.20,p.sz*.27);c(ceramic,p.x,y+.018,z,.13,.018);for(const dx of[-.055,.055])add(bread,sphere,p.x+dx,y+.061,z,.07,.028,.045);
    }else if(/ceramics/.test(type)||spec.programme==='gallery'&&floor.id==='lobby'){
      for(let i=0;i<3;i++){const vase=new THREE.LatheGeometry([new THREE.Vector2(.075,0),new THREE.Vector2(.15,.12),new THREE.Vector2(.135,.24),new THREE.Vector2(.055,.37),new THREE.Vector2(.065,.4)],12);add(i%2?clay:ceramic,vase,p.x-lx+i*lx,y+.03,p.z,1,.65+i*.20,1);}
    }else if(/kitchen/.test(type)||/counter|workbench/.test(p.kind)){
      b(wood,p.x-lx,y+.02,p.z,Math.min(.42,p.sx*.28),.034,Math.min(.32,p.sz*.60));
      teapot(p.x+lx*.6,y+.01,p.z-lz,.7);cup(p.x-lx*.1,y+.01,p.z+lz,.72);
      for(let i=0;i<3;i++){add(bread,sphere,p.x-lx+i*.10,y+.067,p.z,.09,.036,.07);}
      // A finite timber knife block and herb jar stay on the existing counter.
      b(wood,p.x+lx,y+.085,p.z+lz,.08,.16,.09);b(brass,p.x+lx,y+.21,p.z+lz,.014,.20,.016);
    }else{
      const trayW=Math.min(.80,p.sx*.65),trayD=Math.min(.35,p.sz*.7);b(wood,p.x,y+.035,p.z,trayW,.035,trayD);teapot(p.x,y+.055,p.z,.67);cup(p.x-lx*.65,y+.055,p.z+lz*.60,.62);cup(p.x+lx*.65,y+.055,p.z-lz*.60,.62);book(p.x+lx,y+.02,p.z+lz,.27,.19,1);
    }
  }
  // Overhead wall prints and pleated linen valances add room-scale colour
  // without changing the existing doors, lift, stairs, room arrival or passage.
  for(const [index,r]of layout.rooms.entries()){
    const topY=floor.y+Math.min(r.ceilingHeight-.06,2.91),printY=floor.y+2.40,printH=Math.max(.22,Math.min(.46,topY-floor.y-2.22));
    const x=r.x,z=r.bounds.minZ+.105;record({id:`${r.id}-wall`,roomId:r.id,x,y:printY,z,sx:1.26,sy:printH,sz:.04},'original wall print','above head height');
    b(wood,x,printY,z,1.32,printH+.08,.045);b(paper,x,printY,z+.027,1.23,printH,.02);
    // A quiet harbor linocut: curved hill forms and vertical shore markers.
    for(let i=0;i<5;i++){const g=new THREE.CircleGeometry(.15,12,0,Math.PI);add(index%2?dark:clay,g,x-.46+i*.23,printY-.07,z+.041,1,.65+(i%2)*.35,1);}
    for(let i=0;i<3;i++)b(dark,x-.33+i*.33,printY+.06,z+.042,.024,.16,.008);
    const wx=r.bounds.minX+.09,wz=r.z,valanceH=Math.min(.59,r.ceilingHeight-2.15),w=Math.min(2.15,r.depth-.5),steps=24,verts=[],uv=[],ix=[];
    for(let i=0;i<=steps;i++){const t=i/steps,zz=wz-w/2+t*w,fold=Math.cos(t*Math.PI*16)*.038;verts.push(wx+fold-building.x,topY-floor.y,zz-building.z,wx+fold-building.x,topY-valanceH-floor.y,zz-building.z);uv.push(t,0,t,1);if(i<steps){const n=i*2;ix.push(n,n+2,n+1,n+1,n+2,n+3);}}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();geometries.add(g);const curtain=fabric.clone();curtain.side=THREE.DoubleSide;applySurfaceFinish(curtain,'cloth',{strength:.8});materials.add(curtain);if(!buckets.has(curtain))buckets.set(curtain,[]);buckets.get(curtain).push({g,matrix:new THREE.Matrix4()});
    c(brass,wx,topY+.008,wz,.018,w,Math.PI/2);details.push({kind:'pleated linen valance',roomId:r.id,zone:'above head height',minY:topY-valanceH,maxY:topY});
  }
  for(const[m,items]of buckets){const pos=[],normal=[],uv=[];for(const{g,matrix}of items){const copy=g.index?g.toNonIndexed():g.clone();copy.applyMatrix4(matrix);const p=copy.getAttribute('position'),n=copy.getAttribute('normal'),u=copy.getAttribute('uv');for(let i=0;i<p.count;i++){pos.push(p.getX(i),p.getY(i),p.getZ(i));normal.push(n?.getX(i)||0,n?.getY(i)||0,n?.getZ(i)||0);uv.push(u?.getX(i)||0,u?.getY(i)||0);}copy.dispose();}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeBoundingBox();g.computeBoundingSphere();geometries.add(g);const mesh=new THREE.Mesh(g,m);mesh.name=m.name;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}
  const snapshot=()=>({enabled:true,buildingId:building.id,floorId:floor.id,drawCalls:group.children.length,triangles:group.children.reduce((n,m)=>n+m.geometry.getAttribute('position').count/3,0),details,colliders:0,method:'Furniture-top craft and overhead wall dressing, fitted to actual layout parts; no new floor obstacle.'});
  return{group,colliders:[],snapshot,dispose(){group.removeFromParent();group.clear();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();}};
}
