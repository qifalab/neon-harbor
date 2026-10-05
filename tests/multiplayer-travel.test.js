import test from 'node:test';
import assert from 'node:assert/strict';
import { createMultiplayerServer } from '../tools/multiplayer-server.mjs';
import { MultiplayerClient } from '../src/multiplayer.js';
import { ROOM_PROTOCOL, ROOM_WORLD } from '../src/multiplayer-protocol.js';
import { setImmediate as immediate } from 'node:timers/promises';

const world={protocol:ROOM_PROTOCOL,world:ROOM_WORLD};
const pose=(x,y,z)=>({x,y,z,yaw:0});
async function fixture(t){
  let clock=10000;
  t.mock.method(performance,'now',()=>clock);
  const server=await createMultiplayerServer({root:new URL('..',import.meta.url).pathname,now:()=>clock});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.stopRooms();server.closeAllConnections();server.close();});
  const base=`http://127.0.0.1:${server.address().port}`;
  async function post(path,data={},token){
    const response=await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)});
    return {status:response.status,...await response.json()};
  }
  async function connect(code){
    const session=await post('join',{...world,code,pose:pose(8,0,174)});
    assert.equal(session.status,200);
    const client=new MultiplayerClient();client.base=base;client.session=session;client.setStatus('connected');
    return client;
  }
  async function snapshot(client){
    const controller=new AbortController();
    try{
      const response=await fetch(`${base}/api/events?token=${client.session.token}`,{signal:controller.signal});
      const reader=response.body.getReader(),decoder=new TextDecoder();let text='';
      while(!text.includes('\n\n'))text+=decoder.decode((await reader.read()).value,{stream:true});
      return JSON.parse(text.split('\n').find(line=>line.startsWith('data: ')).slice(6));
    }finally{controller.abort();}
  }
  return {post,connect,snapshot,setClock:value=>{clock=value;}};
}

test('eight real room clients coalesce rapid atlas, entry and lift travel into the latest bounded position',async t=>{
  const {post,connect,snapshot,setClock}=await fixture(t),clients=[];
  for(let i=0;i<8;i++)clients.push(await connect(clients[0]?.session.code));
  assert.equal((await post('join',{...world,code:clients[0].session.code})).error,'ROOM_FULL');
  const requests=[];
  for(const client of clients){
    const request=client.request.bind(client);
    client.request=async(path,packet)=>{const result=await request(path,packet);requests.push({id:client.session.id,path,packet:{...packet},result});return result;};
    client.state({pose:pose(1192,3.75,-151.81),scene:'outdoor',travel:true,revision:3});
  }
  await Promise.all(clients.map(client=>client.sendState()));
  setClock(10859);
  for(const client of clients)client.state({pose:pose(1192,4.035,-167.65),scene:'interior:east-012:lobby',travel:true,revision:4});
  await Promise.all(clients.map(client=>client.sendState()));
  assert.equal(requests.length,8,'the original 859 ms atlas-to-entry transition is retained without a rejected request');
  setClock(10950);
  for(const client of clients)client.state({pose:pose(1799,460,-167.65),scene:'interior:east-012:floor-45',travel:true,revision:5});
  await Promise.all(clients.map(client=>client.sendState()));
  assert.equal(requests.length,8);
  setClock(11000);
  await Promise.all(clients.map(client=>client.sendState()));
  assert.equal(requests.length,16);
  assert.ok(requests.slice(8).every(item=>item.packet.revision===5&&item.packet.travel&&item.result.ok));
  const accepted=await snapshot(clients[0]);
  assert.equal(accepted.players.length,8);
  assert.ok(accepted.players.every(player=>player.x===1799&&player.y===460&&player.scene==='interior:east-012:floor-45'));
  setClock(11100);
  for(const client of clients)client.state({pose:pose(1798.5,460,-167.65),scene:'interior:east-012:floor-45',travel:false,revision:5});
  await Promise.all(clients.map(client=>client.sendState()));
  assert.equal(requests.length,24,'ordinary movement continues at the existing 100 ms cadence');
  assert.ok(requests.slice(16).every(item=>!item.packet.travel&&item.result.ok));
  assert.ok(clients.every(client=>client.status==='connected'&&!client.pendingState.travel));
});

test('the real service still rejects rapid direct travel, excessive movement and out-of-world positions',async t=>{
  const {post,connect,setClock}=await fixture(t),client=await connect(),token=client.session.token;
  assert.equal((await post('state',{pose:pose(1192,3.75,-151.81),travel:true},token)).status,200);
  setClock(10100);
  assert.equal((await post('state',{pose:pose(-1799,460,1799),travel:true},token)).error,'TRAVEL_RATE_LIMIT');
  assert.equal((await post('state',{pose:pose(-1799,460,1799),travel:false},token)).error,'MOVE_TOO_FAST');
  setClock(11000);
  assert.equal((await post('state',{pose:pose(-1799,460,1799),travel:true},token)).status,200);
  setClock(11100);
  assert.equal((await post('state',{pose:pose(1801,0,0),travel:true},token)).error,'INVALID_POSE');
  assert.equal((await post('state',{pose:pose(0,460.1,0),travel:true},token)).error,'INVALID_POSE');
});

