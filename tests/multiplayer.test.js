import test from 'node:test';
import assert from 'node:assert/strict';
import { createMultiplayerServer } from '../tools/multiplayer-server.mjs';
import { ROOM_PROTOCOL, ROOM_WORLD, PeerSnapshots } from '../src/multiplayer-protocol.js';
const world={protocol:ROOM_PROTOCOL,world:ROOM_WORLD};
async function fixture(t){
  const server=await createMultiplayerServer({root:new URL('..',import.meta.url).pathname});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.stopRooms();server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function post(path,data={},token){const res=await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)});return {status:res.status,...await res.json()};}
  return {post,base};
}
test('real room service joins two clients, streams movement/chat, isolates rooms and rejects invalid packets',async t=>{
  const {post,base}=await fixture(t);
  const a=await post('join',{...world,name:'A',pose:{x:4,y:0,z:165,yaw:0}});assert.equal(a.status,200);
  const b=await post('join',{...world,name:'<B>',code:a.code});assert.equal(b.players.length,2);assert.equal(b.name,undefined);
  const other=await post('join',{...world});assert.notEqual(other.code,a.code);
  assert.equal((await post('join',{...world,code:'XXXXXX'})).error,'ROOM_NOT_FOUND');
  assert.equal((await post('join',{...world,world:'wrong'})).error,'WORLD_MISMATCH');
  assert.equal((await post('state',{pose:{x:null,y:0,z:0,yaw:0}},a.token)).status,400);
  const stream=await fetch(`${base}/api/events?token=${b.token}`),reader=stream.body.getReader();
  t.after(()=>reader.cancel());
  assert.equal((await post('state',{pose:{x:5,y:0,z:165,yaw:1},scene:'outdoor'},a.token)).status,200);
  assert.equal((await post('chat',{text:'hello'},a.token)).status,200);
  const decoder=new TextDecoder();let buffer='',seen=false;
  for(let attempt=0;attempt<10&&!seen;attempt++){
    buffer+=decoder.decode((await reader.read()).value,{stream:true});
    for(const line of buffer.split('\n'))if(line.startsWith('data: ')){
      const packet=JSON.parse(line.slice(6));seen ||= packet.players.some(p=>p.id===a.id&&p.x===5)&&packet.chat.some(m=>m.text==='hello');
      assert.ok(packet.players.every(p=>p.id!==other.id));
    }
    buffer=buffer.slice(buffer.lastIndexOf('\n')+1);
  }
  assert.ok(seen,'the real stream delivered the peer movement and chat');
  assert.equal((await post('state',{},'bad')).status,401);
  const blocked=await fetch(`${base}/api/join`,{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify(world)});assert.equal(blocked.status,403);
});
test('vehicle claims are exclusive and leaving releases ownership',async t=>{
  const {post}=await fixture(t),pose={x:4,y:0,z:165,yaw:0};
  const a=await post('join',{...world,pose}),b=await post('join',{...world,pose,code:a.code});
  assert.equal((await post('claim',{carId:'starter'},a.token)).status,200);
  assert.equal((await post('claim',{carId:'starter'},b.token)).error,'VEHICLE_TAKEN');
  assert.equal((await post('claim',{carId:'sunset'},b.token)).error,'VEHICLE_TOO_FAR');
  await post('leave',{},a.token);assert.equal((await post('claim',{carId:'starter'},b.token)).status,200);
  assert.equal((await post('state',{pose:{x:1801,y:0,z:165,yaw:0}},b.token)).error,'INVALID_POSE');
});
test('room capacity is enforced and peer interpolation follows shortest angles without interpolating travel',async t=>{
  const {post}=await fixture(t),a=await post('join',world);
  for(let i=1;i<8;i++)assert.equal((await post('join',{...world,code:a.code})).status,200);
  assert.equal((await post('join',{...world,code:a.code})).error,'ROOM_FULL');
  const frames=new PeerSnapshots();frames.push({players:[{id:'a',x:0,y:0,z:0,yaw:3.1,scene:'outdoor'}]},0);frames.push({players:[{id:'a',x:2,y:0,z:0,yaw:-3.1,scene:'outdoor'}]},100);
  assert.equal(frames.sample(150)[0].x,1);assert.ok(Math.abs(frames.sample(150)[0].yaw)>3);
  frames.push({players:[{id:'a',x:200,y:20,z:0,yaw:0,scene:'interior:x'}]},200);assert.equal(frames.sample(210)[0].x,200);
});
