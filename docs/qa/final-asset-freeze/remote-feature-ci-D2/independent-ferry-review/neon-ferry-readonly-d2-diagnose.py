import collections, datetime, hashlib, json, pathlib, re, subprocess, zipfile

ROOT = pathlib.Path('/workspace/scratch/neon-harbor')
BASE = ROOT / 'docs/qa/final-asset-freeze'
D2 = BASE / 'remote-feature-ci-D2'
TRACE = D2 / 'artifacts/ferry-failure-original/trace.zip'
OUT = pathlib.Path('/tmp/neon-ferry-d2-readonly-evidence.json')

def decode(x):
    if not isinstance(x, dict): return x
    if 'o' in x: return {i['k']: decode(i['v']) for i in x['o']}
    if 'a' in x: return [decode(i) for i in x['a']]
    for key in ('n', 's', 'b'): 
        if key in x: return x[key]
    if 'v' in x: return {'null': None, 'undefined': None}.get(x['v'], x['v'])
    return x

def utc_ms(value):
    return datetime.datetime.fromtimestamp(value / 1000, datetime.timezone.utc).isoformat(timespec='milliseconds')

def stages(path):
    raw = path.read_bytes()
    lines = raw.decode().splitlines()
    rows = []
    for number, line in enumerate(lines, 1):
        if '{"stage":"ferry-' in line:
            ts, payload = line.split(' ', 1)
            d = json.loads(payload)
            d['wall'] = ts
            d['line'] = number
            d['epochMs'] = datetime.datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp() * 1000
            rows.append(d)
    return {'path': str(path), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'lines': len(lines), 'stages': rows,
            'stepHeaders': [l for l in lines if '##[group]' in l],
            'caseAndTotals': [l for l in lines if 'public boarding' in l or 'Test timeout' in l or 'mouse.up:' in l or re.search(r'\b\d+ (?:passed|failed)\b', l)],
            'ruleTotals': [l for l in lines if re.search(r'# (?:tests|pass|fail|cancelled|skipped|todo) \d+', l)]}

logs = {
    'D': stages(BASE / 'remote-feature-ci/logs/job-111532676168-original.log'),
    'D2': stages(D2 / 'logs/job-111539469766-original.log')
}
source = ROOT / 'tests/e2e/harbor-sample.spec.js'
blob = subprocess.run(['git', '--git-dir=/tmp/neon-D2-steering-object-store.git', 'show', '7a90f7934b7c9d1af5c4494bf08c4ec337c373e4:tests/e2e/harbor-sample.spec.js'], capture_output=True, check=True).stdout
source_hashes = {'rootSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'D2GitBlobSha256': hashlib.sha256(blob).hexdigest(), 'sameBytes': blob == source.read_bytes()}

with zipfile.ZipFile(TRACE) as z:
    library = [json.loads(line) for line in z.read('0-trace.trace').decode().splitlines()]
    runner = [json.loads(line) for line in z.read('test.trace').decode().splitlines()]
    ctx = next(e for e in library if e['type'] == 'context-options')
    offset = ctx['wallTime'] - ctx['monotonicTime']
    end_by_call = {e['callId']: e for e in library if e['type'] == 'after'}
    runner_end_by_call = {e['callId']: e for e in runner if e['type'] == 'after'}
    phase_start = logs['D2']['stages'][-1]['epochMs'] - offset
    calls = []
    for e in library:
        if e['type'] != 'before': continue
        end = end_by_call.get(e['callId'])
        params = e.get('params', {})
        result = decode((end or {}).get('result', {}).get('value'))
        row = {'id': e['callId'], 'step': e.get('stepId'), 'method': e['method'], 'start': e['startTime'], 'wall': utc_ms(offset + e['startTime']),
               'durationMs': end['endTime'] - e['startTime'] if end else None, 'end': end.get('endTime') if end else None,
               'params': params, 'error': end.get('error') if end else None, 'result': result}
        if e['startTime'] >= phase_start: calls.append(row)
    waits = collections.defaultdict(list)
    motion = []
    for c in calls:
        if c['method'] == 'waitForFunction':
            key = 'camera-yaw' if 'const actual' in c['params'].get('expression', '') else 'local-position'
            waits[key].append(c)
        if c['method'] == 'evaluateExpression' and isinstance(c['result'], dict) and 'cameraYaw' in c['result']:
            motion.append({'wall': c['wall'], 'start': c['start'], 'durationMs': c['durationMs'], **c['result']})
    call_stats = {}
    for method in sorted(set(c['method'] for c in calls)):
        rows = [c for c in calls if c['method'] == method]
        durations = [c['durationMs'] for c in rows if c['durationMs'] is not None]
        call_stats[method] = {'count': len(rows), 'completed': len(durations), 'totalMs': sum(durations), 'maxMs': max(durations, default=0)}
    wait_stats = {k: {'count': len(v), 'sumMs': sum(c['durationMs'] or 0 for c in v), 'maxMs': max(c['durationMs'] or 0 for c in v),
                      'timeouts': [c['params'].get('timeout') for c in v]} for k, v in waits.items()}
    frames = [e for e in library if e['type'] == 'screencast-frame']
    picks = []
    for label, at in [('door-start', phase_start), ('door-middle', phase_start + 45000), ('door-end', frames[-1]['timestamp'])]:
        e = min(frames, key=lambda f: abs(f['timestamp'] - at))
        item = {'label': label, **e, 'wall': utc_ms(offset + e['timestamp'])}
        dest = pathlib.Path(f'/tmp/neon-ferry-d2-{label}-original.jpeg')
        dest.write_bytes(z.read('resources/' + e['sha1']))
        item['extractedPath'] = str(dest)
        picks.append(item)
    runner_errors = [e for e in runner if e.get('type') == 'error' or e.get('error')]
    final_runner_before = [e for e in runner if e['type'] == 'before' and e.get('method') == 'pw:api' and e.get('startTime', 0) >= phase_start]
    for e in final_runner_before:
        end = runner_end_by_call.get(e['callId'])
        e['completedEndTime'] = end.get('endTime') if end else None
        e['completedError'] = end.get('error') if end else None
    src_resources = [a.filename for a in z.infolist() if 'src@' in a.filename]
    trace_details = {'path': str(TRACE), 'bytes': TRACE.stat().st_size, 'sha256': hashlib.sha256(TRACE.read_bytes()).hexdigest(),
                     'libraryContext': ctx, 'eventCounts': {'library': len(library), 'runner': len(runner)}, 'phaseStartMonotonic': phase_start,
                     'phaseCalls': calls, 'phaseCallStats': call_stats, 'phaseWaitStats': wait_stats, 'phaseMotion': motion,
                     'runnerErrors': runner_errors, 'finalRunnerSteps': final_runner_before, 'pickedFrames': picks,
                     'screencastCount': len(frames), 'sourceResourceNames': src_resources}
evidence = {'logs': logs, 'source': source_hashes, 'trace': trace_details}
OUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'evidenceFile': str(OUT), 'source': source_hashes, 'traceHash': trace_details['sha256'], 'callStats': call_stats, 'waitStats': wait_stats,
                  'firstMotion': motion[0] if motion else None, 'lastMotion': motion[-1] if motion else None,
                  'runnerErrors': runner_errors, 'frames': picks, 'sourceResources': src_resources}, ensure_ascii=False, indent=2))
