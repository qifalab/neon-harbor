from pathlib import Path
import json,hashlib,shutil,socket,datetime
from PIL import Image
root=Path('/workspace/scratch/neon-harbor');parent=root/'docs/qa/art-pilot';name='vice-detail-native-2026-10-04';out=parent/name;sha=lambda b:hashlib.sha256(b).hexdigest()
def write(n,d):(out/n).write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
d=json.loads((out/'metadata.json').read_text());inv=json.loads((parent/(name+'.invocation.json')).read_text());assert d['status']!='running' and inv['status']!='running'
active=[]
for p in Path('/proc').iterdir():
 if not p.name.isdigit():continue
 try:
  c=(p/'comm').read_text().strip();parts=(p/'stat').read_text().split()
  if ('chrome' in c.lower()or'chromium'in c.lower())and parts[2]!='Z':active.append({'pid':int(p.name),'comm':c,'state':parts[2],'ppid':int(parts[3])})
 except (FileNotFoundError,ProcessLookupError,PermissionError):pass
s=socket.socket();s.settimeout(1);rc=s.connect_ex(('127.0.0.1',5208));s.close();present=Path('/proc/'+str(inv['pid'])).exists()
closure={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),f'methodPid{inv["pid"]}Present':present,'activeChromeProcesses':active,'port5208ConnectEx':rc,'serverClosed':rc!=0,'gpuBrowserReleased':not active and not present,'noProcessesKilledForThisCheck':True};write('closure-process-check.json',closure);assert closure['serverClosed']and closure['gpuBrowserReleased']
copies=[]
def copy(p,n):
 q=out/n;assert not q.exists();q.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,q);b=q.read_bytes();copies.append({'originalPath':str(p),'copy':n,'bytes':len(b),'sha256':sha(b)})
copy(parent/(name+'.invocation.json'),'invocation-original.json')
for stream in ['stdout','stderr']:copy(parent/inv[stream],inv[stream])
for p,n in [(Path('/tmp/neon-vice-detail-root-run.py'),'run-native-wrapper.py'),(Path(__file__),'close-native-archive.py'),(Path('/tmp/neon-vice-detail-root-preflight.json'),'preflight-original.json'),(Path('/tmp/neon-workshop-vice-detail-f147-review.md'),'independent-review/neon-workshop-vice-detail-f147-review.md')]:copy(p,n)
bad=[]
for rel,h in d['sourceHashes'].items():
 if sha((root/rel).read_bytes())!=h or sha((root/'dist'/rel).read_bytes())!=h:bad.append(rel)
 copy(root/rel,'frozen-source/'+rel)
for rel,h in d['methodHashes'].items():
 if sha((root/rel).read_bytes())!=h:bad.append(rel)
 if not(out/'frozen-source'/rel).exists():copy(root/rel,'frozen-source/'+rel)
copy(root/'dist/build-info.json','frozen-source/build-info.json')
if sha((root/'dist/build-info.json').read_bytes())!=d['buildInfoSha256']:bad.append('dist/build-info.json')
old=parent/'native-validation-owned-release-2026-10-04';oldsha=sha((old/'archive-ledger.json').read_bytes());assert oldsha=='c4f759b3798010590381c45fa833ebffd13d66a4bf1fdc47498637836a12439b';oldbad=[]
for e in json.loads((old/'archive-ledger.json').read_text())['files']:
 b=(old/e['path']).read_bytes()
 if len(b)!=e['bytes']or sha(b)!=e['sha256']:oldbad.append(e['path'])
write('freeze-verification.json',{'sourceCount':len(d['sourceHashes']),'srcCount':sum(p.startswith('src/')for p in d['sourceHashes']),'methodCount':len(d['methodHashes']),'sourceServedMethodManifestUnchanged':not bad,'mismatches':bad,'prior201LedgerSha256':oldsha,'prior201Unchanged':not oldbad,'prior201Mismatches':oldbad})
images=[]
for c in d['context']['captures']:
 p=out/c['file'];q=out/c['poseFile']
 with Image.open(p)as im:size=list(im.size)
 images.append({'file':c['file'],'sha256':sha(p.read_bytes()),'poseSha256':sha(q.read_bytes()),'size':size,'matches':sha(p.read_bytes())==c['sha256']and sha(q.read_bytes())==c['poseSha256']and size==[1280,800],'gl':c['gl']})
write('normalized-detail-evidence.json',{'status':d['status'],'runnerExitCode':inv['exitCode'],'actualEyeDistanceMetres':d.get('actualEyeDistanceMetres'),'captures':images,'actualExitReleaseEvents':d.get('actualExitReleaseEvents'),'errors':d['context']['errors'],'errorsAfterFinalization':d.get('errorsAfterFinalization'),'cleanup':d.get('cleanup'),'caseBudget':d.get('caseBudget'),'finalizationErrors':d.get('finalizationErrors'),'scope':'One independent vice material inspection, not a repeated resource suite, whole-room/city art approval or driver allocation measurement.'})
write('copy-provenance.json',copies)
print(json.dumps({'status':d['status'],'runnerExitCode':inv['exitCode'],'closure':closure,'sources':len(d['sourceHashes']),'methods':len(d['methodHashes']),'mismatches':bad,'prior201Mismatches':oldbad,'images':images,'eyeDistance':d.get('actualEyeDistanceMetres')},ensure_ascii=False))
