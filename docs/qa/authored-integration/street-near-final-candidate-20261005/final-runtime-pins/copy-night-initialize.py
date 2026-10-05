from pathlib import Path
import json,hashlib
source=Path('/workspace/neon-candidates/street-night-quay-method-20261005');target=Path('/workspace/neon-candidates/street-close-final-night-951974-20261005');target.mkdir(exist_ok=False)
sha=lambda v:hashlib.sha256(v).hexdigest()
data=(source/'seal.json').read_bytes();assert sha(data)=='9767987c332745f9d4ea90dd91f3d65f0a9dee174a089421439c826f286436ab';seal=json.loads(data)
for rel,pin in seal['files'].items():
 p=source/rel;value=p.read_bytes();assert not p.is_symlink() and len(value)==pin['bytes'] and sha(value)==pin['sha256'],rel
 q=target/rel;q.parent.mkdir(parents=True,exist_ok=True)
 with q.open('xb') as f:f.write(value)
for rel,name in [('seal.json','original-night-seal-before-final206.json'),('evidence/public-route-static-proof.json','original-night-public-route-static-proof-before-final206.json')]:
 q=target/'provenance'/name;q.parent.mkdir(parents=True,exist_ok=True)
 with q.open('xb') as f:f.write((source/rel).read_bytes())
print(json.dumps({'status':'NIGHT_COPY_READY_FOR_ACTUAL_FINAL_ROUTE_CPU_PREP','path':str(target),'entrySHA256':sha((target/'capture-street-close.mjs').read_bytes()),'plansSHA256':sha((target/'plans.mjs').read_bytes()),'originalCandidateUnchanged':True}))
