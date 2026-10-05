// Six hand specified shop elevations. All dimensions are metres and fitted to
// the existing storefront plane; this module never changes simulation routes.
export const FRONTAGE_PROFILES = Object.freeze({
  books: Object.freeze({ name: 'recessed timber print shop', radius: .34, frame: 'wood', bays: [[-4.7,4.05,2.73,.43],[0,1.9,3.08,.02],[4.7,4.05,2.73,.43]], transom: 2.24, blinds: 0 }),
  cafe: Object.freeze({ name: 'low tile tea room', radius: .24, frame: 'wood', bays: [[-4.4,5.2,2.44,.59],[0,1.72,3.02,.04],[4.4,5.2,2.44,.59]], transom: 1.92, blinds: 1 }),
  market: Object.freeze({ name: 'rolled shutter produce windows', radius: .055, frame: 'metal', bays: [[-4.65,4.8,2.66,.30],[0,2.2,2.87,.13],[4.65,4.8,2.66,.30]], transom: 2.68, blinds: 2 }),
  gallery: Object.freeze({ name: 'tall bronze craft windows', radius: .09, frame: 'metal', bays: [[-4.5,5.5,2.85,.18],[0,1.56,3.06,.03],[4.5,5.5,2.85,.18]], transom: 2.96, blinds: 0 }),
  noodles: Object.freeze({ name: 'tiled noodle room with folding panes', radius: .07, frame: 'wood', bays: [[-4.65,4.8,2.36,.66],[0,1.8,3.07,.02],[4.65,4.8,2.36,.66]], transom: 1.73, blinds: 1 }),
  bakery: Object.freeze({ name: 'asymmetric timber bakery display', radius: .16, frame: 'wood', bays: [[-4.65,4.65,2.59,.40],[0,2.02,3.04,.03],[4.5,4.95,2.25,.74]], transom: 2.47, blinds: 0 }),
});

function outline(path,w,h,r,reverse) {
  const x=-w/2;
  if (!reverse) {
    path.moveTo(x+r,0);path.lineTo(x+w-r,0);path.quadraticCurveTo(x+w,0,x+w,r);
    path.lineTo(x+w,h-r);path.quadraticCurveTo(x+w,h,x+w-r,h);
    path.lineTo(x+r,h);path.quadraticCurveTo(x,h,x,h-r);
    path.lineTo(x,r);path.quadraticCurveTo(x,0,x+r,0);
  } else {
    path.moveTo(x+r,0);path.quadraticCurveTo(x,0,x,r);path.lineTo(x,h-r);
    path.quadraticCurveTo(x,h,x+r,h);path.lineTo(x+w-r,h);
    path.quadraticCurveTo(x+w,h,x+w,h-r);path.lineTo(x+w,r);
    path.quadraticCurveTo(x+w,0,x+w-r,0);path.lineTo(x+r,0);
  }
}

export function createFrontageFrame(THREE,width,height,radius=.08) {
  const edge=.105, shape=new THREE.Shape(), hole=new THREE.Path();
  outline(shape,width,height,Math.min(radius,height/3),false);
  outline(hole,width-edge*2,height-edge*2,Math.max(.018,radius-edge),true);
  hole.translate?.(0,edge);
  if (!hole.translate) for (const curve of hole.curves) for (const key of ['v0','v1','v2','v3']) if (curve[key]) curve[key].y+=edge;
  shape.holes.push(hole);
  const g=new THREE.ExtrudeGeometry(shape,{depth:.16,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,curveSegments:5,steps:1});
  g.computeBoundingBox();g.computeBoundingSphere();return g;
}

/** Geometry is merged by the owner and released with that storefront. No new
 * global textures, lights, materials or invisible furniture colliders appear. */
