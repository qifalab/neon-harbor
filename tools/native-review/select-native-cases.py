#!/usr/bin/env python3
"""Validate a finite native capture selection; never run a capture or modify Git."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_policy(cases, policy):
    records = cases.get('cases')
    rows = policy.get('include')
    if not isinstance(records, list) or not isinstance(rows, list):
        raise ValueError('Cases and matrix must be arrays')
    if len(records) != 24 or len(rows) != 24:
        raise ValueError('The default matrix must retain all 24 cases')
    ids = [record.get('id') for record in records]
    matrix_ids = [row.get('id') for row in rows]
    if any(not isinstance(value, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', value)
           for value in ids + matrix_ids):
        raise ValueError('Invalid canonical case ID')
    if len(set(ids)) != 24 or len(set(matrix_ids)) != 24 or set(ids) != set(matrix_ids):
        raise ValueError('Default matrix and existing case IDs must agree exactly')
    by_id = {record['id']: record for record in records}
    for row in rows:
        if set(row) != {'id', 'job_timeout_minutes', 'evidence_label'}:
            raise ValueError('Unexpected matrix field')
        timeout = row['job_timeout_minutes']
        if type(timeout) is not int or timeout <= 0 or timeout != by_id[row['id']]['jobTimeoutMinutes']:
            raise ValueError('Matrix timeout differs from the existing case budget: ' + row['id'])
        if not isinstance(row['evidence_label'], str) or not row['evidence_label']:
            raise ValueError('Missing evidence label')
    return rows


def select_rows(raw, rows):
    if not isinstance(raw, str) or not raw.strip():
        raise ValueError('Selection must be all or a nonempty comma-separated list')
    if raw == 'all':
        return list(rows)
    requested = [token.strip() for token in raw.split(',')]
    if any(not token for token in requested):
        raise ValueError('Empty case IDs are forbidden')
    if len(set(requested)) != len(requested):
        raise ValueError('Duplicate case IDs are forbidden')
    allowed = {row['id'] for row in rows}
    unknown = set(requested) - allowed
    if unknown:
        raise ValueError('Unknown case IDs: ' + ','.join(sorted(unknown)))
    wanted = set(requested)
    selected = [row for row in rows if row['id'] in wanted]
    if not selected:
        raise ValueError('An empty capture set is forbidden')
    return selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--github-output', type=Path, required=True)
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.output.exists():
        raise FileExistsError('A previous selection receipt must never be overwritten')
    receipt = {'schema': 'neon-harbor/native-selection/v1', 'status': 'FAILED',
               'captureExecuted': False, 'retry': False, 'firstError': None,
               'rawSelection': os.environ.get('SELECTED_CASE_IDS'),
               'authoredDispatchSha': os.environ.get('AUTHORED_SHA'),
               'runId': os.environ.get('GITHUB_RUN_ID'),
               'runAttempt': os.environ.get('GITHUB_RUN_ATTEMPT')}
    code = 1
    try:
        root = args.source_root.resolve()
        dispatch = os.environ.get('AUTHORED_SHA')
        if not isinstance(dispatch, str) or not re.fullmatch(r'[0-9a-f]{40}', dispatch):
            raise ValueError('The actual dispatch SHA is required')
        actual = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'],
                                         text=True, timeout=10).strip()
        top = subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--show-toplevel'],
                                      text=True, timeout=10).strip()
        if actual != dispatch or Path(top).resolve() != root:
            raise ValueError('Selection checkout must be its own exact dispatched Git root')
        bundle = root / 'tools/native-review'
        cases_path, policy_path = bundle / 'cases.json', bundle / 'native-matrix.json'
        rows = validate_policy(json.loads(cases_path.read_text()), json.loads(policy_path.read_text()))
        selected = select_rows(os.environ.get('SELECTED_CASE_IDS'), rows)
        matrix = {'include': selected}
        receipt.update({'status': 'VALIDATED_SELECTION_NOT_CAPTURE_ACCEPTANCE',
                        'actualCheckoutSha': actual, 'selectedCaseIds': [row['id'] for row in selected],
                        'selectedCount': len(selected), 'defaultCaseCount': len(rows),
                        'defaultMatrixUnchanged': True, 'matrix': matrix,
                        'caseFileSHA256': sha256(cases_path), 'matrixFileSHA256': sha256(policy_path),
                        'selectorSHA256': sha256(Path(__file__).resolve())})
        # Values originate only from validated canonical rows. No raw input enters an expression or shell.
        with args.github_output.open('a') as output:
            output.write('matrix=' + json.dumps(matrix, separators=(',', ':')) + '\n')
            output.write('case_ids=' + json.dumps(receipt['selectedCaseIds'], separators=(',', ':')) + '\n')
            output.write('count=' + str(len(selected)) + '\n')
        code = 0
    except Exception as error:
        receipt['status'] = 'FAILED'
        receipt['firstError'] = {'type': type(error).__name__, 'message': str(error)}
    finally:
        with args.output.open('x') as output:
            json.dump(receipt, output, indent=2); output.write('\n')
    print(json.dumps({'status': receipt['status'], 'selectedCount': receipt.get('selectedCount'),
                      'firstError': receipt['firstError']}))
    return code


if __name__ == '__main__':
    sys.exit(main())
