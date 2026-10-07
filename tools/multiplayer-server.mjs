/** Eight-player exploration rooms. SSE downlink + bounded JSON uplink, no dependencies. */
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createStaticServer } from './server.mjs';
import { GameSimulation } from '../src/simulation.js';
import { infrastructureGroundHeightAt } from '../src/metropolis-infrastructure.js';
import { harborTerrainGroundHeightAt } from '../src/harbor-terrain.js';
import { northernVehicles } from '../src/traffic.js';
import { MultiplayerEconomy, ROOM_ECONOMY_SECONDS_PER_HOUR } from '../src/multiplayer-economy.js';
import { ROOM_PROTOCOL, ROOM_WORLD, MAX_PLAYERS, cleanRoomCode, cleanName, cleanPose } from '../src/multiplayer-protocol.js';
const code=()=>randomBytes(4).toString('hex').slice(0,6).toUpperCase();
// Preserve reachable raised roads before the eastern terrain fallback. A
// single 3.75 m plane would incorrectly support the shipping channel and hide
// the ridge's actual elevation from shared vehicle physics.
export const multiplayerGroundHeightAt = (x,z,y=0) => infrastructureGroundHeightAt(x,z,y) ?? harborTerrainGroundHeightAt(x,z) ?? 0;
function reply(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
async function body(req){
  if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('JSON_REQUIRED');
  let size=0,text='';for await(const chunk of req){size+=chunk.length;if(size>4096)throw new Error('BODY_TOO_LARGE');text+=chunk;}
  return JSON.parse(text);
}
export async function createMultiplayerServer({root=fileURLToPath(new URL('../dist',import.meta.url)),origins=[],maxRooms=32,now=()=>Date.now(),economyFile=process.env.NEON_ECONOMY_FILE||null}={}){
  const server=await createStaticServer({root}),staticHandler=server.listeners('request')[0];server.removeAllListeners('request');
  const rooms=new Map(),sessions=new Map(),joinRates=new Map();
  const savedEconomies = economyFile && existsSync(economyFile) ? (()=>{ try { return JSON.parse(readFileSync(economyFile, 'utf8')); } catch { return {}; } })() : {};
  let persistTimer = null;
  function flushPersistence() { if (!economyFile) return; try { mkdirSync(dirname(economyFile), { recursive: true }); writeFileSync(economyFile, JSON.stringify(savedEconomies)); } catch {} }
  function persist() { if (!economyFile || persistTimer) return; persistTimer = setTimeout(() => { persistTimer = null; flushPersistence(); }, 50); persistTimer.unref?.(); }
  function persistRoom(room) { if (!economyFile) return; savedEconomies[room.code] = room.economy.exportState(); persist(); }
  function newRoom(roomCode, savedState=savedEconomies[roomCode]){
    const sim=new GameSimulation({bounds:1800,groundHeightAt:multiplayerGroundHeightAt});sim.cars.push(...northernVehicles());sim.networkControlled=new Set();
    Object.assign(sim.player,{x:1400,z:1400});
    const economy=new MultiplayerEconomy({state:savedState});
    if (economy.absoluteHour > 16.5) sim.elapsed=(economy.absoluteHour-16.5)*ROOM_ECONOMY_SECONDS_PER_HOUR;
    const room={code:roomCode,sim,players:new Map(),owners:new Map(),chat:[],seq:0,economy};rooms.set(roomCode,room);return room;
  }
  function remove(session){
    const room=session.room;if(session.carId)release(session);session.stream?.end();sessions.delete(session.token);room.players.delete(session.id);room.economy.leave(session.id);
    if(!room.players.size)rooms.delete(room.code);
  }
  function release(session){
    if(!session.carId)return;
    const car=session.room.sim.cars.find(car=>car.id===session.carId);
    if(car){car.speed=0;car.vx=0;car.vz=0;car.traffic=false;}
    session.room.owners.delete(session.carId);session.room.sim.networkControlled.delete(session.carId);session.carId=null;
  }
  function snapshot(room,viewer=null,{advance=true}={}){if(advance)room.seq++;const beforeEconomyRevision=room.economy.revision;room.economy.setWorldTime(room.sim.elapsed);if(room.economy.revision!==beforeEconomyRevision)persistRoom(room);return {protocol:ROOM_PROTOCOL,world:ROOM_WORLD,code:room.code,seq:room.seq,time:room.sim.elapsed,
    players:[...room.players.values()].map(s=>({id:s.id,name:s.name,...s.pose,scene:s.scene,carId:s.carId})),
    cars:room.sim.cars.filter(c=>c.health>0).map(c=>({id:c.id,x:c.x,y:c.y||0,z:c.z,yaw:c.yaw,speed:c.speed,health:c.health,pitch:c.pitch||0,roll:c.roll||0,owner:room.owners.get(c.id)||null,traffic:!!c.traffic,waypoint:c.waypoint})),chat:room.chat,economy:room.economy.snapshot(viewer?.id || room.players.keys().next().value || 'anonymous')};}
  server.on('request',async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/api/'))return staticHandler(req,res);
    res.setHeader('X-Content-Type-Options','nosniff');
    const origin=req.headers.origin,ownHost=req.headers.host;
    if(origin){
      let same=false;try{same=new URL(origin).host===ownHost;}catch{}
      if(!same&&!origins.includes(origin))return reply(res,403,{error:'ORIGIN_DENIED'});
      res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
    }
    if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'600'});return res.end();}
    if(url.pathname==='/api/health'&&req.method==='GET')return reply(res,200,{ok:true,protocol:ROOM_PROTOCOL,world:ROOM_WORLD,economy:'neon-harbor/room-economy',maxPlayers:MAX_PLAYERS});
    try{
      if(url.pathname==='/api/join'&&req.method==='POST'){
        const input=await body(req);
        if(input.protocol!==ROOM_PROTOCOL||input.world!==ROOM_WORLD)return reply(res,409,{error:'WORLD_MISMATCH'});
        const address=req.socket.remoteAddress||'unknown',rate=joinRates.get(address);
        if(rate&&now()-rate.start<60000&&rate.count>=20)return reply(res,429,{error:'RATE_LIMIT'});
        if(!rate||now()-rate.start>=60000)joinRates.set(address,{start:now(),count:1});else rate.count++;
        let roomCode=input.code?cleanRoomCode(input.code):code();
        if(!roomCode)return reply(res,400,{error:'INVALID_ROOM'});
        // A mistyped join must not silently create a separate empty room.
        let room=rooms.get(roomCode);
        if(input.code&&!room && !savedEconomies[roomCode])return reply(res,404,{error:'ROOM_NOT_FOUND'});
        if(!room){if(rooms.size>=maxRooms)return reply(res,503,{error:'SERVER_FULL'});while(rooms.has(roomCode))roomCode=code();room=newRoom(roomCode);}
        if(room.players.size>=MAX_PLAYERS)return reply(res,409,{error:'ROOM_FULL'});
        const pose=cleanPose(input.pose)||{x:8,y:0,z:174,yaw:Math.PI};
        const session={id:randomUUID(),token:randomBytes(32).toString('hex'),name:cleanName(input.name),pose,scene:'outdoor',room,carId:null,lastSeen:now(),lastState:0,stream:null};
        sessions.set(session.token,session);room.players.set(session.id,session);
        return reply(res,200,{id:session.id,token:session.token,...snapshot(room,session)});
      }
      const token=req.method==='GET'?url.searchParams.get('token'):req.headers.authorization?.replace(/^Bearer /,'');
      const session=sessions.get(token);if(!session)return reply(res,401,{error:'SESSION_EXPIRED'});
      if(url.pathname==='/api/events'&&req.method==='GET'){
        session.stream?.end();session.stream=res;session.closedAt=null;session.lastSeen=now();
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no'});
        res.write(`retry: 1000\ndata: ${JSON.stringify(snapshot(session.room,session))}\n\n`);
        req.on('close',()=>{if(session.stream===res){session.stream=null;session.closedAt=now();}});return;
      }
      if(url.pathname==='/api/economy'&&req.method==='GET'){
        session.room.economy.setWorldTime(session.room.sim.elapsed); persistRoom(session.room);
        return reply(res,200,{ok:true,economy:session.room.economy.snapshot(session.id)});
      }
      if(req.method!=='POST')return reply(res,405,{error:'METHOD_NOT_ALLOWED'});
      const input=await body(req);session.lastSeen=now();
      if(url.pathname==='/api/state'){
        if(now()-session.lastState<40)return reply(res,200,{ok:true,throttled:true});
        const pose=cleanPose(input.pose);if(!pose)return reply(res,400,{error:'INVALID_POSE'});
        const delta=Math.hypot(pose.x-session.pose.x,pose.y-session.pose.y,pose.z-session.pose.z);
        const seconds=Math.max(.1,(now()-session.lastState)/1000);
        if(session.lastState&&delta>60*seconds+5&&!input.travel)return reply(res,400,{error:'MOVE_TOO_FAST'});
        if(input.travel&&session.lastTravel&&now()-session.lastTravel<1000)return reply(res,429,{error:'TRAVEL_RATE_LIMIT'});
        if(input.travel)session.lastTravel=now();
        session.lastState=now();session.pose=pose;
        session.scene=typeof input.scene==='string'&&input.scene.length<=100?input.scene:'outdoor';
        if(session.carId){
          const car=session.room.sim.cars.find(car=>car.id===session.carId);
          if(session.scene!=='outdoor')release(session);
          else {const speed=Math.max(-12,Math.min(45,Number.isFinite(input.speed)?input.speed:0));Object.assign(car,pose,{speed,vx:Math.sin(pose.yaw)*speed,vz:Math.cos(pose.yaw)*speed});}
        }
        return reply(res,200,{ok:true});
      }
      if(url.pathname==='/api/economy'&&req.method==='POST'){
        session.room.economy.setWorldTime(session.room.sim.elapsed);
        const result=session.room.economy.action(session.id,{...input,scene:session.scene,position:session.pose});
        persistRoom(session.room); return reply(res,result.success?200:409,{ok:result.success,error:result.success?undefined:result.reason,result,economy:session.room.economy.snapshot(session.id)});
      }
      if(url.pathname==='/api/claim'){
        const car=session.room.sim.cars.find(car=>car.id===input.carId),owner=session.room.owners.get(input.carId);
        if(owner&&owner!==session.id)return reply(res,409,{error:'VEHICLE_TAKEN'});
        if(!car||car.health<=0||session.scene!=='outdoor'||Math.hypot(car.x-session.pose.x,car.z-session.pose.z)>7||Math.abs((car.y||0)-session.pose.y)>1.5||Math.abs(car.speed)>9)return reply(res,400,{error:'VEHICLE_TOO_FAR'});
        if(session.carId&&session.carId!==car.id)return reply(res,409,{error:'ALREADY_DRIVING'});
        session.carId=car.id;session.room.owners.set(car.id,session.id);session.room.sim.networkControlled.add(car.id);return reply(res,200,{ok:true,carId:car.id});
      }
      if(url.pathname==='/api/release'){release(session);return reply(res,200,{ok:true});}
      if(url.pathname==='/api/chat'){
        if(session.lastChat&&now()-session.lastChat<800)return reply(res,429,{error:'RATE_LIMIT'});
        const text=typeof input.text==='string'?input.text.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,160):'';
        if(!text)return reply(res,400,{error:'EMPTY_CHAT'});
        session.lastChat=now();session.room.chat.push({id:randomUUID(),name:session.name,text});session.room.chat=session.room.chat.slice(-20);return reply(res,200,{ok:true});
      }
      if(url.pathname==='/api/leave'){remove(session);return reply(res,200,{ok:true});}
      return reply(res,404,{error:'NOT_FOUND'});
    }catch(error){if(!res.headersSent)reply(res,400,{error:error.message==='BODY_TOO_LARGE'?'BODY_TOO_LARGE':'INVALID_REQUEST'});else res.end();}
  });
  let ticks=0;
  const timer=setInterval(()=>{
    for(const room of rooms.values()){
      room.sim.update(1/30);
      const beforeEconomyRevision=room.economy.revision; room.economy.setWorldTime(room.sim.elapsed); if (room.economy.revision!==beforeEconomyRevision) persistRoom(room);
      if(ticks%3===0){room.seq++;for(const s of room.players.values())if(s.stream&&!s.stream.writableEnded){if(s.stream.writableLength>256000){s.stream.destroy();continue;}s.stream.write(`data: ${JSON.stringify(snapshot(room,s,{advance:false}))}\n\n`);}}
    }
    for(const s of sessions.values())if((!s.stream&&now()-s.lastSeen>20000)||(s.closedAt&&now()-s.closedAt>2500))remove(s);
    if(ticks++%900===0)for(const [ip,rate] of joinRates)if(now()-rate.start>60000)joinRates.delete(ip);
  },1000/30);timer.unref();
  server.on('close',()=>clearInterval(timer));
  server.stopRooms=()=>{clearInterval(timer);for(const room of rooms.values())persistRoom(room);for(const s of [...sessions.values()])remove(s);if(persistTimer){clearTimeout(persistTimer);persistTimer=null;}flushPersistence();};
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=await createMultiplayerServer({root:resolve(process.env.NEON_ROOT||'dist'),origins:(process.env.NEON_ALLOWED_ORIGINS||'').split(',').filter(Boolean),economyFile:process.env.NEON_ECONOMY_FILE||resolve('data/neon-harbor-room-economy.json')});
  const port=Number(process.env.PORT||5180);server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Neon Harbor rooms: http://${process.env.HOST||'127.0.0.1'}:${port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.stopRooms();server.close();});
}
