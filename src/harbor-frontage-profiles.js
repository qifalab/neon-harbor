import {createMorningTinCup,createMorningTinHandle} from './harbor-bread-art.js';
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

// Only the two inspected shop programmes opt into these original forms.
// Closed baked crust has real recessed scores, not paper marks on an ellipsoid.
export function createBakedDisplayLoaf(THREE,variant=0) {
 const a=.143+(variant%3)*.009,b=.086+((variant+1)%3)*.006,h=.123+(variant%2)*.009;
 const cuts=variant%2?[-.065,.040]:[-.078,0,.078],nx=24,nz=12,p=[],uv=[],crustColors=[],crumbColors=[],ix=[];
 const dome=(x,z)=>Math.pow(Math.max(0,1-(x/a)**2-(z/b)**2),.44);
 const oldTop=(x,z)=>Math.max(0,h*dome(x,z)*(1+.025*Math.sin(x*37+variant)*Math.sin(z*29+.7))-cuts.reduce((n,c)=>n+.007*Math.exp(-(((x+.32*z-c)/.011)**2)),0)*dome(x,z)**2);
 let oldMaximum=0;for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const z=(j/nz*2-1)*b,x=(i/nx*2-1)*a*Math.sqrt(Math.max(0,1-(z/b)**2));oldMaximum=Math.max(oldMaximum,oldTop(x,z));}
 const score=(x,z)=>{let strength=0;for(const [i,c]of cuts.entries()){const bend=.0025*Math.sin(z*41+i*.8+variant),width=.0095*(.88+.12*Math.sin(z*53+variant+i)),d=(x+.32*z-c-bend)/width;strength=Math.max(strength,Math.exp(-d*d));}return strength;};
 const top=(x,z)=>{const shell=dome(x,z),asym=1+.019*Math.sin(x*39+variant)*Math.sin(z*27+.7)+.009*Math.cos(x*71-z*19+variant);return Math.min(oldMaximum,Math.max(0,h*shell*asym-score(x,z)*.013*shell*shell));};
 const exposed=new THREE.Color(0xdbb679),bakedLip=new THREE.Color(0x935523),color=new THREE.Color();
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const z=(j/nz*2-1)*b,x=(i/nx*2-1)*a*Math.sqrt(Math.max(0,1-(z/b)**2)),y=top(x,z),grain=.5+.5*Math.sin(x*47+z*39+variant);
  p.push(x,y,z);const u=(x/a+1)/2,v=(z/b+1)/2;uv.push((variant%2?1-u:u)+variant*.137,v+variant*.093);
  // The original color map supplies toasted color; neutral vertices avoid
  // multiplying it by the previous dark-brown dome tint a second time.
  const tint=.96+.04*grain;crustColors.push(tint,tint,tint);
  color.copy(bakedLip).lerp(exposed,Math.min(.90,score(x,z)*(.72+.18*grain)));crumbColors.push(color.r,color.g,color.b);
  if(i<nx&&j<nz){const q=j*(nx+1)+i;ix.push(q,q+nx+1,q+1,q+1,q+nx+1,q+nx+2);}
 }
 const edge=[];for(let i=0;i<=nx;i++)edge.push(i);for(let j=1;j<=nz;j++)edge.push(j*(nx+1)+nx);for(let i=nx-1;i>=0;i--)edge.push(nz*(nx+1)+i);for(let j=nz-1;j>0;j--)edge.push(j*(nx+1));
 const centre=p.length/3;p.push(0,0,0);uv.push(.5+variant*.137,.5+variant*.093);crustColors.push(.90,.90,.90);crumbColors.push(bakedLip.r,bakedLip.g,bakedLip.b);
 const crustIndices=[],scoreIndices=[];
 for(let i=0;i<ix.length;i+=3){const [ia,ib,ic]=ix.slice(i,i+3),x=(p[ia*3]+p[ib*3]+p[ic*3])/3,z=(p[ia*3+2]+p[ib*3+2]+p[ic*3+2])/3;(score(x,z)>.34&&Math.abs(z)<b*.76?scoreIndices:crustIndices).push(ia,ib,ic);}
 for(let i=0;i<edge.length;i++)crustIndices.push(centre,edge[(i+1)%edge.length],edge[i]);
 const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(p,3));shell.setIndex([...crustIndices,...scoreIndices]);shell.computeVertexNormals();const normals=shell.attributes.normal;
 const make=(indices,tints)=>{const used=[...new Set(indices)],mapping=new Map(used.map((v,i)=>[v,i])),positions=[],texcoords=[],colors=[],ns=[];for(const v of used){positions.push(...p.slice(v*3,v*3+3));texcoords.push(...uv.slice(v*2,v*2+2));colors.push(...tints.slice(v*3,v*3+3));ns.push(normals.getX(v),normals.getY(v),normals.getZ(v));}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(texcoords,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(ns,3));g.setIndex(indices.map(v=>mapping.get(v)));g.computeBoundingBox();return g;};
 // Crumb triangles replace crust triangles in one continuous original shell.
 // The two sets share exact Float32 positions, with no ribbon offset or overlay.
 const crust=make(crustIndices,crustColors),scores=make(scoreIndices,crumbColors);shell.dispose();return{crust,scores,variant,halfWidth:a,halfDepth:b,height:h,cutDepth:.013,scoreTopology:'disjoint-index-partition-of-shared-shell'};
}

