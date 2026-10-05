#!/usr/bin/env python3
"""Reacquire or offline-verify exact official home sources, never simplify."""
import importlib.util,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('acquirer',ROOT/'tools/acquire-workshop-assets.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
module.EVIDENCE=ROOT/'docs/qa/authored-home/acquisition';module.ASSETS=ROOT/'assets/harbor/home'
probes=json.loads((ROOT/'docs/qa/authored-home/acquisition/home-model-source-probes.json').read_text())['models']
# Previously inspected official glTF bytes and indexed triangle totals are
# immutable input checks; wrapper retains existing original-fittings entries.
old=json.loads((module.ASSETS/'asset-manifest.json').read_text());original=[m for m in old['models']if m['id']not in ['sofa_03','old_bed_frame']]
models=[]
for aid in ['sofa_03','old_bed_frame']:
 p=next(p for p in probes if p['id']==aid)
 models.append(module.acquire(aid,{'sha256':p['gltfSha256'],'geometryTriangles':p['geometryTriangles']}))
old['models']=models+original;old['runtimeBytes']=sum(m['output']['bytes']for m in old['models'])
(module.ASSETS/'asset-manifest.json').write_text(json.dumps(old,indent=2,ensure_ascii=False)+'\n')
print('Official home sources verified:',[(m['id'],m['output']['bytes'])for m in models])
