import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMultiplayerServer } from '../tools/multiplayer-server.mjs';
import { ROOM_PROTOCOL, ROOM_WORLD, PeerSnapshots } from '../src/multiplayer-protocol.js';
import { MultiplayerEconomy } from '../src/multiplayer-economy.js';
const world={protocol:ROOM_PROTOCOL,world:ROOM_WORLD};
async function fixture(t, options={}){
  const server=await createMultiplayerServer({root:new URL('..',import.meta.url).pathname, ...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let stopped=false; const stop=()=>{if(stopped)return;stopped=true;server.stopRooms();server.closeAllConnections();server.close();};
  t.after(stop);
  const base=`http://127.0.0.1:${server.address().port}`;
  async function post(path,data={},token){const res=await fetch(`${base}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)});return {status:res.status,...await res.json()};}
  return {post,base,stop};
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

test('room economy owns a finite shop ledger, idempotent purchase, and shared delivery stock', async t => {
  const { post } = await fixture(t);
  const shopPose = { x: 225.3, y: 0, z: 187, yaw: 0 };
  const a = await post('join', { ...world, name: 'buyer', pose: shopPose });
  const b = await post('join', { ...world, name: 'observer', code: a.code, pose: shopPose });
  assert.equal(a.economy.schema, 'neon-harbor/room-economy');
  const shop = a.economy.shops.find(candidate => candidate.id === 'harbor-produce');
  assert.equal(shop.stock, 4);
  const purchase = await post('economy', { type: 'purchase', shopId: shop.id, requestId: 'test-purchase-1' }, a.token);
  assert.equal(purchase.status, 200); assert.equal(purchase.result.success, true);
  assert.equal(purchase.economy.player.cash, 1194); assert.equal(purchase.economy.shops.find(candidate => candidate.id === shop.id).stock, 3);
  const duplicate = await post('economy', { type: 'purchase', shopId: shop.id, requestId: 'test-purchase-1' }, a.token);
  assert.equal(duplicate.status, 409); assert.equal(duplicate.error, 'already-purchased');
  const observer = await post('economy', {}, b.token);
  assert.equal(observer.economy.shops.find(candidate => candidate.id === shop.id).stock, 3);
  const order = purchase.economy.jobs.find(candidate => candidate.shopId === shop.id && candidate.status === 'available');
  assert.ok(order, 'purchase creates a funded finite delivery order');
  assert.equal((await post('state', { pose: { x: 193.5, y: 0, z: 120.2, yaw: 0 }, travel: true }, a.token)).status, 200);
  const pickup = await post('economy', { type: 'delivery-accept', jobId: order.id }, a.token);
  assert.equal(pickup.status, 200); assert.equal(pickup.result.success, true);
  await new Promise(resolve => setTimeout(resolve, 1050));
  assert.equal((await post('state', { pose: shopPose, travel: true }, a.token)).status, 200);
  const delivery = await post('economy', { type: 'delivery-complete' }, a.token);
  assert.equal(delivery.status, 200); assert.equal(delivery.result.cashDelta, 12); assert.equal(delivery.economy.player.cash, 1206);
  const shared = await post('economy', {}, b.token);
  assert.equal(shared.economy.shops.find(candidate => candidate.id === shop.id).stock, 11);
  assert.equal(shared.economy.jobs.find(candidate => candidate.id === order.id).status, 'delivered');
});

test('room resident wages and purchases are authoritative and product units remain conserved', () => {
  const ledger = new MultiplayerEconomy();
  const initial = Object.fromEntries(['produce', 'tea', 'meal'].map(product => [product,
    ledger.supply.stock[product] + ledger.shops.filter(shop => shop.product === product).reduce((sum, shop) => sum + shop.stock, 0)]));
  ledger.advance(35 * 20);
  assert.equal(ledger.residents.length, 20);
  assert.ok(ledger.residents.every(resident => resident.wages > 0), 'every authored resident received a room-authoritative wage');
  assert.ok(ledger.residents.some(resident => resident.purchases > 0), 'residents exercise a shared shop ledger');
  assert.ok(ledger.transactions.some(transaction => transaction.type === 'resident-wage'));
  assert.ok(ledger.transactions.some(transaction => transaction.type === 'resident-purchase'));
  for (const product of Object.keys(initial)) {
    const remaining = ledger.supply.stock[product] + ledger.shops.filter(shop => shop.product === product).reduce((sum, shop) => sum + shop.stock, 0);
    assert.equal(remaining + ledger.consumed[product], initial[product], `${product} units are conserved`);
  }
  const restored = new MultiplayerEconomy({ state: ledger.exportState() });
  assert.deepEqual(restored.residents, ledger.residents, 'resident balances survive a room restart');
  assert.deepEqual(restored.consumed, ledger.consumed, 'consumed product ledger survives a room restart');
});

test('two clients observe a persisted room economy after the service restarts', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'neon-harbor-economy-'));
  const economyFile = join(directory, 'rooms.json');
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = await fixture(t, { economyFile });
  const pose = { x: 225.3, y: 0, z: 187, yaw: 0 };
  const buyer = await first.post('join', { ...world, name: 'buyer', pose });
  const observer = await first.post('join', { ...world, name: 'observer', code: buyer.code, pose });
  const purchase = await first.post('economy', { type: 'purchase', shopId: 'harbor-produce', requestId: 'restart-purchase-1' }, buyer.token);
  assert.equal(purchase.status, 200);
  const live = await first.post('economy', {}, observer.token);
  assert.equal(live.economy.shops.find(shop => shop.id === 'harbor-produce').stock, 3);
  first.stop();
  const onDisk = JSON.parse(await readFile(economyFile, 'utf8'));
  assert.equal(onDisk[buyer.code].shops.find(shop => shop.id === 'harbor-produce').stock, 3);

  const second = await fixture(t, { economyFile });
  const restored = await second.post('join', { ...world, code: buyer.code, name: 'reconnected', pose });
  assert.equal(restored.status, 200);
  assert.equal(restored.economy.shops.find(shop => shop.id === 'harbor-produce').stock, 3);
  assert.equal(restored.economy.consumed.produce, 0, 'player purchase stock is persisted without being marked as resident consumption');
});
