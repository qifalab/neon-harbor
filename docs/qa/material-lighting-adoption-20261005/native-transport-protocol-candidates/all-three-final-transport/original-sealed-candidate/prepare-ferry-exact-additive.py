from pathlib import Path
import json,hashlib,difflib
p=Path('/workspace/neon-candidates/all-three-transport-public-longitudinal-and-ferry-berth-candidate-20261005');old=p/'sealed-bus-tram-e377-provenance';base=(old/'payload/tools/native-review/methods/transport/native-transport-high.mjs').read_bytes();h=lambda b:hashlib.sha256(b).hexdigest();assert h(base)=='ea866c7f0e20c3f3b6163f1186b7f5bc4c7ab2c25cf633ff2c2020a3ec5a8e46';s=base.decode();changes=[]
def replace(a,b):
 global s
 assert s.count(a)==1,a
 s=s.replace(a,b,1);changes.append({'old':a,'new':b})
replace("if(gap<=(a.ordinaryApproach?.7:.3))return finish('public-near-endpoint-correction');","if(gap<=(a.ferryLongitudinalHold?1.2:a.ordinaryApproach?.7:.3))return finish('public-near-endpoint-correction');")
replace("const slow=ordinaryApproach?false:precision||distance(target,before)<1.2;","const slow=ordinaryApproach?false:precision||distance(target,before)<1.2;\n        // Ferry long centre-hall input retains the original ordinary/near1.2 gait.\n        const ferryLongitudinalHold=kind==='ferry'&&!precision&&Math.abs(dx)<.06&&Math.abs(dz)>1.2;")
replace("if(precision&&distance(target,before)>.3&&(kind==='bus'||kind==='tram'||kind==='ferry')){","if((precision&&distance(target,before)>.3&&(kind==='bus'||kind==='tram'||kind==='ferry'))||ferryLongitudinalHold){")
replace("cycle.publicHeldControl=ordinaryApproach?'ordinary public gait to .7m, then original slow near correction':'ordinary slow key through actual RAF observations, then original near correction';","cycle.publicHeldControl=ferryLongitudinalHold?'original ordinary public Ferry centre-hall gait to1.2m, then original slow near correction':ordinaryApproach?'ordinary public gait to .7m, then original slow near correction':'ordinary slow key through actual RAF observations, then original near correction';")
replace("...(ordinaryApproach?{ordinaryApproach:true}:{})}","...(ordinaryApproach?{ordinaryApproach:true}:{}),...(ferryLongitudinalHold?{ferryLongitudinalHold:true}:{})}")
replace("const berthBudgetMs=kind==='tram'?1200000:600000;","const berthBudgetMs=kind==='tram'||kind==='ferry'?1200000:600000;")
replace("if(kind==='tram'){phase.originalBudgetMs=600000;phase.budgetAmendment='finite-tram-normal-service-observed-wall-rate';}","if(kind==='tram'){phase.originalBudgetMs=600000;phase.budgetAmendment='finite-tram-normal-service-observed-wall-rate';}\n    if(kind==='ferry'){phase.originalBudgetMs=600000;phase.budgetAmendment='explicit-finite-ferry-original600-failure-observed-service-progress';}")
r=s
for c in reversed(changes):assert r.count(c['new'])==1;r=r.replace(c['new'],c['old'],1)
assert r.encode()==base
ledger=json.loads((old/'REVERSIBLE_CHANGE_LEDGER.json').read_text());r=base.decode()
for c in reversed(ledger['changes']):assert r.count(c['new'])==1;r=r.replace(c['new'],c['old'],1)
assert h(r.encode())=='a308a7c3d7d49107e805b70a0a795147dbe0fa87ceaace19f048ee5e0c11e308'
out=p/'payload/tools/native-review/methods/transport/native-transport-high.mjs';out.write_text(s);(p/'FERRY_EXACT_DELTA_FROM_SEALED_BUS_TRAM.diff').write_text(''.join(difflib.unified_diff(base.decode().splitlines(True),s.splitlines(True),fromfile='sealed-e377-bus-tram',tofile='all-three-ferry-hall-berth')));(p/'REVERSIBLE_FERRY_ONLY_CHANGE_LEDGER.json').write_text(json.dumps({'parentSealedBusTramMethod':h(base),'candidateMethod':h(out.read_bytes()),'changes':changes,'reverseExactToSealedBusTram':True,'reverseCombinedToOriginalA308':True,'casesAndMatrixExactOriginal':ledger['casesAndMatrixUnchanged'],'productionSourceHashes':ledger['productionSourceHashes']},indent=2)+'\n');print(h(out.read_bytes()))
