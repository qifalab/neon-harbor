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
