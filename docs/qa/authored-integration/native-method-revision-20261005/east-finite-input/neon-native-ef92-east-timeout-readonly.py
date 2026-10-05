#!/usr/bin/env python3
"""Only original East records, static source/hash checks and finite arithmetic."""
import datetime, hashlib, json, math, pathlib
artifact=pathlib.Path('/tmp/neon-native-ef92-east-interior-11320594919/extracted')
repo=pathlib.Path('/workspace/scratch/neon-harbor')
sha=lambda b:hashlib.sha256(b).hexdigest()
dt=lambda s:datetime.datetime.fromisoformat(s.replace('Z','+00:00'))
meta={m:json.loads((artifact/'native'/m/'metadata.json').read_text()) for m in ['baseline','authored']}
b=meta['baseline'];a=meta['authored'];source_pins=[]
for path in ['src/camera.js','src/frame-clock.js','src/main.js','src/metropolis-interiors.js','src/expansion-programmes.js','src/world-config.js']:
 raw=(repo/path).read_bytes();actual=sha(raw)
 assert actual==a['freezeBefore']['hashes'][path],path
 source_pins.append({'path':path,'bytes':len(raw),'sha256':actual,'matchesAuthoredOriginal':True,'baselineOriginalSha256':b['freezeBefore']['hashes'][path]})
original_method=artifact/'preparation/method-bundle-original/methods/scenic'
pins=[]
for name,expected in a['freezeBefore']['methods'].items():
 raw=(original_method/name).read_bytes();assert sha(raw)==expected,name
 assert b['freezeBefore']['methods'][name]==expected,name
 pins.append({'path':name,'bytes':len(raw),'sha256':expected})
input_raw=(repo/'tools/native-review/methods/scenic/input.mjs').read_bytes()
assert sha(input_raw)==a['freezeBefore']['methods']['input.mjs']
assert "angleDelta(requestedYaw, this.yaw) * -Math.expm1(-12 * dt)" in (repo/'src/camera.js').read_text()
assert 'MAX_FRAME_TIME = 0.25' in (repo/'src/frame-clock.js').read_text()
assert 'cameraOrbitYaw-=(event.clientX-drag.x)*.005*settings.sensitivity' in (repo/'src/main.js').read_text()
leg=next(i for i in reversed(b['inputs']) if i.get('axis'))
assert leg['axis']=='z' and math.isclose(leg['target'],-217.45)
hold=leg['holds'][-1];assert hold['kind']=='coarse' and hold['status']=='failed'
before=hold['before'];after=hold['after'];distance=abs(after['position']['z']-before['position']['z'])
simulation=after['simulationTime']-before['simulationTime'];wall=(dt(hold['finishedAt'])-dt(hold['startedAt'])).total_seconds()
assert before['teleportRevision']==after['teleportRevision']==5
assert abs(distance/simulation-5.6)<1e-8
assert 'Timeout 120000ms' in b['primaryError']['message']
plan=b['plans'][-1];assert plan['label']=='physical-cabin-entry-observation'
assert plan['segments'][-1]['clearanceMargin']>1.4
assert b['failureState']['interior']['elevator']['doorOpen']==1
coarse_target=leg['target']+2.2;required_distance=before['position']['z']-coarse_target
ratio=simulation/wall;required_coarse_seconds=required_distance/5.6/ratio
observed_planned_maximum=max(math.hypot(s['to']['x']-s['from']['x'],s['to']['z']-s['from']['z'])
 for data in meta.values() for route in data['plans'] for s in route['segments'])
