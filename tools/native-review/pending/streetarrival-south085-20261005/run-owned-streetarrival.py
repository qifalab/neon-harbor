"""Preparation only: ROOT must approve the fixed role/owned GPU queue before execution."""
import argparse,pathlib,json,hashlib,importlib.util,os,sys,signal,math,datetime
sys.dont_write_bytecode=True
here=pathlib.Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
binding=json.loads((here/'source-runtime-bindings.json').read_text())
def save(p,o):p.write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
def inventory(root):
 out={}
 for p in sorted(root.rglob('*')):
  assert not p.is_symlink() and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.pyo')
  if p.is_file():out[str(p.relative_to(root))]={'bytes':p.stat().st_size,'sha256':sha(p)}
 return out

def physical_source(root):
 skip={'.git','node_modules','dist','__pycache__','test-results','playwright-report','multiplayer-test-results','multiplayer-playwright-report'}
 return sorted(str(p.relative_to(root)) for p in root.rglob('*') if p.is_file() and not any(x in skip for x in p.relative_to(root).parts))
def freeze(role):
 bound=binding['roles'][role];assert bound is not None,'Candidate must be bound after actual build';root=pathlib.Path(bound['root']);build=root/'dist/build-info.json';actual=json.loads(build.read_text());assert sha(build)==bound['buildInfo']['sha256'] and actual['revision']==bound['revision'] and actual['assets']==bound['assets']
 for p,h in bound['assets'].items():assert sha(root/'dist'/p)==sha(root/p)==h
 assert physical_source(root)==sorted(bound['sourceInputs'])
 for p,h in bound['sourceInputs'].items():assert sha(root/p)==h
 method=inventory(here);method.pop('METHOD-SEAL.json');assert method==json.loads((here/'METHOD-SEAL.json').read_text())['files'];assert sha(pathlib.Path(binding['ownedModule']['path']))==binding['ownedModule']['sha256']
 return {'sourceRole':role,'root':str(root),'buildRevision':bound['revision'],'actualBuildInfoSHA256':sha(build),'actualRuntimeAssets':bound['assets'],'materializedSourceInputs':bound['sourceInputs'],'method':method,'methodSealSHA256':sha(here/'METHOD-SEAL.json'),'ownedModuleSHA256':binding['ownedModule']['sha256']}
def validate(raw,role):
 assert raw['status']=='capture-complete-art-review-pending' and not raw['errors'] and not raw.get('primaryError') and not raw['finalizationErrors'] and raw['playableComplete'] is True and raw['finishedBeforeDeadline'] is True
 assert raw['freezeBefore']==raw['freezeAfter'] and raw['wholeCaseBudgetMinutes']==20 and raw['viewport']=={'width':1280,'height':800} and raw['browser']['version']=='151.0.7922.34'
 assert raw['actualBuildRevision']==binding['roles'][role]['revision'] and raw['directGameStateWrites']==raw['directClockWrites']==raw['directStorageWrites']==0 and raw['retry'] is False and raw['noImagePostProcessing'] is True
 assert len(raw['publicSetups'])==1 and len(raw['captures'])==2 and raw['entryExitComplete'] is True and raw['elevatorExecuted'] is False and raw['ownedBrowserClose']['boundedCloseAccepted'] is True
 assert raw['entryInside']['interior']['buildingId']=='south-085' and raw['entryInside']['interior']['colliderCount']>0 and raw['exitAfter']['exterior']['southInteriorId'] is None and raw['exitAfter']['renderVisibility']['outdoor'] is True
 for shot in raw['captures']:
  assert sha(native/shot['image'])==shot['imageSha256'] and sha(native/shot['pose'])==shot['poseSha256'];data=(native/shot['image']).read_bytes();assert data[:8]==b'\x89PNG\r\n\x1a\n' and [int.from_bytes(data[16:20],'big'),int.from_bytes(data[20:24],'big')]==[1280,800]
  pose=json.loads((native/shot['pose']).read_text());assert pose['before']['position']==pose['after']['position'] and pose['before']['teleportRevision']==pose['after']['teleportRevision']
 if role=='candidate':assert raw['referencePosesMatched'] is True

