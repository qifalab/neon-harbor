/** Lane paths and anticipatory traffic control, shared by client and room service. */
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
const unit = (a,b) => { const d=distance(a,b); return {x:(b.x-a.x)/d,z:(b.z-a.z)/d}; };
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));

export function laneLoop(corners, lane=4, radius=7) {
  const offsets=corners.map((p,i)=>{
    const incoming=unit(corners[(i+corners.length-1)%corners.length],p),outgoing=unit(p,corners[(i+1)%corners.length]);
    return {x:p.x+lane*(incoming.z+outgoing.z),z:p.z-lane*(incoming.x+outgoing.x)};
  });
  const path=[];
  for(let i=0;i<offsets.length;i++){
    const p=offsets[i],incoming=unit(offsets[(i+offsets.length-1)%offsets.length],p),outgoing=unit(p,offsets[(i+1)%offsets.length]);
    const start={x:p.x-incoming.x*radius,z:p.z-incoming.z*radius},end={x:p.x+outgoing.x*radius,z:p.z+outgoing.z*radius};
    for(let j=0;j<=10;j++){
      const t=j/10,s=1-t;
      path.push({x:s*s*start.x+2*s*t*p.x+t*t*end.x,z:s*s*start.z+2*s*t*p.z+t*t*end.z,turn:true});
    }
  }
  return path;
}
export function routePose(route, fraction) {
  const lengths=route.map((p,i)=>distance(p,route[(i+1)%route.length]));
  let remaining=lengths.reduce((a,b)=>a+b,0)*fraction;
  for(let i=0;i<route.length;i++){
    if(remaining<=lengths[i]){const a=route[i],b=route[(i+1)%route.length],t=remaining/lengths[i];return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,yaw:Math.atan2(b.x-a.x,b.z-a.z),waypoint:(i+1)%route.length};}
    remaining-=lengths[i];
  }
  return {...route[0],yaw:0,waypoint:1};
}
export function trafficFleet(prefix,corners,count,cruise=12,reverse=false) {
  const route=laneLoop(reverse?[...corners].reverse():corners);
  const colors=[0xe7edf7,0xfaa75a,0x8095d4,0xd484af,0x5cd7bd];
  return Array.from({length:count},(_,i)=>({id:`${prefix}-${i}`,...routePose(route,(i+.3)/count),route,
    type:'sedan',color:colors[i%colors.length],health:100,traffic:true,pause:0,speed:cruise,cruise:cruise+(i%3-1)*.6,vx:0,vz:0}));
}
export function northernVehicles(){
  const colors=[0xa3b5b0,0xaa7253,0x417d84,0xcfba8a,0x93a2b4,0xc18d87];
  const parked=colors.map((color,i)=>({id:`north-parked-${i}`,x:6,z:-455-i*140,yaw:Math.PI,type:'sedan',color,
    home:{x:6,z:-455-i*140,yaw:Math.PI},speed:0,vx:0,vz:0,health:100,traffic:false}));
  for(let row=0;row<3;row++){
    const top=-420-row*280,bottom=top-140,corners=[{x:-640,z:top},{x:640,z:top},{x:640,z:bottom},{x:-640,z:bottom}];
    parked.push(...trafficFleet(`north-traffic-${row}`,corners,4,10+row,row===1));
  }
  return parked;
}
export function intersectionSignal(time, x, z, axis){
  // Stagger adjacent junctions to form a progression rather than one city-wide stop.
  const phase=((time+Math.round(x/80)*2+Math.round(z/140)*3)%28+28)%28;
  const green=axis==='x'?phase<12:phase>=14&&phase<26;
  const amber=axis==='x'?phase>=12&&phase<13:phase>=26&&phase<27;
  return green?'green':amber?'amber':'red';
}
function approachingIntersection(car){
  // Original roads have 80m spacing, the north shore has 160m by 140m spacing.
  const xs=car.z<-320?[-640,-480,-320,-160,0,160,320,480,640]:[-240,-160,-80,0,80,160,240];
  const zs=car.z<-320?[-420,-560,-700,-840,-980,-1120]:[-240,-160,-80,0,80,160,240];
  const heading={x:Math.sin(car.yaw),z:Math.cos(car.yaw)},axis=Math.abs(heading.x)>.94?'x':Math.abs(heading.z)>.94?'z':null;
  if(!axis)return null;
  let nearest=null;
  for(const x of xs)for(const z of zs){
    const dx=x-car.x,dz=z-car.z,along=dx*heading.x+dz*heading.z,across=Math.abs(dx*heading.z-dz*heading.x);
    if(across<7&&along>0&&along<48&&(!nearest||along<nearest.along))nearest={x,z,along,axis,heading};
  }
  return nearest;
}
/** A safe speed target before contact, preserving stopping distance and a 1.3s headway. */
export function trafficTargetSpeed(car,cars,time,{pedestrian=false,pedestrianDistance=Infinity}={}){
  let target=car.cruise||12,reason='cruise';
  const fx=Math.sin(car.yaw),fz=Math.cos(car.yaw);
  const stopAt=(gap,label)=>{const safe=Math.sqrt(2*5*Math.max(0,gap));if(safe<target){target=safe;reason=label;}};
  for(const other of cars){
    if(other.id===car.id||other.health<=0||Math.abs((other.y||0)-(car.y||0))>2)continue;
    const dx=other.x-car.x,dz=other.z-car.z,along=dx*fx+dz*fz,across=Math.abs(dx*fz-dz*fx);
    if(along<=0||along>50||across>2.7)continue;
    const gap=along-5.8,leader=Math.max(0,(other.vx||0)*fx+(other.vz||0)*fz);
    const following=Math.max(0,leader+(gap-Math.max(2,car.speed*1.3))*.65);
    if(following<target){target=following;reason='following';}
    stopAt(gap,'following');
  }
  const junction=approachingIntersection(car);
  if(junction){
    // Once past the stop line, clear the junction even if the phase changes.
    const line=junction.along-15;
    if(line>0){
      const blocked=cars.some(other=>other.id!==car.id&&other.health>0&&Math.abs(other.speed||0)<1&&
        Math.abs((other.x-car.x)*fz-(other.z-car.z)*fx)<2.7&&
        (other.x-junction.x)*fx+(other.z-junction.z)*fz>10&&
        (other.x-junction.x)*fx+(other.z-junction.z)*fz<25);
      const crossing=cars.some(other=>other.id!==car.id&&other.health>0&&Math.abs(other.speed||0)>.4&&
        Math.abs(other.x-junction.x)<11&&Math.abs(other.z-junction.z)<11&&
        Math.abs(Math.sin(other.yaw-car.yaw))>.65);
      if(blocked||crossing||intersectionSignal(time,junction.x,junction.z,junction.axis)!=='green')stopAt(Math.max(0,line-.4),blocked?'exit-blocked':crossing?'junction-clearing':'signal');
    }
  }
  if(Number.isFinite(pedestrianDistance))stopAt(pedestrianDistance,'pedestrian');
  else if(pedestrian)stopAt(0,'pedestrian');
  return {speed:clamp(target,0,car.cruise||12),reason};
}
