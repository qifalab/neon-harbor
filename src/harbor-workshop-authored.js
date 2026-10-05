/** One authored workshop and archive, with independent support/collision.
 * Stable metres and room programmes; no residents, economy or transit changes.
 */
export const AUTHORED_WORKSHOP_MODELS = Object.freeze({
  bench_vice_01: {meshes:4, textured:true}, metal_tool_chest: {meshes:7, textured:true},
  metal_office_desk: {meshes:9, textured:true}, wooden_bookshelf_worn: {meshes:1, textured:true},
  'workshop-fittings': {meshes:11, textured:false, original:true},
});
const isTarget = (building,floor) => building?.id === 'south-086' && floor?.id === 'lobby';
export function applyAuthoredWorkshopLayout(building,floor,layout) {
  if(!isTarget(building,floor))return layout;
  const archive=layout.rooms.find(r=>r.type==='archive');
  if(!archive)throw new Error('Authored workshop requires the stable archive room');
  const kinds=new Set(['archive-shelf','archive-box','archive-label','reading-table','table-leg','reference-ledger']);
  const replaced=layout.parts.filter(p=>p.roomId===archive.id&&kinds.has(p.kind));
  const removed=new Set(replaced.map(p=>p.id));
  return {...layout, parts:layout.parts.filter(p=>!removed.has(p.id)),
    colliders:layout.colliders.filter(p=>!removed.has(p.id)),
    workshopAuthored:{version:1,replacedArchiveParts:replaced.map(p=>({...p})),
      scope:'Original workshop fittings and real CC0 retrieval desk / archive shelf; static set dressing, not a live job system'}};
}
export function extendAuthoredWorkshopPlan(building,floor,layout,basePlan) {
  if(!isTarget(building,floor)||!layout.workshopAuthored)return basePlan;
  const workshop=layout.rooms.find(r=>r.type==='workshop'), archive=layout.rooms.find(r=>r.type==='archive');
  const x=v=>building.x+v,z=v=>building.z+v,y=v=>floor.y+v;
  const desk={id:'metal_office_desk',position:{x:x(-12.6),y:y(0),z:z(9)},scale:1,rotationY:0,
    purpose:'Archive retrieval and receiving log desk, with circulation on all sides',ownerPartId:'authored-archive-retrieval-desk'};
  const shelf={id:'wooden_bookshelf_worn',position:{x:x(-18.8),y:y(0),z:z(3.8)},scale:1,rotationY:0,
    purpose:'Three joined reference shelves with one shared geometry/texture owner',ownerPartId:'authored-archive-reference-shelf',
    instances:[{x:0,y:0,z:0},{x:1.8,y:0,z:0},{x:3.6,y:0,z:0}]};
  const fittings={id:'workshop-fittings',position:{x:building.x,y:floor.y,z:building.z},scale:1,rotationY:0,
    purpose:'Original metric workbench, service stations, trolley, reference folders and labels',ownerPartId:'authored-workshop-fittings'};
  const replacementKinds=new Set(['workbench','workbench-top','workbench-leg','workbench-stretcher','workbench-shelf','tool-board','workshop-tool','freight-crate']);
  const replace=layout.parts.filter(p=>p.roomId===workshop.id&&replacementKinds.has(p.kind)).map(p=>p.id);
  const collider=(name,cx,cz,sx,sz,h)=>({id:`south-086:lobby:${name}`,kind:'interior-workshop-authored',x:x(cx),z:z(cz),hx:sx/2,hz:sz/2,minY:floor.y,maxY:y(h),physics:true,camera:true});
  const extra=[collider('retrieval-desk',-12.6,9.004496604204178,2.0000003576278687,.9472135305404663,.7875000238418579),
    ...[-18.8,-17,-15.2].map((sx,i)=>collider(`reference-shelf-${i}`,sx,3.8,1.37395179271698,.5813020169734955,2.063442051410675)),
    collider('service-cart',-12.3,-5.45,.86,.66,1.13),
    collider('receiving-station',-8.8,-5.65,1.8,.65,1.25),
    collider('collection-station',-8.8,1.9,1.8,.65,1.25),
    collider('repair-assembly-table',-14.3,1.5,2.4,.95,1.32),
    collider('parts-cabinet',-15.8,-6.6,1.2,.52,1.64),
    collider('document-sorting-table',-8.6,4.55,2.4,.82,.94),
    collider('retrieval-chair',-12.6,10.1,.55,.58,1.0)];
  const proxy=(name,cx,cy,cz,sx,sy,sz,material='metal')=>({id:`south-086:lobby:authored-fallback:${name}`,kind:'authored-furniture-fallback',geometry:'box',material,
    roomId:cz>=3.25?archive.id:workshop.id,x:x(cx),y:y(cy),z:z(cz),sx,sy,sz});
  const fallback=[...basePlan.fallbackParts,
    proxy('bench',-19.1,.93,-1.58,1.83,.06,.84,'timber'),
    ...[-.72,.72].map(dx=>proxy(`bench-leg-${dx}`,-19.1+dx,.43,-1.58,.085,.86,.64)),
    ...[-19.55,-18.65].map(cx=>proxy(`chest-support-${cx}`,cx,.34,-6.52,.62,.68,.66,'timber')),
    proxy('tool-board',-19.1,1.7,-7.01,1.85,1.12,.045),
    proxy('retrieval-desk',-12.6,.39,9,2,.78,.947),
    ...[-18.8,-17,-15.2].map((sx,i)=>proxy(`reference-shelf-${i}`,sx,1.03,3.8,1.374,2.063,.581,'timber')),
    proxy('service-cart',-12.3,.5,-5.45,.86,1,.66),
    proxy('receiving-station',-8.8,.55,-5.65,1.8,1.1,.65),
    proxy('collection-station',-8.8,.55,1.9,1.8,1.1,.65),
    proxy('repair-assembly-table',-14.3,.6,1.5,2.4,1.2,.95),
    proxy('parts-cabinet',-15.8,.8,-6.6,1.2,1.6,.52),
    proxy('document-sorting-table',-8.6,.46,4.55,2.4,.92,.82),
    proxy('retrieval-chair',-12.6,.5,10.1,.55,1,.58)];
  return {...basePlan,authored:true,placements:[...basePlan.placements,desk,shelf,fittings],colliders:[...basePlan.colliders,...extra],
    replacePartIds:[...basePlan.replacePartIds,...replace],fallbackParts:fallback,
    viewCentres:[basePlan.centre,{x:x(-19.1),z:z(-1.58)},{x:x(-12.6),z:z(9)},{x:x(-18.8),z:z(3.8)},{x:x(-12.3),z:z(-5.45)},{x:x(-8.8),z:z(-5.65)},{x:x(-8.8),z:z(1.9)}],
    lod:{near:6,middle:14,far:32,hysteresis:.75},
    requiredClearAisles:[{id:'workshop-main',minX:x(-17),maxX:x(-1.4),minZ:z(-3),maxZ:z(-1),minimumWidth:2},
      {id:'archive-main',minX:x(-16),maxX:x(-1.4),minZ:z(6),maxZ:z(8),minimumWidth:2}],
    untouchedCore:{entrance:layout.entrance,elevator:layout.elevator,stairs:layout.stairs}};
}

