"""ROOT exact committed-source dispatcher. Creates one distinct ref; never edits main."""
import argparse,datetime,hashlib,json,re,subprocess
from pathlib import Path
ROOT=Path('/workspace/neon-candidates/harbor-ferry-long-corridor-verification-final-20261005')
REPO='qifalab/neon-harbor';PARENT='986db512e6268ea5228da4fd360db4317134dd2e'
MAIN='0330df7ee1042d0f211304b042e01cdf6a0b4d44'
REF='codex/harbor-v08-final-ferry-long-corridor-full-and-high-20261005'
PROTECTED={'codex/harbor-v08-final-continuous-life-20261005':'8b6a577529ade0a45aadc499db3181d165043a9d','codex/harbor-v08-northern-ridge-held-20261005':'8b6a577529ade0a45aadc499db3181d165043a9d','codex/harbor-v08-final-material-lighting-full-and-high-20261005':'9cf1c8613765addfb8592e0c4f9de14ce46210f9','codex/harbor-v08-final-mineral-pattern-current-functional-20261005':'986db512e6268ea5228da4fd360db4317134dd2e'}
INPUTS={'native_only':False,'capture_native':True,'selected_case_ids':'ferry'}
def load(p):return json.loads(p.read_bytes())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def git(*a):return subprocess.check_output(['git',*a],cwd=ROOT,text=True).strip()
def save(p,v):assert not p.exists(),p;p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def main():
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--head',required=True);ap.add_argument('--tree',required=True);ap.add_argument('--build-dir',required=True);ap.add_argument('--output',required=True);ap.add_argument('--execute',action='store_true');a=ap.parse_args()
 assert all(re.fullmatch('[0-9a-f]{40}',v) for v in [a.head,a.tree]) and REF not in PROTECTED
 builddir=Path(a.build_dir);build=load(builddir/'receipt.json')
 assert build['status']=='ACTUAL_COMMITTED_NATIVE_ONLY_FERRY_BUILD_PASS_NATIVE_PENDING' and build['commit']==a.head and build['tree']==a.tree and build['parent']==PARENT and build['assets']==208 and build['sourceFiles']==401 and all(build['checks'].values())
 assert git('rev-parse','HEAD')==a.head and git('rev-parse','HEAD^{tree}')==a.tree and git('rev-list','--parents','-n','1',a.head).split()==[a.head,PARENT]
 assert not subprocess.check_output(['git','status','--porcelain','--untracked-files=no'],cwd=ROOT)
 raw=ROOT/'dist/build-info.json';assert sha(raw)==build['actualBuildSHA256'];runtime=load(raw);assert runtime['revision']==a.head and runtime['version']=='0.8.0' and len(runtime['assets'])==208
 assert all(sha(ROOT/p)==sha(ROOT/'dist'/p)==pin for p,pin in runtime['assets'].items())
 b=ROOT/'tools/native-review';catalog=load(b/'bundle-manifest.json');assert sha(b/'bundle-manifest.json')==build['nativeBundleManifestSHA256']
 actual={str(p.relative_to(b)):{'bytes':p.stat().st_size,'sha256':sha(p)} for p in b.rglob('*') if p.is_file() and p!=b/'bundle-manifest.json'}
 assert actual==catalog['files'] and len(actual)==build['nativeBundleFiles'] and not any(p.is_symlink() or '__pycache__' in p.parts or p.suffix=='.pyc' for p in b.rglob('*'))
 assert load(b/'expected-runtime-dictionaries.json')['authored']['assets']==runtime['assets']
 cases={c['id']:c for c in load(b/'cases.json')['cases']};matrix={r['id']:r for r in load(b/'native-matrix.json')['include']}
 for kind in ('bus','tram','ferry'):
  assert cases[kind]['paired'] and cases[kind]['originalBudgetSeconds']==2400 and matrix[kind]=={'id':kind,'job_timeout_minutes':110,'evidence_label':'Native High'}
 method=b/'methods/transport/native-transport-high.mjs';assert sha(method)=='ce3fed236f6f91f9d7bb56479ee961bce19bdee89544efe39d67b6fe01b2ea2f'
 assert sha(ROOT/'.github/workflows/ci.yml')=='5fb9a4cda8726d17c3b0eae49a579f7cd8949cf976664d0740427d4d706cd028' and sha(ROOT/'.github/workflows/native-art.yml')=='c50cdc8dd0b6622430ada81d6ee59b6f3d73063c99199d278627cb6fe9237720'
 out=Path(a.output);create={'ref':'refs/heads/'+REF,'sha':a.head};dispatch={'ref':REF,'inputs':INPUTS}
 if not a.execute:
  assert not out.exists();out.mkdir(parents=True);save(out/'create-request.json',create);save(out/'dispatch-request.json',dispatch);save(out/'prepared-receipt.json',{'status':'PREPARED_ONLY','source':a.head,'tree':a.tree,'parent':PARENT,'expectedMain':MAIN,'ref':REF,'inputs':INPUTS,'buildReceiptSHA256':sha(builddir/'receipt.json'),'buildSHA256':sha(raw),'nativeBundleManifestSHA256':sha(b/'bundle-manifest.json'),'requestedRequiredFunctionalJobs':12,'selectedNativeCases':['ferry'],'currentLocalFerryHallSecondsOnlyIfAtLeast12MetresNonprecision':300,'otherLocalSeconds':150,'graphicsOnlySourceIdentityTo986':True,'networkExecuted':False,'nativePass':False});print(json.dumps({'status':'PREPARED_ONLY','head':a.head,'ref':REF,'assets':208,'nativeFiles':len(actual)}));return
 prepared=load(out/'prepared-receipt.json');assert prepared['source']==a.head and prepared['tree']==a.tree and prepared['buildReceiptSHA256']==sha(builddir/'receipt.json') and load(out/'create-request.json')==create and load(out/'dispatch-request.json')==dispatch
 execution=out/'executed';assert not execution.exists();execution.mkdir()
 def api(name,endpoint,payload=None,status=200):
  command=['gh','api','--include','--method','POST' if payload is not None else 'GET','repos/'+REPO+'/'+endpoint]
  if payload is not None:command+=['--input','-']
  r=subprocess.run(command,input=None if payload is None else json.dumps(payload).encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  (execution/(name+'.response.raw')).write_bytes(r.stdout);(execution/(name+'.stderr.raw')).write_bytes(r.stderr);assert r.returncode==0,'Original failed API response preserved; no retry: '+name
  h,sep,body=r.stdout.replace(b'\r\n',b'\n').partition(b'\n\n');m=re.search(rb'HTTP/[0-9.]+\s+(\d+)',h);assert sep and m and int(m[1])==status,name
  return json.loads(body) if body.strip() else None
 c=api('01-commit','git/commits/'+a.head);assert c['sha']==a.head and c['tree']['sha']==a.tree and [p['sha'] for p in c['parents']]==[PARENT]
 assert api('02-main-before','git/ref/heads/main')['object']['sha']==MAIN
 for n,(ref,pin) in enumerate(PROTECTED.items()):assert api('03-protected-before-'+str(n),'git/ref/heads/'+ref)['object']['sha']==pin
 created=api('04-create-distinct-ref','git/refs',create,201);assert created['ref']=='refs/heads/'+REF and created['object']['sha']==a.head
 assert api('05-source-ref-before','git/ref/heads/'+REF)['object']['sha']==a.head
 started=now();api('06-dispatch','actions/workflows/ci.yml/dispatches',dispatch,204)
 assert api('07-source-ref-after','git/ref/heads/'+REF)['object']['sha']==a.head and api('08-main-after','git/ref/heads/main')['object']['sha']==MAIN
 for n,(ref,pin) in enumerate(PROTECTED.items()):assert api('09-protected-after-'+str(n),'git/ref/heads/'+ref)['object']['sha']==pin
 listed=api('10-workflow-readback','actions/workflows/ci.yml/runs?branch='+REF+'&event=workflow_dispatch&per_page=10');rows=[r for r in listed['workflow_runs'] if r['head_sha']==a.head and r['head_branch']==REF and r['event']=='workflow_dispatch'];assert len(rows)<=1
 run=rows[0] if rows else None
 if run:assert run['run_attempt']==1
 receipt={'status':'DISPATCH_ACCEPTED_NOT_COMPLETED','dispatchStartedUTC':started,'createdAtUTC':now(),'repository':REPO,'commit':a.head,'tree':a.tree,'parent':PARENT,'ref':REF,'inputs':INPUTS,'mainUnchanged':True,'protectedExistingRefsUnchanged':True,'actualNewRunID':run['id'] if run else None,'actualNewRunURL':run['html_url'] if run else None,'actualRunAttempt':run.get('run_attempt') if run else None,'runtimeAssets':208,'rawCommittedBuildSHA256':sha(raw),'nativeBundleFileCount':len(actual),'nativeBundleManifestSHA256':sha(b/'bundle-manifest.json'),'selectedNativeCases':['ferry'],'localFerryAtLeast12mNonprecisionHallSeconds':300,'otherLocalSeconds':150,'all208RuntimeGraphicsResourcesLiteral986':True,'wholeSecondsPerVariant':2400,'finiteFerryBerthMs':1200000,'vmTimeoutMinutesPerPairedCase':110,'originalFailuresPreserved':True,'requiredFunctionalJobsRequested':True,'requiredOrNativePassClaimed':False,'newObserverCreated':False,'retryCancelForceOrMainWrite':False};save(execution/'receipt.json',receipt);print(json.dumps(receipt))
if __name__=='__main__':main()
