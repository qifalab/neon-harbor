from pathlib import Path
import copy,datetime,difflib,hashlib,json,subprocess

W=Path('/tmp/neon-harbor-street-refinement-candidate-20261005');OUT=Path(__file__).parent
sha=lambda v:hashlib.sha256(v).hexdigest()
def jb(v):return (json.dumps(v,ensure_ascii=False,indent=2)+'\n').encode()
def new(p,v):
 p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('xb') as f:f.write(v)
def rec(p):return {'path':str(p),'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())}
build=(W/'dist/build-info.json').read_bytes();assert sha(build)=='9519740965c34cb55fa95a8b601187eaac32cf231a75af8adb2058f07ccfd943';assets=json.loads(build)['assets']
cpu=Path('/workspace/neon-candidates/combined-frontage-cpu-20261005/actual-combined-receipt.json');assert sha(cpu.read_bytes())=='84f46cfa22ab6732320e3f0e0ef0ed0e4e529f473d5a85b793ac558b74e20463'
pose=Path('/workspace/neon-candidates/tree-crown-readonly-review-20261005/whole-tree-camera-minus600-proof.json');assert sha(pose.read_bytes())=='93b1f24b9b889f7b01395e74a449461ea83f8c0b30d76eca3647e697230c1ae3';pose_value=json.loads(pose.read_text())
for rel,pin in pose_value['sourceHashes'].items():assert assets[rel]==pin,rel
diagnostic_receipt=Path('/workspace/neon-candidates/street-night-quay-owner-review-20261005/strict-time-receipt.json');assert sha(diagnostic_receipt.read_bytes())=='a2c11c7dfea5925b67c4ca900dd45617f5f4b93da96be611c22a72ddd8401b84'
diagnostic_diff=Path('/workspace/neon-candidates/street-night-quay-method-20261005/night-failure-diagnostic-preexecution.diff');assert '-  try{record.failureState=diagnostic(await snapshot(page));}' in diagnostic_diff.read_text() and '+  try{record.failureState=compact(await snapshot(page));}' in diagnostic_diff.read_text()
method_files=['capture-street-close.mjs','plans.mjs','input.mjs','server.mjs','render-readiness.mjs','prepare-public-route.mjs','append-method.py','evidence/captured-buildings.json','evidence/public-route-static-proof.json'];results={}
for mode,suffix in [('ordinary','first-render-init'),('quay-public-sprint','public-sprint-first-render-init')]:
 original=Path('/tmp/neon-street-close-art-method-candidate-20261005-'+suffix)
 target=Path('/workspace/neon-candidates/street-close-final-'+mode+'-951974-20261005');target.mkdir(exist_ok=False)
 original_seal=json.loads((original/'seal.json').read_text());before={}
 for rel,pin in original_seal['files'].items():
  p=original/rel;data=p.read_bytes();assert len(data)==pin['bytes'] and sha(data)==pin['sha256'] and not p.is_symlink(),rel;new(target/rel,data);before[rel]=sha(data)
 new(target/'provenance/original-method-seal-before-final206.json',(original/'seal.json').read_bytes())
 for rel in ['capture-street-close.mjs','plans.mjs','input.mjs','evidence/public-route-static-proof.json']:new(target/'provenance/final206-original-method'/rel,(original/rel).read_bytes())
 for source,name in [(cpu,'combined-frontage-receipt-original.json'),(pose,'whole-tree-camera-minus600-proof-original.json'),(diagnostic_receipt,'actual-night-diagnostic-negative-cases-original.json'),(diagnostic_diff,'actual-night-diagnostic-singleline-original.diff')]:new(target/'provenance/final206-evidence'/name,source.read_bytes())
 entry_path=target/'capture-street-close.mjs';old_entry=entry_path.read_text();assert sha(old_entry.encode())=='339644e068faaeaab59fc76d9bcf6cd171437beaae4812c45dadb4649361cbb0'
 needle='diagnostic(await snapshot(page))';assert old_entry.count(needle)==1
 entry=old_entry.replace(needle,'compact(await snapshot(page))')
 if mode=='quay-public-sprint':
  assert entry.count('t.triangles<=54000')==1;entry=entry.replace('t.triangles<=54000','t.triangles<=150000')
 entry_path.write_text(entry)
 plan_path=target/'plans.mjs';old_plan=plan_path.read_text();plan=old_plan
 if mode=='quay-public-sprint':
  needle="walk('z',-440.8),walk('x',-612),\n photo('06-near-quay-tree-whole',-612,-440.8,0,";assert plan.count(needle)==1
  plan=plan.replace(needle,"walk('z',-440.8),walk('x',-600),\n photo('06-near-quay-tree-whole',-600,-440.8,0,");plan_path.write_text(plan)
  assert "walk('x',-720)" in plan and "walk('x',-612),\n {kind:'tree-return'" in plan
 proof_path=target/'evidence/public-route-static-proof.json';old_proof=json.loads(proof_path.read_text());proof=copy.deepcopy(old_proof);changed={}
 for rel,oldpin in proof['sourceHashes'].items():
  if oldpin!=assets[rel]:changed[rel]={'before':oldpin,'after':assets[rel]};proof['sourceHashes'][rel]=assets[rel]
 assert set(changed)=={'src/harbor-district.js','src/harbor-frontage-profiles.js','src/harbor-sample-trees.js'}
 proof['final206SourceOnlyAmendment']={'status':'SOURCE_PIN_AND_EXPLICIT_METHOD_GUARD_AMENDMENT_NATIVE_PENDING','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceChanges':changed,'actualFinalBuildInfoSHA256':sha(build),'originalSourceProofSHA256':sha((original/'evidence/public-route-static-proof.json').read_bytes()),'originalCombinedFrontageCPUReceipt':rec(cpu),'actualWholeTreeGroundColliderCameraCPUProof':rec(pose),'actualDiagnosticCPUNegativeReceipt':rec(diagnostic_receipt),'diagnosticChange':'Only undefined diagnostic(await snapshot(page)) replaced by existing compact(await snapshot(page)); original firstFailure/primaryError persistence and throw ordering unchanged. Actual Night outercatch four positive/negative checks retained as source evidence; this copy does not rerun them.','oldGeometryDataScope':'Original26 stepSamples/7 standingSamples and original limits remain exact historicalCPU preparation. Actual producer receipt verifies final B collisions/fixtures/glass/far resources unchanged. Final tree proof verifies same4178 colliders SHA7bdf and five actual moveCircle legs to/from−600 with no contacts; copiedsealer itself does not rerun geometry.','originalGeometryCasesRerunByCopy':False,'entryPriorSHA256':original_seal['entrySHA256'],'entryActualSHA256':sha(entry_path.read_bytes()),'inputSHA256Unchanged':original_seal['inputSHA256'],'quayScope':{'fullPhotoXBefore':-612,'fullPhotoXAfter':-600,'camera':pose_value['publicCameraControls'],'originalRidgeReferenceUnchanged':True,'oldTriangleGuard':54000,'newTriangleGuard':150000,'actualSixTreeTriangles':136608,'drawCallsUnchanged':6,'oldFarX':-720,'oldReturnX':-612} if mode=='quay-public-sprint' else 'Ordinarycopy only for bakery/ceramics sections; original dormantQUAY54000 guard/old−612 plan retained and not used to inspect dense newtrees. Use separately amendedQUAYpublicSprint copy.','allOriginalDeadlinesPhysicsQualityAndSixAuthoredTreeRequirementsUnchanged':True,'nativeExecuted':False,'humanArtAccepted':False}
 for key,value in old_proof.items():
  if key!='sourceHashes':assert proof[key]==value,key
 proof_path.write_bytes(jb(proof))
 for name,old,newtext in [('entry',old_entry,entry),('plans',old_plan,plan)]:
  if old!=newtext:new(target/('final206-'+name+'-explicit.diff'),''.join(difflib.unified_diff(old.splitlines(True),newtext.splitlines(True),fromfile='original339/'+name,tofile='final206/'+name)).encode())
 hashes={p:{'bytes':(target/p).stat().st_size,'sha256':sha((target/p).read_bytes())} for p in method_files}
 changed_methods=[p for p in method_files if hashes[p]['sha256']!=sha((original/p).read_bytes())]
 assert set(changed_methods)==({'capture-street-close.mjs','evidence/public-route-static-proof.json','plans.mjs'} if mode=='quay-public-sprint' else {'capture-street-close.mjs','evidence/public-route-static-proof.json'})
 assert hashes['input.mjs']['sha256']==original_seal['inputSHA256']
 amendment={'status':'FINAL206_INDEPENDENT_METHOD_COPY_SEALED_NATIVE_NOT_RUN','originalDirectory':str(original),'newDirectory':str(target),'mode':mode,'actualRuntimeAssets':assets,'actualFinalBuildInfoSHA256':sha(build),'nineMethodHashes':hashes,'changedMethodFiles':changed_methods,'allOtherMethodFilesByteIdentical':True,'original339AndInputsAndOriginalFailedArtRecordsPreserved':True,'actualProductTestsBrowserGpuExecutedByCopy':False,'diagnosticNegativeChecksScope':'Reused actual sealed Night outercatch CPU receipt and verified exact singleline source replacement; no new negative tests executed bycopy.','nativeAllowedSections':['quay'] if mode=='quay-public-sprint' else ['bakery','ceramics'],'rawTriangleIncreaseDisclosed':mode=='quay-public-sprint','endpointCameraScope':'Only new whole-tree frame uses−600/yaw−1.8130049139045166/pitch−.05297686261988355; oldridge samepose/camera/time retained.' if mode=='quay-public-sprint' else 'Original bakery/ceramics route/camera/time/High unchanged.'}
 new(target/'final206-method-amendment.json',jb(amendment))
 seal={'status':'FINAL206_METADATA_METHOD_COPY_NATIVE_ART_PENDING','entrySHA256':hashes['capture-street-close.mjs']['sha256'],'inputSHA256':hashes['input.mjs']['sha256'],'actualBuildInfoSHA256':sha(build),'originalSealSHA256':sha((original/'seal.json').read_bytes()),'nineMethodHashes':hashes,'files':{str(p.relative_to(target)):{'bytes':p.stat().st_size,'sha256':sha(p.read_bytes())} for p in sorted(target.rglob('*')) if p.is_file() and p.name!='seal.json' and '__pycache__' not in p.parts and p.suffix!='.pyc'},'nativeAllowedSections':amendment['nativeAllowedSections'],'nativeExecuted':False,'humanArtAccepted':False}
 new(target/'seal.json',jb(seal))
 for rel,pin in seal['files'].items():assert (target/rel).stat().st_size==pin['bytes'] and sha((target/rel).read_bytes())==pin['sha256'],rel
 for rel,pin in before.items():assert sha((original/rel).read_bytes())==pin,rel
 results[mode]={'path':str(target),'entrySHA256':seal['entrySHA256'],'inputSHA256':seal['inputSHA256'],'plansSHA256':hashes['plans.mjs']['sha256'],'proofSHA256':hashes['evidence/public-route-static-proof.json']['sha256'],'sealSHA256':sha((target/'seal.json').read_bytes()),'nineMethodHashes':hashes,'changedMethods':changed_methods,'nativeExecuted':False}
for p,pin in assets.items():assert sha((W/p).read_bytes())==pin,p
new(OUT/'independent-day-method-copy-receipt.json',jb({'status':'FINAL206_INDEPENDENT_DAY_COPIES_COMPLETE_NATIVE_NOT_RUN','methods':results,'productionSourcesChangedByCopy':False,'originalMethodsChangedByCopy':False,'testsBuildBrowserGpuGitExecutedByCopy':False}));print(json.dumps(results))
