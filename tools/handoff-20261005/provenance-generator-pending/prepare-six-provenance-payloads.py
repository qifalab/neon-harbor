#!/usr/bin/env python3
"""Generate six provenance-only files in a FRESH EXTERNAL directory; never adopt/build/git/network."""
import argparse,copy,hashlib,json,re
from pathlib import Path
P=Path('/workspace/neon-candidates/harbor-shared-clock-three-role-successor-20261005')
B=P/'tools/native-review'
E=Path('/workspace/neon-evidence/world-sample-combined-actual-null-preview-build-20261005T1451')
S=Path('/workspace/neon-evidence/world-sample-source-catalogue-derivation-20261005T1452')
RAW=E/'build-info-original.json'
RAW_SHA='62be1c1e08f161a03294b617f6e7d5fe1129c28c9e42836c509f671235440233'
SOURCE_SHA='8154ab9adbcf647456e5b2af8099eda021b63606e278d56b44f92ad77edf50d2'
OLD_SOURCE_SHA='334e3bf45e071daa0231749d973871077d0cad13dcaff700c61c6f005accdcaf'
BUILD_RECEIPT_SHA='32ce1074ab04816a421e479fd3b424e419a4e0d201a4d7b4f547665c23a52e25'
BEFORE_BUNDLE_SHA='ee5e9867b9d40587a9a09141f01f6d79e41b507557499d8349dc90133bb29c57'
HEAD199='199b89c62b216b2a07f2eb7e7d5920430ac46473'
AMEND='runtime-amendments/world-sample-shared-clock-three-role-ferry50-20261005'
RAW_REL='expected-build-provenance/authored-build-info-world-sample-213-20261005-62be1c1e08f1.json'
SOURCE_REL=AMEND+'/actual-historical-comparable-source414.json'
OLD_DICT_REL=AMEND+'/original-current199-authored208-expected-runtime-dictionaries.json'
BRIDGE_REL=AMEND+'/actual-213-runtime-and414-selected-source-bridge.json'

def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb')as f:
  for block in iter(lambda:f.read(1048576),b''):h.update(block)
 return h.hexdigest()
def load(p):return json.loads(Path(p).read_text())
def pin(p,relative=None):return {'path':relative or str(p),'bytes':Path(p).stat().st_size,'sha256':sha(p)}
def emit(p,value):
 p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('x')as f:json.dump(value,f,indent=2);f.write('\n')
def copy_exact(src,dst):
 dst.parent.mkdir(parents=True,exist_ok=True)
 with dst.open('xb')as f:f.write(src.read_bytes())
def safe_name(name):
 q=Path(name);assert not q.is_absolute() and '..'not in q.parts and not (P/q).is_symlink(),name
 assert (P/q).resolve().is_relative_to(P.resolve()),name

