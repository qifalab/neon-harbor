#!/usr/bin/env python3
"""Read saved original CI log bytes; no API, tests, browser, git or source mutation."""
import hashlib, json, pathlib, re, sys

root = pathlib.Path(sys.argv[1])
state = json.loads((root / 'monitor-state.json').read_text())
ansi = re.compile(r'\x1b\[[0-?]*[ -/]*[@-~]')
timestamp = re.compile(r'^\d{4}-\d\d-\d\dT[^ ]+\s')
results, identities, scenario_occurrences = [], [], []
for job in state.get('lastJobs', []):
    if job['name'].startswith('Optional native') or job.get('status') != 'completed' or job.get('conclusion') == 'skipped':
        continue
    path = root / 'logs' / f"job-{job['id']}-original.log"
    if not path.exists():
        results.append({'jobId': job['id'], 'name': job['name'], 'conclusion': job['conclusion'], 'rawLogMissing': True})
        continue
    raw = path.read_bytes()
    lines = [timestamp.sub('', ansi.sub('', line)) for line in raw.decode().splitlines()]
    rules = []
    scenarios = []
    counts = {}
    for line in lines:
        rule = re.match(r'^ok (\d+) - (.*)$', line)
        if rule:
            rules.append((int(rule[1]), rule[2]))
        scenario = re.match(r'^\s*([✓✘])\s+\d+\s+(tests/.*?\s+›\s+.*)\s+\([^()]*\)\s*$', line)
        if scenario:
            scenarios.append({'identity': scenario[2], 'status': 'passed' if scenario[1] == '✓' else 'failed'})
        count = re.match(r'^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$', line)
        if count:
            counts[count[1]] = int(count[2])
    identity_sha = hashlib.sha256(json.dumps(rules, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest() if rules else None
    if rules:
        identities.append((job['id'], identity_sha))
    for scenario in scenarios:
        scenario_occurrences.append({'jobId': job['id'], 'job': job['name'], **scenario})
    summaries = [line for line in lines if re.match(r'^\s+\d+ (passed|failed|flaky|skipped)(?:\s|$)', line)]
    actual_error_lines = [line for line in lines if re.search(r'^(?:\s+)?(?:TimeoutError:|Error:|AssertionError:)|^not ok |^##\[error\]', line)]
    results.append({'jobId': job['id'], 'name': job['name'], 'conclusion': job['conclusion'], 'rawLog': {'path': str(path), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}, 'rules': {'counts': counts, 'numberedPassed': len(rules), 'orderedIdentitySha256': identity_sha, 'numberedPassedContinuous': [x[0] for x in rules] == list(range(1, len(rules) + 1))}, 'scenarios': scenarios, 'playwrightSummaryLines': summaries, 'reportedErrorLines': actual_error_lines})
distinct = {}
for row in scenario_occurrences:
    distinct.setdefault(row['identity'], []).append(row)
result = {'runId': 37247048989, 'attempt': 1, 'headSha': 'ef92c25980f1da12b508971170b72b9dd6230059', 'monitorSequence': state.get('sequence'), 'scope': 'derived only from saved completed original functional logs; native artwork remains separate', 'ruleExecutionsNotUniqueRuleCount': sum(row.get('rules', {}).get('numberedPassed', 0) for row in results), 'orderedRuleSetsAllIdentical': len(set(x[1] for x in identities)) <= 1, 'ruleIdentityHashes': identities, 'uniqueRuleCountWhenSetsIdentical': max([row.get('rules', {}).get('numberedPassed', 0) for row in results] or [0]) if len(set(x[1] for x in identities)) <= 1 else None, 'distinctBrowserScenarios': len(distinct), 'distinctPassedBrowserScenarios': sum(all(x['status'] == 'passed' for x in rows) for rows in distinct.values()), 'distinctFailedBrowserScenarios': sum(any(x['status'] == 'failed' for x in rows) for rows in distinct.values()), 'jobs': results, 'firstFailuresPreservedByMonitor': state.get('firstFailures', state.get('failures')), 'nativeAcceptance': 'PENDING_HUMAN_NATIVE_REVIEW; capture/collector outcome never implies manual artwork acceptance', 'sourceMutation': False, 'execution': 'no tests/build/browser/GPU/API/git/ref'}
result['actualObservedRun'] = state.get('lastRun')
result['actualObservedJobTallies'] = state.get('lastTally')
result['lastPollAt'] = state.get('lastPollAt')
result['allRequiredJobsCompleted'] = bool(state.get('lastTally')) and sum(state['lastTally']['required'].get(k, 0) for k in ('inProgress', 'queued')) == 0
result['overallAcceptance'] = ('HAS_RECORDED_FAILURES_NOT_FINAL' if state.get('lastRun', {}).get('status') != 'completed' else 'FAILED') if state.get('failures') else 'UNDETERMINED'
result['artifactsListedOnlyNotDownloadedByMonitor'] = state.get('artifacts', [])
print(json.dumps(result, ensure_ascii=False, indent=2))
