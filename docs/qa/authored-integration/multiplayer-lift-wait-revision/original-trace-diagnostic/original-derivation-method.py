from pathlib import Path
import json,zipfile,hashlib,statistics,math,datetime
ROOT=Path('/workspace/scratch/neon-harbor'); ART=ROOT/'docs/qa/authored-integration/remote-ci-ef92/artifacts/multiplayer-11319935663/extracted'
CASE=next(ART.glob('rooms-two-browsers*'));OUT=Path('/tmp/neon-mp-ef92-original-trace-diagnostic');OUT.mkdir(exist_ok=False)
def save(p,d):Path(p).write_text(json.dumps(d,indent=2,ensure_ascii=False)+'\n')
def digest(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
 return h.hexdigest()
def decoded(v,refs=None):
 refs={} if refs is None else refs
 if not isinstance(v,dict):return v
 if 'ref' in v:return refs.get(v['ref'],{'unresolvedRef':v['ref']})
 if 'o' in v:
  r={};refs[v.get('id')]=r
  for x in v['o']:r[x['k']]=decoded(x['v'],refs)
  return r
 if 'a' in v:
  r=[];refs[v.get('id')]=r;r.extend(decoded(x,refs) for x in v['a']);return r
 for k in ['n','s','b']:
  if k in v:return v[k]
 if 'v' in v:return None if v['v'] in ['undefined','null'] else v['v']
 return v

def compact(s):
 i=s.get('city',{}).get('interior',s.get('interior',{}));return {'position':s.get('position'),'simulationTime':s.get('simulationTime'),'paused':s.get('paused'),'started':s.get('started'),'settings':s.get('settings'),'timing':s.get('timing'),'renderer':s.get('renderer'),'interior':{k:i.get(k) for k in ['buildingId','floorId','moving','elevator','cabin','totalFloors']}}
progress=json.loads((CASE/'independent-client-progress.json').read_text());visitor=progress['final'][0]['state']['multiplayer']['id'];clientdata=[];target_height=None
WAITSTART=334907.422;WAITEND=514920.141;CLICKSTART=331578.750
for index in [1,2]:
 with zipfile.ZipFile(CASE/f'independent-client-{index}-trace.zip') as z:
  lines=[json.loads(x) for x in z.read('trace.trace').splitlines()];network=[json.loads(x)['snapshot'] for x in z.read('trace.network').splitlines()]
  after={r['callId']:r for r in lines if r.get('type')=='after'};states=[];calls=[]
  for r in lines:
   if r.get('type')!='before':continue
   a=after.get(r['callId'],{});result=decoded(a.get('result',{}).get('value'));params=r.get('params',{})
   if isinstance(result,dict) and ('position' in result or 'simulationTime' in result):
    states.append({'callId':r['callId'],'startTime':r['startTime'],'endTime':a.get('endTime'),'state':compact(result)})
    if target_height is None:
     building=next((b for b in result.get('city',{}).get('buildings',[]) if b['id']=='east-012'),None)
     if building:
      high=next(f for f in building['floors'] if f['y']>325);target_height=high['y'];save(OUT/'actual-requested-floor-from-original-snapshot.json',{'buildingId':'east-012','requestedFloor':high})
   calls.append({'callId':r['callId'],'startTime':r['startTime'],'endTime':a.get('endTime'),'durationMs':a.get('endTime',r['startTime'])-r['startTime'],'method':r.get('method'),'selector':params.get('selector'),'expression':params.get('expression'),'error':a.get('error')})
  screens=[r for r in lines if r.get('type')=='screencast-frame'];inwait=[r for r in screens if WAITSTART<=r['timestamp']<=WAITEND]
  gaps=[(b['timestamp']-a['timestamp'])/1000 for a,b in zip(inwait,inwait[1:])]
  posts=[];responses=[];missing=0;badstatus=[]
  for row in network:
   req=row['request'];url=req.get('url','').split('?',1)[0]
   if not(url.endswith('/api/state') and req.get('method')=='POST'):continue
   h=req.get('postData',{}).get('_sha1');post=json.loads(z.read('resources/'+h));pose=post.get('pose',{})
   entry={'time':row.get('_monotonicTime'),'startedDateTime':row.get('startedDateTime'),'pose':{k:pose.get(k) for k in ['x','y','z','yaw']},'scene':post.get('scene'),'revision':post.get('revision'),'status':row['response'].get('status'),'resourceSha1':h,'requestDurationMs':row.get('time')};posts.append(entry)
   if entry['status']!=200:badstatus.append({'time':entry['time'],'status':entry['status']})
   rh=row['response'].get('content',{}).get('_sha1')
   if rh:
    packet=json.loads(z.read('resources/'+rh));peer=next((p for p in packet.get('players',[]) if p.get('id')==visitor),None)
    if peer:responses.append({'time':row.get('_monotonicTime'),'startedDateTime':row.get('startedDateTime'),'world':packet.get('world'),'visitor':{k:peer.get(k) for k in ['x','y','z','scene']},'resourceSha1':rh})
   else:missing+=1
  sendride=[r for r in posts if r['time'] is not None and CLICKSTART<=r['time']<=WAITEND and r['scene'].startswith('interior:east-012:')]
  recvride=[r for r in responses if r['time'] is not None and CLICKSTART<=r['time']<=WAITEND and r['visitor'].get('scene','').startswith('interior:east-012:')]
  uniques=[]
  for r in sendride:
   if not uniques or r['pose']['y']!=uniques[-1]['pose']['y']:uniques.append(r)
  for timepoint in [WAITSTART,WAITSTART+30000,WAITSTART+60000,WAITSTART+90000,WAITSTART+120000,WAITSTART+150000,WAITEND]:
   if sendride:closest=min(sendride,key=lambda r:abs(r['time']-timepoint));print('client',index,'sample',round((timepoint-WAITSTART)/1000,2),'sendTime',closest['time'],'y',closest['pose']['y'])
  summary={'client':index,'contextOptions':lines[0],'calls':calls,'snapshotStates':states,'networkStatePostCount':len(posts),'networkResponseBodiesMissing':missing,'non200StateResponses':badstatus,'rideStatePostCount':len(sendride),'rideUniqueHeightCount':len(uniques),'rideStartSend':sendride[0] if sendride else None,'rideFinalSend':sendride[-1] if sendride else None,'rideOutboundHeightMonotonicNonDecreasing':all(b['pose']['y']>=a['pose']['y'] for a,b in zip(sendride,sendride[1:])),'rideObserverResponseHeightRange':[min(r['visitor']['y'] for r in recvride),max(r['visitor']['y'] for r in recvride)] if recvride else None,'inWaitScreencastCount':len(inwait),'inWaitScreencastGapSeconds':{'min':min(gaps),'median':statistics.median(gaps),'max':max(gaps),'mean':statistics.mean(gaps)} if gaps else None,'screencastNotEquivalentToRenderOrSimulationFrames':True}
  # Never copy room tokens/headers or whole HAR request URLs into derived output.
  save(OUT/f'client-{index}-derived-summary.json',summary);save(OUT/f'client-{index}-ride-network-derived.json',{'outbound':sendride,'receivedStateResponses':recvride,'uniqueOutboundHeights':uniques,'notDirectEventSourceMessageArchive':True})
  clientdata.append(summary)
  for label,timepoint in [('before-request',CLICKSTART),('mid-ride',WAITSTART+90000),('end-wait',WAITEND)]:
   sc=min(screens,key=lambda r:abs(r['timestamp']-timepoint));name='resources/'+sc['sha1'];dst=OUT/f'client-{index}-{label}-original.jpeg';dst.write_bytes(z.read(name));save(OUT/f'client-{index}-{label}-original-frame-reference.json',{'traceZip':str(CASE/f'independent-client-{index}-trace.zip'),'originalResource':name,'traceFrame':sc,'originalBytesCopiedUnchanged':True,'sha256':digest(dst)})
final=progress['final'][0]['state'];elev=final['interior']['elevator'];total=elev['duration']+1.6; projection=total*((WAITEND-WAITSTART)/1000)/elev['elapsed']
inputs=[CASE/'independent-client-progress.json',CASE/'independent-client-1-trace.zip',CASE/'independent-client-2-trace.zip',ROOT/'tests/e2e/helpers/occupied.js',ROOT/'tests/multiplayer-browser/rooms.spec.js']
proof={'status':'READONLY_ORIGINAL_MP_FAILURE_DIAGNOSIS','sourceCommit':'ef92c25980f1da12b508971170b72b9dd6230059','noBrowserGpuTestsBuildOrRootMutations':True,'inputs':[{'path':str(p),'bytes':p.stat().st_size,'sha256':digest(p)} for p in inputs],'waitMs':WAITEND-WAITSTART,'requestedFloorId':'level-78','actualTargetHeight':target_height,'lobbyHeight':4.035,'observedFinalElevator':elev,'observedFinalTiming':final['timing'],'observedFinalSimulationTime':final['simulationTime'],'originalProgressPhases':[{'label':p['label'],'state':compact(p['state'])} for p in progress['phases']],'originalProgressFinal':[{'client':p['client'],'state':compact(p.get('state',{}))} for p in progress['final']],'projectedTotalSecondsAtObservedMeanMotionRate':projection,'projectionIsNotPredictedPassGuarantee':True,'firstCause':'Original180000ms wall wait expires while the physical elevator is still advancing; main simulation drops wall time above0.25/frame. Renderer/trace/CPU attribution is not measured by this artifact.','recommendation':'Only this MP chooseStorey call may use arrivalTimeout300000; helper default180000, whole900000, physical route, precise arrival and remote bounds remain unchanged; no retry. Preserve real original failure and finite failure diagnostics.'}
save(OUT/'diagnostic.json',proof)
print(json.dumps({'output':str(OUT),'targetHeight':target_height,'projectionSeconds':projection,'inputSha256':digest(CASE/'independent-client-progress.json')}))