def main():
 global RAW,RAW_SHA,SOURCE_SHA,BUILD_RECEIPT_SHA,BEFORE_BUNDLE_SHA,RAW_REL,SOURCE_REL,BRIDGE_REL
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument('--output',required=True,type=Path)
 ap.add_argument('--build-info',type=Path,default=RAW);ap.add_argument('--build-info-sha256',default=RAW_SHA)
 ap.add_argument('--build-receipt',type=Path,default=E/'receipt.json');ap.add_argument('--build-receipt-sha256',default=BUILD_RECEIPT_SHA)
 ap.add_argument('--source-catalogue',type=Path,default=S/'actual-combined-source-catalogue.json');ap.add_argument('--source-catalogue-sha256',default=SOURCE_SHA)
 ap.add_argument('--source-receipt',type=Path,default=S/'receipt.json')
 ap.add_argument('--before-bundle-sha256',default=BEFORE_BUNDLE_SHA)
 a=ap.parse_args();RAW=a.build_info;RAW_SHA=a.build_info_sha256;SOURCE_SHA=a.source_catalogue_sha256;BUILD_RECEIPT_SHA=a.build_receipt_sha256;BEFORE_BUNDLE_SHA=a.before_bundle_sha256
 for value in [RAW_SHA,SOURCE_SHA,BUILD_RECEIPT_SHA,BEFORE_BUNDLE_SHA]:assert re.fullmatch('[a-f0-9]{64}',value)
 out=a.output.resolve();assert not out.exists() and not out.is_relative_to(P.resolve()) and not P.resolve().is_relative_to(out),'fresh external output only'
 assert sha(RAW)==RAW_SHA and sha(a.build_receipt)==BUILD_RECEIPT_SHA
 raw=load(RAW);receipt=load(a.build_receipt);assert raw['version']=='0.8.0' and raw['revision']is None and isinstance(raw['assets'],dict) and raw['assets']
 assert receipt['status'].startswith('ACTUAL_CLOSED_PASS_SOURCE_') and receipt['status'].endswith('_EXACT') and receipt['actualExitCode']==0 and receipt['sourcePaths']==len(receipt['sourceAfter']) and receipt['sourcePaths']>0 and receipt['sourceBefore']==receipt['sourceAfter'] and receipt['buildInfoSHA256']==RAW_SHA
 assert receipt['worktree']==str(P)
 source_path=a.source_catalogue;old_source_path=S/'historical199-source409-original.json'
 assert sha(source_path)==SOURCE_SHA and sha(old_source_path)==OLD_SOURCE_SHA
 source=load(source_path);oldsource=load(old_source_path);source_receipt=load(a.source_receipt);assert source_receipt['currentSHA256']==SOURCE_SHA and source_receipt['currentCount']==len(source) and source_receipt['historical409SHA256']==OLD_SOURCE_SHA
 assert len(source)>=409 and len(oldsource)==409 and set(oldsource)<=set(source)
 additions=sorted(set(source)-set(oldsource));assert set(['src/harbor-office-craft.js','src/harbor-role-routines.js','src/harbor-south-quay-fixtures.js','src/harbor-world-clock.js','src/resident-near-motion.js'])<=set(additions)
 before=load(B/'expected-runtime-dictionaries.json');assert len(before['baseline']['assets'])==156 and len(before['authored']['assets'])==208
 assert sha(B/'bundle-manifest.json')==BEFORE_BUNDLE_SHA
 for mapping in [raw['assets'],source,receipt['sourceAfter']]:
  for name,digest in mapping.items():safe_name(name);assert re.fullmatch('[a-f0-9]{64}',digest) and sha(P/name)==digest,name
 for name,digest in raw['assets'].items():assert sha(P/'dist'/name)==digest,name
 current_build=before['authored']['currentBuildInfo'];assert sha(B/current_build['path'])==current_build['sha256'] and load(B/current_build['path'])['assets']==before['authored']['assets']
 seal=load(B/'bundle-manifest.json');actual={}
 for p in sorted(B.rglob('*')):
  assert not p.is_symlink() and '__pycache__'not in p.parts and p.suffix!='.pyc'
  if p.is_file() and p!=B/'bundle-manifest.json':actual[str(p.relative_to(B))]={'bytes':p.stat().st_size,'sha256':sha(p)}
 assert actual==seal['files']
 runtime_count=len(raw['assets']);source_count=len(source);native_count=len(actual)+4
 RAW_REL=f'expected-build-provenance/authored-build-info-world-sample-{runtime_count}-20261005-{RAW_SHA[:12]}.json'
 SOURCE_REL=AMEND+f'/actual-historical-comparable-source{source_count}-{SOURCE_SHA[:12]}.json'
 BRIDGE_REL=AMEND+f'/actual-runtime{runtime_count}-and-selected-source{source_count}-bridge.json'
 # Input validation is complete before any external payload is written.
 out.mkdir();payload=out/'payload/tools/native-review';payload.mkdir(parents=True)
 copy_exact(RAW,payload/RAW_REL);copy_exact(source_path,payload/SOURCE_REL);copy_exact(B/'expected-runtime-dictionaries.json',payload/OLD_DICT_REL)
 expected=copy.deepcopy(before);expected['authored']['assets']=raw['assets'];expected['authored']['historicalCurrent199Authored208BuildInfo']=copy.deepcopy(current_build)
 expected['authored']['actualCommittedBuildRevision']='REQUIRE_ACTUAL_DISPATCH_HEAD_FROM_GIT_AND_BUILD'
 expected['authored']['currentBuildInfo']={**pin(payload/RAW_REL,RAW_REL),'version':'0.8.0','assetCount':runtime_count,'revision':None,'scope':'ROOT actual closed null-preview build of the exact measured graph identified by the supplied build receipt and selected-source descriptor. Runtime change paths below are derived from the actual asset dictionaries, so future street/arrival-owner changes are included when present. Raw hash is preview evidence; future committed CI build revision must equal its actual checkout HEAD. Complete runtime assets, not raw build-info hash, are sealed for CI comparison. Native and art acceptance remain pending.','actualScopeInputs':{'buildReceiptSHA256':BUILD_RECEIPT_SHA,'selectedSourceDescriptorSHA256':SOURCE_SHA,'selectedSourcePathCount':source_count,'runtimeAssetCount':runtime_count,'addedOrChangedRuntimePathsFromProduction199':sorted(name for name,value in raw['assets'].items()if before['authored']['assets'].get(name)!=value),'removedRuntimePathsFromProduction199':sorted(set(before['authored']['assets'])-set(raw['assets']))}}
 emit(payload/'expected-runtime-dictionaries.json',expected)
 old_assets=before['authored']['assets'];delta={'added':{k:v for k,v in raw['assets'].items()if k not in old_assets},'removed':sorted(set(old_assets)-set(raw['assets'])),'changed':{k:{'before':old_assets[k],'after':v}for k,v in raw['assets'].items()if k in old_assets and old_assets[k]!=v},'unchangedCount':sum(1 for k,v in old_assets.items()if raw['assets'].get(k)==v)}
 # Counts come from the freshly verified inputs;213/414 is preserved only as the first measured graph.
 bridge={'status':f'ACTUAL_COMBINED_{runtime_count}_RUNTIME_AND{source_count}_SELECTED_SOURCE_NATIVE_AND_ART_PENDING','parentProductionHEAD':HEAD199,'previewRevision':None,'actualNullBuild':pin(payload/RAW_REL,RAW_REL),'actualROOTBuildReceipt':pin(a.build_receipt),'historicalCurrent199208ExpectedDictionary':pin(payload/OLD_DICT_REL,OLD_DICT_REL),'newExpectedDictionary':pin(payload/'expected-runtime-dictionaries.json','expected-runtime-dictionaries.json'),'runtimeAssetCount':runtime_count,'baselineAssetCountUnchanged':156,'runtimeDeltaFromCurrent199208':delta,'sourceCatalog':pin(payload/SOURCE_REL,SOURCE_REL),'sourceFileCount':source_count,'historical409SourceDescriptor':pin(old_source_path),'historicalComparableSourceScope':source_receipt['scope'],'newSelectedSourcePaths':additions,'selectedSourceChangedFrom409':{k:{'before':v,'after':source[k]}for k,v in oldsource.items()if source[k]!=v},'preProvenanceRefreshReviewedInputs':receipt['sourceAfter'],'preProvenanceRefreshReviewedInputCount':len(receipt['sourceAfter']),'preProvenanceRefreshInputsAreNotFinalWholeRepositoryCatalogue':True,'newTestsHelpersFixturesLockedByRootFinalStageLedger':True,'firstMeasuredGraph213And414RemainsPreservedExternal':True,'metadataDeltaLockedSeparatelyByGeneratedPayloadManifestAndRootStageLedger':True,'expectedRevisionPolicy':'No predicted commit SHA and no normalized build hash. CI runner sets GITHUB_SHA to each actual checkout HEAD; frozen() requires built revision==HEAD and complete assets equality, then source/dist bytes. Null raw preview evidence is never substituted for committed build evidence.','oldControllerCPUProofsRemainHistoricalScope':'Frozen current199 controller/source pressure evidence is not a literal replay of the successor shared-clock runtime; fresh native is required.','nativeToolSHA256':sha(B/'methods/transport/native-transport-high.mjs'),'casesMatrixRunnerSelectorAndWorkflowsChanged':False,'beforeNativeInventorySHA256':BEFORE_BUNDLE_SHA,'beforeNativeInventoryMemberCount':len(actual),'actualRule424ClosureIsNotNativeArtAcceptance':True,'nativeOrGPUOrArtOrDeviceFPSAcceptance':False}
 emit(payload/BRIDGE_REL,bridge)
 # Seal is the final DAG node: bridge -> expected -> actual raw, source/history.
 # The bundle does not contain itself; no file references the future bundle SHA.
 refreshed=copy.deepcopy(seal);refreshed['historicalPreWorldSampleRuntimeProvenance']=copy.deepcopy(seal['currentRuntimeProvenance'])
 refreshed['currentRuntimeProvenance']={**copy.deepcopy(seal['currentRuntimeProvenance']),'authoredAssetCount':runtime_count,'baselineAssetCount':156,'currentLocalBuildInfoPath':RAW_REL,'currentLocalBuildInfoSHA256':RAW_SHA,'currentSelectedSourceCatalogPath':SOURCE_REL,'currentSelectedSourceCatalogSHA256':SOURCE_SHA,'currentSelectedSourceFileCount':source_count,'historicalBaselineAndAuthoredOriginalFilesUnchanged':True,'changedFromProduction199':bool(delta['changed'] or delta['added'] or delta['removed']),'metadataGenerationChangedRuntimeSource':False,'nativeCaptureAndArtApproval':'PENDING_ACTUAL_NEW_RUN_AND_HUMAN_REVIEW'}
 refreshed['currentRuntimeProvenance'].pop('refreshChangedRuntimeSource',None)
 refreshed['worldSampleSharedClockThreeRoleFerry50ProvenanceAmendment']={'path':BRIDGE_REL,'bytes':(payload/BRIDGE_REL).stat().st_size,'sha256':sha(payload/BRIDGE_REL),'status':bridge['status'],'historical208AndOriginal40FailuresPreserved':True,'nativeExecutedByRefresh':False}
 for p in sorted(payload.rglob('*')):
  if p.is_file():refreshed['files'][str(p.relative_to(payload))]={'bytes':p.stat().st_size,'sha256':sha(p)}
 assert len(refreshed['files'])==native_count
 emit(payload/'bundle-manifest.json',refreshed)
 entries=[]
 for p in sorted(payload.rglob('*')):
  if p.is_file():
   rel='tools/native-review/'+str(p.relative_to(payload));old=P/rel;entries.append({**pin(p,rel),'beforeSHA256':sha(old)if old.is_file()else None})
 assert len(entries)==6
 emit(out/'PAYLOAD_MANIFEST.json',{'status':'SIX_METADATA_PAYLOADS_READY_ROOT_REVIEW_AND_ADOPTION_REQUIRED','payloads':entries,'payloadCount':6,'actualNativeInventoryFileCountAfterAdoption':native_count,'parentProductionHEAD':HEAD199,'actualROOTNullBuildSHA256':RAW_SHA,'actualSelectedSourceCatalogueSHA256':SOURCE_SHA,'sourceWorktreeEdited':False,'gitBuildGPUNetworkOrDispatchExecuted':False,'old233BundleSnapshotCopied':False,'expectedBaseline156Literal':expected['baseline']==before['baseline'],'rawNullPreviewDoesNotReplaceFutureActualCommitBuild':True,'newNativeArtOrDevicePerformancePass':False})
 emit(out/'GENERATION_RECEIPT.json',{'status':'EXTERNAL_SIX_PAYLOADS_GENERATED_SOURCE_UNCHANGED','payloads':6,'nativeBundleMembersAfterAdoption':native_count,'freshCommittedCIStillRequired':True,'runtimeSourceBeforeAfterMatched':all(sha(P/k)==v for k,v in raw['assets'].items()),'selectedSourceBeforeAfterMatched':all(sha(P/k)==v for k,v in source.items()),'reviewedInputsBeforeAfterMatched':all(sha(P/k)==v for k,v in receipt['sourceAfter'].items()),'oldBundleSHAStillExact':sha(B/'bundle-manifest.json')==BEFORE_BUNDLE_SHA})
 print(json.dumps({'output':str(out),'payloadCount':6,'manifestSHA256':sha(out/'PAYLOAD_MANIFEST.json'),'runtimeAssets':runtime_count,'selectedSourcePaths':source_count,'nativeInventoryMembers':native_count,'integrationMutationExecuted':False}))
if __name__=='__main__':main()
