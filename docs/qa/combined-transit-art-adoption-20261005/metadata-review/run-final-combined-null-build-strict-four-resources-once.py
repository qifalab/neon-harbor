"""One authorized combined candidate null build. External immutable receipts; no tests/GPU/network/git mutation."""
import argparse,datetime,hashlib,json,os,subprocess,time
from pathlib import Path
W=Path('/workspace/neon-candidates/harbor-combined-transit-art-final-20261005'); R=Path(str(W)+'-review'); PARENT='220312885a7b1a7a987790aa4f9d1d38b294be90'
TRAM={f'assets/harbor/transport/tram/vesper-t9-lod{i}.glb' for i in range(3)}
CLIENT_ASSET_MODULE='src/harbor-authored-transport-assets.js'
RUNTIME_DELTA=TRAM|{CLIENT_ASSET_MODULE}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def load(p):return json.loads(p.read_text())
def save(out,name,v):p=out/name;assert not p.exists(),p;p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def git(*a):return subprocess.check_output(['git',*a],cwd=W,text=True).strip()
def native():
 b=W/'tools/native-review'; assert not any(p.is_symlink() or '__pycache__' in p.parts or p.suffix=='.pyc' for p in b.rglob('*')); return {str(p.relative_to(b)):{'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(b.rglob('*')) if p.is_file()}
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--adoption-receipt',required=True);ap.add_argument('--adoption-receipt-sha256',required=True);ap.add_argument('--output',required=True);a=ap.parse_args()
 rp=Path(a.adoption_receipt);assert sha(rp)==a.adoption_receipt_sha256;adopt=load(rp);assert adopt['status']=='ALL_THREE_REVIEWED_LITERAL_PAYLOADS_ADOPTED_BUILD_PENDING' and adopt['parentCommit']==PARENT and adopt['rootActualReviewAuthorized'] is True
 assert git('rev-parse','HEAD')==PARENT
 # Client asset source may change only the exact three expected Tram SHA strings.
 old_client=subprocess.check_output(['git','show',PARENT+':'+CLIENT_ASSET_MODULE],cwd=W)
 new_client=(W/CLIENT_ASSET_MODULE).read_bytes()
 original_resources=load(R/'original-committed-220208-build-info.json')['assets']
 restored=new_client
 for rel in sorted(TRAM):
  new_pin=sha(W/rel).encode();old_pin=original_resources[rel].encode();assert new_client.count(new_pin)==1 and old_client.count(old_pin)==1,rel;restored=restored.replace(new_pin,old_pin)
 assert restored==old_client,'Client asset module contains unapproved changes beyond3SHA strings'
 payload=adopt['literalTargetFiles'];assert 'tests/e2e/harbor-sample.spec.js' in payload and RUNTIME_DELTA<=set(payload)
 for rel,row in payload.items():assert sha(W/rel)==row['sha256'] and (W/rel).stat().st_size==row['bytes'],rel
 old=load(R/'original-all401-source-hashes-220.json');assert len(old)==401;sourcepaths=set(old)|{p for p in payload if p.startswith(('src/','art-source/','assets/','tests/','vendor/'))}
 source={p:sha(W/p) for p in sorted(sourcepaths)};delta={p:{'before':old[p],'after':source[p]} for p in old if old[p]!=source[p]};assert set(delta)<=set(payload),delta
 original=load(R/'original-committed-220208-build-info.json');assert len(original['assets'])==208 and original['revision']==PARENT
 preassets={p:sha(W/p) for p in original['assets']};assert {p for p in preassets if preassets[p]!=original['assets'][p]}==RUNTIME_DELTA
 tracked=[p for p in subprocess.check_output(['git','ls-files','-z'],cwd=W).decode().split('\0') if p];before={p:sha(W/p) for p in tracked};nb=native();status=subprocess.check_output(['git','status','--porcelain','-z'],cwd=W)
 out=Path(a.output).resolve();assert not out.exists() and not out.is_relative_to(W);out.mkdir(parents=True);save(out,'all-tracked-hashes-before.json',before);save(out,'actual-source-hashes-before.json',source);save(out,'native-inventory-before.json',nb);save(out,'actual-runtime-source-hashes-before.json',preassets)
 env=os.environ.copy();env.pop('GITHUB_SHA',None);started=datetime.datetime.now(datetime.timezone.utc).isoformat();t=time.monotonic()
 with (out/'build.stdout.log').open('wb') as stdout,(out/'build.stderr.log').open('wb') as stderr:run=subprocess.run(['npm','run','build'],cwd=W,env=env,stdout=stdout,stderr=stderr)
 actual=None
 if (W/'dist/build-info.json').exists():raw=(W/'dist/build-info.json').read_bytes();(out/'build-info-original.json').write_bytes(raw);actual=json.loads(raw)
 after={p:sha(W/p) for p in tracked};asource={p:sha(W/p) for p in source};anative=native();save(out,'all-tracked-hashes-after.json',after);save(out,'actual-source-hashes-after.json',asource);save(out,'native-inventory-after.json',anative)
 assets=actual.get('assets',{}) if actual else {};added=sorted(set(assets)-set(original['assets']));removed=sorted(set(original['assets'])-set(assets));changed={p:{'before':original['assets'][p],'after':assets[p]} for p in set(assets)&set(original['assets']) if assets[p]!=original['assets'][p]}
 checks={'buildExitZero':run.returncode==0,'allTrackedBeforeAfterFrozen':before==after,'allSourceBeforeAfterFrozen':source==asource,'allNativeFilesBeforeAfterFrozen':nb==anative,'headAndStatusFrozen':git('rev-parse','HEAD')==PARENT and status==subprocess.check_output(['git','status','--porcelain','-z'],cwd=W),'version08AndNullRevision':actual is not None and actual.get('version')=='0.8.0' and actual.get('revision') is None,'actual208AndExplicitFourTramAndClientSHAModuleResourcesChanged':len(assets)==208 and not added and not removed and set(changed)==RUNTIME_DELTA,'allCurrentResourcesSourceDistExact':bool(assets) and all(sha(W/p)==sha(W/'dist'/p)==pin for p,pin in assets.items())}
 receipt={'status':'ACTUAL_COMBINED_NULL_BUILD_PASS_NATIVE_AND_ART_PENDING' if all(checks.values()) else 'ACTUAL_COMBINED_NULL_BUILD_FAILED_RAW_OUTPUTS_PRESERVED','parentCommit':PARENT,'adoptionReceipt':str(rp),'adoptionReceiptSHA256':sha(rp),'actualResourceCount':len(assets),'actualBuildInfoSHA256':sha(out/'build-info-original.json') if actual else None,'actualSourceFileCount':len(source),'actualSourceManifestSHA256':sha(out/'actual-source-hashes-before.json'),'sourceDeltaFrom220':delta,'sourceAddedFrom220':sorted(set(source)-set(old)),'runtimeDeltaFrom220':{'changed':changed,'added':added,'removed':removed,'unchangedCount':len(set(assets)&set(original['assets']))-len(changed)},'allActualRuntimeAssets':assets,'checks':checks,'buildExit':run.returncode,'startedAtUTC':started,'elapsedSeconds':time.monotonic()-t,'stdoutSHA256':sha(out/'build.stdout.log'),'stderrSHA256':sha(out/'build.stderr.log'),'testsExecuted':False,'GPUOrNetworkExecuted':False,'oldNativeOrArtPassInherited':False}
 save(out,'build-receipt.json',receipt);print(json.dumps({k:v for k,v in receipt.items() if k not in ['allActualRuntimeAssets','sourceDeltaFrom220']},indent=2));return 0 if all(checks.values()) else 1
if __name__=='__main__':raise SystemExit(main())
