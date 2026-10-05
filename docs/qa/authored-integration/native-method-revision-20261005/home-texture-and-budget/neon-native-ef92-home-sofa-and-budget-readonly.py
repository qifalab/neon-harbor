#!/usr/bin/env python3
"""Read original native HOME evidence and GLB JSON/header; no decoder/game execution."""
import collections,datetime,hashlib,json,math,pathlib,struct
repo=pathlib.Path('/workspace/scratch/neon-harbor')
root=pathlib.Path('/tmp/neon-native-ef92-home-11320646335/extracted')
sha=lambda b:hashlib.sha256(b).hexdigest()
dt=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
meta={m:json.loads((root/'native'/m/'metadata.json').read_text()) for m in ('baseline','authored')}
a=meta['authored'];b=meta['baseline'];pins=[]
paths=['src/harbor-home-authored.js','src/harbor-home-assets.js','src/metropolis-interiors.js','vendor/three/addons/loaders/GLTFLoader.js','assets/harbor/home/sofa_03.glb']
for key in paths:
 bytes_=(repo/key).read_bytes();expected=a['sourceServedVerifiedAssetDictionary'][key]
 assert sha(bytes_)==expected,key
 pins.append({'path':key,'bytes':len(bytes_),'sha256':expected,'matchesOriginalNativeDictionary':True})
glb=(repo/paths[-1]).read_bytes();assert glb[:4]==b'glTF';size,chunk=struct.unpack_from('<II',glb,12);assert chunk==0x4e4f534a
g=json.loads(glb[20:20+size]);keys=[]
for n,t in enumerate(g['textures']):
 image=g['images'][t['source']];key=str(image.get('uri',image.get('bufferView')))+':'+str(t.get('sampler'))
 keys.append({'definitionIndex':n,'sourceIndex':t['source'],'samplerIndex':t.get('sampler'),'imageBufferView':image.get('bufferView'),'r185CacheKey':key})
assert len(g['textures'])==6 and len(g['images'])==4 and len({r['r185CacheKey'] for r in keys})==4
loader=(repo/paths[3]).read_text();assert "const cacheKey = ( sourceDef.uri || sourceDef.bufferView ) + ':' + textureDef.sampler;" in loader
assert 'return this.textureCache[ cacheKey ];' in loader
owner=next(row['owner'] for row in a['failureState']['interior']['authoredHome'] if row['floorId']=='lobby')
assert owner['status']=='ready' and owner['assetCount']==3 and not owner['pending'] and owner['errors']==[] and not owner['fallbackVisible']
assert sorted(row['assetId'] for row in owner['resources'])==['home-lobby-fittings','old_bed_frame','sofa_03']
sofa=next(row for row in owner['resources'] if row['assetId']=='sofa_03');assert sofa['geometries']==2 and sofa['textures']==4 and sofa['decodedTextures']==4
assert len(sofa['images'])==4
for image in sofa['images']:assert image['decoded'] and image['width']==1024 and image['height']==1024 and image['decoderObject']=='ImageBitmap'
original_methods=root/'preparation/method-bundle-original/methods/harbor'
method_pins=[]
for key,expected in a['methodHashes'].items():
 byte=(original_methods/key).read_bytes();assert sha(byte)==expected,key
 method_pins.append({'path':key,'bytes':len(byte),'sha256':expected})
expect=(original_methods/'expectations.mjs').read_text();assert 'sofa_03:{folder:\'home\',geometries:2,textures:6,images:4' in expect
legs=[]
for index,item in enumerate(b['inputs']):
 if not item.get('axis'):continue
 before=item.get('before');after=item.get('actualAfter');elapsed=(dt(item['finishedAt'])-dt(item['startedAt'])).total_seconds()
 distance=abs(after['position'][item['axis']]-before['position'][item['axis']]) if after else None
 sim=after['simulationTime']-before['simulationTime'] if after else None
 legs.append({'inputIndex':index,'axis':item['axis'],'target':item['target'],'status':item['status'],'startedAt':item['startedAt'],'finishedAt':item['finishedAt'],'elapsedWallSeconds':elapsed,'observedEndpointMetres':distance,'observedSimulationDelta':sim,'simulationWallRatio':sim/elapsed if sim is not None and elapsed else None,'remainingMillisecondsAtStart':item.get('remainingMsAtStart'),'holds':[{'kind':h['kind'],'status':h['status'],'firstError':h.get('firstError')} for h in item.get('holds',[])],'firstError':item.get('firstError'),'secondaryErrors':item.get('secondaryErrors',[])})
valid=[x for x in legs if x['status']=='completed'];substantial=[x for x in valid if x['observedEndpointMetres']>1]
ratio=min(x['simulationWallRatio'] for x in substantial)
photo_blocks=[]
for index in (2,6,13,15):
 prev=b['inputs'][index];following=next(i for i in b['inputs'][index+1:] if i.get('axis'))
 photo_blocks.append({'precedingInputIndex':index,'startAfterCompletedWalk':prev['finishedAt'],'nextWalkStartedAt':following['startedAt'],'wallSeconds':(dt(following['startedAt'])-dt(prev['finishedAt'])).total_seconds(),'scope':'inter-leg block containing actual photo, pointer/readiness/protocol; not direct screenshot timing'})
