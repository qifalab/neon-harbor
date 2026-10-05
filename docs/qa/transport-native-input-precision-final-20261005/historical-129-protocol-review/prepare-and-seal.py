#!/usr/bin/env python3
"""Strict independent AEC metadata adoption; no build/test/GPU/commit/ref mutation."""
import argparse, copy, datetime, hashlib, json, pathlib, shutil, subprocess

W = pathlib.Path('/workspace/neon-candidates/transport-native-input-final-20261005')
P = pathlib.Path('/tmp/neon-harbor-street-refinement-candidate-20261005')
C = pathlib.Path('/workspace/neon-candidates/5cd-bus-native-failure-review-20261005')
Q = W / 'docs/qa/transport-native-input-final-20261005'
R = pathlib.Path(__file__).resolve().parent
HEAD = 'aec53e145abb25d76f268a90ad4b52a69e2fe089'
LEDGER = '515c2ea11179b097ef0ec23ad55cee8ec6dacb2097a0c609a75ef7b93c14d59a'
CAT = 'de0cf09ceac31cf985bb27285143cb6d048446793bac7b3885c55a412c97c7dd'
AEC_BUILD = '0700334224a69f044f50814a0dee64aae07cad6fdf373905e5eb4681201f8a62'
NULL_BUILD = '9519740965c34cb55fa95a8b601187eaac32cf231a75af8adb2058f07ccfd943'
DICT = 'cde02c53d4cb942c7a3a0d9075973e20acc893871a68ff8507fdb945284813d2'
def sha(b): return hashlib.sha256(b).hexdigest()
def read(p):
    assert not p.is_symlink(), str(p)
    return p.read_bytes()
