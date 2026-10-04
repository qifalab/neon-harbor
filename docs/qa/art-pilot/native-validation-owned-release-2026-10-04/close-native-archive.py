from pathlib import Path
import json,hashlib,shutil,socket,datetime
from PIL import Image
base=Path('/workspace/scratch/neon-harbor-art-pilot'); parent=base/'docs/qa/art-pilot'; out=parent/'native-validation-owned-release-2026-10-04'
sha=lambda b:hashlib.sha256(b).hexdigest()
def write(n,d): (out/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
d=json.loads((out/'metadata.json').read_text()); inv=json.loads((parent/(out.name+'.invocation.json')).read_text()); assert d['status']!='running' and inv['status']!='running'
active=[]
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:
  comm=(p/'comm').read_text().strip(); parts=(p/'stat').read_text().split(); state=parts[2]
  if ('chrome' in comm.lower() or 'chromium' in comm.lower()) and state!='Z': active.append({'pid':int(p.name),'comm':comm,'state':state,'ppid':int(parts[3])})
 except (FileNotFoundError,ProcessLookupError,PermissionError):pass
s=socket.socket();s.settimeout(1);code=s.connect_ex(('127.0.0.1',5208));s.close();pid=inv['pid'];present=Path('/proc/'+str(pid)).exists()
closure={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),f'methodPid{pid}Present':present,'activeChromeProcesses':active,'port5208ConnectEx':code,'serverClosed':code!=0,'gpuBrowserReleased':not active and not present,'noProcessesKilledForThisCheck':True}
write('closure-process-check.json',closure)
assert closure['gpuBrowserReleased'] and closure['serverClosed'],'Cannot finalize closed GPU archive while owned processes/server remain'
copied=[]
def copy(p,n):
 q=out/n;assert not q.exists();q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,q);b=q.read_bytes();copied.append({'originalPath':str(p),'copy':n,'bytes':len(b),'sha256':sha(b)})
for suffix in ['stdout.txt','stderr.txt','invocation.json']:copy(parent/(out.name+'.'+suffix),'raw-'+suffix)
copy(Path('/tmp/neon-pilot-native-owned-run.py'),'run-native-wrapper.py');copy(Path(__file__),'close-native-archive.py')
for p in [Path('/tmp/neon-art-pilot-owned-release-root-look.json'),Path('/tmp/neon-art-pilot-owned-release-root-cycle3-look.json')]:
 if p.exists():copy(p,'independent-review/'+p.name)
mismatches=[];sourceActual={};servedActual={}
for rel,expected in d['sourceHashes'].items():
 b=(base/rel).read_bytes();t=(base/'dist'/rel).read_bytes();sourceActual[rel]=sha(b);servedActual[rel]=sha(t)
 if sha(b)!=expected or sha(t)!=expected:mismatches.append(rel)
 copy(base/rel,'frozen-source/'+rel)
for rel,expected in d['methodHashes'].items():
 b=(base/rel).read_bytes()
 if sha(b)!=expected:mismatches.append(rel)
 if not (out/'frozen-source'/rel).exists():copy(base/rel,'frozen-source/'+rel)
manifest=(base/'dist/build-info.json').read_bytes();copy(base/'dist/build-info.json','frozen-source/build-info.json')
if sha(manifest)!=d['buildInfoSha256']:mismatches.append('dist/build-info.json')
old=parent/'native-validation-2026-10-04'; ledger=json.loads((old/'archive-ledger.json').read_text());oldm=[]
for e in ledger['files']:
 p=old/e['path'];b=p.read_bytes()
 if len(b)!=e['bytes'] or sha(b)!=e['sha256']:oldm.append(e['path'])
write('freeze-verification.json',{'sourceServedMethodManifestUnchanged':not mismatches,'mismatches':mismatches,'sourceHashes':sourceActual,'servedHashes':servedActual,'historical183Unchanged':not oldm,'historicalMismatches':oldm,'historicalLedgerSha256':sha((old/'archive-ledger.json').read_bytes())})
images=[]
for case in d['scenarios']:
 for c in case['captures']:
  p=out/c['file'];pose=out/c['poseFile']
  with Image.open(p) as im:size=list(im.size)
  images.append({'file':c['file'],'sha256':sha(p.read_bytes()),'size':size,'poseSha256':sha(pose.read_bytes()),'matches':sha(p.read_bytes())==c['sha256'] and sha(pose.read_bytes())==c['poseSha256'] and size==[1280,800],'gl':c['gl']})
releases=[];seen=set()
for e in d['scenarios'][0]['events']:
 for r in e.get('lifecycle',[]):
  if r['kind']=='asset-released' and r['sequence'] not in seen:seen.add(r['sequence']);releases.append(r)
normal=d['scenarios'][0]
assert all(e['matches'] and e['gl']['errorAtCapture']==0 and not e['gl']['contextLost'] for e in images), 'PNG/pose/native GL consistency failed'
assert len(releases)==8 if d['status']=='passed' else True, 'Expected 4 actual normal exits / 8 owned release events'
summary={'status':'OWNED_RESOURCE_NATIVE_PASS' if d['status']=='passed' and inv['exitCode']==0 and not mismatches and not oldm else 'FAILED','runnerExitCode':inv['exitCode'],'startedAt':d['startedAt'],'completedAt':d.get('completedAt'),'methodSha256':d['methodHashes']['tools/capture-workshop-pilot.mjs'],'manifestSha256':d['buildInfoSha256'],'normalOwnedReleaseEvents':releases,'normalGlobalObservations':normal.get('globalMemoryObservations'),'images':images,'cases':[{'name':c['name'],'status':c['status'],'unexpectedErrors':c['errors'],'expectedErrors':c['expectedErrors'],'teardownEvents':c['teardownEvents'],'abortVsLateParse':c.get('abortVsLateParse'),'lifecycleAfterExit':c.get('lifecycleAfterExit'),'injection':c['injection']}for c in d['scenarios']],'limits':['Owned Three disposal counts do not establish driver allocation bytes or city-wide no-leak.','Original strict whole-scene native FAIL remains failed and immutable.','Vice near photo is small/dark; independent closer inspection remains unexecuted.','Two real GLBs do not approve whole-room/city/AAA art.']}
write('normalized-resource-evidence.json',summary);write('copy-provenance.json',copied)
print(json.dumps({'status':summary['status'],'closure':closure,'copies':len(copied),'sourceCount':len(sourceActual),'mismatches':mismatches,'old183Mismatches':oldm,'images':len(images),'normalOwnedReleaseCount':len(releases)},ensure_ascii=False))
