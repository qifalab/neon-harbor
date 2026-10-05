/** A single original two-floor dwelling, in stable city metres.
 * Furniture, assets and collision belong to the floor owner. Room identifiers,
 * entrance, lift, stairs, programmes and the player's saved life stay intact.
 */
export const AUTHORED_HOME = Object.freeze({buildingId:'south-079', floors:['lobby','gallery'],
  nearDistance:24, farDistance:32, lod:{near:6,middle:14,hysteresis:.75}});
export const HOME_MODELS = Object.freeze({
  sofa_03:{meshes:2,textured:true}, old_bed_frame:{meshes:1,textured:true},
  'home-lobby-fittings':{meshes:14,textured:false,original:true},
  'home-gallery-fittings':{meshes:16,textured:false,original:true},
});
export const isAuthoredHome = (building,floor) => building?.id===AUTHORED_HOME.buildingId && AUTHORED_HOME.floors.includes(floor?.id);
// Axis-aligned occupied furniture footprints. The bed uses separate narrow
// end panels and a low mattress, never one 1.2 m tall bounding-box collider.
export const HOME_BODIES = Object.freeze({
  lobby:[
    ['sofa',-6.7,-.95,2.73117733,.925084204,0,1.118264037,'fabric'],
    ['coffee-table',-6.7,.48,1.20,.65,0,.46,'timber'],
    ['reading-chair',-5.05,1.75,.62,.65,0,.93,'timber'],
    ['bookcase',-8.00,1.55,.45,1.30,0,1.62,'timber'],
    ['window-writing-desk',-6.50,2.57,1.40,.56,0,.765,'timber'],
    ['writing-chair',-6.50,1.87,.52,.55,0,.94,'timber'],
    ['plant-pot',-4.50,2.49,.32,.32,0,.43,'terracotta'],
    ['bed-mattress',-7.25,5.30,.80,1.85,0,.64,'fabric'],
    ['bed-head',-7.25,4.33,.905,.065,.38,1.202,'metal'],
    ['bed-foot',-7.25,6.27,.905,.065,.38,.80,'metal'],
    ['bedside-table',-6.37,4.56,.42,.42,0,.55,'timber'],
    ['wardrobe',-5.20,7.72,1.70,.52,0,2.195,'timber'],
    ['bedroom-writing-desk',-5.15,4.22,1.20,.55,0,.77,'timber'],
    ['bedroom-chair',-5.15,4.77,.53,.56,0,.96,'timber'],
    ['coat-and-shoes',-4.45,7.05,.45,.42,0,1.66,'timber'],
  ],
  gallery:[
    ['kitchen-main-counter',-8.12,.78,.65,3.75,0,.94,'timber'],
    ['kitchen-return-counter',-7.05,-1.30,1.80,.63,0,.94,'timber'],
    ['kitchen-wall-storage',-7.05,-1.57,1.60,.28,1.45,2.36,'timber'],
    ['fridge',-5.40,-1.08,.65,.72,0,1.79,'metal'],
    ['dining-table',-5.90,2.05,1.32,.75,0,.77,'timber'],
    ['dining-chair-rear',-5.90,1.16,.53,.55,0,.96,'timber'],
    ['dining-chair-front',-5.90,2.92,.53,.55,0,.96,'timber'],
    ['washing-machine',-7.90,4.02,.65,.67,0,.88,'metal'],
    ['laundry-basket',-7.90,4.83,.45,.43,0,.58,'fabric'],
    ['basin-vanity',-6.70,4.02,.91,.53,0,.98,'timber'],
    ['toilet',-5.25,4.19,.45,.72,0,.83,'porcelain'],
    ['bath-storage',-5.00,7.57,1.20,.50,0,1.72,'timber'],
    ['shower-back-glass',-8.20,6.62,.025,1.55,.025,2.03,'glass'],
    ['shower-side-glass',-7.30,7.40,1.80,.025,.025,2.03,'glass'],
  ],
});
const structuralKinds = new Set(['detail','partition','door-jamb','door-lintel','ceiling','room-floor','floor','wall','window','skirting','trim']);
export function applyAuthoredHomeLayout(building,floor,layout) {
  if(!isAuthoredHome(building,floor))return layout;
  const expected=floor.id==='lobby'?['living','bedroom']:['kitchen','bath'];
  if(layout.rooms.length!==2 || expected.some((type,i)=>layout.rooms[i]?.type!==type))
    throw new Error('south-079 home requires its existing four room programmes');
  const roomIds=new Set(layout.rooms.map(r=>r.id));
  const replaced=layout.parts.filter(p=>roomIds.has(p.roomId)&&!structuralKinds.has(p.kind));
  const removed=new Set(replaced.map(p=>p.id));
  const colliders=HOME_BODIES[floor.id].map(([id,dx,dz,sx,sz,min,max])=>({
    id:`south-079:${floor.id}:home:${id}`,kind:'interior-home-furniture',
    x:building.x+dx,z:building.z+dz,hx:sx/2,hz:sz/2,minY:floor.y+min,maxY:floor.y+max,physics:true,camera:true}));
  const fallbackParts=HOME_BODIES[floor.id].map(([id,dx,dz,sx,sz,min,max,material])=>({
    id:`south-079:${floor.id}:home-fallback:${id}`,kind:'home-fallback',geometry:'box',material:({fabric:'upholstery',terracotta:'ceramic',porcelain:'ceramic'})[material]||material,
    roomId:layout.rooms[dz<3.25?0:1].id,x:building.x+dx,y:floor.y+(min+max)/2,z:building.z+dz,
    sx,sy:max-min,sz}));
  const fit={id:`home-${floor.id}-fittings`,position:{x:building.x,y:floor.y,z:building.z},scale:1,rotationY:0,
    purpose:'Original metric furniture, kitchen/laundry fixtures, soft bedding and personal objects'};
  const placements=floor.id==='lobby'?[
    {id:'sofa_03',position:{x:building.x-6.7,y:floor.y-.000628394599,z:building.z-.95+.001341447234},scale:1,rotationY:0,
      purpose:'Real-size upholstered three-seat sofa, facing the reading space'},
    {id:'old_bed_frame',position:{x:building.x-7.25-.004722446203,y:floor.y-.0000000503531545,z:building.z+5.30-.002411544323},scale:1,rotationY:0,
      purpose:'Real-size single metal bed, fitted with a mattress, folded duvet and pillow'},fit]:[fit];
  const home={authored:true,placements,colliders,fallbackParts,
    centre:{x:layout.rooms[0].x,y:floor.y,z:(layout.rooms[0].z+layout.rooms[1].z)/2},
    viewCentres:layout.rooms.map(r=>({x:r.x,z:r.z})),lod:AUTHORED_HOME.lod,
    requiredClearAisles:layout.rooms.map(r=>({id:r.id+':entry-aisle',minX:building.x-3.5,maxX:building.x-1.5,
      minZ:r.bounds.minZ+.30,maxZ:r.bounds.maxZ-.30,minimumWidth:2})),
    untouchedCore:{entrance:layout.entrance,elevator:layout.elevator,stairs:layout.stairs},
    scope:'Four existing room IDs on two adjacent floors, static authored dwelling; no inventory/work/life changes'};
  return {...layout,parts:layout.parts.filter(p=>!removed.has(p.id)),
    colliders:[...layout.colliders.filter(p=>!removed.has(p.id)),...colliders],homeAuthored:home,
    homeReplacedPartIds:[...removed]};
}
