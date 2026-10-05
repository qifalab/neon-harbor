"""One final actual production full rules and build; preserve first source outcome."""
import datetime,hashlib,json,os,re,subprocess,time
from pathlib import Path
w=Path('/workspace/neon-candidates/harbor-mineral-pattern-correction-final-20261005');r=Path('/workspace/neon-candidates/harbor-mineral-pattern-correction-final-20261005-review');f=r/'final-production-checks';q=w/'docs/qa/mineral-pattern-correction-adoption-20261005/final-production-checks'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def save(p,v):assert not p.exists(),p;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def cp(p,t):assert not t.exists(),t;t.parent.mkdir(parents=True,exist_ok=True);t.write_bytes(p.read_bytes())
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=w,text=True).strip()=='9cf1c8613765addfb8592e0c4f9de14ce46210f9'
assert sha(r/'pattern-correction-adoption-receipt.json')=='eb90c1d022ed307759ad3d076757484ffb3d9c62c16eff1c4ac6f582f73a2018'
sources=load(r/'source-hashes-after-adoption-before-checks.json');assert len(sources)==401;assert {p:sha(w/p) for p in sources}==sources
assert sha(r/'original-committed-9cf208-build-info.json')=='b7fff54990d24db3441124ee822d188b12531f3336667aa896e070e5beaade88'
for dst in [f/'all-production-test-source-hashes-before.json',q/'all-production-test-source-hashes-before.json']:save(dst,sources)
print(json.dumps({'status':'PATTERN_CORRECTION_FINAL_PRODUCTION_RULES_STARTED','sourceFileCount':len(sources)}),flush=True)
started=datetime.datetime.now(datetime.timezone.utc).isoformat();tick=time.monotonic()
with (f/'full-npm-test.stdout.txt').open('wb') as out,(f/'full-npm-test.stderr.txt').open('wb') as err:run=subprocess.run(['npm','test'],cwd=w,stdout=out,stderr=err)
txt=(f/'full-npm-test.stdout.txt').read_text();summary={}
for key in ['tests','suites','pass','fail','cancelled','skipped','todo','duration_ms']:
 vals=re.findall(r'(?:ℹ|#)\s*'+key+r'\s+([0-9.]+)',txt);assert len(vals)==1,(key,vals);summary[key]=float(vals[0]) if key=='duration_ms' else int(vals[0])
after={p:sha(w/p) for p in sources};assert after==sources
tr={'status':'ACTUAL_PATTERN_CORRECTION_FINAL_PRODUCTION_FULL_NPM_TEST_PASS' if run.returncode==0 else 'ACTUAL_PATTERN_CORRECTION_FINAL_PRODUCTION_FULL_NPM_TEST_FAIL_PRESERVED','command':['npm','test'],'startedAtUTC':started,'elapsedSeconds':time.monotonic()-tick,'exitCode':run.returncode,'actualSummary':summary,'stdoutSHA256':sha(f/'full-npm-test.stdout.txt'),'stderrSHA256':sha(f/'full-npm-test.stderr.txt'),'sourceFileCount':len(sources),'allSourceBeforeAfterEqual':True,'testsChangedOrRetried':False,'original9cf381OutcomePreserved':True,'nativeGpuExecuted':False}
for n in ['full-npm-test.stdout.txt','full-npm-test.stderr.txt']:cp(f/n,q/n)
for dst in [f/'full-npm-test-receipt.json',q/'full-npm-test-receipt.json']:save(dst,tr)
print(json.dumps({'status':tr['status'],'exitCode':run.returncode,'actualSummary':summary}),flush=True)
if run.returncode:raise SystemExit(run.returncode)
assert summary['tests']==summary['pass']==381 and summary['fail']==summary['cancelled']==summary['skipped']==summary['todo']==0
started=datetime.datetime.now(datetime.timezone.utc).isoformat();tick=time.monotonic();env=os.environ.copy();env.pop('GITHUB_SHA',None)
with (f/'build.stdout.txt').open('wb') as out,(f/'build.stderr.txt').open('wb') as err:run=subprocess.run(['npm','run','build'],cwd=w,env=env,stdout=out,stderr=err)
after={p:sha(w/p) for p in sources};assert after==sources
br={'status':'ACTUAL_PATTERN_CORRECTION_FINAL_PRODUCTION_BUILD_PASS' if run.returncode==0 else 'ACTUAL_PATTERN_CORRECTION_FINAL_PRODUCTION_BUILD_FAIL_PRESERVED','command':['npm','run','build'],'startedAtUTC':started,'elapsedSeconds':time.monotonic()-tick,'exitCode':run.returncode,'stdoutSHA256':sha(f/'build.stdout.txt'),'stderrSHA256':sha(f/'build.stderr.txt'),'sourceFileCount':len(sources),'allSourceBeforeAfterEqual':True,'GITHUB_SHAExplicitlyAbsent':True,'buildRepeatedForThisSource':False,'original9cfCommittedBuildB7fffPreserved':True,'nativeGpuExecuted':False}
if run.returncode==0:
 cp(w/'dist/build-info.json',f/'build-info-original.json');cp(w/'dist/build-info.json',q/'build-info-original.json');build=load(w/'dist/build-info.json');old=load(w/'docs/qa/mineral-pattern-correction-adoption-20261005/original-committed-9cf208-build-info.json')['assets'];new=build['assets'];assert build.get('revision') is None
 delta={'added':{p:new[p] for p in sorted(new.keys()-old.keys())},'changed':{p:{'before':old[p],'after':new[p]} for p in sorted(old.keys()&new.keys()) if old[p]!=new[p]},'removed':sorted(old.keys()-new.keys()),'unchangedCount':sum(old[p]==new[p] for p in old.keys()&new.keys())}
 assert not delta['added'] and set(delta['changed'])=={'src/metropolis-western-ridge.js'} and not delta['removed'] and delta['unchangedCount']==207
 for p,pin in new.items():assert sha(w/p)==sha(w/'dist'/p)==pin,p
 br.update(assetCount=len(new),revision=None,buildInfoSHA256=sha(w/'dist/build-info.json'),exactRuntimeDeltaFrom9cf=delta,actualEntireBuildDictionaryMatchesSourceAndDist=True)
for n in ['build.stdout.txt','build.stderr.txt']:cp(f/n,q/n)
for dst in [f/'build-receipt.json',q/'build-receipt.json']:save(dst,br)
for dst in [f/'all-production-test-source-hashes-after.json',q/'all-production-test-source-hashes-after.json']:save(dst,after)
print(json.dumps(br),flush=True);raise SystemExit(run.returncode)