// Smooth continuous thrown profile, closed foot, inner wall and rounded thick
// mouth. Old ceramic display maximum radius/height are explicit arguments.
export function createCraftVesselGeometry(THREE,radius=.096,height=.29) {
 const control=[[.54,0],[.88,.19],[1,.44],[.94,.63],[.62,.82],[.43,.94],[.51,.978]].map(([r,y])=>new THREE.Vector2(r*radius,y*height));
 const curve=new THREE.SplineCurve(control),old=curve.getPoints(7).map(v=>Math.min(radius,Math.max(radius*.43,v.x))),maximum=Math.max(...old);
 const outer=curve.getPoints(24).map(v=>new THREE.Vector2(Math.max(radius*.43,v.x),Math.min(height*.978,Math.max(0,v.y))));
 const scale=maximum/Math.max(...outer.map(v=>v.x));
 for(const p of outer)p.x=Math.min(maximum,p.x*scale);
 outer[0].y=0;
 const lipOuter=outer.at(-1).x,lipInner=lipOuter-radius*.11,lipMiddle=(lipOuter+lipInner)/2;
 const points=[new THREE.Vector2(0,0),...outer];
 for(let i=1;i<=4;i++){const a=i*Math.PI/4;points.push(new THREE.Vector2(lipMiddle+radius*.055*Math.cos(a),height*.978+height*.022*Math.sin(a)));}
 const inner=curve.getPoints(16).map(v=>new THREE.Vector2(Math.min(maximum,Math.max(radius*.43,v.x)*scale),Math.min(height*.978,Math.max(0,v.y))));
 points.push(...inner.reverse().map(v=>new THREE.Vector2(Math.max(radius*.28,v.x-radius*.11),Math.max(height*.035,v.y-height*.018))),new THREE.Vector2(0,height*.035),new THREE.Vector2(0,0));
 const g=new THREE.LatheGeometry(points,32),position=g.getAttribute('position'),uv=g.getAttribute('uv'),indices=[];
 // Physical height coordinates keep pigment/grain density coherent on both
 // sides of the rim. Remove the axis-ring zero-area triangles from the mesh.
 for(let i=0;i<uv.count;i++)uv.setY(i,position.getY(i)/height);
 for(let i=0;i<g.index.count;i+=3){const a=g.index.getX(i),b=g.index.getX(i+1),c=g.index.getX(i+2),ax=position.getX(b)-position.getX(a),ay=position.getY(b)-position.getY(a),az=position.getZ(b)-position.getZ(a),bx=position.getX(c)-position.getX(a),by=position.getY(c)-position.getY(a),bz=position.getZ(c)-position.getZ(a);if((ay*bz-az*by)**2+(az*bx-ax*bz)**2+(ax*by-ay*bx)**2>1e-20)indices.push(a,b,c);}
 g.setIndex(indices);g.computeVertexNormals();
 // computeVertexNormals splits the duplicated UV seam; restore a continuous
 // thrown surface across the first/last meridian without changing UVs.
 const normals=g.getAttribute('normal'),normal=new THREE.Vector3(),last=32*points.length;
 for(let j=0;j<points.length;j++){normal.set(normals.getX(j)+normals.getX(last+j),normals.getY(j)+normals.getY(last+j),normals.getZ(j)+normals.getZ(last+j)).normalize();normals.setXYZ(j,normal.x,normal.y,normal.z);normals.setXYZ(last+j,normal.x,normal.y,normal.z);}
 g.computeBoundingBox();g.computeBoundingSphere();return g;
}

