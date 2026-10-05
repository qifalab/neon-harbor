/** Editable original south-086 fittings, authored in metres. CPU-only export.
 * This does not repackage the old box furniture. The original CC0 vice and
 * portable tool chest stay at their already reviewed positions.
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';

const buckets = new Map(), records = [], temporary = new THREE.Object3D();
const O = {x:200, y:.215, z:-113};
const materials = [
  {name:'Weathered grey timber / CC0 metric UV',pbrMetallicRoughness:{baseColorTexture:{index:0},metallicRoughnessTexture:{index:2},metallicFactor:0,roughnessFactor:1},normalTexture:{index:1,scale:.7},occlusionTexture:{index:2}},
  {name:'Workshop faded green enamel',pbrMetallicRoughness:{baseColorFactor:[.12,.25,.21,1],metallicFactor:.45,roughnessFactor:.66}},
  {name:'Worn brushed steel',pbrMetallicRoughness:{baseColorFactor:[.35,.39,.37,1],metallicFactor:.83,roughnessFactor:.48}},
  {name:'Rubber casters / grips',pbrMetallicRoughness:{baseColorFactor:[.035,.041,.037,1],metallicFactor:0,roughnessFactor:.95}},
  {name:'Archive folders / paper',pbrMetallicRoughness:{baseColorFactor:[.65,.57,.40,1],metallicFactor:0,roughnessFactor:.93}},
  {name:'Original workshop labels',pbrMetallicRoughness:{baseColorTexture:{index:3},metallicFactor:0,roughnessFactor:.95},doubleSided:false},
];
function add(geometry, material, x,y,z, tier='core', rotation=[0,0,0], name='fitting') {
  const g=geometry.index?geometry.toNonIndexed():geometry.clone(); geometry.dispose();
  temporary.position.set(x-O.x,y-O.y,z-O.z);temporary.rotation.set(...rotation);temporary.scale.set(1,1,1);temporary.updateMatrix();g.applyMatrix4(temporary.matrix);
  const key=`${tier}:${material}`;if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(g);
  g.computeBoundingBox();records.push({name,tier,material,triangles:g.attributes.position.count/3,min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()});
}
function bevelBox(sx,sy,sz,bevel=.006) {
  const r=Math.min(bevel,sx/5,sy/5,sz/5),shape=new THREE.Shape();
  shape.moveTo(-sx/2+r,-sy/2+r);shape.lineTo(sx/2-r,-sy/2+r);shape.lineTo(sx/2-r,sy/2-r);shape.lineTo(-sx/2+r,sy/2-r);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{steps:1,depth:sz-2*r,bevelEnabled:true,bevelSize:r,bevelThickness:r,bevelSegments:2,curveSegments:2});g.translate(0,0,-sz/2+r);
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++){
    const axis=Math.abs(n.getY(i))>Math.abs(n.getX(i))&&Math.abs(n.getY(i))>Math.abs(n.getZ(i))?'y':Math.abs(n.getX(i))>Math.abs(n.getZ(i))?'x':'z';
    uv.setXY(i, (axis==='x'?p.getZ(i):p.getX(i))/1.5, (axis==='y'?p.getZ(i):p.getY(i))/1.5);
  }
  return g;
}
function box(m,x,y,z,sx,sy,sz,tier='core',name='bevelled fitting') {add(bevelBox(sx,sy,sz),m,x,y,z,tier,[0,0,0],name);}
function tube(m,x,y,z,r,h,tier='core',rx=0,rz=0,name='tube') {add(new THREE.CylinderGeometry(r,r,h,10,1,false),m,x,y,z,tier,[rx,0,rz],name);}
function label(row,x,y,z,w,h,rotation=0) {
  const g=new THREE.PlaneGeometry(w,h),uv=g.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setXY(i,.008+uv.getX(i)*.984,row/8+.003+(1-uv.getY(i))*(.125-.006));
  add(g,5,x,y,z,'core',[0,rotation,0],`label ${row}`);
}
const y=v=>O.y+v;
// Three individually edged hardwood boards: the top ends at the same 1.175 m
// world height as the baseline, preserving the vice/clamp and photography.
for(const dz of[-.282,0,.282])box(0,180.9,y(.93),-114.58+dz,1.83,.06,.276,'core','repair bench separate plank');
for(const dx of[-.72,.72])for(const dz of[-.27,.27]){
  box(1,180.9+dx,y(.43),-114.58+dz,.085,.86,.085,'core','repair bench enamel leg');
  box(3,180.9+dx,y(.035),-114.58+dz,.105,.07,.105,'near','bench foot cap');
  for(const yy of[.18,.70])tube(2,180.9+dx,y(yy),-114.58+dz+.049,.015,.010,'near',Math.PI/2,0,'frame bolt');
}
for(const dz of[-.27,.27])box(1,180.9,y(.24),-114.58+dz,1.47,.075,.06,'core','bench stretcher');
box(0,180.9,y(.30),-114.58,1.4,.05,.52,'core','lower slatted shelf');
// Original crate footprints remain under the chest. Thin slats, cleats and
// edge strips reveal construction rather than a solid timber cube.
for(const cx of[180.45,181.35]){
  for(const side of[-1,1])box(0,cx+side*.23,y(.025),-119.52,.10,.05,.61,'core','box ground cleat');
  box(0,cx,y(.0575),-119.52,.58,.025,.60,'core','box bottom board');
  for(const yy of[.11,.30,.49,.64])for(const side of[-1,1])box(0,cx,y(yy),-119.52+side*.31,.62,.13,.04,'core','service box side slat');
  for(const yy of[.11,.30,.49,.64])for(const side of[-1,1])box(0,cx+side*.29,y(yy),-119.52,.04,.13,.58,'core','service box end slat');
  box(0,cx,y(.663),-119.52,.62,.034,.66,'core','box supporting lid');
  for(const side of[-1,1])box(2,cx+side*.25,y(.34),-119.863,.022,.65,.012,'near','box corner strap');
}
// Repair board, clamps and shaped handles. Tools remain above the bench area.
box(1,180.9,y(1.70),-120.01,1.85,1.12,.045,'core','enamel backboard');
for(let row=0;row<6;row++)for(let col=0;col<9;col++)tube(3,180.16+col*.18,y(1.28+row*.15),-119.982,.011,.009,'near',Math.PI/2,0,'pegboard perforation');
for(const cx of[180.26,180.62,180.98,181.34]){
  tube(2,cx,y(1.62),-119.94,.017,.30,'core',0,0,'tool shaft');
  box(3,cx,y(1.40),-119.94,.055,.16,.055,'core','tool grip');
  box(2,cx,y(1.78),-119.94,.18,.038,.041,'core','tool head');
}
label(1,180.9,y(2.36),-119.947,1.75,.22);
label(7,180.9,y(1.08),-114.145,1.45,.18);
// Two orderly service stations at opposite sides of the 2 m central aisle.
for(const [z,row]of[[-118.65,0],[-111.1,2]]){
  const x=191.2;box(0,x,y(.86),z,1.8,.07,.62,'core','service station top');
  for(const dx of[-.73,.73])box(1,x+dx,y(.4175),z,.07,.835,.49,'core','service station end frame');
  box(1,x,y(.19),z,1.45,.065,.46,'core','station lower shelf');
  for(const dx of[-.5,0,.5])box(4,x+dx,y(.97),z,.34,.14,.29,'core','job folder / sorted spares');
  label(row,x,y(1.14),z+.325,1.5,.18);
}
// Original small service cart: bent sheet tray, raised lip, tubular handle,
// axle and separate rubber casters. No downloaded 3.17 MB cart is resident.
const cx=187.7,cz=-118.45;
for(const yy of[.24,.78]){
  box(1,cx,y(yy),cz,.82,.035,.57,'core','cart steel tray');
  for(const side of[-1,1])box(1,cx,y(yy+.042),cz+side*.272,.82,.07,.025,'core','folded tray lip');
}
for(const dx of[-.36,.36])for(const dz of[-.23,.23]){
  tube(2,cx+dx,y(.47),cz+dz,.017,.59,'core',0,0,'cart frame');
  tube(3,cx+dx,y(.105),cz+dz,.085,.045,'core',0,Math.PI/2,'rubber caster');
}
for(const dx of[-.37,.37])tube(2,cx+dx,y(.98),cz+.29,.017,.27,'near',0,0,'cart handle upright');
tube(2,cx,y(1.11),cz+.29,.02,.74,'near',0,Math.PI/2,'cart push handle');
for(const dx of[-.24,0,.24])tube(2,cx+dx,y(.818),cz,.075,.025,'near',0,0,'sorted flange fitting');
label(5,cx,y(.69),cz+.302,.65,.16);
// Assembly station: an opened pump with two flanges and sorted fasteners.
const ax=185.7,az=-111.5;
box(0,ax,y(.90),az,2.4,.05,.95,'core','repair assembly worktop');
for(const dx of[-1.02,1.02])for(const dz of[-.34,.34])box(1,ax+dx,y(.4375),az+dz,.06,.875,.06,'core','assembly table leg');
box(1,ax,y(.26),az,2.04,.06,.58,'core','assembly table stretcher');
box(2,ax+.1,y(.945),az,.43,.04,.48,'core','pump mounting plate');
tube(2,ax+.1,y(1.135),az,.13,.36,'core',Math.PI/2,0,'cast pump body');
for(const dz of[-.192,.192])tube(2,ax+.1,y(1.135),az+dz,.17,.024,'core',Math.PI/2,0,'pump flange');
for(let i=0;i<6;i++)tube(2,ax-.67+i*.075,y(.949),az+.15,.018,.047,'near',0,0,'sorted fastener');
box(4,ax-.77,y(.940),az-.18,.44,.03,.24,'core','repair worksheet');
// A proper shallow cabinet: open carcass panels, two framed doors, handles
// and a metal plinth. It stores parts along the wall, outside circulation.
const px=184.2,pz=-119.6;
box(1,px,y(.04),pz,1.08,.08,.45,'core','cabinet floor plinth');
for(const dx of[-.58,.58])box(1,px+dx,y(.84),pz,.04,1.52,.50,'core','parts cabinet side');
for(const yy of[.08,.78,1.58])box(1,px,y(yy),pz,1.2,.04,.50,'core','parts cabinet horizontal');
box(1,px,y(.84),pz-.23,1.12,1.46,.035,'core','cabinet back');
for(const dx of[-.29,.29]){
  box(1,px+dx,y(.84),pz+.242,.56,1.42,.028,'core','cabinet separate door');
  tube(2,px+dx+(dx<0?.18:-.18),y(.86),pz+.276,.012,.13,'near',0,0,'cabinet pull');
}
label(5,px,y(1.38),pz+.262,.82,.15);
// Retrieval desk dressing: open ledger, thin folders, pencil tray and lamp.
box(4,187.2,y(.797),-103.88,.49,.019,.33,'core','open receiving ledger');
box(4,187.67,y(.8015),-104.15,.31,.028,.24,'core','reference folder');
box(1,187.9,y(.810),-103.84,.30,.045,.08,'near','pen tray');
for(let i=0;i<3;i++)tube(2,187.83+i*.05,y(.8365),-103.84,.004,.21,'near',Math.PI/2,0,'pencil');
tube(1,188.0,y(.7995),-104.22,.12,.024,'core',0,0,'task light base');
tube(2,188.0,y(.99),-104.22,.014,.38,'core',0,0,'task light stem');
box(1,188.0,y(1.1875),-104.18,.21,.065,.16,'core','task light shade');
label(4,187.4,y(.675),-103.51,.95,.13);
// Seated retrieval position with open leg frame and bent timber back.
const qx=187.4,qz=-102.9;
box(0,qx,y(.47),qz,.48,.035,.44,'core','retrieval chair seat');
for(const dx of[-.19,.19])for(const dz of[-.17,.17])tube(2,qx+dx,y(dz>0?.49:.226),qz+dz,.012,dz>0?.98:.452,'core',0,0,dz>0?'chair continuous rear leg / back support':'retrieval chair front leg');
box(0,qx,y(.855),qz+.18,.47,.20,.025,'core','chair timber back');
// Sorting and return table, with rolled plans and ordered outgoing records.
const dx=191.4,dz=-108.45;
box(0,dx,y(.79),dz,2.4,.06,.82,'core','archive sorting surface');
for(const xx of[-1.02,1.02])for(const zz of[-.28,.28])box(1,dx+xx,y(.38),dz+zz,.055,.76,.055,'core','sorting table leg');
for(let i=0;i<3;i++)tube(4,dx-.68+i*.16,y(.86),dz-.08,.04,.55,'core',Math.PI/2,0,'rolled reference chart');
for(let i=0;i<4;i++)box(4,dx+.35,y(.83+i*.028),dz+.07,.43,.024,.30,'core','outgoing ordered file');
label(3,dx,y(.70),dz+.426,1.42,.17);
// Archive is organized by reference collection, rather than piles of boxes.
// Heights come from CPU inspection of real shelf upper-facing triangles.
for(const offset of[0,1.8,3.6])for(const [support,height]of[[.107606889,.22],[.391877891,.22],[.671546818,.24],[.960453273,.25],[1.276523393,.30],[1.663382572,.31]])for(let j=0;j<5;j++){
  const centre=support+.002+height/2;
  box(4,180.72+offset+j*.23,y(centre),-109.15,.16,height,.30,'core','archive vertical folder');
  box(1,180.72+offset+j*.23,y(centre),-108.992,.033,height*.75,.013,'near','folder spine marker');
}
for(const offset of[0,1.8,3.6])label(6,181.2+offset,y(1.94),-108.904,1.18,.16);
label(3,187.4,y(2.18),-109.642,2.1,.28);
// Far tier is original low-cost shape proxies, never the collision source.
box(0,180.9,y(.93),-114.58,1.83,.06,.84,'far','far repair bench');
for(const dx of[-.72,.72])box(1,180.9+dx,y(.43),-114.58,.085,.86,.64,'far','far repair frame');
box(1,187.4,y(.74),-104.0,2,.1,.947,'far','far retrieval desk');
for(const offset of[0,1.8,3.6])box(0,181.2+offset,y(1.03),-109.2,1.374,2.063,.58,'far','far archive shelf');
box(1,cx,y(.48),cz,.82,.67,.57,'far','far service cart');
box(1,ax,y(.60),az,2.4,1.2,.95,'far','far assembly table');
box(1,px,y(.82),pz,1.2,1.64,.52,'far','far parts cabinet');
box(0,dx,y(.46),dz,2.4,.92,.82,'far','far document sorting table');

const binary=[],views=[],accessors=[],meshes=[],nodes=[],sceneNodes=[];
let binaryLength=0;
function buffer(payload,target){const pad=(-binaryLength)&3;if(pad){binary.push(Buffer.alloc(pad));binaryLength+=pad;}const index=views.length;views.push({buffer:0,byteOffset:binaryLength,byteLength:payload.length,...(target?{target}:{})});binary.push(payload);binaryLength+=payload.length;return index;}
function attribute(a,type){const view=buffer(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength),34962),index=accessors.length;const record={bufferView:view,componentType:5126,count:a.count,type};if(type==='VEC3'){record.min=[0,1,2].map(k=>{let v=Infinity;for(let i=k;i<a.array.length;i+=3)v=Math.min(v,a.array[i]);return v;});record.max=[0,1,2].map(k=>{let v=-Infinity;for(let i=k;i<a.array.length;i+=3)v=Math.max(v,a.array[i]);return v;});}accessors.push(record);return index;}
const tiers={core:[],near:[],far:[]},counts={core:{triangles:0,drawCalls:0},near:{triangles:0,drawCalls:0},far:{triangles:0,drawCalls:0}};
for(const [key,items]of buckets){const[tier,m]=key.split(':'),arrays={position:[],normal:[],uv:[]};for(const g of items){for(const name of Object.keys(arrays))arrays[name].push(...g.attributes[name].array);g.dispose();}const attrs={};for(const[name,list]of Object.entries(arrays))attrs[{position:'POSITION',normal:'NORMAL',uv:'TEXCOORD_0'}[name]]=attribute(new THREE.Float32BufferAttribute(list,name==='uv'?2:3),name==='uv'?'VEC2':'VEC3');const mi=meshes.length;meshes.push({name:`${tier} / ${materials[Number(m)].name}`,primitives:[{attributes:attrs,material:Number(m)}]});const ni=nodes.length;nodes.push({name:`authored-${tier}-${m}`,mesh:mi});tiers[tier].push(ni);counts[tier].triangles+=arrays.position.length/9;counts[tier].drawCalls++;}
for(const tier of ['core','near','far']){sceneNodes.push(nodes.length);nodes.push({name:`workshop-tier-${tier}`,children:tiers[tier]});}
const textureSources=['wood_planks_grey_diff_1k.jpg','wood_planks_grey_nor_gl_1k.jpg','wood_planks_grey_arm_1k.jpg'].map(n=>new URL('../docs/qa/authored-workshop/acquisition/wood-planks/'+n,import.meta.url));textureSources.push(new URL('../docs/qa/authored-workshop/authored-source/workshop-labels.png',import.meta.url));
const images=[];for(const url of textureSources){const b=await fs.readFile(url);images.push({bufferView:buffer(b),mimeType:url.pathname.endsWith('.png')?'image/png':'image/jpeg'});}
const gltf={asset:{version:'2.0',generator:'Neon Harbor original authored workshop source'},scene:0,scenes:[{nodes:sceneNodes}],nodes,meshes,materials,buffers:[{byteLength:binaryLength}],bufferViews:views,accessors,images,textures:images.map((_,source)=>({source,sampler:source===3?1:0})),samplers:[{wrapS:10497,wrapT:10497,magFilter:9729,minFilter:9987},{wrapS:33071,wrapT:33071,magFilter:9729,minFilter:9987}]};
let j=Buffer.from(JSON.stringify(gltf));j=Buffer.concat([j,Buffer.alloc((-j.length)&3,32)]);let b=Buffer.concat(binary);b=Buffer.concat([b,Buffer.alloc((-b.length)&3)]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+b.length,8);header.writeUInt32LE(j.length,12);header.writeUInt32LE(0x4e4f534a,16);const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(b.length,0);binHeader.writeUInt32LE(0x004e4942,4);const result=Buffer.concat([header,j,binHeader,b]);
await fs.writeFile(new URL('../assets/harbor/workshop/workshop-fittings.glb',import.meta.url),result);
const report={kind:'CPU-only original authored geometry export; no WebGL or visual approval',origin:O,bytes:result.length,sha256:crypto.createHash('sha256').update(result).digest('hex'),tiers:counts,maxVisibleNear:{triangles:counts.core.triangles+counts.near.triangles,drawCalls:counts.core.drawCalls+counts.near.drawCalls},totalPackedTriangles:Object.values(counts).reduce((n,v)=>n+v.triangles,0),meshCount:meshes.length,materials:materials.length,textures:images.length,details:records};
await fs.writeFile(new URL('../docs/qa/authored-workshop/authored-source/fittings-export.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,details:undefined},null,2));
