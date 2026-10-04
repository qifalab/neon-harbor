from pathlib import Path
import hashlib,json,subprocess,datetime,shutil
root=Path('/workspace/scratch/neon-harbor')
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1048576),b''):h.update(b)
 return h.hexdigest()
def git(*args,check=True):
 return subprocess.run(['git',*args],cwd=root,text=True,capture_output=True,check=check)
parent='0330df7ee1042d0f211304b042e01cdf6a0b4d44'
assert git('rev-parse','HEAD').stdout.strip()==parent
manifest=root/'dist/build-info.json';assert sha(manifest)=='502af982ac2999fb28c395388d7d97acdf6165df803f62b3069f95cafa2dcbb3'
assets=json.loads(manifest.read_text())['assets'];assert len(assets)==156 and sum(p.startswith('src/') for p in assets)==53
for p,s in assets.items():assert sha(root/p)==s and sha(root/'dist'/p)==s,p
assert sha(root/'tools/capture-harbor-tour.mjs')=='a8ff1a10fb47c97d2385054e65503b3269ba1a44fc3d2f7318bf5fe39603e537'
assert sha(root/'tools/capture-workshop-vice-detail.mjs')=='1cc5537fe516cf57cbd71ff7f463588b962ce1d102799c1b8ec1fab90f1b4e7d'
tests=json.loads((root/'docs/qa/art-pilot/root-integration-2026-10-04/node-test-dictionary.json').read_text());assert len(tests)==43
for p,s in tests.items():assert sha(root/p)==s,p
cpu=json.loads((root/'docs/qa/art-pilot/cpu-validation-release-revision-2026-10-04/source-after.json').read_text())
for p in ['package.json','package-lock.json']:assert sha(root/p)==cpu[p]['sha256']
assert sha(root/'tests/multiplayer-browser/rooms.spec.js')=='c3e382b6a86b2b0130a138e936817f35f5dc802c8ee586ffa7834433f89ad20f'
archive_checks={
 'docs/qa/art-pilot/native-validation-owned-release-2026-10-04/archive-ledger.json':'c4f759b3798010590381c45fa833ebffd13d66a4bf1fdc47498637836a12439b',
 'docs/qa/art-pilot/vice-detail-native-2026-10-04/archive-ledger.json':'f3538418852d32ec664d1e393b789ad520b6b2c6565bc624778d3a07a9245bc3',
 'docs/qa/art-pilot/vice-detail-region-native-2026-10-04/archive-ledger.json':'467ed930f24c1963c03661ff05baf8264d26f7fa943eff01aa03d4301f764fee'}
archive_counts={}
for path,s in archive_checks.items():
 p=root/path;assert sha(p)==s,path
 entries=json.loads(p.read_text())['files']
 for row in entries:
  f=p.parent/row['path'];assert f.stat().st_size==row['bytes'] and sha(f)==row['sha256'],str(f)
 archive_counts[path]=len(entries)
plan=json.loads((root/'docs/qa/release-v08-storage/first-three-video-storage-plan-original.json').read_text())
video_checks=[]
for v in plan['videos']:
 p=root/v['originalCapturePath'];assert p.stat().st_size==v['originalBytes'] and sha(p)==v['originalSha256']
 assert git('cat-file','-e',parent+':'+v['originalCapturePath'],check=False).returncode!=0
 video_checks.append({'path':v['originalCapturePath'],'bytes':p.stat().st_size,'sha256':sha(p),'keptLocally':True})
removed=[]
for v in plan['videos'][:2]:
 path=v['originalCapturePath'];assert git('ls-files','--',path).stdout.strip()==path
 result=git('update-index','--force-remove','--',path)
 removed.append({'command':['git','update-index','--force-remove','--',path],'exitCode':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
assert not git('ls-files','*.webm').stdout.strip()
for row in video_checks:assert (root/row['path']).stat().st_size==row['bytes'] and sha(root/row['path'])==row['sha256']
tracked=set(git('ls-files').stdout.splitlines());generated=[]
for path,s in assets.items():
 if path not in tracked:
  assert path.startswith(('assets/city/chunks/','assets/metropolis/chunks/')),path;generated.append(path);continue
 b=subprocess.check_output(['git','show',':'+path],cwd=root)
 assert hashlib.sha256(b).hexdigest()==s,'Staged runtime asset differs: '+path
for path,s in tests.items():assert hashlib.sha256(subprocess.check_output(['git','show',':'+path],cwd=root)).hexdigest()==s,path
for path in ['package.json','package-lock.json']:assert hashlib.sha256(subprocess.check_output(['git','show',':'+path],cwd=root)).hexdigest()==cpu[path]['sha256'],path
scoped=git('diff','--cached','--check','--','.gitignore','src','tests','tools','.github','README.md','docs/QA_V08.md','docs/HARBOR_SAMPLE_ACCEPTANCE.md','docs/WORLD_SIMULATOR_PLAN.md','docs/REAL_CITY_V08_PLAN.md')
assert scoped.returncode==0
rows=git('ls-files','--stage').stdout.splitlines();oids={x.split()[1] for x in rows}
sizes=subprocess.check_output(['git','cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],cwd=root,input=('\n'.join(oids)+'\n').encode()).decode().splitlines()
maxblob=max(int(x.split()[2]) for x in sizes if x.split()[1]=='blob');assert maxblob<100*1024*1024
assert not git('diff','--name-only').stdout.strip(),'Unstaged modifications remain'
d=root/'docs/qa/release-v08-storage'
receipt={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'parentCommit':parent,'runtimeManifestSha256':sha(manifest),'assetCount':len(assets),'sourceModuleCount':53,'npmTestsByteMatched':len(tests),'packageAndLockByteMatched':True,'multiplayerTraceFixRetained':True,'originalArchiveCountsRechecked':archive_counts,'sourceAndBuiltAssetHashesEqual':True,'stagedTrackedRuntimeHashesEqual':True,'generatedRuntimePathsRebuiltByCI':generated,'rawVideoStorageState':'local-originals-retained-release-attachments-planned-not-uploaded','rawVideoChecks':video_checks,'indexRemovalCommands':removed,'stagedWebmCountAfterRemoval':0,'maximumStagedBlobBytesBeforeThisReceipt':maxblob,'scopedDiffCheckExitCode':scoped.returncode,'noOriginalLogEdited':True,'fourthTourStatus':'prepared-not-executed','publicationPerformed':False}
(d/'precommit-index-and-source-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
shutil.copyfile(Path(__file__),d/'executed-precommit-check.py')
git('add','--','docs/qa/release-v08-storage/precommit-index-and-source-receipt.json','docs/qa/release-v08-storage/executed-precommit-check.py')
print(json.dumps({'status':'PRECOMMIT_PASS','runtimeAssets':156,'sourceModules':53,'npmTestFiles':43,'archiveCounts':archive_counts,'maximumStagedBlobBytes':maxblob,'originalVideoBytesRetained':sum(x['bytes'] for x in video_checks),'indexWebmCount':0,'generatedRuntimePaths':len(generated)}))