current=b['inputs'][-1]['before']['position'].copy();remaining=[]
for index,step in enumerate(b['plan']['steps'][b['activeStep']['index']:],b['activeStep']['index']):
 if step['kind']!='walk':continue
 axis=step['axis'];distance=abs(step['target']-current[axis]);fine=min(distance,2.2) if distance>3.2 else distance
 held=(distance-fine)/5.6+fine/.8
 remaining.append({'stepIndex':index,'axis':axis,'target':step['target'],'nominalStraightDistance':distance,'sourceProtocolNominalHeldSimulationSeconds':held});current[axis]=step['target']
held_sim=sum(x['sourceProtocolNominalHeldSimulationSeconds'] for x in remaining);movement=held_sim/ratio
remaining_photos=sum(x['kind']=='photo' for x in b['plan']['steps'][b['activeStep']['index']:]);photo=max(x['wallSeconds'] for x in photo_blocks)*remaining_photos
rpc=len(remaining)*20;protocol=300;nominal_minutes=32+(movement+photo+rpc+protocol)/60;margin_minutes=nominal_minutes*1.2
input_source=(original_methods/'input.mjs').read_text()
for token in ('>3.2','target-2.2','target+2.2','/5.6','/.8','timeout:remaining(120000)','maximumCorrectionHolds:2','toleranceMetres:.15'):
 assert token in input_source,token
result={'scope':'readonly evidence/source/GLB JSON arithmetic, no GLTF decoder import, game construction, tests/build/browser/GPU/API/ref/runtime/index mutation','originalArtifact':{'id':11320646335,'bytes':6283317,'sha256':'311374fb7a51e23eca694d471247690872dc7a5d466ad11b0ea3ca8c8e7bf8bd'},'sourceAssetPins':pins,'originalMethodPins':method_pins,'gltf':{'definitionTextures':len(g['textures']),'images':len(g['images']),'textureRows':keys,'materials':g['materials'],'extensionsUsed':g.get('extensionsUsed',[]),'uniqueR185CacheKeys':len({x['r185CacheKey'] for x in keys})},'nativeAuthoredOwner':{k:owner[k] for k in ('status','assetCount','pending','errors','fallbackVisible','lodTier','resources')},'authoredPrimary':a['primaryError'],'authoredCaptures':len(a['captures']),'baseline':{'startedAt':b['startedAt'],'finalizationCompletedAt':b['finalizationCompletedAt'],'originalWholeMinutes':b['wholeCaseBudgetMinutes'],'hardDeadlineReached':b['hardDeadlineReached'],'activeStep':b['activeStep'],'plannedSteps':len(b['plan']['steps']),'planKinds':dict(collections.Counter(x['kind'] for x in b['plan']['steps'])),'completedLegs':len(valid),'captures':b['captures'],'events':[{'kind':x['kind'],'at':x['at']} for x in b['events']],'originalPrimary':b['primaryError'],'lastSuccessfulSimulationTime':b['inputs'][-2]['actualAfter']['simulationTime'],'inputLegs':legs,'photoContainingInterLegBlocks':photo_blocks},'budgetEstimateNotGuarantee':{'startPoint':'original failed leg before snapshot, because no post-deadline snapshot survives','remainingLegs':remaining,'remainingMetres':sum(x['nominalStraightDistance'] for x in remaining),'remainingSourceProtocolHeldSimulationSeconds':held_sim,'lowestObservedSimulationWallRatioAcrossSuccessfulLegsMovingMoreThan1m':ratio,'estimatedRemainingMovementSeconds':movement,'remainingPhotoCount':remaining_photos,'maxObservedPhotoContainingInterLegBlockSeconds':max(x['wallSeconds'] for x in photo_blocks),'estimatedRemainingPhotoBlocksSeconds':photo,'allowanceRPCSecondsPerRemainingLeg':20,'allowanceRemainingEOwnerAndCleanupSeconds':protocol,'nominalWholeMinutes':nominal_minutes,'marginFactor':1.2,'marginWholeMinutes':margin_minutes,'recommendedFiniteWholeMinutesPerHomeMode':110,'suggestedFuturePairedHomeJobMinutes':260,'originalOtherCasesAndLocalGuardsRemainUnchanged':True,'localGuardFailureStillPossible':True,'notAPerformanceMeasurementOrHardwareFPSClaim':True},'minimalExpectationCorrection':'MODELS.sofa_03.textures 6 -> 4, original images4/geometries2/SHA and all exact ready/release/decoded/native dimensions checks unchanged','noFuturePassPredicted':True,'originalsRemainFailed':True}
print(json.dumps(result,ensure_ascii=False,indent=2))
