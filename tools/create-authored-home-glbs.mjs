/** Original metric home furniture and fixtures. Editable CPU-only modelling
 * source; real CC0 sofa/bed remain unchanged, correctly fitted at scale 1. */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
import {HOME_BODIES} from '../src/harbor-home-authored.js';

let buckets,records;const temporary=new THREE.Object3D();
const baseMaterials=[
 {name:'Reclaimed grey timber / CC0 1.5m UV',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicRoughnessTexture:{index:2},metallicFactor:0,roughnessFactor:1},normalTexture:{index:1,scale:.62},occlusionTexture:{index:2}},
 {name:'Warm sage enamel',pbrMetallicRoughness:{baseColorFactor:[.30,.40,.34,1],metallicFactor:.10,roughnessFactor:.66}},
 {name:'Cream porcelain glaze',pbrMetallicRoughness:{baseColorFactor:[.79,.75,.64,1],metallicFactor:0,roughnessFactor:.29}},
 {name:'Brushed domestic metal',pbrMetallicRoughness:{baseColorFactor:[.42,.45,.42,1],metallicFactor:.82,roughnessFactor:.38}},
 {name:'Woven cotton / pillow and duvet',pbrMetallicRoughness:{baseColorFactor:[.80,.77,.65,1],metallicFactor:0,roughnessFactor:.96},doubleSided:true},
 {name:'Rubber / dark book cloth',pbrMetallicRoughness:{baseColorFactor:[.075,.092,.081,1],metallicFactor:0,roughnessFactor:.87}},
 {name:'Shower and appliance glass',pbrMetallicRoughness:{baseColorFactor:[.47,.62,.61,.18],metallicFactor:0,roughnessFactor:.18},alphaMode:'BLEND',doubleSided:true},
 {name:'Original domestic prints and book jackets',pbrMetallicRoughness:{baseColorTexture:{index:3},metallicFactor:0,roughnessFactor:.94},doubleSided:false},
];
function add(geometry,material,x,y,z,tier='core',rotation=[0,0,0],name='fitting'){
 const g=geometry.index?geometry.toNonIndexed():geometry.clone();geometry.dispose();
 temporary.position.set(x,y,z);temporary.rotation.set(...rotation);temporary.scale.set(1,1,1);temporary.updateMatrix();g.applyMatrix4(temporary.matrix);
 const key=`${tier}:${material}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(g);
 g.computeBoundingBox();records.push({name,tier,material,triangles:g.attributes.position.count/3,min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()});
}
function bevelBox(sx,sy,sz,bevel=.006){
 const r=Math.min(bevel,sx/5,sy/5,sz/5),s=new THREE.Shape();
 s.moveTo(-sx/2+r,-sy/2+r);s.lineTo(sx/2-r,-sy/2+r);s.lineTo(sx/2-r,sy/2-r);s.lineTo(-sx/2+r,sy/2-r);s.closePath();
 const g=new THREE.ExtrudeGeometry(s,{steps:1,depth:sz-2*r,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:2,curveSegments:2});g.translate(0,0,-sz/2+r);
 const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;
 for(let i=0;i<p.count;i++){const a=Math.abs(n.getY(i))>Math.abs(n.getX(i))&&Math.abs(n.getY(i))>Math.abs(n.getZ(i))?'y':Math.abs(n.getX(i))>Math.abs(n.getZ(i))?'x':'z';u.setXY(i,(a==='x'?p.getZ(i):p.getX(i))/1.5,(a==='y'?p.getZ(i):p.getY(i))/1.5);}return g;
}
const box=(m,x,y,z,sx,sy,sz,t='core',name='edged furniture panel')=>add(bevelBox(sx,sy,sz),m,x,y,z,t,[0,0,0],name);
const tube=(m,x,y,z,r,h,t='core',rx=0,rz=0,name='tube')=>add(new THREE.CylinderGeometry(r,r,h,12,1,false),m,x,y,z,t,[rx,0,rz],name);
const oval=(m,x,y,z,sx,sy,sz,t='core',name='soft shaped object')=>{const g=new THREE.SphereGeometry(1,16,10);g.scale(sx/2,sy/2,sz/2);add(g,m,x,y,z,t,[0,0,0],name);};
function print(row,x,y,z,w,h,ry=0,rx=0){const g=new THREE.PlaneGeometry(w,h),u=g.attributes.uv;for(let i=0;i<u.count;i++)u.setXY(i,.01+u.getX(i)*.98,row/8+.01+(1-u.getY(i))*.105);add(g,7,x,y,z,'core',[rx,ry,0],`original home print ${row}`);}
function table(x,z,w,d,h=.77){box(0,x,h-.025,z,w,.05,d);for(const dx of[-w/2+.08,w/2-.08])for(const dz of[-d/2+.08,d/2-.08])box(0,x+dx,(h-.05)/2,z+dz,.045,h-.05,.045);box(0,x,.24,z,w-.16,.04,.04,'core','table stretcher');}
function chair(x,z,yaw=0){
 // All legs are separate; silhouette stays open beneath the shaped seat.
 const root=new THREE.Object3D();root.position.set(x,0,z);root.rotation.y=yaw;root.updateMatrix();
 const at=(xx,yy,zz)=>new THREE.Vector3(xx,yy,zz).applyMatrix4(root.matrix);
 const b=(m,xx,yy,zz,sx,sy,sz)=>{const p=at(xx,yy,zz);add(bevelBox(sx,sy,sz),m,p.x,p.y,p.z,'core',[0,yaw,0],'chair timber frame');};
 b(0,0,.455,0,.48,.045,.46);for(const xx of[-.19,.19])for(const zz of[-.17,.17])b(0,xx,zz>0?.46:.215,zz,.033,zz>0?.92:.43,.033);
 b(0,0,.79,.18,.46,.22,.030);const p=at(0,.486,0);oval(4,p.x,p.y,p.z,.46,.055,.43,'core','soft chair cushion');
}
function book(x,y,z,w=.22,d=.15,th=.035,row=3){box(5,x,y+th/2,z,w,th,d,'core','book cloth cover');box(2,x,y+th/2,z+.003,w-.015,th*.65,d-.015,'core','book pages');print(row,x,y+th+.001,z,w-.009,d*.65,0,-Math.PI/2);}
function cup(x,y,z,s=.65){const pts=[[.034,0],[.057,.014],[.064,.096],[.057,.112],[.051,.096],[.040,.014]].map(p=>new THREE.Vector2(...p));const g=new THREE.LatheGeometry(pts,14);g.scale(s,s,s);add(g,2,x,y,z,'core',[0,0,0],'open ceramic cup');tube(5,x,y+.080*s,z,.047*s,.005,'near',0,0,'tea surface');const h=new THREE.TorusGeometry(.030*s,.008*s,6,10,Math.PI*1.7);add(h,2,x+.064*s,y+.058*s,z,'near',[0,0,0],'cup handle');}
function lamp(x,y,z){tube(3,x,y+.009,z,.065,.018);tube(3,x,y+.17,z,.006,.32);add(new THREE.ConeGeometry(.105,.11,14,1,true),2,x,y+.33,z,'core',[0,0,0],'reading lamp shade');}
function softDuvet(){
 const w=.79,l=1.42,nx=20,nz=30,p=[],u=[],ix=[];
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const a=i/nx,b=j/nz,xx=(a-.5)*w,zz=(b-.5)*l;
  const fold=.018*Math.sin(a*Math.PI*10+b*5)+.012*Math.sin(b*Math.PI*9+a*6),edge=Math.pow(Math.abs(a-.5)*2,5)*.032;
  p.push(xx,.653+fold-edge,zz);u.push(a*w/1.5,b*l/1.5);if(i<nx&&j<nz){const q=j*(nx+1)+i;ix.push(q,q+nx+1,q+1,q+1,q+nx+1,q+nx+2);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));g.setIndex(ix);g.computeVertexNormals();add(g,4,-7.25,0,5.50,'core',[0,0,0],'draped cotton duvet with uneven folds');
}
function curtain(x,z,width,height=1.8){
 const n=40,m=5,p=[],u=[],ix=[];
 for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){const a=i/n,b=j/m;p.push(.038*Math.sin(a*Math.PI*18)*(1-.08*b),2.64-b*height,(a-.5)*width);u.push(a*width/1.5,b*height/1.5);if(i<n&&j<m){const q=j*(n+1)+i;ix.push(q,q+1,q+n+1,q+1,q+n+2,q+n+1);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));g.setIndex(ix);g.computeVertexNormals();add(g,4,x,0,z,'core',[0,0,0],'gathered window curtain');tube(3,x,2.70,z,.015,width+.10,'core',Math.PI/2,0,'curtain rail');
}
function cabinet(x,z,w,d,h,frontAxis='z'){
 const sign=frontAxis==='-z'?-1:1;box(0,x,.045,z,w-.08,.09,d-.06,'core','cabinet recessed plinth');
 for(const s of[-1,1])box(0,x+s*(w/2-.018),h/2+.04,z,.036,h-.08,d,'core','cabinet side panel');
 for(const y of[.11,h/2,h-.018])box(0,x,y,z,w,.036,d,'core','cabinet shelf');
 box(0,x,h/2,z-sign*(d/2-.02),w-.04,h-.08,.025,'core','cabinet back panel');
 for(const s of[-1,1]){box(1,x+s*w/4,h/2+.04,z+sign*(d/2+.01),w/2-.022,h-.11,.025,'core','separate cabinet door');tube(3,x+s*.095,h/2+.06,z+sign*(d/2+.034),.009,.13,'near',0,0,'cabinet pull');}
}
function lobby(){
 // Reading space uses the real sofa. Everyday pieces sit on their supports.
 table(-6.7,.48,1.2,.65,.46);book(-6.9,.462,.50,.24,.17,.028,3);cup(-6.42,.462,.40,.80);
 chair(-5.05,1.75,-.45);oval(4,-5.05,.50,1.75,.47,.04,.44,'near','loose chair pad');
 const bx=-8,bz=1.55;for(const side of[-1,1])box(0,bx,.84,bz+side*.63,.45,1.58,.035,'core','bookcase end');
 box(0,bx-.20,.84,bz,.025,1.58,1.30,'core','bookcase back');
 for(const y of[.07,.46,.84,1.22,1.60])box(0,bx,y,bz,.45,.028,1.30,'core','bookcase shelf');
 for(const y of[.084,.474,.854,1.234])for(let i=0;i<7;i++){
  const zz=bz-.52+i*.155,h=.23+(i%3)*.04;box(i%2?5:1,bx+.015,y+h/2,zz,.28,h,.10,'core','individual upright book');box(2,bx+.029,y+h/2,zz,.247,h-.018,.088,'near','book exposed pages');}
 table(-6.5,2.57,1.4,.56,.765);chair(-6.5,1.87,Math.PI);book(-6.68,.766,2.61,.29,.20,.025,6);lamp(-5.98,.766,2.52);print(1,-6.5,1.95,3.19,1.26,.24,Math.PI);
 tube(2,-4.5,.15,2.49,.16,.30);tube(5,-4.5,.29,2.49,.135,.011,'core',0,0,'plant soil');
 for(let i=0;i<7;i++){const xx=-4.5+Math.sin(i*2.4)*.11,zz=2.49+Math.cos(i*2.4)*.11;tube(1,xx,.45+i*.025,zz,.006,.32);oval(1,xx,.65+i*.025,zz,.10,.21,.055,'core','plant leaf');}
 curtain(-8.35,.10,.52,1.62);curtain(-8.35,2.64,.48,1.62);
 // Mattress sits on the real bed rails at about 0.40 m; no scaling distortion.
 for(const dz of[-.72,-.36,0,.36,.72])box(0,-7.25,.395,5.30+dz,.80,.025,.09,'core','bed timber support slat');
 oval(4,-7.25,.52,5.30,.80,.24,1.85,'core','fitted mattress with round edges');softDuvet();
 oval(4,-7.25,.695,4.63,.62,.15,.35,'core','soft pillow');box(4,-7.25,.651,6.0,.77,.02,.16,'near','duvet turned-down hem');
 table(-6.37,4.56,.42,.42,.55);lamp(-6.37,.551,4.56);book(-6.34,.552,4.64,.20,.13,.025,3);
 cabinet(-5.2,7.72,1.70,.50,2.12,'-z');box(4,-5.62,2.15,7.71,.41,.045,.34,'core','folded blanket on wardrobe');box(4,-5.16,2.15,7.71,.37,.045,.33,'core','folded linen on wardrobe');
 table(-5.15,4.22,1.20,.55,.77);chair(-5.15,4.77,0);book(-5.35,.771,4.23,.32,.23,.027,6);lamp(-4.70,.771,4.23);
 print(2,-5.15,1.70,3.36,.90,.27);box(0,-5.15,1.70,3.339,.95,.32,.025,'core','calendar timber surround');
 // Shoe shelf and coat stand, with shoes and one folded tote: a lived home.
 box(0,-4.45,.12,7.05,.45,.028,.41);for(const y of[.16,.38])box(0,-4.45,y,7.05,.45,.026,.41);
 for(const dx of[-.205,.205])box(0,-4.45+dx,.24,7.05,.04,.48,.41);
 for(const dx of[-.10,.10])oval(5,-4.45+dx,.425,7.07,.14,.07,.28,'core','worn shoes');
 tube(0,-4.45,1.05,6.89,.024,1.2);tube(3,-4.45,1.63,6.89,.012,.35,'core',0,Math.PI/2,'coat hanger');
 box(4,-4.45,1.29,6.93,.36,.55,.08,'core','hung canvas tote');
 curtain(-8.35,4.05,.47,1.52);curtain(-8.35,6.65,.49,1.52);
}
function gallery(){
 // Continuous L kitchen with separate fronts, edged worktops and an actual
 // open sink bowl; the kitchen counter top does not cap the sink opening.
 const x=-8.12;box(0,x,.055,.78,.56,.11,3.66,'core','kitchen recessed plinth');
 for(let i=0;i<5;i++){const z=-.72+i*.735;box(1,x,.455,z,.59,.77,.705,'core','kitchen base cabinet');box(0,x+.306,.455,z,.028,.73,.681,'core','separate kitchen door');tube(3,x+.331,.50,z+.20,.010,.14,'near',0,0,'horizontal cabinet handle');}
 // Left sink centred at z=0: worktop comes around all four edges.
 for(const [z,l]of[[-.686,.818],[1.466,2.378]])box(2,x,.915,z,.68,.045,l,'core','seamed kitchen worktop');
 for(const dx of[-.262,.262])box(2,x+dx,.915,0,.155,.045,.56,'core','sink side worktop');
 for(const z of[-.265,.265])box(2,x,.915,z,.40,.045,.04,'core','sink end rim');
 box(3,x,.76,0,.35,.022,.44,'core','sink recessed bottom');
 for(const dx of[-.177,.177])box(3,x+dx,.84,0,.022,.16,.46,'core','sink bowl side');for(const z of[-.222,.222])box(3,x,.84,z,.37,.16,.022,'core','sink bowl end');
 tube(3,x-.21,1.025,-.31,.018,.23);tube(3,x-.13,1.145,-.31,.016,.18,'core',0,Math.PI/2,'sink tap spout');tube(3,x-.047,1.12,-.31,.017,.06);
 box(1,-7.05,.46,-1.30,1.75,.81,.57);box(2,-7.05,.915,-1.30,1.80,.045,.63,'core','return countertop joint');
 for(const dx of[-.60,0,.60]){box(0,-7.05+dx,.46,-.987,.56,.75,.028,'core','separate drawer/cupboard front');tube(3,-7.05+dx,.67,-.96,.009,.21,'near',0,Math.PI/2,'drawer pull');}
 box(5,-6.45,.947,-1.30,.58,.025,.47,'core','hob inset');for(const dx of[-.15,.15])for(const dz of[-.12,.12]){tube(3,-6.45+dx,.964,-1.30+dz,.081,.018);tube(5,-6.45+dx,.977,-1.30+dz,.060,.015);}
 add(new THREE.LatheGeometry([[.08,0],[.12,.035],[.12,.15],[.09,.17]].map(p=>new THREE.Vector2(...p)),14),3,-6.60,.982,-1.18,'core',[0,0,0],'cooking pot');tube(5,-6.60,1.157,-1.18,.115,.018);tube(3,-6.60,1.182,-1.18,.017,.035);
 box(0,-7.25,.956,-1.34,.37,.022,.27,'core','cutting board');box(2,-7.25,.977,-1.30,.21,.01,.18,'near','recipe sheet');
 // Wall storage over the counter avoids the walkable floor and leaves window.
 for(const dx of[-.784,.784])box(0,-7.05+dx,1.905,-1.57,.032,.91,.28,'core','upper kitchen cabinet side');
 for(const yy of[1.466,1.905,2.344])box(0,-7.05,yy,-1.57,1.60,.032,.28,'core','upper kitchen cabinet shelf');
 box(0,-7.05,1.905,-1.698,1.54,.85,.024,'core','upper cabinet back');
 for(const dx of[-.4,.4]){box(1,-7.05+dx,1.905,-1.421,.77,.85,.025,'core','upper cabinet door');tube(3,-7.05+dx,1.64,-1.395,.009,.16,'near',0,Math.PI/2,'upper cabinet pull');}
 // A real refrigerator has a door seam, handle, feet, top trim and magnets.
 box(2,-5.40,.92,-1.08,.64,1.70,.69,'core','fridge body');for(const dx of[-.24,.24])box(5,-5.40+dx,.041,-1.08,.08,.082,.56);
 for(const [y,h]of[[.45,.76],[1.31,.91]]){box(2,-5.40,y,-.721,.615,h,.025,'core','separate refrigerator door');tube(3,-5.62,y,-.69,.012,.28,'near',0,0,'fridge pull');}
 print(4,-5.4,1.27,-.702,.29,.16);tube(5,-5.40,1.42,-.681,.016,.006,'near',Math.PI/2,0,'recipe magnet');
 table(-5.9,2.05,1.32,.75,.77);chair(-5.9,1.16,Math.PI);chair(-5.9,2.92,0);
 for(const dx of[-.30,.30]){tube(2,-5.9+dx,.780,2.05,.125,.012);cup(-5.9+dx,.790,2.21,.75);}book(-5.9,.78,1.83,.24,.18,.022,4);
 print(4,-5.90,1.87,3.19,1.15,.22,Math.PI);curtain(-8.35,2.54,.56,.70);
 // Laundry / wash / open shower: visible low furniture has real matching
 // collision. Glass consists of two thin panels; the shower entry is open.
 box(2,-7.90,.46,4.02,.65,.84,.67,'core','washing machine body');
 add(new THREE.TorusGeometry(.185,.027,8,24),3,-7.90,.43,4.367,'core',[0,0,0],'washer round door frame');add(new THREE.CircleGeometry(.164,24),6,-7.90,.43,4.372,'core',[0,0,0],'washer porthole');
 box(1,-7.90,.78,4.372,.59,.085,.020);for(const dx of[-.16,.16])tube(5,-7.90+dx,.78,4.39,.024,.015,'near',Math.PI/2,0,'washer control');
 box(4,-7.90,.90,4.02,.51,.04,.48,'core','folded laundry towel');
 tube(0,-7.90,.28,4.83,.217,.56);for(let i=0;i<8;i++){const a=i*Math.PI/4;tube(1,-7.9+Math.sin(a)*.207,.29,4.83+Math.cos(a)*.207,.009,.50,'near',0,0,'basket weave upright');}oval(4,-7.90,.54,4.83,.37,.13,.35,'core','loose towel in hamper');
 cabinet(-6.7,4.02,.88,.51,.77);box(2,-6.7,.80,4.02,.91,.07,.53,'core','basin vanity top');
 add(new THREE.LatheGeometry([[.08,0],[.19,.05],[.23,.16],[.20,.19],[.15,.08],[.08,.03]].map(p=>new THREE.Vector2(...p)),18),2,-6.7,.81,4.05,'core',[0,0,0],'open wash basin');tube(3,-6.70,.98,3.84,.012,.28);tube(3,-6.64,1.12,3.84,.012,.15,'core',0,Math.PI/2,'basin tap');
 box(0,-6.7,1.52,3.36,.80,.85,.04,'core','bath mirror frame');box(3,-6.7,1.52,3.385,.72,.77,.014,'core','brushed mirror approximation');tube(2,-6.28,.85,4.00,.035,.08,'core',0,0,'soap bottle');
 // Toilet with distinct bowl, seat ring, tank and flush button.
 oval(2,-5.25,.28,4.24,.38,.51,.55);add(new THREE.TorusGeometry(.18,.034,8,22),2,-5.25,.53,4.27,'core',[Math.PI/2,0,0],'toilet seat rim');box(2,-5.25,.64,3.90,.40,.36,.16);tube(3,-5.25,.827,3.90,.022,.008,'near',0,0,'flush button');
 cabinet(-5,7.57,1.20,.48,1.68,'-z');for(let i=0;i<3;i++)box(4,-5.3+i*.30,1.715,7.56,.24,.045,.32,'core','folded bath linen');print(5,-5,1.24,7.304,.71,.15,Math.PI);
 // Flush shower tray is visual support at the unchanged floor, not a raised
 // hidden support or solid full cubicle collider.
 box(2,-7.30,.009,6.62,1.80,.018,1.55,'core','nearly flush shower tray');tube(3,-7.15,.024,6.86,.06,.006,'near',0,0,'shower drain');
 box(6,-8.20,1.028,6.62,.022,2.006,1.55,'core','thin shower back glass');box(6,-7.30,1.028,7.40,1.80,2.006,.022,'core','thin shower side glass');
 for(const z of[5.845,7.395])tube(3,-8.2,1.03,z,.009,2.06);tube(3,-6.40,1.03,7.40,.009,2.06);
 tube(3,-8.07,1.17,6.62,.018,1.43);tube(3,-7.98,1.88,6.62,.014,.22,'core',0,Math.PI/2,'shower arm');tube(3,-7.87,1.87,6.62,.085,.024,'core',0,0,'shower head');tube(3,-8.07,.80,6.62,.040,.065,'near',Math.PI/2,0,'shower control');
 // Towel rail is on the storage front, away from the usable entry aisle.
 tube(3,-5,.85,7.284,.012,.54,'core',0,Math.PI/2,'bath towel rail');box(4,-5,.62,7.271,.46,.43,.018,'core','hanging bath towel');curtain(-8.35,4.88,.50,.55);
}
async function exportFloor(floor){
 buckets=new Map();records=[];if(floor==='lobby')lobby();else gallery();
 // Low-detail render proxies are independent of fixed full collision.
 for(const[name,x,z,w,d,min,max,mat]of HOME_BODIES[floor]){
  if(name.includes('glass'))continue;let m=mat==='timber'?0:mat==='fabric'?4:mat==='metal'?3:2;
  if(name==='bed-head'||name==='bed-foot')continue;
  box(m,x,(min+max)/2,z,w,max-min,d,'far',`far ${name}`);
 }
 const materials=structuredClone(baseMaterials);
 if(floor==='lobby')materials[4]={...materials[4],pbrMetallicRoughness:{baseColorTexture:{index:4},metallicRoughnessTexture:{index:6},metallicFactor:0,roughnessFactor:1},normalTexture:{index:5,scale:.48},occlusionTexture:{index:6}};
 const binary=[],views=[],accessors=[],meshes=[],nodes=[],sceneNodes=[];let binaryLength=0;
 function buffer(payload,target){const pad=(-binaryLength)&3;if(pad){binary.push(Buffer.alloc(pad));binaryLength+=pad;}const index=views.length;views.push({buffer:0,byteOffset:binaryLength,byteLength:payload.length,...(target?{target}:{})});binary.push(payload);binaryLength+=payload.length;return index;}
 function attribute(a,type){const index=accessors.length,record={bufferView:buffer(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength),34962),componentType:5126,count:a.count,type};if(type==='VEC3'){record.min=[0,1,2].map(k=>{let v=Infinity;for(let i=k;i<a.array.length;i+=3)v=Math.min(v,a.array[i]);return v;});record.max=[0,1,2].map(k=>{let v=-Infinity;for(let i=k;i<a.array.length;i+=3)v=Math.max(v,a.array[i]);return v;});}accessors.push(record);return index;}
 const tiers={core:[],near:[],far:[]},counts={core:{triangles:0,drawCalls:0},near:{triangles:0,drawCalls:0},far:{triangles:0,drawCalls:0}};
 for(const[key,items]of buckets){const[tier,m]=key.split(':'),arrays={position:[],normal:[],uv:[]};for(const g of items){for(const name of Object.keys(arrays))arrays[name].push(...g.attributes[name].array);g.dispose();}const attrs={};for(const[name,list]of Object.entries(arrays))attrs[{position:'POSITION',normal:'NORMAL',uv:'TEXCOORD_0'}[name]]=attribute(new THREE.Float32BufferAttribute(list,name==='uv'?2:3),name==='uv'?'VEC2':'VEC3');const mi=meshes.length;meshes.push({name:`${tier} / ${materials[+m].name}`,primitives:[{attributes:attrs,material:+m}]});const ni=nodes.length;nodes.push({name:`home-${tier}-${m}`,mesh:mi});tiers[tier].push(ni);counts[tier].triangles+=arrays.position.length/9;counts[tier].drawCalls++;}
 for(const tier of ['core','near','far']){sceneNodes.push(nodes.length);nodes.push({name:`home-tier-${tier}`,children:tiers[tier]});}
 const imagePaths=['wood_planks_grey_diff_1k.jpg','wood_planks_grey_nor_gl_1k.jpg','wood_planks_grey_arm_1k.jpg'].map(n=>'docs/qa/authored-home/acquisition/wood-planks/'+n);imagePaths.push('docs/qa/authored-home/authored-source/home-prints.png');if(floor==='lobby')for(const s of['col_02','nor_gl','arm'])imagePaths.push(`docs/qa/authored-home/acquisition/linen/fabric_pattern_05_${s}_1k.jpg`);
 const images=[];for(const path of imagePaths){const b=await fs.readFile(new URL('../'+path,import.meta.url));images.push({bufferView:buffer(b),mimeType:path.endsWith('.png')?'image/png':'image/jpeg'});}
 const gltf={asset:{version:'2.0',generator:'Neon Harbor original authored home source'},scene:0,scenes:[{nodes:sceneNodes}],nodes,meshes,materials,buffers:[{byteLength:binaryLength}],bufferViews:views,accessors,images,textures:images.map((_,source)=>({source,sampler:source===3?1:0})),samplers:[{wrapS:10497,wrapT:10497,magFilter:9729,minFilter:9987},{wrapS:33071,wrapT:33071,magFilter:9729,minFilter:9987}]};
 let j=Buffer.from(JSON.stringify(gltf));j=Buffer.concat([j,Buffer.alloc((-j.length)&3,32)]);let b=Buffer.concat(binary);b=Buffer.concat([b,Buffer.alloc((-b.length)&3)]);const h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(28+j.length+b.length,8);h.writeUInt32LE(j.length,12);h.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(b.length,0);bh.writeUInt32LE(0x004e4942,4);const result=Buffer.concat([h,j,bh,b]);
 const id=`home-${floor}-fittings`,out=`assets/harbor/home/${id}.glb`;await fs.writeFile(new URL('../'+out,import.meta.url),result);
 const report={id,output:{path:out,bytes:result.length,sha256:crypto.createHash('sha256').update(result).digest('hex')},meshCount:meshes.length,tiers:counts,totalPackedTriangles:Object.values(counts).reduce((n,v)=>n+v.triangles,0),records,materialCount:materials.length,textureCount:images.length,texturePaths:imagePaths,coordinates:'local metres relative to south-079 origin and active floor.y'};
 await fs.writeFile(new URL(`../docs/qa/authored-home/authored-source/${id}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({id,...report.output,meshes:report.meshCount,tiers:counts,triangles:report.totalPackedTriangles}));
}
await exportFloor('lobby');await exportFloor('gallery');
