#!/usr/bin/env python3
"""Read actual two-mode workshop records; source/hash and arithmetic only."""
import collections, datetime, hashlib, json, math, pathlib
root=pathlib.Path('/tmp/neon-native-ef92-workshop-11320513014/extracted')
sha=lambda b:hashlib.sha256(b).hexdigest()
dt=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
metadata={m:json.loads((root/'native'/m/'metadata.json').read_text()) for m in ('baseline','authored')}
assert metadata['baseline']['plan']==metadata['authored']['plan']
methods=root/'preparation/method-bundle-original/methods/harbor'
pins=[]
for key,expected in metadata['authored']['methodHashes'].items():
 raw=(methods/key).read_bytes();assert sha(raw)==expected,key
 assert metadata['baseline']['methodHashes'][key]==expected,key
 pins.append({'path':key,'bytes':len(raw),'sha256':expected})
assert sha((methods/'plans.mjs').read_bytes())=='609dcdd5ffa45168be7c0579ec5e23b7cf7da0d14abad1d8f83b473e50e8cf95'
input_source=(methods/'input.mjs').read_text()
for token in ('>3.2','target-2.2','target+2.2','/5.6','/.8','timeout:remaining(120000)','maximumCorrectionHolds:2','toleranceMetres:.15'):
 assert token in input_source,token
results={};all_ratios=[];all_blocks=[]
for mode,data in metadata.items():
 assert data['status']=='failed' and data['hardDeadlineReached'] and data['wholeCaseBudgetMinutes']==25
 assert data['activeStep']=={'index':17,'kind':'walk','axis':'z','target':-106}
 steps=data['plan']['steps'];assert len(steps)==34
 walk_steps=[(i,s) for i,s in enumerate(steps) if s['kind']=='walk']
 leg_inputs=[(i,s) for i,s in enumerate(data['inputs']) if s.get('axis')]
 assert len(walk_steps)==22 and len(leg_inputs)==13
 for (_,step),(_,actual) in zip(walk_steps,leg_inputs):
  assert actual['axis']==step['axis'] and actual['target']==step['target']
 assert all(s['status']=='completed' for _,s in leg_inputs[:-1])
 failed=leg_inputs[-1][1];assert failed['status']=='failed' and failed.get('actualAfter') is None
 legs=[]
 for index,item in leg_inputs:
  before=item['before'];after=item.get('actualAfter')
  wall=(dt(item['finishedAt'])-dt(item['startedAt'])).total_seconds()
  distance=abs(after['position'][item['axis']]-before['position'][item['axis']]) if after else None
  simulation=after['simulationTime']-before['simulationTime'] if after else None
  ratio=simulation/wall if simulation is not None and wall else None
  if item['status']=='completed' and distance>1:all_ratios.append(ratio)
  legs.append({'inputIndex':index,'axis':item['axis'],'target':item['target'],'status':item['status'],
   'startedAt':item['startedAt'],'finishedAt':item['finishedAt'],'wallSeconds':wall,
   'actualBeforePosition':before['position'],'actualAfterPosition':after['position'] if after else None,
   'simulationDelta':simulation,'simulationWallRatio':ratio,'actualDistance':distance,
   'remainingMsAtStart':item.get('remainingMsAtStart'),'firstError':item.get('firstError'),
   'holds':[{k:h.get(k) for k in ('kind','status','startedAt','finishedAt','firstError','secondaryErrors')} for h in item.get('holds',[])],
   'secondaryErrors':item.get('secondaryErrors',[])})
 captures=data['captures'];planned_photos=[s for s in steps if s['kind']=='photo']
 assert len(captures)==4 and [c['label'] for c in captures]==[s['label'] for s in planned_photos[:4]]
 capture_pins=[];photo_blocks=[]
 for capture in captures:
  for key,digestkey in [('file','sha256'),('poseFile','poseSha256')]:
   file=root/'native'/mode/capture[key];raw=file.read_bytes();assert sha(raw)==capture[digestkey]
   capture_pins.append({'path':str(file.relative_to(root)),'bytes':len(raw),'sha256':sha(raw)})
  step_index=next(i for i,s in enumerate(steps) if s['kind']=='photo' and s['label']==capture['label'])
  preceding_walk_number=sum(s['kind']=='walk' for s in steps[:step_index])-1
  preceding_index,preceding=leg_inputs[preceding_walk_number];next_index,next_leg=leg_inputs[preceding_walk_number+1]
  wall=(dt(next_leg['startedAt'])-dt(preceding['finishedAt'])).total_seconds();all_blocks.append(wall)
  photo_blocks.append({'label':capture['label'],'precedingInputIndex':preceding_index,'nextInputIndex':next_index,
   'startAfterCompletedWalk':preceding['finishedAt'],'nextWalkStartedAt':next_leg['startedAt'],
   'wallSeconds':wall,'scope':'Inter-leg block containing actual photo, pointer/readiness/protocol; not direct screenshot timing'})
 current=failed['before']['position'].copy();remaining=[]
 for index,step in enumerate(steps[data['activeStep']['index']:],data['activeStep']['index']):
  if step['kind']!='walk':continue
  axis=step['axis'];distance=abs(step['target']-current[axis]);fine=min(distance,2.2) if distance>3.2 else distance
  remaining.append({'stepIndex':index,'axis':axis,'target':step['target'],'nominalStraightDistance':distance,
   'sourceProtocolNominalHeldSimulationSeconds':(distance-fine)/5.6+fine/.8})
  current[axis]=step['target']
 assert len(remaining)==10
 meta_raw=(root/'native'/mode/'metadata.json').read_bytes()
 results[mode]={'metadataPin':{'path':f'native/{mode}/metadata.json','bytes':len(meta_raw),'sha256':sha(meta_raw)},
  'status':data['status'],'startedAt':data['startedAt'],'finalizationCompletedAt':data['finalizationCompletedAt'],
  'originalWholeMinutes':data['wholeCaseBudgetMinutes'],'hardDeadlineReached':data['hardDeadlineReached'],
  'activeStep':data['activeStep'],'originalPrimary':data['primaryError'],'cleanup':data['cleanup'],
  'planSteps':len(steps),'planKinds':dict(collections.Counter(s['kind'] for s in steps)),
  'completedWalks':len(leg_inputs)-1,'lastSuccessfulSimulationTime':leg_inputs[-2][1]['actualAfter']['simulationTime'],
  'inputLegs':legs,'captures':captures,'capturePins':capture_pins,'photoContainingInterLegBlocks':photo_blocks,
  'remainingLegs':remaining,'remainingMetres':sum(s['nominalStraightDistance'] for s in remaining),
  'remainingHeldSimulationSeconds':sum(s['sourceProtocolNominalHeldSimulationSeconds'] for s in remaining),
  'remainingPhotoCount':sum(s['kind']=='photo' for s in steps[data['activeStep']['index']:])}