/** Local, reversible set dressing for the already authored furniture. All
 * vertices stay inside an existing furniture collider, including its height.
 * This owns no external asset or texture and never edits the collision plan. */
export function createAuthoredWorkshopDetails(THREE, plan) {
  const group = new THREE.Group(); group.name = 'Workshop · repair and archive detail';
  const origin = plan.placements.find(p => p.id === 'workshop-fittings').position;
  group.position.set(origin.x, origin.y, origin.z);
  const buckets = new Map(), records = [], temporary = new THREE.Object3D();
  const surfaces = [
    { name:'Used brushed steel', color:0xffffff, metalness:.78, roughness:.65 },
    { name:'Oxidised brass and fasteners', color:0xffffff, metalness:.60, roughness:.70 },
    { name:'Rubber cable and seals', color:0xffffff, metalness:0, roughness:.94 },
    { name:'Paper and woven shop cloth', color:0xffffff, metalness:0, roughness:.96 },
    { name:'Worn enamel storage', color:0xffffff, metalness:.24, roughness:.79 },
  ].map(p => new THREE.MeshStandardMaterial({...p, vertexColors:true}));
  const colours = [[.34,.39,.38],[.54,.37,.20],[.025,.036,.032],[.64,.59,.45],[.12,.23,.20]];
  const fit = name => {
    const c = plan.colliders.find(p => p.id === `south-086:lobby:${name}`);
    if (!c) throw new Error(`Workshop detail requires existing ${name} envelope`);
    return { id:c.id, min:[c.x-c.hx-origin.x,c.minY-origin.y,c.z-c.hz-origin.z],
      max:[c.x+c.hx-origin.x,c.maxY-origin.y,c.z+c.hz-origin.z] };
  };
  const add = (geometry, material, envelope, x,y,z, rotation=[0,0,0], name='detail', tint=colours[material]) => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone(); geometry.dispose();
    temporary.position.set(x,y,z);temporary.rotation.set(...rotation);temporary.updateMatrix();g.applyMatrix4(temporary.matrix);
    g.computeBoundingBox(); const box=g.boundingBox;
    for (let axis=0;axis<3;axis++) if(box.min.getComponent(axis)<envelope.min[axis]-1e-6||box.max.getComponent(axis)>envelope.max[axis]+1e-6) {
      g.dispose(); throw new Error(`Workshop ${name} exceeds ${envelope.id} on axis ${axis}`);
    }
    const colour = new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<colour.length;i+=3)colour.set(tint,i);
    g.setAttribute('color',new THREE.BufferAttribute(colour,3));
    if(!buckets.has(material))buckets.set(material,[]);buckets.get(material).push(g);
    records.push({name,envelope:envelope.id,min:box.min.toArray(),max:box.max.toArray(),triangles:g.attributes.position.count/3});
  };
  const box = (m,e,x,y,z,sx,sy,sz,name,tint) => add(new THREE.BoxGeometry(sx,sy,sz),m,e,x,y,z,[0,0,0],name,tint);
  const tube = (m,e,x,y,z,r,h,rotation,name,segments=12) => add(new THREE.CylinderGeometry(r,r,h,segments,1),m,e,x,y,z,rotation,name);
  const ring = (m,e,x,y,z,r,t,rotation,name) => add(new THREE.TorusGeometry(r,t,6,16),m,e,x,y,z,rotation,name);
  const cable = (e,points,r,name) => add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,7,false),2,e,0,0,0,[0,0,0],name);
  let disposed=false, summary;
  try {
    const a=fit('repair-assembly-table'), ax=-14.3, az=1.5;
    // Visible seals, hexagonal flange fixings and ribs break the former smooth
    // cylinder. They describe one pump assembly instead of adding another box.
    for(const side of[-1,1]) {
      ring(2,a,ax+.1,1.135,az+side*.207,.143,.009,[0,0,0],'pump flange gasket');
      for(let i=0;i<6;i++) {
        const angle=i*Math.PI/3;
        tube(1,a,ax+.1+Math.cos(angle)*.132,1.135+Math.sin(angle)*.132,az+side*.211,.017,.027,[Math.PI/2,0,0],'hexagonal flange nut',6);
      }
    }
    for(const dz of[-.12,-.06,0,.06,.12])ring(0,a,ax+.1,1.135,az+dz,.133,.0045,[0,0,0],'pump cooling rib');
    tube(1,a,ax+.285,1.025,az+.07,.028,.09,[0,0,Math.PI/2],'brass service union');
    cable(a,[[ax+.33,1.025,az+.07],[ax+.48,.997,az+.14],[ax+.52,.966,az+.29],[ax+.72,.963,az+.24]],.012,'curved service hose');
    tube(0,a,ax+.72,.963,az+.24,.020,.075,[0,0,Math.PI/2],'hose end coupling');
    // Small hand tools and a used cloth occupy the original worktop footprint.
    box(3,a,ax-.54,.937,az+.15,.30,.018,.19,'folded shop cloth',[.29,.34,.31]);
    tube(0,a,ax-.64,.962,az+.10,.008,.21,[0,0,Math.PI/2],'spanner shaft');
    for(const dx of[-.105,.105])ring(0,a,ax-.64+dx,.962,az+.10,.026,.006,[Math.PI/2,0,0],'spanner ring end');
    tube(1,a,ax-.18,.964,az-.22,.027,.035,[0,0,0],'removed seal spacer');
    // Open storage baskets below the existing table, rather than solid crates.
    for(const dx of[-.57,.57]) {
      box(4,a,ax+dx,.305,az,.48,.022,.54,'parts basket floor');
      for(const edge of[-1,1]) {
        for(const yy of[.35,.46,.57])box(4,a,ax+dx,yy,az+edge*.258,.48,.018,.016,'basket open horizontal rail');
        for(const zz of[-.20,0,.20])tube(0,a,ax+dx+edge*.23,.45,az+zz,.008,.28,[0,0,0],'basket upright');
      }
      for(let j=0;j<3;j++)ring(0,a,ax+dx-.13+j*.13,.333,az+.04,.048,.012,[Math.PI/2,0,0],'stored coupling ring');
    }
    const c=fit('parts-cabinet');
    box(4,c,-15.8,1.608,-6.6,.85,.018,.35,'cabinet shallow sorting tray');
    for(let j=0;j<6;j++)ring(j%2,c,-16.07+j*.105,1.628,-6.6,.027,.006,[Math.PI/2,0,0],'sorted cabinet washer');
    // Broken paint patches sit on the existing door surface, within the old
    // envelope; no door geometry, hinge or interaction is replaced.
    for(const [dx,yy,w,h]of[[-.40,.22,.12,.013],[.32,.51,.07,.017],[-.10,1.20,.11,.014]])
      box(1,c,-15.8+dx,yy,-6.3405,w,h,.001,'cabinet worn edge',[.30,.25,.18]);
    for(const [station,z]of[['receiving-station',-5.65],['collection-station',1.9]]) {
      const e=fit(station);
      for(let j=0;j<3;j++) {
        tube(0,e,-9.48+j*.52,.34,z,.13,.20,[0,0,0],'lower shelf parts can');
        ring(0,e,-9.48+j*.52,.442,z,.127,.010,[Math.PI/2,0,0],'can rolled rim');
        tube(2,e,-9.48+j*.52,.444,z,.107,.009,[0,0,0],'dark can opening');
      }
      ring(1,e,-8.055,1.016,z-.16,.060,.017,[Math.PI/2,0,0],'ready service coupling');
    }
    // The archive desktop is already dressed in the GLB. Its cable hangs
    // underneath, within the existing desk-height and footprint envelope.
    const d=fit('retrieval-desk');
    cable(d,[[-11.95,.735,8.70],[-11.89,.61,8.71],[-11.91,.40,8.74],[-12.06,.33,8.78],[-12.23,.42,8.78]],.009,'retrieval lamp supply cable');
    const s=fit('document-sorting-table');
    for(let j=0;j<3;j++)ring(0,s,-8.30+j*.11,.929,4.57,.020,.004,[Math.PI/2,0,0],'outgoing binder clip');
    // Shallow coloured reference tabs distinguish collections; they are at
    // real folder front surfaces inside each unchanged shelf's envelope.
    for(let i=0;i<3;i++) {
      const e=fit(`reference-shelf-${i}`);
      for(let j=0;j<4;j++)box(3,e,-19.25+i*1.8+j*.23,.82+j*.01,4.016,.075,.028,.003,'reference folder index tab',j%2?[.57,.33,.25]:[.56,.58,.43]);
    }
    for(const [index,geometries]of buckets) {
      const merged=new THREE.BufferGeometry();
      for(const name of['position','normal','uv','color']) {
        const size=name==='uv'?2:3,total=geometries.reduce((n,g)=>n+g.attributes[name].array.length,0),data=new Float32Array(total);
        let offset=0;for(const g of geometries){data.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
        merged.setAttribute(name,new THREE.BufferAttribute(data,size));
      }
      merged.computeBoundingBox();merged.computeBoundingSphere();
      const mesh=new THREE.Mesh(merged,surfaces[index]);mesh.name=surfaces[index].name;
      mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
    summary={meshes:group.children.length,triangles:records.reduce((n,r)=>n+r.triangles,0),textures:0,
      envelopeCount:new Set(records.map(r=>r.envelope)).size,detailPieces:records.length};
  } catch(error) {for(const mesh of group.children)mesh.geometry.dispose();for(const m of surfaces)m.dispose();throw error;
  } finally {for(const geometries of buckets.values())for(const g of geometries)g.dispose();}
  const dispose=()=>{if(disposed)return;disposed=true;for(const mesh of group.children)mesh.geometry.dispose();for(const material of surfaces)material.dispose();group.removeFromParent();group.clear();};
  return {group,records,summary,dispose};
}
