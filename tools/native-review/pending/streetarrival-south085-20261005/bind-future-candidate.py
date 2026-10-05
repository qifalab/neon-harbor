"""Read-only candidate source/build binding after ROOT has closed the actual before run."""
from pathlib import Path
import argparse,json,hashlib,datetime
HERE=Path(__file__).parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
p=argparse.ArgumentParser();p.add_argument('--root',required=True);p.add_argument('--closed-before',required=True);p.add_argument('--closed-before-sha256',required=True);a=p.parse_args()
reference=Path(a.closed_before).resolve();assert sha(reference)==a.closed_before_sha256
raw=json.loads(reference.read_text());binding=json.loads((HERE/'source-runtime-bindings.json').read_text())
assert raw['mode']=='before' and raw['status']=='capture-complete-art-review-pending' and raw['primaryError'] is None and raw['finishedBeforeDeadline'] and raw['freezeUnchanged'] and raw['ownedBrowserClose']['boundedCloseAccepted'] and raw['entryExitComplete'] and len(raw['captures'])==2 and not raw['errors']
assert raw['actualBuildInfoSHA256']==binding['roles']['before']['buildInfo']['sha256']
assert binding['roles']['candidate'] is None,'Do not overwrite a prior candidate binding'
root=Path(a.root).resolve();assert not HERE.is_relative_to(root)
build=root/'dist/build-info.json';info=json.loads(build.read_text());assert info['version']=='0.8.0'
skip={'.git','node_modules','dist','__pycache__','test-results','playwright-report','multiplayer-test-results','multiplayer-playwright-report'}
source={}
for f in sorted(root.rglob('*')):
    if any(x in skip for x in f.relative_to(root).parts):continue
    if f.is_file():
        assert not f.is_symlink();source[str(f.relative_to(root))]=sha(f)
for name,pin in info['assets'].items():assert sha(root/name)==sha(root/'dist'/name)==pin
assert sorted(str(f.relative_to(root/'dist')) for f in (root/'dist').rglob('*') if f.is_file())==sorted([*info['assets'],'build-info.json'])
old=(HERE/'source-runtime-bindings.json').read_bytes();(HERE/'before-only-source-binding-original.json').write_bytes(old)
binding['roles']['candidate']={'root':str(root),'revision':info['revision'],'uncommittedPreview':info['revision'] is None,'buildInfo':{'sha256':sha(build)},'assets':info['assets'],'sourceInputs':source}
binding['status']='BEFORE_CLOSED_AND_ACTUAL_BUILT_CANDIDATE_BOUND_NATIVE_PENDING'
binding['closedBeforeReference']={'path':str(reference),'sha256':sha(reference)}
(HERE/'source-runtime-bindings.json').write_text(json.dumps(binding,ensure_ascii=False,indent=2)+'\n')
receipt={'status':'CANDIDATE_SOURCE_RUNTIME_BOUND_NO_NATIVE_EXECUTION','boundAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'beforeClosedReference':binding['closedBeforeReference'],'actualCandidateBuildInfoSHA256':sha(build),'actualRuntimeAssets':len(info['assets']),'materializedSourceFiles':len(source),'candidateNativeExecuted':False,'buildGitNetworkOrSourceChangesExecuted':False}
(HERE/'CANDIDATE-BINDING-RECEIPT.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
files={str(f.relative_to(HERE)):{'bytes':f.stat().st_size,'sha256':sha(f)} for f in sorted(HERE.rglob('*')) if f.is_file() and f.name!='METHOD-SEAL.json'}
(HERE/'METHOD-SEAL.json').write_text(json.dumps({'status':'CANDIDATE_BOUND_NATIVE_PENDING','files':files},ensure_ascii=False,indent=2)+'\n')
print(json.dumps(receipt,ensure_ascii=False,indent=2))
