"""Read-only exact test/package-set comparison; no test execution."""
from pathlib import Path
import json,hashlib
PILOT=Path(__file__).resolve().parents[4]
ROOT=PILOT.parent/'neon-harbor'
OUT=Path(__file__).resolve().parent
def one(path):
 data=path.read_bytes();return {'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
def dictionary(base):
 return {str(p.relative_to(base)):one(p) for p in sorted((base/'tests').rglob('*')) if p.is_file()}
a,b=dictionary(ROOT),dictionary(PILOT)
differences=[p for p in sorted(set(a)&set(b)) if a[p]!=b[p]]
extras=sorted(set(b)-set(a));missing=sorted(set(a)-set(b))
assert differences==['tests/multiplayer-browser/rooms.spec.js'],differences
assert extras==['tests/harbor-workshop-pilot.test.js'],extras
assert missing==[],missing
nodeA={str(p.relative_to(ROOT)):one(p) for p in sorted((ROOT/'tests').glob('*.test.js'))}
nodeB={str(p.relative_to(PILOT)):one(p) for p in sorted((PILOT/'tests').glob('*.test.js'))}
assert all(nodeB.get(p)==r for p,r in nodeA.items())
assert sorted(set(nodeB)-set(nodeA))==['tests/harbor-workshop-pilot.test.js']
package={name:{'root':one(ROOT/name),'pilot':one(PILOT/name)} for name in ['package.json','package-lock.json']}
assert all(r['root']==r['pilot'] for r in package.values())
result={'status':'passed','rootFullTestDictionary':a,'pilotFullTestDictionary':b,'rootNodeTestDictionary':nodeA,'pilotNodeTestDictionary':nodeB,'intentionalBrowserDifference':differences,'pilotOnlyNodeTest':extras,'missing':missing,'package':package,'note':'Browser rooms trace-off ROOT fix is retained by ROOT during selective integration and is not run by npm test; no test assertions copied or weakened in this run.'}
(OUT/'test-tree-source-comparison.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'status':'passed','rootTests':len(a),'pilotTests':len(b),'rootNodeTests':len(nodeA),'pilotNodeTests':len(nodeB),'intentionalDifferences':differences,'extras':extras,'packageIdentical':True}))
