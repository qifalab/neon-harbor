from pathlib import Path
import zipfile, hashlib, json, difflib, subprocess
BASE=Path('/workspace/neon-candidates/required-ferry-compact-snapshot-candidate-20261005')
EVIDENCE=Path('/workspace/neon-evidence/8b6-required-ferry-original-fail-11331208345')
ZIP=EVIDENCE/'original.zip'
LOG=Path('/workspace/scratch/neon-harbor/docs/qa/authored-integration/remote-ci-north-held-8b6/monitor-2026-10-05T07-13-17Z/logs/job-111654306750-original.log')
sha=lambda b:hashlib.sha256(b).hexdigest()
assert ZIP.stat().st_size==55699161 and sha(ZIP.read_bytes())=='22309a9fb19f5cebb99ab23cb1108f21caffc33a3c7c6a895e7f5d157650ca89'
assert sha(LOG.read_bytes())=='e6dfc07686f1f50217390a2523fff20b0abd4d9e2c34d2d2c46fdca808781d2d'
tracepath=EVIDENCE/'extracted/test-results/harbor-sample-ferry-public-11d08-el-and-lower-door-alighting/trace.zip'
with zipfile.ZipFile(tracepath) as z:
 original=z.read('resources/src@27bbc15740cda4074d80180c6d8ee429a14bfb04.txt')
 browser=[json.loads(l) for l in z.read('0-trace.trace').decode().splitlines()]
 worker=[json.loads(l) for l in z.read('test.trace').decode().splitlines()]
 assert sha(original)=='9f0dd470f17cfa8ec5b84e1079b64429de976fc06caaa501662e11e454ce5476'
 for source in ['harbor-northern-ridge-final-20261005','harbor-visible-west-ridge-final-20261005']:
  assert (BASE.parent/source/'tests/e2e/harbor-sample.spec.js').read_bytes()==original
 (BASE/'harbor-sample-original-executed-9f0d.js').write_bytes(original)
 before={r['callId']:r for r in browser if r['type']=='before'}
 after={r['callId']:r for r in browser if r['type']=='after'}
 wb={r['callId']:r for r in worker if r['type']=='before'}
 wa={r['callId']:r for r in worker if r['type']=='after'}

def decode(v):
 if not isinstance(v,dict):return v
 if 'o'in v:return {i['k']:decode(i['v']) for i in v['o']}
 if 'a'in v:return [decode(i) for i in v['a']]
 for k in ('n','s','b'):
  if k in v:return v[k]
 if 'v'in v:return None if v['v']=='null' else v['v']
 return v
snapshots=[]
for r in browser:
 if r['type']=='after' and before.get(r.get('callId'),{}).get('params',{}).get('expression')=='() => window.__NEON__.snapshot()' and 'result'in r:
  s=decode(r['result']['value']);assert 'city'in s
  snapshots.append({'callId':r['callId'],'original':s,'originalProtocolBytes':len(json.dumps(r['result'],separators=(',',':'))),'browserStartMs':before[r['callId']]['startTime'],'browserEndMs':r['endTime']})
