#!/usr/bin/env python3
"""Read-only index/closed-evidence audit. Never read the active third-tour folder."""
from pathlib import Path
import datetime
import hashlib
import json
import subprocess

root = Path('/workspace/scratch/neon-harbor')
def git(*args):
    return subprocess.check_output(['git', *args], cwd=root)
index = {}
for entry in git('ls-files', '--stage', '-z').decode().split('\0'):
    if not entry:
        continue
    head, path = entry.split('\t', 1)
    mode, sha, stage = head.split()
    if stage == '0':
        index[path] = sha
result = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'activeFolderExcluded': 'docs/qa/transit-crossing-repair/continuous-tour-budget-review/',
          'ledgers': [], 'issues': [], 'uniqueFiles': {}, 'missingIndex': []}
for folder in ('docs/qa/art-final', 'docs/qa/post-checkpoint', 'docs/qa/transit-crossing-repair'):
    for ledger in sorted((root/folder).rglob('evidence-files.json')):
        if 'continuous-tour-budget-review' in ledger.parts:
            continue
        document = json.loads(ledger.read_text())
        rows = document if isinstance(document, list) else document.get('files', [])
        relative_ledger = str(ledger.relative_to(root))
        summary = {'ledger': relative_ledger, 'rows': len(rows), 'workingExact': 0,
                   'indexExact': 0, 'ledgerInIndex': relative_ledger in index}
        for row in rows:
            filename = row.get('file', row.get('path'))
            path = ledger.parent/filename
            relative = str(path.relative_to(root))
            if 'continuous-tour-budget-review' in path.parts:
                result['issues'].append(['active-folder-reference-skipped', relative])
                continue
            body = path.read_bytes()
            size, digest = len(body), hashlib.sha256(body).hexdigest()
            expected_size = row.get('bytes', row.get('size'))
            if (size, digest) == (expected_size, row['sha256']):
                summary['workingExact'] += 1
            else:
                result['issues'].append(['working-mismatch', relative, size, digest])
            result['uniqueFiles'][relative] = {'bytes': size, 'sha256': digest}
            if relative in index:
                staged = git('cat-file', 'blob', index[relative])
                if (len(staged), hashlib.sha256(staged).hexdigest()) == (expected_size, row['sha256']):
                    summary['indexExact'] += 1
                else:
                    result['issues'].append(['index-mismatch', relative])
            else:
                result['missingIndex'].append(relative)
        result['ledgers'].append(summary)
result['uniqueFileCount'] = len(result['uniqueFiles'])
result['uniqueFileBytes'] = sum(row['bytes'] for row in result['uniqueFiles'].values())
Path('/tmp/neon-release-preparation-ledger-read.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'uniqueFiles'}, indent=2))
