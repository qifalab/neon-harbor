import ast
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import yaml

ROOT = Path('/workspace/scratch/neon-harbor')
PACKAGE = Path('/tmp/neon-selective-native-recapture-workflow-20261005')
HELPER = PACKAGE / 'payload/tools/native-review/select-native-cases.py'
sys.dont_write_bytecode = True
ast.parse(HELPER.read_text())
spec = importlib.util.spec_from_file_location('native_selector', HELPER)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
cases = json.loads((ROOT / 'tools/native-review/cases.json').read_text())
policy = json.loads((PACKAGE / 'payload/tools/native-review/native-matrix.json').read_text())
checks = []


def check(name, run):
    run()
    checks.append({'name': name, 'result': 'PASS'})


def same(a, b):
    assert a == b, (a, b)


def rejects(run):
    try:
        run()
    except ValueError:
        return
    raise AssertionError('Invalid selection/policy was accepted')


rows = module.validate_policy(cases, policy)
check('default all retains exact 24 ordered matrix rows', lambda: same(module.select_rows('all', rows), rows))
for row in rows:
    check('single allowed case: ' + row['id'], lambda row=row: same(module.select_rows(row['id'], rows), [row]))
check('subset uses original matrix order and complete unchanged rows',
      lambda: same(module.select_rows('bus,home,resident-core', rows),
                   [row for row in rows if row['id'] in {'bus', 'home', 'resident-core'}]))
check('CSV whitespace normalizes only canonical IDs',
      lambda: same(module.select_rows(' home , resident-core ', rows),
                   [row for row in rows if row['id'] in {'home', 'resident-core'}]))
for raw in ['', ' ', ',', 'home,', ',home', 'home,,bus', 'home,home', 'home, home',
            'unknown', 'Home', 'all,home', '["home"]', 'home;echo data', None]:
    check('reject invalid selection: ' + repr(raw), lambda raw=raw: rejects(lambda: module.select_rows(raw, rows)))
changed = copy.deepcopy(policy); changed['include'][0]['job_timeout_minutes'] += 1
check('reject timeout drift', lambda: rejects(lambda: module.validate_policy(cases, changed)))
changed_ids = copy.deepcopy(policy); changed_ids['include'][0]['id'] = 'new-unreviewed-case'
check('reject unknown policy ID', lambda: rejects(lambda: module.validate_policy(cases, changed_ids)))
duplicate = copy.deepcopy(policy); duplicate['include'][1] = duplicate['include'][0]
check('reject duplicated policy ID', lambda: rejects(lambda: module.validate_policy(cases, duplicate)))
short = copy.deepcopy(policy); short['include'].pop()
check('reject empty or reduced default matrix', lambda: rejects(lambda: module.validate_policy(cases, short)))


class ActionsLoader(yaml.SafeLoader):
    pass


ActionsLoader.yaml_implicit_resolvers = copy.deepcopy(yaml.SafeLoader.yaml_implicit_resolvers)
for key, resolvers in list(ActionsLoader.yaml_implicit_resolvers.items()):
    ActionsLoader.yaml_implicit_resolvers[key] = [(tag, regex) for tag, regex in resolvers
                                                 if tag != 'tag:yaml.org,2002:bool']


old_native = yaml.load((PACKAGE / 'original-native-art.yml').read_text(), Loader=ActionsLoader)
new_native = yaml.load((PACKAGE / 'payload/.github/workflows/native-art.yml').read_text(), Loader=ActionsLoader)
old_ci = yaml.load((PACKAGE / 'original-ci.yml').read_text(), Loader=ActionsLoader)
new_ci = yaml.load((PACKAGE / 'bridge/.github/workflows/ci.yml').read_text(), Loader=ActionsLoader)
check('copied matrix equals original static 24-case matrix',
      lambda: same(policy['include'], old_native['jobs']['capture']['strategy']['matrix']['include']))
check('capture steps remain identical', lambda: same(new_native['jobs']['capture']['steps'], old_native['jobs']['capture']['steps']))
check('capture budget expression unchanged', lambda: same(new_native['jobs']['capture']['timeout-minutes'], old_native['jobs']['capture']['timeout-minutes']))
check('max parallel unchanged', lambda: same(new_native['jobs']['capture']['strategy']['max-parallel'], old_native['jobs']['capture']['strategy']['max-parallel']))
check('capture needs successful select job', lambda: same(new_native['jobs']['capture']['needs'], 'select'))
check('dynamic matrix from validated job output', lambda: same(new_native['jobs']['capture']['strategy']['matrix'], '${{ fromJSON(needs.select.outputs.matrix) }}'))
for trigger in ['workflow_dispatch', 'workflow_call']:
    check('native default all: ' + trigger, lambda trigger=trigger: same(new_native['on'][trigger]['inputs']['selected_case_ids']['default'], 'all'))
    check('CI native-only default false: ' + trigger, lambda trigger=trigger: same(new_ci['on'][trigger]['inputs']['native_only']['default'], 'false'))
for job in ['verify', 'multiplayer', 'room-art', 'room-detail']:
    updated = copy.deepcopy(new_ci['jobs'][job])
    if job in {'verify', 'multiplayer'}:
        updated.pop('if')
    check('original functional/PR job body retained: ' + job,
          lambda job=job, updated=updated: same(updated, old_ci['jobs'][job]))
for job in new_native['jobs'].values():
    for step in job.get('steps', []):
        if step.get('shell') == 'bash' and 'run' in step:
            result = subprocess.run(['bash', '-n'], input=step['run'], text=True, capture_output=True)
            assert result.returncode == 0, result.stderr
check('all workflow bash blocks parse without execution', lambda: None)
result = {'status': 'SOURCE_ONLY_SELECTION_AND_SYNTAX_PASS', 'checks': checks,
          'checkCount': len(checks), 'defaultMatrixCount': len(rows),
          'actualCaptureRun': False, 'productTestsOrBuildRun': False, 'gpuRun': False,
          'workflowDispatched': False, 'githubGraphOrSchemaAcceptance': 'PENDING_ACTUAL_DISPATCH'}
(PACKAGE / 'selection-and-yaml-proof.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'status': result['status'], 'checkCount': len(checks)}))
