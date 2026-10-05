#!/usr/bin/env python3
"""One local functional resident-day run; preinstalled dependencies, not remote CI."""
import pathlib,subprocess,json,hashlib,importlib.util,os,time,sys,datetime,signal
root=pathlib.Path('/workspace/scratch/neon-harbor').resolve(); baseline=pathlib.Path('/tmp/neon-resident-loop-baseline-local-20261005').resolve()
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();out=pathlib.Path('/tmp/neon-resident-loop-local-'+head[:12]+'-20261005')
assert not out.exists(),'Never reuse prior evidence directory';out.mkdir();(out/'logs').mkdir();(out/'native').mkdir();(out/'preparation').mkdir()
def sha(p):return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def save(p,v):pathlib.Path(p).write_text(json.dumps(v,indent=2)+'\n')
modulePath=root/'tools/native-review/run-paired-native.py';spec=importlib.util.spec_from_file_location('neon_owned_native_wrapper',modulePath);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
signal.signal(signal.SIGTERM,m.request_abort);signal.signal(signal.SIGINT,m.request_abort)
summary={'scope':'LOCAL_PREINSTALLED_DEPENDENCIES_LOW_FUNCTIONAL_ONLY','status':'RUNNING','actualHead':head,'baselineHead':m.git_head(baseline),'originalWrapperSHA256':sha(modulePath),'harnessSHA256':sha(__file__),'startedAt':m.now(),'remoteCI':False,'artAcceptance':'NOT_APPLICABLE_LOW_FUNCTIONAL_ONLY','firstError':None,'retry':False}
print(json.dumps({'output':str(out),'head':head,'status':'STARTING_ONE_LOCAL_OWNED_RESIDENT_DAY'}),flush=True)
try:
 assert m.git_head(baseline)==m.BASELINE
 bundle=root/'tools/native-review';seal=json.loads((bundle/'bundle-manifest.json').read_text());case=next(c for c in json.loads((bundle/'cases.json').read_text())['cases'] if c['id']=='resident-loop')
 assert not case['paired'] and case['originalBudgetSeconds']==10800
 for name,pin in seal['files'].items():assert sha(bundle/name)==pin['sha256'],name
 for key,p in [('nativeWorkflowSha256','.github/workflows/native-art.yml'),('ciWorkflowSha256','.github/workflows/ci.yml'),('unchangedPagesSha256','.github/workflows/pages.yml')]:assert sha(root/p)==seal[key]
 adapter=seal['processAdapter'];assert sha(root/'node_modules/playwright-core/package.json')==adapter['packageSha256'];assert sha(root/'node_modules/playwright-core/lib/coreBundle.js')==adapter['coreBundleSha256']
 browsers=json.loads((root/'node_modules/playwright-core/browsers.json').read_text());assert all(next(b for b in browsers['browsers'] if b['name']==n)['browserVersion']=='151.0.7922.34' for n in ['chromium','chromium-headless-shell'])
 package=json.loads((root/'node_modules/playwright-core/package.json').read_text());assert package['version']=='1.62.1'
 receipt={'dependencyMode':'actual preinstalled provider; no apt/sudo/install step claimed','playwright':'1.62.1','browserManifest':browsers,'adapter':adapter,'actualWrapperBytesSHA':sha(modulePath),'actualCollectorSHA':sha(bundle/'methods/resident-extra/tools/capture-resident-extra.mjs'),'nativeCase':case}
 save(out/'preparation/dependency-receipt.json',receipt)
 environment={**os.environ,'GITHUB_SHA':head,'AUTHORED_SHA':head};environment.pop('CHROMIUM_PATH',None)
 deadline=time.monotonic()+m.PREPARATION_SECONDS
 build=m.run_owned(['npm','run','build'],root,environment,deadline-time.monotonic(),out/'logs/authored-build');assert m.executor_success(build),'Owned actual build failed'
 expected=json.loads((bundle/'expected-runtime-dictionaries.json').read_text())['authored'];before=m.frozen(root,expected,head);save(out/'preparation/actual-build-receipt.json',before)
 (out/'preparation/build-info-original.json').write_bytes((root/'dist/build-info.json').read_bytes())
 assert m.port_closed(m.PORT)['confirmedRefused'],'Owned port not closed before launch'
 native=out/'native/authored';argv=m.native_command(case,'authored',root,bundle,native);save(out/'preparation/actual-argv.json',argv)
 summary['freezeBefore']=before;save(out/'local-summary.json',summary)
 result=m.run_owned(argv,root,environment,case['originalBudgetSeconds']+m.OUTER_CLEANUP_GRACE_SECONDS,out/'logs/native-authored',check_port=True,metadata_path=native/'metadata.json',owned_port=m.PORT)
 raw=m.native_result(native,case['family'],out/'logs/native-authored.stdout.log');summary['executor']=result;summary['rawRecord']={k:v for k,v in raw.items() if k!='rawMetadata'}
 after=m.frozen(root,expected,head);summary['freezeAfter']=after;assert before==after,'Actual runtime changed during capture'
 assert m.ABORT_SIGNAL is None and m.executor_success(result) and raw['status'] in m.SUCCESS_STATES and not raw['originalFirstError'],'Original collector did not complete with exact owned closure'
 summary['status']='FUNCTIONAL_RESIDENT_DAY_COMPLETE'
except BaseException as e:
 summary['status']='FAILED';summary['firstError']={'type':type(e).__name__,'message':str(e)}
finally:
 if m.ABORT_SIGNAL is not None:summary['status']='FAILED';summary['cancellationSignal']=m.ABORT_SIGNAL
 summary['finishedAt']=m.now();save(out/'local-summary.json',summary)
 files={str(p.relative_to(out)):{'bytes':p.stat().st_size,'sha256':m.digest(p)} for p in sorted(out.rglob('*')) if p.is_file() and p.name!='evidence-files.json'}
 if m.ABORT_SIGNAL is not None:
  summary['status']='FAILED';summary['cancellationSignal']=m.ABORT_SIGNAL;save(out/'local-summary.json',summary);files['local-summary.json']={'bytes':(out/'local-summary.json').stat().st_size,'sha256':m.digest(out/'local-summary.json')}
 save(out/'evidence-files.json',{'status':summary['status'],'files':files})
 print(json.dumps({'output':str(out),'head':head,'status':summary['status'],'firstError':summary['firstError']}),flush=True)
sys.exit(0 if summary['status']=='FUNCTIONAL_RESIDENT_DAY_COMPLETE' else 1)