test('an acknowledged travel cannot clear a newer revision queued during the actual HTTP request',async t=>{
  const {connect,snapshot,setClock}=await fixture(t),client=await connect(),request=client.request.bind(client);
  let accepted,release;
  const reached=new Promise(resolve=>{accepted=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  client.request=async(path,packet)=>{const result=await request(path,packet);if(packet.revision===1){accepted();await gate;}return result;};
  client.state({pose:pose(1192,3.75,-151.81),scene:'outdoor',travel:true,revision:1});
  const first=client.sendState();await reached;
  setClock(10010);
  client.state({pose:pose(1192,4.035,-167.65),scene:'interior:east-012:lobby',travel:true,revision:2});
  release();await first;
  assert.equal(client.pendingState.revision,2);assert.equal(client.pendingState.travel,true);
  setClock(11009);await client.sendState();
  assert.equal((await snapshot(client)).players[0].scene,'outdoor');
  setClock(11010);await client.sendState();
  assert.equal((await snapshot(client)).players[0].scene,'interior:east-012:lobby');
  assert.equal(client.pendingState.travel,false);assert.equal(client.status,'connected');
});

test('a throttled HTTP acknowledgement preserves the unsent travel until an actual accepted update',async t=>{
  const {post,connect,snapshot,setClock}=await fixture(t),client=await connect();
  assert.equal((await post('state',{pose:pose(8,0,174)},client.session.token)).status,200);
  setClock(10020);
  client.state({pose:pose(1192,4.035,-167.65),scene:'interior:east-012:lobby',travel:true,revision:1});
  await client.sendState();
  assert.equal(client.pendingState.travel,true);
  assert.equal(client.nextTravelTime,undefined);
  assert.equal((await snapshot(client)).players[0].x,8);
  setClock(10120);await client.sendState();
  assert.equal(client.pendingState.travel,false);
  assert.equal((await snapshot(client)).players[0].x,1192);
});

test('leaving discards the queued travel and ignores an old session acknowledgement',async t=>{
  const {connect,setClock}=await fixture(t),client=await connect(),request=client.request.bind(client);
  let accepted,release;
  const reached=new Promise(resolve=>{accepted=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  client.request=async(path,packet,session)=>{const result=await request(path,packet,session);if(path==='state'){accepted();await gate;}return result;};
  client.state({pose:pose(1192,3.75,-151.81),scene:'outdoor',travel:true,revision:1});
  const first=client.sendState();await reached;
  client.state({pose:pose(1192,4.035,-167.65),scene:'interior:east-012:lobby',travel:true,revision:2});
  await client.leave();setClock(10020);release();await first;
  assert.equal(client.pendingState,null);assert.equal(client.nextTravelTime,0);assert.equal(client.status,'offline');
});

test('a rapid travel-to-car claim waits for the actual latest pose before requesting ownership',async t=>{
  const {connect,setClock}=await fixture(t),client=await connect(),request=client.request.bind(client),calls=[];
  client.request=async(path,packet,session)=>{calls.push({path,revision:packet.revision});return request(path,packet,session);};
  client.state({pose:pose(1192,3.75,-151.81),scene:'outdoor',travel:true,revision:3});
  await client.sendState();setClock(10859);
  client.state({pose:pose(4,0,165),scene:'outdoor',travel:true,revision:4});
  const claiming=client.claim('starter');await immediate();
  assert.deepEqual(calls,[{path:'state',revision:3}],'no old-pose ownership request during the travel allowance');
  setClock(11000);
  assert.equal((await claiming).carId,'starter');
  assert.deepEqual(calls,[{path:'state',revision:3},{path:'state',revision:4},{path:'claim',revision:undefined}]);
  assert.equal(client.status,'connected');
});

test('a claim awaits an existing actual HTTP state request without duplicating it',async t=>{
  const {connect}=await fixture(t),client=await connect(),request=client.request.bind(client),calls=[];
  let accepted,release;
  const reached=new Promise(resolve=>{accepted=resolve;}),gate=new Promise(resolve=>{release=resolve;});
  client.request=async(path,packet,session)=>{calls.push(path);const result=await request(path,packet,session);if(path==='state'){accepted();await gate;}return result;};
  client.state({pose:pose(4,0,165),scene:'outdoor',travel:true,revision:1});
  const state=client.sendState();await reached;
  const claiming=client.claim('starter');await immediate();
  assert.deepEqual(calls,['state']);
  release();await state;
  assert.equal((await claiming).carId,'starter');assert.deepEqual(calls,['state','claim']);
});

test('a failed actual state update aborts the claim without silently retrying HTTP',async t=>{
  const {connect}=await fixture(t),client=await connect(),request=client.request.bind(client),calls=[];
  client.request=async(path,packet,session)=>{calls.push(path);return request(path,packet,session);};
  client.state({pose:pose(1801,0,165),scene:'outdoor',travel:true,revision:1});
  await assert.rejects(client.claim('starter'),/房间服务暂时不可用/);
  assert.deepEqual(calls,['state']);assert.equal(client.status,'reconnecting');
});

test('leaving during a queued claim prevents any later ownership request',async t=>{
  const {connect,setClock}=await fixture(t),client=await connect(),request=client.request.bind(client),calls=[];
  client.request=async(path,packet,session)=>{calls.push(path);return request(path,packet,session);};
  client.state({pose:pose(1192,3.75,-151.81),scene:'outdoor',travel:true,revision:1});
  await client.sendState();setClock(10859);
  client.state({pose:pose(4,0,165),scene:'outdoor',travel:true,revision:2});
  const rejected=assert.rejects(client.claim('starter'),/连接已结束/);await immediate();
  await client.leave();setClock(11000);await rejected;
  assert.deepEqual(calls,['state','leave']);assert.equal(client.status,'offline');
});

test('a claim without a session fails before making an HTTP request',async()=>{
  const client=new MultiplayerClient();let called=false;
  client.request=async()=>{called=true;};
  await assert.rejects(client.claim('starter'),/连接已结束/);assert.equal(called,false);
});

test('an old session acknowledgement cannot clear a new session state request or complete its old claim',async t=>{
  const {post,connect,setClock}=await fixture(t),client=await connect(),request=client.request.bind(client),oldToken=client.session.token;
  let oldAccepted,oldRelease,newAccepted,newRelease;
  const oldReached=new Promise(resolve=>{oldAccepted=resolve;}),oldGate=new Promise(resolve=>{oldRelease=resolve;});
  const newReached=new Promise(resolve=>{newAccepted=resolve;}),newGate=new Promise(resolve=>{newRelease=resolve;});
  client.request=async(path,packet,session)=>{
    const target=session||client.session,result=await request(path,packet,target);
    if(path==='state'){
      if(target.token===oldToken){oldAccepted();await oldGate;}
      else{newAccepted();await newGate;}
    }
    return result;
  };
  client.state({pose:pose(1192,3.75,-151.81),scene:'outdoor',travel:true,revision:1});
  const oldState=client.sendState();await oldReached;
  const oldClaim=assert.rejects(client.claim('starter'),/连接已结束/);
  await client.leave();
  const fresh=await post('join',{...world,pose:pose(8,0,174)});assert.equal(fresh.status,200);
  client.session=fresh;client.setStatus('connected');
  // Advance the normal 100 ms uplink tick; a frozen clock would correctly keep
  // the new request inside the existing 90 ms state-send guard.
  setClock(10100);
  client.state({pose:pose(4,0,165),scene:'outdoor',travel:true,revision:1});
  const newState=client.sendState();await newReached;
  const newRequest=client.stateRequest;
  oldRelease();await oldState;await oldClaim;
  assert.equal(client.stateRequest,newRequest);assert.equal(client.sending,true);
  assert.equal(client.pendingState.travel,true);assert.equal(client.status,'connected');
  newRelease();await newState;
  assert.equal(client.sending,false);assert.equal(client.pendingState.travel,false);
  assert.equal((await client.claim('starter')).carId,'starter');
});

test('a claim waiting on a hung state RPC has a 6500 ms bound and cannot claim after timeout',async t=>{
  let clock=10000,resolveState;
  t.mock.method(performance,'now',()=>clock);
  t.mock.timers.enable({apis:['setTimeout']});
  const client=new MultiplayerClient(),calls=[];
  client.session={token:'test'};client.setStatus('connected');
  client.request=async path=>{calls.push(path);return new Promise(resolve=>{resolveState=resolve;});};
  client.state({pose:pose(4,0,165),scene:'outdoor',travel:true,revision:1});
  const rejected=assert.rejects(client.claim('starter'),/位置同步未完成/);await immediate();
  clock=16499;t.mock.timers.tick(6499);assert.deepEqual(calls,['state']);
  clock=16500;t.mock.timers.tick(1);await rejected;
  resolveState({ok:true});await immediate();
  assert.deepEqual(calls,['state'],'late state success cannot issue ownership after the finite boundary');
});
