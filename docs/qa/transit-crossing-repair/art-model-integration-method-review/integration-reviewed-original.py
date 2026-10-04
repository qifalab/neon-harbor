#!/usr/bin/env python3
"""Selective integration, only after the fresh native suite actually passes.

No Git operations or dist copies. Keep ROOT's multiplayer trace fix and all
pre-existing edits. Reuse CPU evidence only after exact source/test comparison.
"""
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path('/workspace/scratch/neon-harbor')
PILOT = Path('/workspace/scratch/neon-harbor-art-pilot')
NATIVE = PILOT / 'docs/qa/art-pilot/native-validation-owned-release-2026-10-04'
EXPECTED_MANIFEST = '502af982ac2999fb28c395388d7d97acdf6165df803f62b3069f95cafa2dcbb3'
ROOT_MANIFEST = '7145fa443190896ff24050d518a54fea364ddb0547ddfa71756a33d64c515fb3'
METHOD = '6bb5b9b574e22b2be5ebec977d3b4f1e56faab64e3ed11d5fb9ef47bc426f714'
DETAIL_METHOD = 'f147a2d783628e016b37f9ce48103901dada4e65e08759e1ede45f686ed5a993'
NATIVE_METHODS = {
    'tools/capture-workshop-pilot.mjs': METHOD,
    'tools/server.mjs': '7cab11ba7366dcc6b39a8be794031747a1342b37ad9f73825a4bcca85007e388',
    'tools/workshop-review-helpers/walking.js': '12e30e93076aea7339e31befdc5e6155e64869a2f3d763d92298f6b302960969',
    'tools/workshop-review-helpers/occupied.js': '7698eb877fcaf3f4a60136beb4a0a00a4310985f20437939ce99b9ecd1047bed',
    'package.json': '445222967a997007bd4b6d7bd8b2c22b88b0cf031fed4f2cefb08a6f04a7f028',
    'package-lock.json': '163259fc64f19ce8fa5bba80359eb97befc847648bb7f6454c0569d4867fc87d',
}
CPU = PILOT / 'docs/qa/art-pilot/cpu-validation-release-revision-2026-10-04'
CPU_LEDGER = '33ebad117d8057bd6a6f1939b168b15cb6e259e2b15a97b5d9760d1bae76a534'
EXISTING = {'src/main.js', 'src/city-exploration.js', 'src/metropolis-interiors.js'}

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def require(value, message):
    if not value:
        raise RuntimeError(message)

def verify_ledger(base, ledger_name, expected_sha=None):
    ledger_path = base / ledger_name
    require(ledger_path.is_file(), f'Closed evidence ledger missing: {ledger_path}')
    if expected_sha:
        require(digest(ledger_path) == expected_sha, f'Closed ledger changed: {ledger_path}')
    rows = json.loads(ledger_path.read_text())['files']
    require(bool(rows), f'Empty ledger: {ledger_path}')
    names = set()
    for record in rows:
        name = record.get('path', record.get('file', ''))
        path = base / name
        require(name and name not in names and path.resolve().is_relative_to(base.resolve()),
                f'Invalid or duplicate evidence path: {name}')
        names.add(name)
        require(path.is_file() and path.stat().st_size == record['bytes'] and
                digest(path) == record['sha256'], f'Closed evidence changed: {path}')
    return names

