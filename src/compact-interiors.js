/** Small old-town shells cannot contain the north-shore 8 m gallery corridor.
 * This separate plan keeps a 2 m clear aisle, two furnished rooms, a rear lift
 * and a narrower real stair. No room or furniture is scaled outside its shell.
 */
export function createCompactInteriorLayout(building,floor,stairs,design) {
  const width=building.width-.7,depth=building.depth-.7;
  const next=building.floors.find(f=>f.y>floor.y),height=next?next.y-floor.y-.42:4.1;
  const observation=floor.id==='observation',ground=floor.id===building.floors[0].id;
  const outgoing=stairs.find(s=>s.fromFloorId===floor.id),incoming=stairs.find(s=>s.toFloorId===floor.id);
  const parts=[],colliders=[],labels=[],rooms=[],lights=[];let serial=0;
  const add=(material,x,y,z,sx,sy,sz,kind='detail',solid=false,geometry='box')=>{
    if(sx<=0||sy<=0||sz<=0)throw new Error(`Invalid compact part: ${building.id}/${kind}`);
    const part={id:`${building.id}:${floor.id}:${++serial}`,material,x:building.x+x,y:floor.y+y,z:building.z+z,sx,sy,sz,kind,geometry};parts.push(part);
    if(solid)colliders.push({id:part.id,kind:`interior-${kind}`,x:part.x,z:part.z,hx:sx/2,hz:sz/2,minY:part.y-sy/2,maxY:part.y+sy/2,physics:true,camera:true});
    return part;
  };
  const box=(...args)=>add(...args),round=(m,x,y,z,sx,sy,sz,k='detail',solid=false)=>add(m,x,y,z,sx,sy,sz,k,solid,'rounded');
  const label=(text,x,y,z,w=2,h=.3,rotation=0)=>labels.push({text,x:building.x+x,y:floor.y+y,z:building.z+z,width:w,height:h,rotation,color:'#eee5d2'});
  const slab=(material,y,thickness,hole,kind,solid=false)=>{
    if(!hole){box(material,0,y,0,width,thickness,depth,kind,solid);return;}
    const x0=hole.minX-building.x,x1=hole.maxX-building.x,z0=hole.minZ-building.z,z1=hole.maxZ-building.z;
    box(material,(-width/2+x0)/2,y,0,x0+width/2,thickness,depth,kind,solid);
    box(material,(x1+width/2)/2,y,0,width/2-x1,thickness,depth,kind,solid);
    box(material,(x0+x1)/2,y,(-depth/2+z0)/2,x1-x0,thickness,z0+depth/2,kind,solid);
    box(material,(x0+x1)/2,y,(z1+depth/2)/2,x1-x0,thickness,depth/2-z1,kind,solid);
  };
  slab(observation?'interiorStone':design.floorFinish,-.16,.32,incoming?.hole,'floor');
  if(!observation)slab('interiorCeiling',height+.12,.24,outgoing?.hole,'ceiling',true);
  for(const side of [-1,1]) {
    box('domesticPaint',side*width/2,.5,0,.25,1,depth,'wall',true);
    box('glass',side*width/2,1.8,0,.08,1.6,depth-.5,'window',true);
    if(!observation)box('domesticPaint',side*width/2,(height+2.6)/2,0,.25,height-2.6,depth,'wall',true);
    box('walnut',side*(width/2-.16),.10,0,.10,.2,depth-.4,'skirting');
    for(let z=-depth/2+1;z<depth/2;z+=3.2)box('metal',side*(width/2-.07),1.8,z,.10,1.7,.07,'window-frame');
  }
  box('domesticPaint',0,observation?.55:height/2,-depth/2,width,observation?1.1:height,.25,'wall',true);
  const segment=(width-3.6)/2;
  for(const side of [-1,1])box('domesticPaint',side*(1.8+segment/2),observation?.6:height/2,depth/2,segment,observation?1.2:height,.25,'wall',true);
  if(!ground)box('glass',0,1.3,depth/2,3.6,2.6,.08,'window',true);
  const elevator={x:building.x,z:building.z-depth/2+3.7,y:floor.y,width:4.4,depth:4.6,doorZ:building.z-depth/2+6};
  const entrance={x:building.x,z:building.z+depth/2-2.8,yaw:Math.PI};
  label('LIFT · 电梯',0,2.7,-depth/2+6.15,3,.35);
  label(`${building.name} · ${floor.label.split(' · ')[0]}`,0,Math.min(3.2,height-.4),depth/2-.2,Math.min(width-1,5),.35,Math.PI);
  if(ground)label('EXIT · 街道',-2.2,2.2,depth/2-.2,1.2,.22,Math.PI);
  const minX=-width/2+.35,maxX=-1.45,minZ=-depth/2+7,maxZ=depth/2-.5;
  const span=(maxZ-minZ)/2;
  const programmeOffset=floor.id==='gallery'?2:0;
  for(let i=0;i<2;i++) {
    const roomDesign=design.rooms[(i+programmeOffset)%4],a=minZ+i*span+.12,b=minZ+(i+1)*span-.12,centre=(a+b)/2;
    const room={...roomDesign,x:building.x+(minX+maxX)/2,z:building.z+centre,width:maxX-minX,depth:b-a,enclosed:!observation,
      bounds:{minX:building.x+minX,maxX:building.x+maxX,minZ:building.z+a,maxZ:building.z+b},
      entrance:{x:building.x+maxX+.10,z:building.z+centre},arrival:{x:building.x+maxX-1.15,z:building.z+centre},
      art:{...design.collection,composition:i,variant:building.index+i},number:roomDesign.number||`${floor.level}${i+1}`};rooms.push(room);
    const firstPart=parts.length;
    if(!observation) {
      // Split the room partition around a full two-metre doorway.
      for(const [lo,hi] of [[a,centre-1],[centre+1,b]])if(hi-lo>.02)box('domesticPaint',maxX,height/2,(lo+hi)/2,.18,height,hi-lo,'partition',true);
      box('domesticPaint',(minX+maxX)/2,height/2,a,maxX-minX,height,.18,'partition',true);
      if(i===1)box('domesticPaint',(minX+maxX)/2,height/2,b,maxX-minX,height,.18,'partition',true);
    }
    const farX=minX+1.15,backZ=a+.75;
    if(room.type==='bedroom') {
      round('walnut',farX,.20,centre,1.55,.30,Math.min(2.1,b-a-.6),'bed-frame',true);
      round('fabric',farX,.43,centre,1.52,.20,Math.min(2.0,b-a-.65),'mattress');
      round('upholstery',farX,.56,centre+.32,1.48,.12,1.2,'quilt');round('white',farX,.61,centre-.62,1.15,.17,.45,'pillow');
      box('walnut',farX,.85,a+.2,1.6,1.45,.25,'headboard');
    } else if(room.type==='bath') {
      round('ceramic',farX,.64,backZ,1.0,.36,.64,'basin',true);
      box('steel',farX,.98,backZ-.18,.045,.37,.045,'tap');box('glass',farX,1.55,a+.14,1.05,.88,.04,'mirror');
      round('ceramic',farX,.37,b-.62,.65,.62,.85,'toilet',true);
    } else {
      round(room.type==='kitchen'?'ceramic':'timber',farX,.80,backZ,1.65,.12,.75,'table',true);
      for(const dx of [-.60,.60])for(const dz of [-.25,.25])box('metal',farX+dx,.37,backZ+dz,.07,.74,.07,'table-leg');
      round('upholstery',farX,.46,Math.min(b-.65,backZ+1.08),.65,.17,.58,'chair',true);
      round('upholstery',farX,.82,Math.min(b-.83,backZ+.87),.65,.61,.13,'chair-back');
      if(room.type==='kitchen') {
        round('ceramic',farX-.35,.98,backZ,.24,.24,.24,'cup',false);
        round('metal',farX+.28,.885,backZ,.40,.08,.34,'hob');
      } else {
        box('paper',farX-.35,.89,backZ+.1,.32,.05,.23,'book');
        box('dark',farX+.3,1.16,backZ-.20,.57,.39,.05,'screen');
      }
    }
    if(b-a>5) {
      round('upholstery',minX+1.1,.47,b-1.2,1.75,.60,.9,'sofa',true);
      round('upholstery',minX+1.1,.87,b-1.58,1.75,.65,.17,'sofa-back');
    }
    box('walnut',minX+.25,1.15,backZ,.35,2.1,1.0,'shelf',true);
    for(let j=0;j<5;j++)box(j%2?'paper':'navy',minX+.37,.60+j*.24,backZ,.17,.18,.40,'shelf-book');
    label(room.name,maxX+.12,2.1,centre,1.65,.25,-Math.PI/2);
    for(const part of parts.slice(firstPart))part.roomId=room.id;
  }
  const flight=outgoing||incoming;
  if(outgoing) {
    const cx=outgoing.x-building.x,start=outgoing.startZ-building.z,tread=outgoing.run/outgoing.treadCount;
    for(let i=0;i<outgoing.treadCount;i++) {
      const top=(i+1)*outgoing.rise/outgoing.treadCount,z=start-(i+.5)*tread;
      box('interiorStone',cx,top-.10,z,outgoing.width,.2,tread+.01,'stair-tread');
      box('brass',cx,top+.006,z+tread/2-.023,outgoing.width,.012,.045,'stair-nosing');
      for(const side of [-1,1]) {
        box('metal',cx+side*(outgoing.width/2+.09),top+.54,z,.07,1.08,tread+.01,'stair-guard',true);
        box('timber',cx+side*(outgoing.width/2+.09),top+1.10,z,.09,.08,tread+.01,'stair-handrail');
      }
    }
    box('interiorStone',cx,outgoing.rise-.12,start-outgoing.run-.55,outgoing.width,.24,1.1,'stair-landing');
  }
  if(incoming&&!outgoing) {
    const cx=incoming.x-building.x,start=incoming.startZ-building.z;
    for(const side of [-1,1])box('metal',cx+side*(incoming.width/2+.09),.55,start-incoming.run/2,.07,1.1,incoming.run,'stair-guard',true);
    box('metal',cx,.55,start+.30,incoming.width+.18,1.1,.07,'stair-end-guard',true);
  }
  if(flight)label('楼梯 · 逐层可达',flight.x-building.x,1.9,depth/2-1.35,1.8,.25,Math.PI);
  return {buildingId:building.id,floorId:floor.id,category:design.category,design,rooms,parts,colliders,labels,lights,
    width,depth,height,elevator,entrance,stairs,groundY:floor.y,observation};
}