// A shallow, real display fits inside the existing window frame. None of
// these goods supplies stock or collision; the occupied shop counter remains
// the only source of finite purchases.
function addWindowDisplay(THREE,{site,programme,u,width,bottom,height,add,b,materials:m}) {
  const inner=width-.30, shelfY=bottom+.30, depth=.39;
  b(m.dark,u,bottom+height/2,.20,width-.17,height-.16,.04);
  b(m.wood,u,shelfY,depth,inner,.045,.30);
  if(height>1.7)b(m.wood,u,shelfY+.66,depth,inner,.035,.28);
  const refinedCraft=site?.shellId==='south-096'&&programme==='gallery',refinedBake=site?.shellId==='south-094'&&programme==='bakery';
  const count=refinedCraft?2:inner>3?5:3, step=Math.min(.53,(inner-.38)/(count-1));
  const at=i=>u+(i-(count-1)/2)*step;
  const curved=(material,geometry,x,y,z,sx=1,sy=1,sz=1)=>add(material,geometry,x,y,z,sx,sy,sz);
  const cup=(x,y,z)=>{
    const points=[[.054,0],[.068,.014],[.077,.12],[.069,.135],[.060,.118],[.047,.016]].map(([x,y])=>new THREE.Vector2(x,y));
    curved(refinedCraft?m.glaze:m.ceramic,refinedBake?createMorningTinCup(THREE):new THREE.LatheGeometry(points,refinedCraft?32:10),x,y,z);
    curved(refinedCraft?m.glaze:m.ceramic,refinedBake?createMorningTinHandle(THREE):new THREE.TorusGeometry(.040,.011,5,refinedCraft?16:10),x+.088,y+.075,z,1,1,1);
  };
  for(let i=0;i<count;i++) {
    const x=at(i),y=shelfY+.025,z=.405;
    if(programme==='market') {
      // Open, slatted produce crates leave the rounded fruit silhouettes visible.
      b(m.wood,x,y+.018,z,.40,.036,.24);
      for(const dx of[-.185,.185])b(m.wood,x+dx,y+.105,z,.030,.18,.24);
      for(const dz of[-.105,.105])for(const dy of[.065,.13])b(m.wood,x,y+dy,z+dz,.37,.034,.024);
      for(const dx of[-.092,.092])for(const dz of[-.054,.054])curved(m.fruit,new THREE.SphereGeometry(1,10,6),x+dx,y+.114,z+dz,.079,.074,.074);
    } else if(programme==='gallery') {
      if(refinedCraft)curved(i%2?m.clayForm:m.glaze,createCraftVesselGeometry(THREE),x,shelfY+.0225,z,1,i%2?1.16:1,1);
      else {
        const points=[[.052,0],[.091,.07],[.096,.16],[.043,.25],[.049,.29]].map(([x,y])=>new THREE.Vector2(x,y));
        curved(i%2?m.brick:m.ceramic,new THREE.LatheGeometry(points,12),x,y,z,1,1+(i%2)*.22,1);
        add(m.ceramic,new THREE.TorusGeometry(.045,.009,5,10),x,y+.29*(1+(i%2)*.22),z,1,1,1,Math.PI/2);
      }
    } else if(programme==='books') {
      for(let k=0;k<3;k++) {
        const h=.22+(k%2)*.07,bx=x-.105+k*.105;
        b(k%2?m.brick:m.grout,bx,y+h/2,z,.086,h,.20);
        b(m.paper,bx,y+h/2,z+.103,.064,h-.036,.010);
        b(m.paper,bx,y+.040,z+.113,.045,.012,.010);
      }
    } else if(programme==='bakery') {
      b(m.wood,x,y+.012,z,.38,.024,.26);
      if(refinedBake){const loaf=createBakedDisplayLoaf(THREE,i);curved(m.breadCrust,loaf.crust,x,y+.024,z);curved(m.breadCrumb,loaf.scores,x,y+.024,z);}
      else {curved(m.fruit,new THREE.SphereGeometry(1,12,7),x,y+.087,z,.165,.074,.101);for(const dx of[-.062,0,.062])b(m.paper,x+dx,y+.150,z,.014,.006,.080);}
    } else {
      if(programme==='noodles') {
        curved(m.ceramic,new THREE.SphereGeometry(.105,12,7,0,Math.PI*2,Math.PI/2,Math.PI/2),x,y+.105,z);
        b(m.wood,x,y+.111,z,.26,.011,.018);
      } else cup(x,y,z);
    }
    if(height>1.7) {
      if(programme==='books')for(let k=0;k<2;k++){b(k?m.brick:m.grout,x,shelfY+.69+k*.064,z,.32,.055,.23);b(m.paper,x,shelfY+.69+k*.064,z+.12,.28,.031,.01);}
      else if(programme==='market')curved(m.fruit,new THREE.SphereGeometry(1,10,6),x,shelfY+.77,z,.091,.083,.088);
      else cup(x,shelfY+(refinedCraft?.6775:.68),z);
    }
  }
  // The separate glazing does not write depth or cast an opaque shadow over
  // the real objects behind it. It remains non-emissive in both day and night.
  b(m.displayGlass,u,bottom+height/2,.675,width-.23,height-.22,.016);
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
    if(publicDoor) {
      b(m.dark,u,bottom+height/2,.43,width-.17,height-.16,.07);
      b(m.glass,u,bottom+height/2,.505,width-.23,height-.22,.025);
    } else addWindowDisplay(THREE,{site,programme:site.programme,u,width,bottom,height,add,b,materials:m});
    b(stone,u,bottom+.022,.66,width+.10,.044,.35);
    b(frame,u,bottom+height+.022,.61,width+.13,.07,.23);
    if(width>3||!publicDoor){
      const divisions=width<=3?2:site.programme==='noodles'?4:site.programme==='gallery'?2:3;
      for(let i=1;i<divisions;i++)b(frame,u-width/2+i*width/divisions,bottom+height/2,.635,.039,height-.19,.07);
      if(profile.transom>bottom&&profile.transom<bottom+height-.12)b(frame,u,profile.transom,.638,width-.17,.044,.08);
    } else {
      b(frame,u,1.30,.64,.048,2.45,.095);
      for(const sign of [-1,1])c(m.handle,u+sign*.39,1.15,.74,.019,.27);
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
    for(const sign of[-1,1])door(m.handle,new THREE.CylinderGeometry(1,1,1,10),sign*.39,1.15,.74,.019,.27,.019);
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