def js(b): return json.loads(b)
def jb(v): return (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()
def archive(target, b):
    target.parent.mkdir(parents=True,exist_ok=True)
    if target.exists(): assert read(target)==b, 'Existing archive mismatch '+str(target)
    else: target.write_bytes(b)
def git(*args, cwd=W): return subprocess.check_output(['git',*args],cwd=cwd,text=True).strip()
def gitblob(rel): return subprocess.check_output(['git','show',HEAD+':'+rel],cwd=P)
def info(p):
    b=read(p); return {'bytes':len(b),'sha256':sha(b)}

ap=argparse.ArgumentParser(description=__doc__)
ap.add_argument('--apply',action='store_true')
args=ap.parse_args()
assert git('rev-parse','HEAD')==HEAD
assert git('rev-parse','HEAD',cwd=P)==HEAD
assert git('diff','--cached','--name-only')==''
assert sha(read(C/'payload-ledger.json'))==LEDGER
ledger=js(read(C/'payload-ledger.json'))
assert ledger['metadataParentCommit']==HEAD and len(ledger['files'])==3
old_catalog_bytes=gitblob('tools/native-review/bundle-manifest.json')
assert sha(old_catalog_bytes)==CAT
old_catalog=js(old_catalog_bytes)
assert len(old_catalog['files'])==128
dictionary_bytes=read(W/'tools/native-review/expected-runtime-dictionaries.json')
assert sha(dictionary_bytes)==DICT and dictionary_bytes==gitblob('tools/native-review/expected-runtime-dictionaries.json')
dictionaries=js(dictionary_bytes)
null_rel='tools/native-review/expected-build-provenance/authored-build-info-final-dense-bakery-ceramics-mp-css-20261005-9519740965c3.json'
null_bytes=read(W/null_rel)
assert sha(null_bytes)==NULL_BUILD
null_build=js(null_bytes)
assert null_build.get('revision') is None and len(null_build['assets'])==206
aec_bytes=read(P/'dist/build-info.json')
assert sha(aec_bytes)==AEC_BUILD
aec_build=js(aec_bytes)
assert aec_build['revision']==HEAD and aec_build['assets']==null_build['assets']==dictionaries['authored']['assets']
assert len(dictionaries['baseline']['assets'])==156
runtime_rows={}
tracked=set(git('ls-files').splitlines())
generated=[rel for rel in null_build['assets'] if rel not in tracked]
assert len(generated)==72 and all(rel.startswith(('assets/city/chunks/','assets/metropolis/chunks/')) for rel in generated)
if not (W/'dist').exists(): shutil.copytree(P/'dist',W/'dist',symlinks=True)
assert sha(read(W/'dist/build-info.json'))==AEC_BUILD
for rel,pin in sorted(null_build['assets'].items()):
    a=read(W/'dist'/rel); b=read(P/'dist'/rel)
    assert sha(a)==sha(b)==pin, 'Frozen runtime identity mismatch '+rel
    if rel in tracked:
        source=read(W/rel); g=gitblob(rel)
        assert sha(source)==sha(g)==pin, 'Tracked source identity mismatch '+rel
    runtime_rows[rel]={'bytes':len(a),'sha256':pin,'equalAECGitBlob':True if rel in tracked else None,'generatedIgnoredChunk':rel not in tracked,'equalFrozenAECDist':True}
assert len(runtime_rows)==206

# Preserve AEC originals outside the native bundle; only three payload files are adopted.
archive(Q/'original-aec-bundle-manifest.json',old_catalog_bytes)
archive(Q/'original-aec-build-info.json',aec_bytes)
archive(Q/'original-null-revision-build-info.json',null_bytes)
for rel in ('tools/native-review/methods/transport/native-transport-high.mjs','tools/native-review/methods/transport/method-manifest.json'):
    archive(Q/('original-aec-'+pathlib.Path(rel).name),gitblob(rel))
selected=('payload-ledger.json','REPORT.md','FIRST_FAILURE_REPORT.json','SELECTED_ORIGINAL_FILE_HASHES.json',
          'POINTER_ORIGIN_AND_REUSED_GUARD_FRAME.patch','protocol-cpu-replay-receipt.json',
          'physical-continuation-cpu-receipt.json','verify-protocol-candidate.mjs','SEALED_REPORT_FILES.json')
producer_seal_bytes=read(C/'SEALED_REPORT_FILES.json')
producer_seal=js(producer_seal_bytes)
producer_pins={r['path']:r for r in producer_seal['files']}
archived=[]
for rel in selected:
    b=read(C/rel)
    if rel!='SEALED_REPORT_FILES.json':
        pin=producer_pins[rel]; assert len(b)==pin['bytes'] and sha(b)==pin['sha256']
    target=Q/'original-bus-failure-review'/rel
    archive(target,b)
    archived.append({'path':str(target.relative_to(W)),'bytes':len(b),'sha256':sha(b)})
adoption_rows=[]
for row in ledger['files']:
    rel=row['target']; b=read(C/'payload'/rel)
    assert len(b)==row['bytes'] and sha(b)==row['sha256']
    target=W/rel
    original=gitblob(rel) if rel in ('tools/native-review/methods/transport/native-transport-high.mjs','tools/native-review/methods/transport/method-manifest.json') else None
    if target.exists(): assert read(target)==original or read(target)==b, 'Unexpected adoption target '+rel
    else: assert original is None
    target.parent.mkdir(parents=True,exist_ok=True)
    if not target.exists() or read(target)!=b: target.write_bytes(b)
    adoption_rows.append({**row,'beforeSha256':sha(original) if original else None})

bundle=W/'tools/native-review'
manifest=js(read(bundle/'methods/transport/method-manifest.json'))
assert manifest['tool']['sha256']=='2fdc400b65c62c9d0b3ea405a5644db63ee4f0387579a8d6be89eb4b57d74bee'
assert info(bundle/'methods/transport/native-transport-high.mjs')=={'bytes':manifest['tool']['bytes'],'sha256':manifest['tool']['sha256']}
assert sha(read(bundle/'methods/transport/canonical-layouts.json'))==manifest['canonical']['sha256']
assert sha(read(bundle/'methods/transport/runtime-resources.json'))==manifest['resources']['sha256']
for field in ('sourcePins','authoredSourcePins','servedSourcePins'):
    for rel,pin in manifest.get(field,{}).items(): assert sha(read(W/rel))==pin, field+':'+rel
amendment=manifest['pointerOriginAndGuardFrameAmendment']
assert sha(read(bundle/'methods/transport'/amendment['path']))==amendment['sha256']
resources=js(read(bundle/'methods/transport/runtime-resources.json'))
for f in resources['files']:
    actual=info(W/f['target']); assert actual=={'bytes':f['bytes'],'sha256':f['sha256']}

# Full actual inventory equality. No pycache, vendor copies or symlinks are admitted.
actual={}
for p in sorted(bundle.rglob('*')):
    assert not p.is_symlink(), 'Native bundle symlink '+str(p)
    assert '__pycache__' not in p.parts and p.suffix!='.pyc', 'Unexpected cache '+str(p)
    if p.is_file() and p!=bundle/'bundle-manifest.json': actual[str(p.relative_to(bundle))]=info(p)
new_path='methods/transport/POINTER_ORIGIN_AND_GUARD_FRAME_AMENDMENT-20261005.json'
changed={'methods/transport/method-manifest.json','methods/transport/native-transport-high.mjs'}
assert len(actual)==129 and set(actual)==set(old_catalog['files'])|{new_path}
assert {rel for rel in old_catalog['files'] if actual[rel]!=old_catalog['files'][rel]}==changed
new_catalog=copy.deepcopy(old_catalog)
new_catalog['files']=actual
new_catalog['transportPublicInputProtocolAmendment']={
    'status':'EXACT_THREE_FILE_PROTOCOL_ADOPTED_NATIVE_RECAPTURE_AND_ART_REVIEW_PENDING',
    'parentCommit':HEAD,'parentBundleManifestSHA256':CAT,'parentBundleManifestPath':str((Q/'original-aec-bundle-manifest.json').relative_to(W)),
    'payloadLedgerSHA256':LEDGER,'payloadLedgerPath':str((Q/'original-bus-failure-review/payload-ledger.json').relative_to(W)),
    'originalActiveMethodSHA256':ledger['baseMethodSha256'],'activeMethodSHA256':manifest['tool']['sha256'],
    'amendmentPath':new_path,'amendmentSHA256':amendment['sha256'],
    'bundleFilesBefore':128,'bundleFilesAfter':129,'unchangedOriginalBundleFiles':126,
    'runtimeSourceChanged':False,'runtimeAssetCount':206,'runtimeDictionarySHA256':DICT,
    'actualParentBuildInfoSHA256':AEC_BUILD,'actualParentBuildRevision':HEAD,'originalNullRevisionBuildInfoSHA256':NULL_BUILD,
    'oldNativeFailuresPreserved':True,'nativeRunExecutedByAdoption':False,'testsOrBuildExecutedByAdoption':False,
    'humanArtAcceptance':False,'scope':'Public pointer-origin observation and reuse of the existing qualifying camera frame only. Original finite budgets, poses, input/physics/resource/quality guards remain. This does not resolve or accept the later AEC local QUAY startup failure.'}
new_catalog_bytes=jb(new_catalog)
planned=R/'bundle-manifest-candidate.json'
archive(planned,new_catalog_bytes)
current_manifest=read(bundle/'bundle-manifest.json')
assert current_manifest==old_catalog_bytes or current_manifest==new_catalog_bytes
receipt={
    'status':'STRICT129_PROTOCOL_METADATA_READY_NOT_COMMITTED_NATIVE_PENDING' if not args.apply else 'STRICT129_PROTOCOL_METADATA_APPLIED_NOT_COMMITTED_NATIVE_PENDING',
    'atUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'worktree':str(W),'head':HEAD,
    'payloadLedgerSHA256':LEDGER,'adoptedPayloadFiles':adoption_rows,
    'bundleFileCount':129,'bundleManifestBeforeSHA256':CAT,'bundleManifestAfterSHA256':sha(new_catalog_bytes),
    'allActualNativeBundleFilesCoveredExactly':True,'runtime206MatchesFrozenDist':True,'trackedRuntimeSource134MatchesAECGit':True,
    'ignoredGeneratedChunkCount':72,'independentDistCopiedExactlyWithoutBuild':True,
    'actualParentBuildInfoSHA256':AEC_BUILD,'originalNullRevisionBuildInfoSHA256':NULL_BUILD,
    'currentExpectedRuntimeDictionarySHA256':DICT,'baseline156EntireDictionaryUnchanged':True,
    'noProductionSourceAssetTestOrWorkflowChanges':True,'buildTestGpuExecuted':False,'stageCommitDispatchExecuted':False,
    'oldNativeFailuresRetained':True,'nativeCompletionAndHumanArtAcceptance':False,
    'producerOriginalSealSHA256':sha(producer_seal_bytes),'archivedProvenanceSubset':archived,
    'archiveScope':'Selected immutable receipt/diagnosis subset. Original 18-file producer seal remains historical; omitted source/script copies are not asserted to be present in this subset.',
    'runtimeAssets':runtime_rows}
if args.apply: (bundle/'bundle-manifest.json').write_bytes(new_catalog_bytes)
for rel,pin in null_build['assets'].items():
    assert sha(read(W/'dist'/rel))==pin
    if rel in tracked: assert sha(read(W/rel))==pin
allowed=changed|{'bundle-manifest.json'}
modified=git('diff','--name-only').splitlines()
assert set(modified)=={'tools/native-review/'+rel for rel in (changed|({'bundle-manifest.json'} if args.apply else set()))}
assert git('diff','--cached','--name-only')==''
assert read(P/'tools/native-review/bundle-manifest.json')==old_catalog_bytes
assert sha(read(P/'dist/build-info.json'))==AEC_BUILD
assert git('rev-parse','HEAD',cwd=P)==HEAD
output=R/('strict129-apply-receipt.json' if args.apply else 'strict129-dry-receipt.json')
assert not output.exists(), 'Use distinct historical receipts; do not overwrite'
output.write_bytes(jb(receipt))
print(json.dumps({'status':receipt['status'],'receipt':str(output),'receiptSHA256':sha(read(output)),
                  'bundleManifestSHA256':sha(new_catalog_bytes),'bundleFiles':129,'runtimeAssets':206,'modified':modified}))
