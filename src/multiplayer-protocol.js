export const ROOM_PROTOCOL = 1;
export const ROOM_WORLD = 'neon-harbor-v08';
export const MAX_PLAYERS = 8;
export function cleanRoomCode(value){return typeof value==='string'&&/^[A-Z0-9]{6}$/.test(value)?value:null;}
export function cleanName(value){return typeof value==='string'?value.replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,20)||'漫游者':'漫游者';}
export function validPose(value){
  return value&&['x','y','z','yaw'].every(key=>Number.isFinite(value[key]))&&Math.abs(value.x)<=1800&&Math.abs(value.z)<=1800&&value.y>=-.5&&value.y<=460;
}
export function cleanPose(value){return validPose(value)?{x:value.x,y:value.y,z:value.z,yaw:Math.atan2(Math.sin(value.yaw),Math.cos(value.yaw))}:null;}
const blend=(a,b,t)=>a+(b-a)*t;
export class PeerSnapshots{
  constructor(){this.previous=null;this.current=null;this.received=0;}
  push(snapshot,now){this.previous=this.current;this.current=snapshot;this.received=now;}
  sample(now,kind='players'){
    if(!this.current)return [];
    const t=Math.max(0,Math.min(1,(now-this.received)/100)),previous=new Map((this.previous?.[kind]||[]).map(p=>[p.id,p]));
    return (this.current[kind]||[]).map(p=>{
      const old=previous.get(p.id);
      if(!old||old.scene!==p.scene||Math.hypot(old.x-p.x,old.y-p.y,old.z-p.z)>15)return {...p};
      return {...p,x:blend(old.x,p.x,t),y:blend(old.y,p.y,t),z:blend(old.z,p.z,t),yaw:old.yaw+Math.atan2(Math.sin(p.yaw-old.yaw),Math.cos(p.yaw-old.yaw))*t};
    });
  }
}
