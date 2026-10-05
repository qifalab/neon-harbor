const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const input=JSON.parse(fs.readFileSync(0,'utf8'));const candidate=fs.readFileSync(input.payload,'utf8');
const start=candidate.indexOf('const transitSnapshot = () => page.evaluate(')+'const transitSnapshot = () => page.evaluate('.length;
const end=candidate.indexOf('\n    });',start);
const callback=vm.runInNewContext('('+candidate.slice(start,end)+'\n    })');const rows=[];
for(const r of input.snapshots){let calls=0;const original=r.original;
const context={window:{__NEON__:{snapshot:()=>{calls++;return original;}}}};
const fn=vm.runInNewContext('('+candidate.slice(start,end)+'\n    })',context);const compact=fn();
assert.equal(calls,1);const expected={position:original.position,simulationTime:original.simulationTime,teleportRevision:original.teleportRevision,city:{sample:{transit:original.city.sample.transit},interior:{buildingId:original.city.interior.buildingId}}};
assert.deepStrictEqual(JSON.parse(JSON.stringify(compact)),expected);
assert.equal(compact.city.sample.transit.riding,original.city.sample.transit.riding);
const full=JSON.stringify(original),small=JSON.stringify(compact),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
rows.push({callId:r.callId,fullJSONBytes:Buffer.byteLength(full),compactJSONBytes:Buffer.byteLength(small),fullSHA256:hash(full),compactSHA256:hash(small),allConsumedFieldsExact:true,snapshotCalls:calls});}
const arrival=input.snapshots.find(r=>r.callId==='call@3779').original,outside=input.snapshots.find(r=>r.callId==='call@3783').original;
assert.equal(arrival.city.sample.transit.riding,true);assert.equal(outside.city.sample.transit.riding,false);assert.equal(outside.city.sample.transit.passengerLocal,null);assert.equal(outside.city.sample.transit.ridingVehicleId,null);assert.equal(outside.teleportRevision,arrival.teleportRevision+1);assert.deepStrictEqual(outside.position,{x:220,y:1.3,z:-380.5,yaw:0});assert.equal(outside.city.interior.buildingId,null);
console.log(JSON.stringify({status:'PASS_CPU_ONLY',realOriginalSnapshotCount:rows.length,rows,originalPostEAlightingObserved:true,budgetsAndInputsUnchanged:true,noBrowserOrGPUStarted:true,newNativeResult:null},null,2));