ratio=min(all_ratios);held=max(r['remainingHeldSimulationSeconds'] for r in results.values())
movement=held/ratio;photo=max(all_blocks);rpc=10*20;protocol=300
nominal=25+(movement+photo+rpc+protocol)/60;with_margin=nominal*1.2
recommended=math.ceil(with_margin/5)*5;assert recommended==65
result={'scope':'Only original saved metadata/method hashes/photo byte pins and arithmetic; no decoder/game construction/tests/build/browser/GPU/API/ROOT/index/ref mutations',
 'originalArtifact':{'id':11320513014,'bytes':8588375,'sha256':'76f9e01f2e7e42a6d077caf29a148e5ba0aa565840dd9b9df7811e7743d0d5d2'},
 'originalMethodPins':pins,'modes':results,
 'budgetEstimateNotGuarantee':{'startPoint':'Each actual failed leg before snapshot; no post-deadline snapshot is invented',
  'remainingLegCount':10,'remainingPhotoCount':1,'maximumRemainingHeldSimulationSeconds':held,
  'lowestObservedSimulationWallRatioOfSuccessfulLegsOver1mAcrossBothModes':ratio,
  'estimatedRemainingMovementSeconds':movement,'maximumObservedPhotoContainingBlockSeconds':photo,
  'allowanceRPCSecondsPerRemainingLeg':20,'allowanceRemainingEOwnerCleanupSeconds':protocol,
  'nominalWholeMinutes':nominal,'marginFactor':1.2,'marginWholeMinutes':with_margin,
  'recommendedFiniteWholeMinutesPerWorkshopMode':recommended,'suggestedFuturePairedWorkshopJobMinutes':160,
  'otherCaseBudgetsAndAllLocalGuardsUnchanged':True,'finiteLocalFailuresRemainPossible':True,
  'notHardwarePerformanceMeasurement':True},
 'originalFailuresPreserved':True,'noFutureNativePassPredicted':True,'noArtAcceptancePredicted':True}
print(json.dumps(result,ensure_ascii=False,indent=2))