assert len(snapshots)==13
text=original.decode()
start=text.index("    const errors = await boot(page), layout = createHarborVehicleLayout(kind)")
end=text.index("\ntest('funded cargo",start)
body=text[start:end]
# Restrict changes to the existing bus/tram/ferry public transit scenario.
assert body.count('await snapshot(page)')==10,body.count('await snapshot(page)')
helper="""    // Return only the fields consumed by this transit scenario. The complete
    // transit state and all physical alighting assertions remain unchanged.
    const transitSnapshot = () => page.evaluate(() => {
      const s = window.__NEON__.snapshot();
      return { position: s.position, simulationTime: s.simulationTime, teleportRevision: s.teleportRevision,
        city: { sample: { transit: s.city.sample.transit }, interior: { buildingId: s.city.interior.buildingId } } };
    });
"""
firstend=body.index('\n')+1
candidatebody=body[:firstend]+helper+body[firstend:]
candidatebody=candidatebody.replace('await snapshot(page)','await transitSnapshot()')
candidate=text[:start]+candidatebody+text[end:]
# Exact reverse must recreate original; no other input, deadline, route, assertion or helper changed.
assert candidatebody.replace(helper,'',1).replace('await transitSnapshot()','await snapshot(page)')==body
payload=BASE/'payload/tests/e2e/harbor-sample.spec.js';payload.parent.mkdir(parents=True,exist_ok=True);payload.write_text(candidate)
(BASE/'EXACT_SCENARIO_SNAPSHOT_ONLY.diff').write_text(''.join(difflib.unified_diff(text.splitlines(True),candidate.splitlines(True),fromfile='original-executed/tests/e2e/harbor-sample.spec.js',tofile='candidate/tests/e2e/harbor-sample.spec.js')))
# Evaluate the literal candidate callback on every actual full snapshot returned
# by the original closed trace; compare all consumed fields without modifying
# the fixture state or synthesizing a successful outside position.
node=r'''const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
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
console.log(JSON.stringify({status:'PASS_CPU_ONLY',realOriginalSnapshotCount:rows.length,rows,originalPostEAlightingObserved:true,budgetsAndInputsUnchanged:true,noBrowserOrGPUStarted:true,newNativeResult:null},null,2));'''
(BASE/'verify-literal-projection.cjs').write_text(node)
p=subprocess.run(['node',str(BASE/'verify-literal-projection.cjs')],input=json.dumps({'payload':str(payload),'snapshots':snapshots}),text=True,capture_output=True)
(BASE/'CPU.stdout.json').write_text(p.stdout);(BASE/'CPU.stderr.txt').write_text(p.stderr)
if p.returncode:raise RuntimeError('Literal callback CPU verification failed; preserved stdout/stderr')
receipt=json.loads(p.stdout);assert receipt['status']=='PASS_CPU_ONLY'
subprocess.run(['node','--check',str(payload)],check=True)
last=next(s['original'] for s in snapshots if s['callId']=='call@3783');arrival=next(s['original'] for s in snapshots if s['callId']=='call@3779')
select=lambda s:{'position':s['position'],'simulationTime':s['simulationTime'],'teleportRevision':s['teleportRevision'],'paused':s['paused'],'transit':{k:s['city']['sample']['transit'][k] for k in ['riding','ridingVehicleId','passengerLocal','passengerDeck','currentStopId','boardedStopId']},'interiorBuildingId':s['city']['interior']['buildingId']}
vehicle=next(v for v in arrival['city']['sample']['transit']['vehicles'] if v['id']=='harbor-ferry-1')
summary={'scope':'Closed original required CI first failure, not a new native pass','run':37276412421,'job':111654306750,'artifact':11331208345,'sourceCommit':'8b6a577529ade0a45aadc499db3181d165043a9d','originalZIP':{'path':str(ZIP),'bytes':55699161,'sha256':sha(ZIP.read_bytes())},'originalLog':{'path':str(LOG),'bytes':LOG.stat().st_size,'sha256':sha(LOG.read_bytes())},'traceZIP':{'path':str(tracepath),'sha256':sha(tracepath.read_bytes())},'executedTestSourceSHA256':sha(original),'firstFailure':{'message':'Test timeout of 900000ms exceeded','line':392,'originalStatus':'FAILED','assertionFalseWasObserved':False},'arrival':select(arrival),'arrivalVehicle':vehicle,'postEOriginalResult':select(last),'calls':{cid:{'before':before[cid],'after':{k:v for k,v in after[cid].items() if k!='result'},'originalResultJSONBytes':len(json.dumps(after[cid].get('result',{})))} for cid in ['call@3777','call@3781','call@3783']},'worker':{cid:{'before':wb[cid],'after':wa[cid]} for cid in ['pw:api@2343','expect@2344','pw:api@2345']},'actualCause':'The original public E interaction successfully alighted at the northern berth. The whole-test deadline interrupted the final expect.poll while the worker awaited completion of a full-world snapshot operation whose trace result serialized 2344504 bytes; the returned state already had riding=false. This is a whole-scenario confirmation deadline failure, not evidence of a blocked runtime exit.','candidate':'Return only consumed fields inside this transit scenario; preserve full transit, position/time/revision/interior buildingId and every input/route/assertion/deadline. No new result or wall-time savings are claimed.','upperHighOriginalAttachment':{'sha256':'8d6031a6451f79855b88c773fe55cf4bdaa3060de3496199f8af30251135db27','poseSHA256':'960fffc30c2490a37260569946027491f7041c27bf511e3b7ffa694450035103','claim':'Actual original upper High capture exists; this failed scenario is not accepted as complete transit or art.'}}
(BASE/'closed-original-first-failure.json').write_text(json.dumps(summary,indent=2)+'\n')
manifest={'status':'READY_CPU_VERIFIED_ONLY_NOT_NATIVE_PASS','sourceParentForAdoption':'b80eace6b3cf62eea3589c6dda40ed16251b480c','expectedOriginalTestSHA256':sha(original),'payload':[{'path':'tests/e2e/harbor-sample.spec.js','candidatePath':str(payload),'bytes':payload.stat().st_size,'sha256':sha(payload.read_bytes())}],'changeScope':{'scenarioOnly':'bus/tram/ferry public boarding, upper stairs, travel and lower-door alighting','snapshotReadCallSites':10,'executableGaitInputCameraCaptureHighHelpersChanged':False,'wholeFerrySeconds':900,'allLocalAndPollBudgetsAndAssertions':'exact original bytes','otherTests':'exact original bytes','productionRuntimeChange':False,'snapshotProjection':'position/simulationTime/teleportRevision/full city.sample.transit/city.interior.buildingId'},'originalFailureArchive':str(EVIDENCE),'originalFailureSummarySHA256':sha((BASE/'closed-original-first-failure.json').read_bytes()),'CPUReceiptSHA256':sha((BASE/'CPU.stdout.json').read_bytes()),'GPUExecuted':False,'nativeAcceptance':None}
(BASE/'PAYLOAD_MANIFEST.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'payloadSHA256':manifest['payload'][0]['sha256'],'cpuCount':len(receipt['rows']),'sourceHashExact':True,'originalStillFailed':True,'ready':True},indent=2))
