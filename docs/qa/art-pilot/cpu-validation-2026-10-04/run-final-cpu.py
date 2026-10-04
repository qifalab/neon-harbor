import hashlib
import json
from pathlib import Path
import subprocess
import time

ROOT = Path('/workspace/scratch/neon-harbor')
PILOT = Path('/workspace/scratch/neon-harbor-art-pilot')
OUT = PILOT / 'docs/qa/art-pilot/cpu-validation-2026-10-04'
assert not (OUT / 'commands-final.json').exists(), 'Preserve previous results'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def one(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': sha(data)}

def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def fingerprint(base, entries):
    result = {}
    for entry in entries:
        path = base / entry
        files = sorted(p for p in path.rglob('*') if p.is_file()) if path.is_dir() else [path]
        for item in files:
            if item.exists(): result[str(item.relative_to(base))] = one(item)
    return result

paths = ['tests/harbor-sample-integration.test.js', 'tests/harbor-life-traffic.test.js', 'tests/fixtures/harbor-life-pre-crossing-repair.json']
overlay = []
for path in paths:
    source, target = ROOT / path, PILOT / path
    before = one(target) if target.exists() else None
    if target.exists():
        archive = OUT / 'prior-tests' / Path(path).name
        archive.parent.mkdir(exist_ok=True)
        archive.write_bytes(target.read_bytes())
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())
    assert target.read_bytes() == source.read_bytes()
    overlay.append({'path': path, 'sourceWorktree': str(ROOT), 'before': before, 'root': one(source), 'copied': one(target), 'exactBytes': True})
write('root-test-overlay.json', {'authorization': 'Parent explicitly authorized these three exact ROOT test bytes after preserving initial old-tree failure; no weakened assertions', 'records': overlay})

protected = ['src', 'tools', 'tests', 'vendor', 'package.json', 'package-lock.json', 'index.html', 'styles.css', 'favicon.svg', 'assets/harbor/workshop']
root_entries = ['src', 'tools', 'tests', 'vendor', 'assets', 'dist', 'package.json', 'package-lock.json', 'index.html', 'styles.css', 'favicon.svg']
before, root_before = fingerprint(PILOT, protected), fingerprint(ROOT, root_entries)
write('source-final-before.json', before)
write('root-final-before.json', root_before)
records = []
commands = [('final-node-rules', ['npm', 'test']), ('final-build', ['npm', 'run', 'build']),
            ('built-assets-verification', ['python3', 'docs/qa/art-pilot/cpu-validation-2026-10-04/verify-built-assets.py'])]
for label, command in commands:
    started = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    start = time.monotonic()
    with (OUT / f'{label}.stdout.txt').open('wb') as stdout, (OUT / f'{label}.stderr.txt').open('wb') as stderr:
        result = subprocess.run(command, cwd=PILOT, stdout=stdout, stderr=stderr, timeout=600)
    records.append({'label': label, 'command': command, 'cwd': str(PILOT), 'startedAt': started,
                    'endedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'elapsedSeconds': round(time.monotonic()-start, 3),
                    'exitCode': result.returncode, 'stdout': f'{label}.stdout.txt', 'stderr': f'{label}.stderr.txt'})
    write('commands-final.json', records)
    print(json.dumps(records[-1]), flush=True)

after, root_after = fingerprint(PILOT, protected), fingerprint(ROOT, root_entries)
write('source-final-after.json', after)
write('root-final-after.json', root_after)
historical = json.loads((OUT / 'historical-evidence-before.json').read_text())
historical_after = {path: one(PILOT / path) for path in historical}
write('freeze-final-verification.json', {'finalPilotSourceUnchanged': before == after, 'rootRuntimeUnchanged': root_before == root_after,
     'historicalEvidenceUnchanged': historical == historical_after,
     'sourceDifferences': [p for p in sorted(set(before) | set(after)) if before.get(p) != after.get(p)],
     'rootDifferences': [p for p in sorted(set(root_before) | set(root_after)) if root_before.get(p) != root_after.get(p)],
     'historicalEvidenceDifferences': [p for p in historical if historical[p] != historical_after[p]]})
assert before == after and root_before == root_after and historical == historical_after, 'Frozen source or evidence changed'
print(json.dumps({'allFinalCommandsPassed': all(r['exitCode'] == 0 for r in records), 'finalPilotSourceUnchanged': True, 'rootUnchanged': True, 'historicalEvidenceUnchanged': True}), flush=True)