export function addAuthoredGroundElevation(THREE,{site,add,b,c,materials:m,clay,stone}) {
  const profile=FRONTAGE_PROFILES[site.programme];
  if (!profile) throw new Error('Missing authored storefront profile: '+site.programme);
  const frame=m[profile.frame], spans=profile.bays.map(([x,w])=>[x-w/2,x+w/2]).sort((a,b)=>a[0]-b[0]);
  let last=-site.width/2;
  for(const [start,end] of spans) {
    const right=Math.max(last,Math.min(site.width/2,start));
    if(right-last>.04)b(clay,(right+last)/2,1.58,.34,right-last,3.12,.20);
    last=Math.min(site.width/2,Math.max(last,end));
  }
  if(site.width/2-last>.04)b(clay,(site.width/2+last)/2,1.58,.34,site.width/2-last,3.12,.20);
  for(const [u,width,originalHeight,originalBottom] of profile.bays) {
    const publicDoor=site.side===0&&Math.abs(u)<.01;
    // The east elevation is a display window; the public entrance faces south.
    const bottom=!publicDoor&&width<=3?.50:originalBottom;
    const height=originalHeight-(bottom-originalBottom);
    b(clay,u,bottom+height+(3.15-bottom-height)/2,.34,width,Math.max(.03,3.15-bottom-height),.20);
    if(bottom>.06){b(clay,u,bottom/2,.34,width,bottom,.20);b(m.grout,u,Math.min(bottom,.52)/2,.47,width,Math.min(bottom,.52),.10);}
    // Set glazing back inside a solid, bevelled frame. A double sill, narrow
    // muntins and hardware give the oblique view a depth cue rather than a decal.
    add(frame,createFrontageFrame(THREE,width,height,profile.radius),u,bottom,.52);
    b(m.dark,u,bottom+height/2,.43,width-.17,height-.16,.07);
    b(m.glass,u,bottom+height/2,.505,width-.23,height-.22,.025);
    b(stone,u,bottom+.022,.66,width+.10,.044,.35);
    b(frame,u,bottom+height+.022,.61,width+.13,.07,.23);
    if(width>3||!publicDoor){
      const divisions=width<=3?2:site.programme==='noodles'?4:site.programme==='gallery'?2:3;
      for(let i=1;i<divisions;i++)b(frame,u-width/2+i*width/divisions,bottom+height/2,.635,.039,height-.19,.07);
      if(profile.transom>bottom&&profile.transom<bottom+height-.12)b(frame,u,profile.transom,.638,width-.17,.044,.08);
    } else {
      b(frame,u,1.30,.64,.048,2.45,.095);
      for(const sign of [-1,1])c(m.metal,u+sign*.39,1.15,.74,.019,.27);
      b(m.metal,u,.10,.645,width-.23,.13,.055);
    }
    if(profile.blinds===2&&width>3){
      // The roll sits over the opening; individual corrugations follow the
      // cylinder instead of duplicating a square blind on every shop.
      c(m.metal,u,bottom+height-.07,.76,.095,width-.13,0,Math.PI/2);
      for(let i=0;i<7;i++)b(m.metal,u,bottom+height-.18-i*.043,.715,width-.19,.023,.035);
      for(const d of[-1,1])b(m.metal,u+d*(width/2-.11),bottom+height/2,.70,.042,height-.16,.06);
    } else if(profile.blinds===1&&width>3){
      for(let i=0;i<7;i++)b(m.wood,u,bottom+height-.20-i*.068,.691,width-.28,.034,.045);
    }
  }
  if(site.side!==0) {
    // Fit the same physical public door used by the interior system. Transform
    // it into this east-frontage batch without moving any furniture collider.
    const cosine=Math.cos(site.angle),sine=Math.sin(site.angle),shell=site.shell;
    const door=(material,geometry,x,y,z,sx=1,sy=1,sz=1)=>{
      const dx=shell.x-site.x+x,dz=shell.z+shell.depth/2-site.z+z;
      add(material,geometry,cosine*dx-sine*dz,y,sine*dx+cosine*dz,sx,sy,sz,0,-site.angle,0);
    };
    const panel=(material,x,y,z,sx,sy,sz)=>door(material,new THREE.BoxGeometry(1,1,1),x,y,z,sx,sy,sz);
    door(frame,createFrontageFrame(THREE,2.10,3.06,profile.radius),0,.02,.52);
    panel(m.dark,0,1.55,.43,1.93,2.90,.07);
    panel(m.glass,0,1.55,.505,1.87,2.84,.025);
    panel(frame,0,1.50,.64,.048,2.84,.095);
    for(const sign of[-1,1])door(m.metal,new THREE.CylinderGeometry(1,1,1,10),sign*.39,1.15,.74,.019,.27,.019);
    panel(stone,0,.042,.66,2.20,.044,.35);
    panel(frame,0,3.102,.61,2.23,.07,.23);
  }
  // Fasteners, a recessed service hatch and properly joined gutter elbows stay
  // on the existing facade plane; the walking strip and doorway remain clear.
  for(const side of[-1,1]) {
    const x=side*(site.width/2-.20);
    for(const y of[.81,2.11,3.11]){
      b(m.metal,x,y,.69,.13,.036,.035);
      c(m.metal,x,y,.724,.018,.045,Math.PI/2);
    }
    const elbow=new THREE.TorusGeometry(.11,.034,6,10,Math.PI/2);
    add(m.metal,elbow,x,3.41,.78,1,1,1,0,0,side<0?0:Math.PI/2);
    c(m.metal,x,3.55,.89,.034,.28);
  }
  b(m.dark,site.width/2-.74,.90,.554,.63,.66,.038);
  for(let i=0;i<8;i++)b(m.metal,site.width/2-.74,.65+i*.066,.586,.55,.017,.016);
  return profile.name;
}
