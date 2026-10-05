import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createMultiplayerServer } from '/tmp/neon-multiplayer-travel-rate-candidate-20261005/tools/multiplayer-server.mjs';
import { ROOM_PROTOCOL,ROOM_WORLD } from '/tmp/neon-multiplayer-travel-rate-candidate-20261005/src/multiplayer-protocol.js';
import { MultiplayerClient as Original } from './original-multiplayer-claim-probe-module.mjs';
import { MultiplayerClient as Candidate } from '/tmp/neon-multiplayer-travel-rate-candidate-20261005/src/multiplayer.js';

let clock=10000;
const previousClock=Object.getOwnPropertyDescriptor(performance,'now');
Object.defineProperty(performance,'now',{configurable:true,value:()=>clock});
const actualFetch=globalThis.fetch,results=[];
try{
  for(const [version,Client] of [['original-5cd',Original],['sealed-travel-candidate',Candidate]]){
    clock=10000;
    const server=await createMultiplayerServer({root:'/tmp/neon-multiplayer-travel-rate-candidate-20261005',now:()=>clock});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base=`http://127.0.0.1:${server.address().port}`,requests=[];
    try{
      globalThis.fetch=async(url,options)=>{
        const response=await actualFetch(url,options);
        if(String(url).includes('/api/state')||String(url).includes('/api/claim'))requests.push({clock,route:new URL(url).pathname,packet:JSON.parse(options.body),status:response.status,result:await response.clone().json()});
        return response;
      };
      const joined=await actualFetch(`${base}/api/join`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({protocol:ROOM_PROTOCOL,world:ROOM_WORLD,pose:{x:8,y:0,z:174,yaw:0}})});
      const client=new Client();client.base=base;client.session=await joined.json();client.setStatus('connected');
      client.state({pose:{x:1192,y:3.75,z:-151.81,yaw:0},scene:'outdoor',travel:true,revision:3});
      await client.sendState();
      clock=10859;
      client.state({pose:{x:4,y:0,z:165,yaw:0},scene:'outdoor',travel:true,revision:4});
      let immediateClaim;
      try{immediateClaim={ok:true,result:await client.claim('starter')};}catch(error){immediateClaim={ok:false,message:error.message};}
      const statusAfterImmediateClaim=client.status;
      clock=11000;
      let claimAfterAllowance;
      try{claimAfterAllowance={ok:true,result:await client.claim('starter')};}catch(error){claimAfterAllowance={ok:false,message:error.message};}
      assert.equal(immediateClaim.ok,false);
      assert.equal(requests.find(item=>item.route==='/api/claim').result.error,'VEHICLE_TOO_FAR');
      assert.equal(claimAfterAllowance.ok,true);
      results.push({version,requests,immediateClaim,statusAfterImmediateClaim,claimAfterAllowance});
    }finally{globalThis.fetch=actualFetch;server.stopRooms();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  }
}finally{globalThis.fetch=actualFetch;if(previousClock)Object.defineProperty(performance,'now',previousClock);else delete performance.now;}
const receipt={sourceParent:'5cd20885881c5fd9d30b405eb267a25ec7752164',serverUnchanged:true,realHTTP:true,GPU:false,results,conclusion:'The immediate rapid travel-to-car claim already fails with VEHICLE_TOO_FAR in original 5cd after a travel 429; the sealed candidate removes the 429 but still claims before queued travel is accepted. Both succeed once the allowance renews. Claim should await the pending state within a finite boundary before issuing the ownership request.'};
await writeFile(new URL('./claim-order-original-candidate-proof.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