def main():
    native = json.loads((NATIVE / 'metadata.json').read_text())
    require(native['status'] == 'passed', 'Fresh native suite has not passed')
    require([(s['name'], s['status']) for s in native['scenarios']] ==
            [('normal', 'passed'), ('404', 'passed'), ('delay-exit', 'passed')],
            'All three real-browser scenarios must pass without replacement')
    require(native['buildInfoSha256'] == EXPECTED_MANIFEST and
            native['methodHashes'] == NATIVE_METHODS,
            'Native result does not describe the approved build and method')
    for path, sha in NATIVE_METHODS.items():
        require(digest(PILOT / path) == sha, f'Approved native dependency changed: {path}')
    require(digest(NATIVE / 'build-info.json') == EXPECTED_MANIFEST,
            'Native archived build manifest changed')
    native_files = verify_ledger(NATIVE, 'archive-ledger.json')
    require({'metadata.json', 'build-info.json', 'closure-process-check.json',
             'invocation-original.json'} <= native_files,
            'Native ledger omits a required closure record')
    invocation = json.loads((NATIVE / 'invocation-original.json').read_text())
    require(invocation['status'] == 'passed' and invocation['exitCode'] == 0 and
            invocation['pid'] == 52763 and
            invocation['sourceSha256'] == invocation['finalSourceSha256'] == METHOD and
            invocation['buildInfoSha256'] == invocation['finalBuildInfoSha256'] == EXPECTED_MANIFEST,
            'Original native runner did not exit successfully with the frozen method/build')
    for stream in ['stdout', 'stderr']:
        name = invocation[stream]
        require(name in native_files and digest(NATIVE / name) == invocation[f'{stream}Sha256'],
                f'Original native runner output changed: {name}')
    closure = json.loads((NATIVE / 'closure-process-check.json').read_text())
    require(closure['methodPid52763Present'] is False and
            closure['activeChromeProcesses'] == [] and
            closure['port5208ConnectEx'] != 0 and
            closure['serverClosed'] is True and closure['gpuBrowserReleased'] is True and
            closure['noProcessesKilledForThisCheck'] is True,
            'Actual native process and GPU closure has not been verified')
    cpu_files = verify_ledger(CPU, 'evidence-ledger.json', CPU_LEDGER)
    require({'run-summary.json', 'commands.json', 'node-rules.stdout.txt',
             'freeze-verification.json', 'test-tree-source-comparison.json'} <= cpu_files,
            'CPU ledger omits required original results')
    cpu_summary = json.loads((CPU / 'run-summary.json').read_text())
    require(cpu_summary['status'] == 'passed' and cpu_summary['methodSha256'] == METHOD and
            all(cpu_summary['freeze'][k] is True for k in
                ['sourceUnchanged', 'rootRuntimeUnchanged', 'historicalEvidenceUnchanged']) and
            all(cpu_summary['freeze'][k] == [] for k in
                ['sourceDifferences', 'rootDifferences', 'historicalDifferences']),
            'Sealed CPU result or frozen source proof did not pass')
    commands = json.loads((CPU / 'commands.json').read_text())
    require(all(c['status'] == 'passed' and c['exitCode'] == 0 for c in commands),
            'An original CPU command did not succeed')
    require({c['label'] for c in commands} >=
            {'node-rules', 'build', 'built-assets-verification', 'test-tree-comparison'},
            'Required CPU commands missing')
    for command in commands:
        for stream in ['stdout', 'stderr']:
            output = CPU / command[stream]
            record = command[f'{stream}Record']
            require(output.stat().st_size == record['bytes'] and digest(output) == record['sha256'],
                    f'Original CPU command output changed: {output}')
    cpu_lines = (CPU / 'node-rules.stdout.txt').read_text().splitlines()
    require(all(line in cpu_lines for line in
                ['ℹ tests 311', 'ℹ pass 311', 'ℹ fail 0', 'ℹ cancelled 0',
                 'ℹ skipped 0', 'ℹ todo 0']), 'Original 311-rule result not present')
    require(digest(PILOT / 'dist/build-info.json') == EXPECTED_MANIFEST, 'Pilot build changed')
    require(digest(PILOT / 'tools/capture-workshop-pilot.mjs') == METHOD, 'Pilot method changed')
    require(digest(ROOT / 'dist/build-info.json') == ROOT_MANIFEST, 'ROOT build changed')
    old = json.loads((ROOT / 'dist/build-info.json').read_text())['assets']
    new = json.loads((PILOT / 'dist/build-info.json').read_text())['assets']
    require(set(old) <= set(new), 'Pilot removed runtime files')
    require({p for p in old if old[p] != new[p]} == EXISTING, 'Unexpected existing runtime change')
    additions = set(new) - set(old)
    require(len(additions) == 10 and 'src/harbor-workshop-pilot.js' in additions,
            'Unexpected new runtime scope')
    for path, sha in old.items():
        require(digest(ROOT / path) == sha, f'ROOT changed: {path}')
    for path, sha in new.items():
        require(digest(PILOT / path) == sha, f'Pilot source changed: {path}')
    require(native['sourceHashes'] == new, 'Native source dictionary differs from final runtime')
    require(digest(PILOT / 'tools/capture-workshop-vice-detail.mjs') == DETAIL_METHOD,
            'Independently reviewed vice detail method changed')
    proof = json.loads((PILOT / 'docs/qa/art-pilot/cpu-validation-release-revision-2026-10-04/test-tree-source-comparison.json').read_text())
    for path, record in proof['rootFullTestDictionary'].items():
        require(digest(ROOT / path) == record['sha256'], f'ROOT test changed: {path}')
    for path, record in proof['pilotNodeTestDictionary'].items():
        require(digest(PILOT / path) == record['sha256'], f'Pilot Node test changed: {path}')
    for path, record in proof['package'].items():
        require(digest(ROOT / path) == record['root']['sha256'] == digest(PILOT / path),
                f'Package mismatch: {path}')
    extra_files = [
        'tests/harbor-workshop-pilot.test.js', 'tools/capture-workshop-pilot.mjs',
        'tools/capture-workshop-vice-detail.mjs',
        'tools/acquire-workshop-assets.py', 'tools/inspect-workshop-assets.mjs',
        'tools/inspect-workshop-placement.mjs',
    ]
    verified_source = json.loads((CPU / 'source-after.json').read_text())
    for path in extra_files:
        if path == 'tools/capture-workshop-vice-detail.mjs':
            continue  # Separately pinned after the CPU run by its independent review.
        record = verified_source[path]
        require((PILOT / path).stat().st_size == record['bytes'] and
                digest(PILOT / path) == record['sha256'],
                f'Extra tool or test changed after the sealed CPU run: {path}')
    helpers = {str(p.relative_to(PILOT)) for p in
               (PILOT / 'tools/workshop-review-helpers').rglob('*') if p.is_file()}
    require(helpers == {p for p in NATIVE_METHODS if p.startswith('tools/workshop-review-helpers/')},
            'Unexpected helper file would be copied')
    for path in additions | set(extra_files):
        require(not (ROOT / path).exists(), f'Preserve unexpected existing file: {path}')
    for path in ['docs/qa/art-pilot', 'tools/workshop-review-helpers']:
        require(not (ROOT / path).exists(), f'Preserve unexpected existing directory: {path}')
    for path in sorted(EXISTING | additions | set(extra_files)):
        target = ROOT / path
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(PILOT / path, target)
    for path in ['docs/qa/art-pilot', 'tools/workshop-review-helpers']:
        shutil.copytree(PILOT / path, ROOT / path)
    for path, sha in new.items():
        require(digest(ROOT / path) == sha, f'Integrated runtime mismatch: {path}')
    actual_tests = {str(p.relative_to(ROOT)): digest(p) for p in (ROOT / 'tests').glob('*.test.js')}
    expected_tests = {p: r['sha256'] for p, r in proof['pilotNodeTestDictionary'].items()}
    require(actual_tests == expected_tests, 'Integrated npm test file set or bytes changed')
    require(digest(ROOT / 'tests/multiplayer-browser/rooms.spec.js') ==
            proof['rootFullTestDictionary']['tests/multiplayer-browser/rooms.spec.js']['sha256'],
            'ROOT multiplayer trace fix was overwritten')
    print(json.dumps({'status': 'integrated exact verified runtime and npm test set',
                      'assets': len(new), 'sourceModules': sum(p.startswith('src/') for p in new),
                      'nodeTestFiles': len(actual_tests), 'buildRequired': True,
                      'fullRuleEvidence': 'same exact source, npm test files, package and lock as isolated 311 PASS',
                      'copiedDist': False, 'gitMutation': False}))

if __name__ == '__main__':
    main()
