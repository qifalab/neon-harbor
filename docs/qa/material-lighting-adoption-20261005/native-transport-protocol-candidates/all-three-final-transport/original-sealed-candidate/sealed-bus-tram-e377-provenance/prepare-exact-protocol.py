from pathlib import Path
import json,hashlib,difflib
p=Path('/workspace/neon-candidates/bus-tram-ordinary-far-public-input-candidate-20261005');project=Path('/workspace/neon-candidates/harbor-visible-west-ridge-final-20261005');rel='tools/native-review/methods/transport/native-transport-high.mjs';base=(project/rel).read_bytes();h=lambda b:hashlib.sha256(b).hexdigest();assert h(base)=='a308a7c3d7d49107e805b70a0a795147dbe0fa87ceaace19f048ee5e0c11e308';(p/'original-executed-b80-a308-method.mjs').write_bytes(base);s=base.decode();changes=[]
def replace(old,new):
 global s
 assert s.count(old)==1,old
 s=s.replace(old,new,1);changes.append({'old':old,'new':new})
replace("if(gap<=.3)return finish('public-near-endpoint-correction');","if(gap<=(a.ordinaryApproach?.7:.3))return finish('public-near-endpoint-correction');")
replace("let first=null;const precisionModifier=","let first=null,allMovementReleased=true,failureDiagnostic=null;const precisionModifier=")
replace("const desired=v.yaw+Math.atan2(dx,dz)-offset;const reusedFrame=await aim(p,desired,.15,{acceptCurrent:true});const slow=precision||distance(target,before)<1.2;","const desired=v.yaw+Math.atan2(dx,dz)-offset;const reusedFrame=await aim(p,desired,.15,{acceptCurrent:true});\n        // An ordinary public gait covers only a far bus/tram precision approach.\n        // Source max .25s step at 2.25m/s is .5625m, below twice the .7m handoff.\n        const ordinaryApproach=precision&&(kind==='bus'||kind==='tram')&&!precisionModifier.downAttempted&&Math.abs(dx)<.06&&Math.abs(dz)>.7;\n        const slow=ordinaryApproach?false:precision||distance(target,before)<1.2;")
replace("cycle.publicHeldControl='ordinary slow key through actual RAF observations, then original near correction';","cycle.publicHeldControl=ordinaryApproach?'ordinary public gait to .7m, then original slow near correction':'ordinary slow key through actual RAF observations, then original near correction';")
replace("metresBefore:metres,geometricMetres:0,lastLocal:{...transit(guardBeforeAction).passengerLocal},observations:[]}","metresBefore:metres,geometricMetres:0,lastLocal:{...transit(guardBeforeAction).passengerLocal},observations:[],...(ordinaryApproach?{ordinaryApproach:true}:{})}")
replace("cycle.releaseConfirmed=false;cycle.inputs.push({action:'up',key:k,confirmed:false","cycle.releaseConfirmed=false;allMovementReleased=false;cycle.inputs.push({action:'up',key:k,confirmed:false")
anchor="      record.motion.push({stage,target,precision,localBudget:150000,maxIterations:1800,initialLocal:transit(initial).passengerLocal,lastObservedLocal:transit(current).passengerLocal,samples,precisionModifier,firstError:first?err(first,'local movement'):null});"
replacement="""      if(first&&(kind==='bus'||kind==='tram')) {
        const cap=Math.min(4900,deadline-Date.now());
        const modifierReleased=!precisionModifier.downAttempted||precisionModifier.releaseConfirmed===true;
        if(!allMovementReleased||!modifierReleased)failureDiagnostic={status:'SKIPPED_RELEASE_UNCONFIRMED'};
        else if(cap<=0)failureDiagnostic={status:'SKIPPED_ORIGINAL_WHOLE_DEADLINE'};
        else try {
          const observed=await bounded(()=>page.evaluate(()=>{
            const s=window.__NEON__.snapshot(),t=s.city.sample.transit,v=t.vehicles.find(v=>v.id===t.ridingVehicleId);
            return {ready:s.ready,paused:s.paused,position:s.position,camera:s.camera,timing:s.timing,
              simulationTime:s.simulationTime,teleportRevision:s.teleportRevision,ridingVehicleId:t.ridingVehicleId,
              local:t.passengerLocal,deck:t.passengerDeck,vehicle:v?{id:v.id,yaw:v.yaw,stopId:v.stopId,remaining:v.remaining}:null};
          }),cap,'released cabin first-failure readonly diagnostic');
          failureDiagnostic={status:'OBSERVED_AFTER_CONFIRMED_KEYUP',budgetMs:cap,observed};
        }catch(error){failureDiagnostic={status:'FAILED_SECONDARY',budgetMs:cap,error:err(error,'released first-failure diagnostic')};record.secondaryErrors.push(err(error,'released first-failure diagnostic'));}
      }
      record.motion.push({stage,target,precision,localBudget:150000,maxIterations:1800,initialLocal:transit(initial).passengerLocal,lastObservedLocal:transit(current).passengerLocal,samples,precisionModifier,...(kind==='bus'||kind==='tram'?{failureDiagnostic}:{}),firstError:first?err(first,'local movement'):null});"""
replace(anchor,replacement)
# All other bytes, including Ferry budget/body, cameras/routes/High and shared guards, reverse exactly.
r=s
for c in reversed(changes):assert r.count(c['new'])==1;r=r.replace(c['new'],c['old'],1)
assert r.encode()==base
out=p/'payload'/rel;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(s)
(p/'EXACT_PUBLIC_INPUT_ONLY.diff').write_text(''.join(difflib.unified_diff(base.decode().splitlines(True),s.splitlines(True),fromfile='original-b80-a308',tofile='candidate-normal-public-far')))
(p/'REVERSIBLE_CHANGE_LEDGER.json').write_text(json.dumps({'baseSHA256':h(base),'candidateSHA256':h(out.read_bytes()),'changes':changes,'reverseExact':True,'casesAndMatrixUnchanged':{str(f):h((project/f).read_bytes())for f in ['tools/native-review/cases.json','tools/native-review/native-matrix.json']},'productionSourceHashes':{f:h((project/f).read_bytes())for f in ['src/main.js','src/harbor-transit.js','src/harbor-vehicle-models.js','src/collision.js']}},indent=2)+'\n')
print('METHOD_PREPARED',h(out.read_bytes()))
