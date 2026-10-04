import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time

ROOT = Path('/workspace/scratch/neon-harbor')
PILOT = Path('/workspace/scratch/neon-harbor-art-pilot')
OUT = PILOT / 'docs/qa/art-pilot/cpu-validation-final-2026-10-04'
assert not OUT.exists(), 'Use a fresh result path; preserve every previous run'
OUT.mkdir()
previous = PILOT / 'docs/qa/art-pilot/cpu-validation-2026-10-04'
shutil.copyfile(previous / 'verify-built-assets.py', OUT / 'verify-built-assets.py')
shutil.copyfile(Path(__file__), OUT / 'run-cpu-validation.py')

def stamp():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

def one(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}

def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def fingerprint(base, entries):
    records = {}
    for entry in entries:
        path = base / entry
        files = sorted(p for p in path.rglob('*') if p.is_file()) if path.is_dir() else [path]
        for item in files:
            if item.exists(): records[str(item.relative_to(base))] = one(item)
    return records

protected = ['src', 'tools', 'tests', 'vendor', 'package.json', 'package-lock.json', 'index.html', 'styles.css', 'favicon.svg', 'assets/harbor/workshop']
root_entries = ['src', 'tools', 'tests', 'vendor', 'assets', 'dist', 'package.json', 'package-lock.json', 'index.html', 'styles.css', 'favicon.svg']
source_before, root_before = fingerprint(PILOT, protected), fingerprint(ROOT, root_entries)
write('source-before.json', source_before)
write('root-before.json', root_before)
method = json.loads((PILOT / 'docs/qa/art-pilot/browser-method-source.json').read_text())
assert all(one(PILOT / row['path']) == {'bytes': row['bytes'], 'sha256': row['sha256']} for row in method['files']), 'Reviewed method bytes changed'
assert one(PILOT / 'tools/capture-workshop-pilot.mjs')['sha256'] == '8be52d410558e25da2016ce7d83fd669b2647ed27e1904c1a22e3404d62516a9'
for name in ['tests/harbor-sample-integration.test.js', 'tests/harbor-life-traffic.test.js', 'tests/fixtures/harbor-life-pre-crossing-repair.json']:
    assert (PILOT / name).read_bytes() == (ROOT / name).read_bytes(), 'Authorized exact ROOT test differs'
historical_before = {}
for item in sorted((PILOT / 'docs/qa/art-pilot').rglob('*')):
    if item.is_file() and OUT not in item.parents:
        historical_before[str(item.relative_to(PILOT))] = one(item)
write('historical-evidence-before.json', historical_before)
write('authorization.json', {'authorizedAtPhase': 'ROOT confirmed GPU released and authorized final CPU only', 'browserStarted': False, 'serverStarted': False,
                           'gpuUsed': False, 'sourceModificationPermitted': False, 'methodSha256': one(PILOT / 'tools/capture-workshop-pilot.mjs')['sha256'],
                           'preExistingDistBuildInfo': one(PILOT / 'dist/build-info.json')})

active = None
cancelled = False
def cancel(signum, _frame):
    global cancelled
    cancelled = True
    write('interrupt.json', {'signal': signum, 'atUtc': stamp(), 'status': 'terminated-partial-NOT-PASS'})
    if active is not None and active.poll() is None:
        os.killpg(active.pid, signal.SIGTERM)
signal.signal(signal.SIGTERM, cancel)
signal.signal(signal.SIGINT, cancel)

commands = [
    ('node-version', ['node', '--version']), ('npm-version', ['npm', '--version']),
    ('capture-syntax', ['node', '--check', 'tools/capture-workshop-pilot.mjs']),
    ('walking-syntax', ['node', '--check', 'tools/workshop-review-helpers/walking.js']),
    ('occupied-syntax', ['node', '--check', 'tools/workshop-review-helpers/occupied.js']),
    ('renderer-syntax', ['node', '--check', 'src/main.js']),
    ('pilot-syntax', ['node', '--check', 'src/harbor-workshop-pilot.js']),
    ('interiors-syntax', ['node', '--check', 'src/metropolis-interiors.js']),
    ('node-rules', ['npm', 'test']), ('build', ['npm', 'run', 'build']),
    ('built-assets-verification', ['python3', 'docs/qa/art-pilot/cpu-validation-final-2026-10-04/verify-built-assets.py']),
    ('git-diff-check', ['git', 'diff', '--check']),
]
records = []
for label, command in commands:
    if cancelled: break
    record = {'label': label, 'command': command, 'cwd': str(PILOT), 'startedAt': stamp(), 'status': 'running',
              'stdout': f'{label}.stdout.txt', 'stderr': f'{label}.stderr.txt'}
    records.append(record); write('commands.json', records)
    start = time.monotonic()
    with (OUT / record['stdout']).open('wb') as stdout, (OUT / record['stderr']).open('wb') as stderr:
        active = subprocess.Popen(command, cwd=PILOT, stdout=stdout, stderr=stderr, start_new_session=True)
        try:
            code = active.wait(timeout=600)
        except subprocess.TimeoutExpired:
            os.killpg(active.pid, signal.SIGTERM)
            code = active.wait(timeout=10)
            record['timeoutReached'] = True
        finally:
            active = None
    record.update({'endedAt': stamp(), 'elapsedSeconds': round(time.monotonic()-start, 3), 'exitCode': code,
                   'status': 'terminated-partial-NOT-PASS' if cancelled else 'passed' if code == 0 else 'failed',
                   'stdoutRecord': one(OUT / record['stdout']), 'stderrRecord': one(OUT / record['stderr'])})
    write('commands.json', records)
    print(json.dumps(record), flush=True)
    if cancelled or code != 0: break

source_after, root_after = fingerprint(PILOT, protected), fingerprint(ROOT, root_entries)
historical_after = {name: one(PILOT / name) for name in historical_before}
write('source-after.json', source_after)
write('root-after.json', root_after)
freeze = {'sourceUnchanged': source_before == source_after, 'rootRuntimeUnchanged': root_before == root_after,
          'historicalEvidenceUnchanged': historical_before == historical_after,
          'sourceDifferences': [p for p in sorted(set(source_before) | set(source_after)) if source_before.get(p) != source_after.get(p)],
          'rootDifferences': [p for p in sorted(set(root_before) | set(root_after)) if root_before.get(p) != root_after.get(p)],
          'historicalDifferences': [p for p in historical_before if historical_before[p] != historical_after[p]]}
write('freeze-verification.json', freeze)
passed = not cancelled and len(records) == len(commands) and all(record.get('exitCode') == 0 for record in records)
summary = {'status': 'passed' if passed and all(freeze[key] for key in ['sourceUnchanged','rootRuntimeUnchanged','historicalEvidenceUnchanged']) else 'NOT PASS',
           'completedAtUtc': stamp(), 'methodSha256': one(PILOT / 'tools/capture-workshop-pilot.mjs')['sha256'],
           'browserStarted': False, 'serverStarted': False, 'gpuUsed': False, 'freeze': freeze}
write('run-summary.json', summary)
print(json.dumps(summary), flush=True)
raise SystemExit(0 if summary['status'] == 'passed' else 1)