if __name__=='__main__':
 ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--mode',choices=['before','candidate'],required=True);ap.add_argument('--gpu-go',choices=['yes'],required=True);ap.add_argument('--output',required=True);ap.add_argument('--temp-root',required=True);ap.add_argument('--reference');ap.add_argument('--reference-sha256');a=ap.parse_args();root=pathlib.Path(binding['roles'][a.mode]['root']);assert (a.mode=='before' and not a.reference and not a.reference_sha256) or (a.mode=='candidate' and a.reference and a.reference_sha256 and sha(pathlib.Path(a.reference))==a.reference_sha256);out=pathlib.Path(a.output).resolve();temp=pathlib.Path(a.temp_root).resolve();assert not out.exists() and not temp.exists() and not out.is_relative_to(root) and not temp.is_relative_to(root);out.mkdir(parents=True);temp.mkdir(parents=True);native=out/'native';native.mkdir();(out/'logs').mkdir();assert os.statvfs(temp).f_bavail*os.statvfs(temp).f_frsize>400*1024**2
 spec=importlib.util.spec_from_file_location('unchanged_official_neon_owned',binding['ownedModule']['path']);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);signal.signal(signal.SIGINT,m.request_abort);signal.signal(signal.SIGTERM,m.request_abort);assert m.OUTER_CLEANUP_GRACE_SECONDS==120
 summary={'status':'RUNNING','sourceRole':a.mode,'baseOrCommittedHead':None,'actualBuildRevision':binding['roles'][a.mode]['revision'],'candidateUncommittedPreview':binding['roles'][a.mode]['uncommittedPreview'],'firstError':None,'artAcceptance':'PENDING_ROOT_AND_INDEPENDENT_ORIGINAL_PIXELS','runtimeBindingSHA256':sha(here/'source-runtime-bindings.json'),'wrapperSHA256':sha(pathlib.Path(__file__)),'methodSealSHA256':sha(here/'METHOD-SEAL.json'),'startedAt':m.now(),'directSourceOrStorageOrGameWrites':False};exitcode=1
 try:
  summary['freezeBefore']=freeze(a.mode);save(out/'local-summary.json',summary);(out/'source-runtime-binding-original.json').write_bytes((here/'source-runtime-bindings.json').read_bytes());(out/'build-info-original.json').write_bytes((root/'dist/build-info.json').read_bytes());assert m.port_closed(5240)['confirmedRefused'];argv=['node',str(here/'capture-streetarrival.mjs'),'--mode',a.mode,'--output',str(native),'--gpu-go','yes','--port','5240'];
  if a.reference:argv+=['--reference',str(pathlib.Path(a.reference).resolve()),'--reference-sha256',a.reference_sha256]
  save(out/'actual-argv.json',argv);env=dict(os.environ);env.update(TMPDIR=str(temp),TMP=str(temp),TEMP=str(temp));result=m.run_owned(argv,root,env,20*60+120,out/'logs/native-streetarrival',check_port=True,metadata_path=native/'metadata.json',owned_port=5240);summary['executor']=result;raw=json.loads((native/'metadata.json').read_text());summary['originalNativePrimaryError']=raw.get('primaryError');summary['freezeAfter']=freeze(a.mode);assert summary['freezeBefore']==summary['freezeAfter'];assert m.executor_success(result);validate(raw,a.mode);summary['status']='CAPTURE_COMPLETE_ART_REVIEW_PENDING';summary['captures']=raw['captures'];exitcode=0
 except BaseException as e:summary['status']='FAILED';summary['firstError']={'type':type(e).__name__,'message':str(e)}
 finally:summary['finishedAt']=m.now();summary['publicationOrNativeTransportAccepted']=False;summary['wholeCharacterOrAAAClaim']=False;save(out/'local-summary.json',summary);save(out/'evidence-files.json',{'status':summary['status'],'files':inventory(out)});print(json.dumps({'status':summary['status'],'firstError':summary['firstError'],'output':str(out)}),flush=True)
 sys.exit(exitcode)
