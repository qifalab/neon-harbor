import hashlib
import json
from pathlib import Path
import subprocess
import time

ROOT = Path('/workspace/scratch/neon-harbor')
PILOT = Path('/workspace/scratch/neon-harbor-art-pilot')
OUT = PILOT / 'docs/qa/art-pilot/cpu-validation-2026-10-04'
OUT.mkdir(exist_ok=True)
assert not (OUT / 'commands.json').exists(), 'Preserve any previous CPU run'

def stamp():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

def one(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def fingerprint(base, entries):
    result = {}
    for entry in entries:
        path = base / entry
        paths = sorted(p for p in path.rglob('*') if p.is_file()) if path.is_dir() else [path]
        for item in paths:
            if item.exists():
                result[str(item.relative_to(base))] = one(item)
    return result

def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

protected = ['src', 'tools', 'tests', 'vendor', 'package.json', 'package-lock.json', 'index.html', 'styles.css', 'favicon.svg', 'assets/harbor/workshop']
root_entries = ['src', 'tools', 'tests', 'vendor', 'assets', 'dist', 'package.json', 'package-lock.json', 'index.html', 'styles.css', 'favicon.svg']
source_before = fingerprint(PILOT, protected)
root_before = fingerprint(ROOT, root_entries)
old_evidence = {}
for item in sorted((PILOT / 'docs/qa/art-pilot').rglob('*')):
    if item.is_file() and OUT not in item.parents and item.name != 'README.md':
        old_evidence[str(item.relative_to(PILOT))] = one(item)
write('source-before.json', source_before)
write('root-before.json', root_before)
write('historical-evidence-before.json', old_evidence)
write('prior-dist-build-info.json', {'path': 'dist/build-info.json', **one(PILOT / 'dist/build-info.json')})

records = []
commands = [
    ('node-version', ['node', '--version']),
    ('npm-version', ['npm', '--version']),
    ('capture-syntax', ['node', '--check', 'tools/capture-workshop-pilot.mjs']),
    ('walking-syntax', ['node', '--check', 'tools/workshop-review-helpers/walking.js']),
    ('occupied-syntax', ['node', '--check', 'tools/workshop-review-helpers/occupied.js']),
    ('renderer-syntax', ['node', '--check', 'src/main.js']),
    ('pilot-syntax', ['node', '--check', 'src/harbor-workshop-pilot.js']),
    ('interiors-syntax', ['node', '--check', 'src/metropolis-interiors.js']),
    ('node-rules', ['npm', 'test']),
    ('build', ['npm', 'run', 'build']),
]
for label, command in commands:
    started = stamp()
    start = time.monotonic()
    with (OUT / f'{label}.stdout.txt').open('wb') as stdout, (OUT / f'{label}.stderr.txt').open('wb') as stderr:
        completed = subprocess.run(command, cwd=PILOT, stdout=stdout, stderr=stderr, timeout=600)
    record = {'label': label, 'command': command, 'cwd': str(PILOT), 'startedAt': started, 'endedAt': stamp(),
              'elapsedSeconds': round(time.monotonic() - start, 3), 'exitCode': completed.returncode,
              'stdout': f'{label}.stdout.txt', 'stderr': f'{label}.stderr.txt'}
    records.append(record)
    write('commands.json', records)
    print(json.dumps(record), flush=True)

source_after = fingerprint(PILOT, protected)
root_after = fingerprint(ROOT, root_entries)
historical_after = {path: one(PILOT / path) for path in old_evidence}
write('source-after.json', source_after)
write('root-after.json', root_after)
write('freeze-verification.json', {
    'sourceUnchanged': source_before == source_after,
    'rootRuntimeUnchanged': root_before == root_after,
    'historicalEvidenceUnchanged': old_evidence == historical_after,
    'sourceDifferences': [p for p in sorted(set(source_before) | set(source_after)) if source_before.get(p) != source_after.get(p)],
    'rootDifferences': [p for p in sorted(set(root_before) | set(root_after)) if root_before.get(p) != root_after.get(p)],
    'historicalEvidenceDifferences': [p for p in old_evidence if old_evidence[p] != historical_after[p]],
})
assert source_before == source_after, 'Frozen pilot source changed'
assert root_before == root_after, 'Root runtime bytes changed during CPU run'
assert old_evidence == historical_after, 'Historical evidence overwritten'
print(json.dumps({'cpuCommandsPassed': all(r['exitCode'] == 0 for r in records), 'sourceUnchanged': True, 'rootUnchanged': True, 'historicalEvidenceUnchanged': True}), flush=True)
