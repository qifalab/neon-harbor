from pathlib import Path
import copy,datetime,hashlib,json,subprocess

W=Path('/tmp/neon-harbor-street-refinement-candidate-20261005');B=W/'tools/native-review';OUT=Path(__file__).parent
FINAL_SHA='9519740965c34cb55fa95a8b601187eaac32cf231a75af8adb2058f07ccfd943'
PARENT='5cd20885881c5fd9d30b405eb267a25ec7752164'
ADDED={'assets/harbor/bakery/LICENSE-ASSETS-CC0.txt','assets/harbor/bakery/bread-crust-albedo.png','assets/harbor/bakery/bread-crust-height.png','assets/harbor/bakery/bread-crust-roughness.png','assets/harbor/bakery/manifest.json','src/harbor-bread-art.js','src/harbor-ceramic-art.js'}
CHANGED={'assets/harbor/vegetation/asset-manifest.json','assets/harbor/vegetation/quay-banyan-a.glb','assets/harbor/vegetation/quay-banyan-b.glb','assets/harbor/vegetation/quay-banyan-c.glb','src/harbor-district.js','src/harbor-frontage-profiles.js','src/harbor-sample-trees.js','src/multiplayer.js','styles.css'}
def sha(v):return hashlib.sha256(v).hexdigest()
def jb(v):return (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()
def rec(p,rel=None):return {'path':rel or str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
def new(p,data):
 p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('xb') as f:f.write(data)
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=W,text=True).strip()==PARENT
buildbytes=(W/'dist/build-info.json').read_bytes();build=json.loads(buildbytes);assert sha(buildbytes)==FINAL_SHA and len(build['assets'])==206 and build['revision'] is None
actual_original=Path('/workspace/neon-candidates/combined-street-refinement-20261005/final-dense-claim-checks/build-info-original.json');assert actual_original.read_bytes()==buildbytes
dictionary_path=B/'expected-runtime-dictionaries.json';dictionary_bytes=dictionary_path.read_bytes();dictionary=json.loads(dictionary_bytes);original_dictionary=copy.deepcopy(dictionary);old=dictionary['authored']['assets'];assets=build['assets']
assert len(old)==199 and len(dictionary['baseline']['assets'])==156
delta={'added':{p:assets[p] for p in sorted(assets.keys()-old.keys())},'changed':{p:{'before':old[p],'after':assets[p]} for p in sorted(assets.keys()&old.keys()) if assets[p]!=old[p]},'removed':sorted(old.keys()-assets.keys()),'unchangedCount':sum(assets[p]==old[p] for p in assets.keys()&old.keys())}
assert set(delta['added'])==ADDED and set(delta['changed'])==CHANGED and not delta['removed'] and delta['unchangedCount']==190
for p,pin in assets.items():assert sha((W/p).read_bytes())==pin,p
source_before={p:sha((W/p).read_bytes()) for p in assets}
historical_before={str(p.relative_to(B)):sha(p.read_bytes()) for p in B.rglob('*') if p.is_file() and ('provenance' in p.parts or p.name=='curated-original-provenance.json' or p.parent.name=='expected-build-provenance') and '__pycache__' not in p.parts}
wide_path=B/'methods/harbor/evidence/frontage-wide-static-proof.json';wide_bytes=wide_path.read_bytes();wide=json.loads(wide_bytes);old_wide=copy.deepcopy(wide)
archive=B/'runtime-amendments/final-dense-bakery-ceramics-mp-css-20261005'
new(archive/'original-expected-runtime-dictionaries-5cd.json',dictionary_bytes)
new(archive/'original-frontage-wide-static-proof-5cd.json',wide_bytes)
for rel in sorted(CHANGED):
 if rel.endswith('.glb'):continue
 data=subprocess.check_output(['git','show',f'{PARENT}:{rel}'],cwd=W);assert sha(data)==old[rel],rel;new(archive/'original-source-5cd'/rel,data)
new(archive/'original-parent-build-info-5cd-333332feb919.json',Path('/workspace/neon-candidates/runtime-pin-refresh-plan-20261005-0517/frozen-before-5cd/dist/build-info.json').read_bytes())
receipts={}
files=[
 ('/workspace/neon-candidates/combined-frontage-cpu-20261005/actual-combined-receipt.json','combined-frontage-receipt-original.json','84f46cfa22ab6732320e3f0e0ef0ed0e4e529f473d5a85b793ac558b74e20463'),
 ('/workspace/neon-candidates/combined-frontage-cpu-20261005/cpu-proof.json','combined-frontage-cpu-proof-original.json','97bb0f7d0e00dd272554196e0122bfd66db748a861caeb890e2de7de0b93734e'),
 ('/workspace/neon-candidates/combined-frontage-cpu-20261005/actual-full-source-hashes.json','combined-frontage-source-hashes-original.json','ce7cb9a9af888b3765499f1f08f3bcda2facb8f466ed2d1e311cf3820bc27498'),
 ('/workspace/neon-candidates/combined-street-refinement-20261005/dense-tree-and-claim-adoption-receipt.json','dense-tree-and-claim-adoption-original.json','41ac4795c7b72b45b6e0d9b8709a75d138571d7e46dd89e7855396f14eaa31fb'),
 ('/workspace/neon-candidates/tree-crown-density-candidate-20261005/candidate-receipt.json','dense-tree-candidate-receipt-original.json','91fa51c320dbccbb48e73d939bde8a4b3925cb7977456669aafe1aba1618227d'),
 ('/workspace/neon-candidates/tree-crown-density-candidate-20261005/cpu-density-proof.json','dense-tree-cpu-density-proof-original.json','9f850077e2fe15a7cb4075ecd8c3eca4091f6587d5ae63b7d3c4b42d31b8e08e'),
 ('/workspace/neon-candidates/tree-crown-density-candidate-20261005/cpu-owner-density-proof.json','dense-tree-cpu-owner-proof-original.json','02a91c9a0120ffa1bcd87822c6b0516320d0201a0b72a31a4a2d0e2cc4486e73'),
 ('/workspace/neon-candidates/tree-crown-readonly-review-20261005/independent-candidate-byte-proof.json','dense-tree-independent-byte-proof-original.json','b34413c9e525071bfa93e5dbb2e9f708d34ef566105142fb1dd3414f2020f0b4'),
 ('/tmp/neon-multiplayer-travel-claim-candidate-review-20261005/receipt.json','multiplayer-claim-review-receipt-original.json','7b4a5c78ce0c47e0d67b4fd172c588d56de57a03893ba23056f72071e87ea551'),
 ('/workspace/neon-candidates/combined-street-refinement-20261005/final-dense-claim-checks/build-receipt.json','final-actual-build-receipt-original.json',None),
]
for source,name,expected in files:
 p=Path(source);data=p.read_bytes()
 if expected:assert sha(data)==expected,source
 target=archive/name;new(target,data);receipts[name]={'original':rec(p),'archived':rec(target,str(target.relative_to(B)))}
cpu=json.loads(Path(files[0][0]).read_text())
assert cpu['sourceHashes']['src/harbor-district.js']==assets['src/harbor-district.js'] and cpu['sourceHashes']['src/harbor-frontage-profiles.js']==assets['src/harbor-frontage-profiles.js']
assert cpu['collisionAndFixtureIdentity']['unchanged'] and cpu['displayGlassAllSixIdentity'] and cpu['sixFarProxiesByteIdentity'] and cpu['lightingAndOutputSourceIdentity']
provenance=B/'expected-build-provenance/authored-build-info-final-dense-bakery-ceramics-mp-css-20261005-9519740965c3.json';new(provenance,buildbytes)
info={'path':str(provenance.relative_to(B)),'sha256':FINAL_SHA,'bytes':len(buildbytes),'version':build['version'],'assetCount':206,'revision':None,'scope':'Actual final combined dense six-tree crowns, original094 baked crust maps/rounded cups, original096 thrown glaze/clay maps, MP travel429/claim ordering and optional HUD nowrap. Exact7 additions/9 changed runtime files/190 unchanged from5cd199. This refresh executes no product build/rule/browser/GPU tests.','note':'Actual local revisionnull. Final complete rule run is separately owned byROOT and stillpending here; historical371 intermediate pass is not final. New source-bound native results and human art acceptance remain pending.'}
dictionary['authored']['assets']=assets;dictionary['authored']['currentBuildInfo']=info
assert dictionary['baseline']==original_dictionary['baseline']
dictionary_path.write_bytes(jb(dictionary))
b_pins={p:assets[p] for p in ['src/harbor-district.js','src/harbor-frontage-profiles.js']};wide['sourceHashes']['authored'].update(b_pins)
wide['breadCeramicFinishAmendment']={'status':'ACTIVE_FINAL_COMBINED_RENDERING_SOURCE_PIN_AMENDMENT_CPU_EVIDENCE_NATIVE_ART_PENDING','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceHashesBefore':{p:old_wide['sourceHashes']['authored'][p] for p in b_pins},'sourceHashesAfter':b_pins,'actualBuildInfo':info,'originalProof':rec(archive/'original-frontage-wide-static-proof-5cd.json',str((archive/'original-frontage-wide-static-proof-5cd.json').relative_to(B))),'originalCPUReceipt':receipts['combined-frontage-receipt-original.json'],'scope':'Only current authored094/096 appearance source pins refreshed. Actual combined producerCPU proof binds finalB source/module pins and verifies36 frontage colliders/fixtures, four other shops, six far proxies, original display glass and unchanged lighting/output source. Original cases and older amendments remain unchanged; this sealer does not rerun route geometry. Producer70-source receipt predates dense-tree/MP claim adoption; its full70-source set is historical, not claimed identical to every final206 source. FinalB/lighting pins match actual finalbuild.','actualCombinedCPUAppearanceBudget':cpu['actualCombinedBudget'],'originalGeometryCaseDataUnchanged':True,'originalCaseGeometryReexecutedBySealer':False,'nativeCaptureExecutedBySealer':False,'humanArtAcceptance':False}
wide['denseStreetTreeSourceAmendment']={'status':'EXPLICIT_DENSITY_BUDGET_SOURCE_AMENDMENT_NATIVE_ART_PENDING','sourceHashesBefore':{'src/harbor-sample-trees.js':old['src/harbor-sample-trees.js']},'sourceHashesAfter':{'src/harbor-sample-trees.js':assets['src/harbor-sample-trees.js']},'changedTreeAssetPins':{p:assets[p] for p in sorted(CHANGED) if p.startswith('assets/harbor/vegetation/')},'originalProducerCPUReceipts':{k:v for k,v in receipts.items() if k.startswith('dense-tree-')},'submittedSixTreeBudget':{'previousTriangles':53664,'currentTriangles':136608,'drawCalls':6,'leafCountPerTreeBefore':576,'leafCountPerTreeAfter':1728,'explicitAcceptanceCap':150000},'scope':'Dense final tree models retain original bark, original576 leaf attributes/images/materials and owner near/far/sites lifecycle;1152 closed leaves added permodel. Actual triangle increase is disclosed, not measured hardware performance. Original route/collider case records remain historical. Original old3GLB bodies retained byROOT and Git5cd; nooldasset overwritten in original archives.','nativeCaptureExecutedBySealer':False,'humanArtAcceptance':False}
for key,value in old_wide.items():
 if key!='sourceHashes':assert wide[key]==value,key
assert wide['sourceHashes']['baseline']==old_wide['sourceHashes']['baseline']
wide_path.write_bytes(jb(wide))
readme=B/'README.md';original_readme=readme.read_bytes();new(archive/'original-native-review-readme-5cd.md',original_readme)
text=original_readme.decode();needle='current authored dictionary (192 entries)';assert text.count(needle)==1
text=text.replace(needle,'current authored dictionary (206 entries)');text+='\nCurrent206 runtime comes from the actual final dense-tree/bakery/ceramics/MP/CSS build. Original190/192/199 build records and all original failed or rejected native results remain historical. The previous371-rule pass belongs to the intermediate composition; final rules, new source-bound native captures and human art approval require their own actual results.\n';readme.write_text(text)
amendment={'status':'SOURCE_ONLY_FINAL206_RUNTIME_DELTA_NATIVE_PENDING','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceParent':PARENT,'actualFinalBuildInfo':info,'exactRuntimeDeltaFrom5cd199':delta,'originalReceiptCopies':receipts,'unchangedMainIndexAndSimulationPins':{p:assets[p] for p in ['index.html','src/main.js','src/simulation.js','src/frame-clock.js','src/camera.js','src/contact-occlusion.js']},'MPAndCssScope':'MP client fixes travel429 state bursts and serializes shared-vehicle claims; CSS onlypreventsHUDcontrols wrapping. Main/index/camera/simulation/AO remain original5cd bytes. Separate targeted15 tests are historical actual claimproducer evidence; no browsermultiplayer pass inferred.','originalSourceAndFailureHistoryPreserved':True,'productBuildRulesGeometryBrowserGpuExecutedBySealer':False,'humanArtAcceptance':False}
new(archive/'final-runtime-source-amendment.json',jb(amendment))
for p,pin in source_before.items():assert sha((W/p).read_bytes())==pin,p
for p,pin in historical_before.items():assert sha((B/p).read_bytes())==pin,p
receipt={'status':'SOURCE_ONLY_FINAL206_METADATA_REFRESHED_NATIVE_ART_PENDING','worktree':str(W),'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'actualBuildInfo':info,'parentAssets':old,'exactRuntimeDeltaFrom5cd199':delta,'runtimeAssets':assets,'baseline156ObjectDeepIdentity':True,'oldWideCasesAndEveryPriorAmendmentDeepIdentity':True,'oldSourceAndRawReceiptsPreserved':True,'productionSourceAssetsTestsIndexStylePackageEditedBySealer':False,'testsBuildGeometryBrowserGpuExecutedBySealer':False,'indexCommitRefsEditedBySealer':False,'nativeAndHumanArtAcceptance':False,'writes':[rec(dictionary_path,str(dictionary_path.relative_to(W))),rec(wide_path,str(wide_path.relative_to(W))),rec(readme,str(readme.relative_to(W))),rec(provenance,str(provenance.relative_to(W)))]}
new(OUT/'metadata-refresh-receipt.json',jb(receipt));print(json.dumps({'status':receipt['status'],'receipt':str(OUT/'metadata-refresh-receipt.json'),'receiptSHA256':sha((OUT/'metadata-refresh-receipt.json').read_bytes()),'newProofSHA256':sha(wide_path.read_bytes()),'actualFinalBuildSHA256':FINAL_SHA,'sourceUnchanged':True}))
