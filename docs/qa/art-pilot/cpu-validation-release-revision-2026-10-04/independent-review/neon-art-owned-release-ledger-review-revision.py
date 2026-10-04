from pathlib import Path
import hashlib,json,datetime
ROOT=Path('/workspace/scratch/neon-harbor-art-pilot')
BASE=ROOT/'docs/qa/art-pilot/release-diagnostics-revision-2026-10-04'
OUT=Path('/tmp/neon-art-owned-release-ledger-review-revision.json')
def digest(p):
    raw=p.read_bytes()
    return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
def checked(p,expected):
    actual=digest(p) if p.is_file() else None
    return {'path':str(p),'expected':expected,'actual':actual,'exact':actual==expected}
ledger=BASE/'revision-ledger.json'
records=json.loads(ledger.read_text())['files']
entries=[checked(BASE/r['path'],{'bytes':r['bytes'],'sha256':r['sha256']}) for r in records]
after=json.loads((BASE/'after-source-hashes.json').read_text())
before=json.loads((BASE/'before-source-hashes.json').read_text())
before_by_path={r['path']:r for r in before}
matrix=[]
for r in after:
    prior={'bytes':r['bytes'],'sha256':r['sha256']}
    baseline=before_by_path.get(r['path'])
    declared_before={'bytes':baseline['bytes'],'sha256':baseline['sha256']} if baseline else None
    matrix.append({'path':r['path'],'beforeManifestExact':prior==declared_before,
        'before':checked(BASE/'before'/r['path'],prior),
        'after':checked(ROOT/r['path'],{'bytes':r['afterBytes'],'sha256':r['afterSha256']})})
result={'checkedAtUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'method':'Read-only local byte count and SHA256; no tests/build/browser/GPU/network; output only in /tmp.',
    'revisionLedger':{'path':str(ledger),**digest(ledger),'entryCount':len(entries),'expectedEntryCount':14,
        'declaredBytes':sum(r['bytes'] for r in records),'exactCount':sum(r['exact'] for r in entries),'entries':entries},
    'sources':{'count':len(matrix),'expectedCount':6,'beforeManifestCount':len(before),
        'exactCount':sum(r['beforeManifestExact'] and r['before']['exact'] and r['after']['exact'] for r in matrix),
        'entries':matrix}}
result['allExact']=len(entries)==14 and all(r['exact'] for r in entries) and len(matrix)==len(before)==6 and all(r['beforeManifestExact'] and r['before']['exact'] and r['after']['exact'] for r in matrix)
OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'output':str(OUT),'revisionLedgerSha256':result['revisionLedger']['sha256'],
    'ledgerEntries':len(entries),'ledgerExact':result['revisionLedger']['exactCount'],
    'declaredBytes':result['revisionLedger']['declaredBytes'],'sourceCount':len(matrix),
    'sourceExact':result['sources']['exactCount'],'allExact':result['allExact']},ensure_ascii=False))