assert abs(observed_planned_maximum-38.925)<1e-8
known_longest_seconds=(observed_planned_maximum-2.2)/5.6/ratio
face=a['inputs'][-1];assert face['kind']=='real-pointer-look' and face['status']=='failed'
assert 'Timeout 30000ms' in a['primaryError']['message'] and len(a['captures'])==0
angular=lambda aa,bb:math.atan2(math.sin(aa-bb),math.cos(aa-bb))
requested_delta=angular(face['yaw'],face['before']['camera']['yaw'])
residual=angular(face['yaw'],face['after']['camera']['yaw'])
assert .003<abs(residual)<.004
assert face['before']['position']==face['after']['position']
assert face['before']['teleportRevision']==face['after']['teleportRevision']==5
camera_settle_time=math.log(abs(requested_delta)/.003)/12
camera_elapsed_equivalent=math.log(abs(requested_delta/residual))/12
records={}
for mode,data in meta.items():
 raw=(artifact/'native'/mode/'metadata.json').read_bytes()
 records[mode]={'metadataPin':{'path':f'native/{mode}/metadata.json','bytes':len(raw),'sha256':sha(raw)},
  'status':data['status'],'startedAt':data['startedAt'],'closedAt':data['closedAt'],
  'wholeCaseBudgetMinutes':data['wholeCaseBudgetMinutes'],'primaryError':data['primaryError'],
  'cleanup':data['cleanup'],'secondaryErrors':data['secondaryErrors'],
  'captures':data['captures'],'wholeDeadlineNotReached':not data.get('hardDeadlineReached',False)}
result={'scope':'Original saved records/static source/hash/arithmetic only; no world/layout construction, tests/build/browser/GPU/ROOT/ref or remote mutation',
 'artifact':{'id':11320594919,'bytes':11393689,'sha256':'698aefe9bbab1f7b3460d13cb5f2097ef76acf10d292112c569e13298048b312'},
 'records':records,'sourcePins':source_pins,'originalMethodPins':pins,
 'baselineWalk':{'actualBefore':before,'actualAfter':after,'distanceMetres':distance,'simulationDelta':simulation,
  'wallSecondsIncludingPostTimeoutObservations':wall,'simulationWallRatio':ratio,'speedMetresPerSimulationSecond':distance/simulation,
  'coarseTargetZ':coarse_target,'coarseDistanceRemainingAtTimeout':after['position']['z']-coarse_target,
  'requiredCoarseSecondsAtObservedRatio':required_coarse_seconds,'actualRoutePlan':plan,
  'longestKnownLobbyStraightDistance':observed_planned_maximum,'longestKnownCoarseSecondsAtRatio':known_longest_seconds,
  'marginFactor':1.2,'longestKnownCoarseWithMarginSeconds':known_longest_seconds*1.2,'proposedFiniteInputHoldMilliseconds':180000,
  'finding':'Actual average speed exactly equals 5.6 m/sim, with recorded clear full static segment and open elevator door; this timeout supplies no collision/physical-stall evidence.'},
 'authoredPointer':{'actualEvent':face,'requestedAngularDelta':requested_delta,'remainingAngularError':residual,
  'beforeAfterSimulationDelta':face['after']['simulationTime']-face['before']['simulationTime'],
  'sourceFirstPersonDampingRate':12,'sourceMaximumFrameDt':.25,
  'cameraTimeNeededForOriginalAngularGuard':camera_settle_time,'equivalentDampingTimeFromObservedResidual':camera_elapsed_equivalent,
  'remainingEquivalentCameraTime':camera_settle_time-camera_elapsed_equivalent,
  'residualAfterOneAdditionalCappedFrame':residual*math.exp(-12*.25),'proposedFinitePointerWaitMilliseconds':60000,
  'finding':'Residual is consistent with two capped .25 s camera-damping updates and remains just above strict .003. Before/after simulation delta includes mouse RPC time; missing per-event onset/frame timing is not invented. This supports a finite wait, not a relaxed guard or synthetic camera write.'},
 'proposedScope':'Only EAST-specific createInput remaining callback maps hold120000→180000 and pointer30000→60000; its original helper bytes and all tolerances/poses/keys/assertions remain. Both wrappers still clamp through original whole60min deadline. Day/night keep their original remaining function/caps/15min whole budgets.',
 'originalFailuresPreserved':True,'futurePassNotGuaranteed':True}
print(json.dumps(result,ensure_ascii=False,indent=2))
