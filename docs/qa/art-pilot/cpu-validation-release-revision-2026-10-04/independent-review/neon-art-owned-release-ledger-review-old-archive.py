#!/usr/bin/env python3
"""Read-only archive-ledger validation; writes results only to /tmp.

No tests, builds, browser/GPU calls, network, or repository writes.
Local file bytes and SHA-256 are compared against all recorded ledger rows.
"""
from pathlib import Path
import hashlib
import json

LEDGER = Path('/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/native-validation-2026-10-04/archive-ledger.json')
EXPECTED_LEDGER_SHA = 'fb60ba35e31ca0b392aaa465823565ecab962c93173850dbf32f48144f160be1'
OUTPUT = Path('/tmp/neon-art-owned-release-ledger-review-old-archive.json')

raw_ledger = LEDGER.read_bytes()
ledger = json.loads(raw_ledger)
rows = []
for item in ledger['files']:
    target = LEDGER.parent / item['path']
    row = {
        'path': item['path'],
        'expectedBytes': item['bytes'],
        'expectedSha256': item['sha256'],
        'exists': target.is_file(),
    }
    if row['exists']:
        raw_file = target.read_bytes()
        row['actualBytes'] = len(raw_file)
        row['actualSha256'] = hashlib.sha256(raw_file).hexdigest()
        row['bytesMatch'] = row['actualBytes'] == row['expectedBytes']
        row['sha256Match'] = row['actualSha256'] == row['expectedSha256']
    else:
        row['bytesMatch'] = False
        row['sha256Match'] = False
    row['exact'] = row['bytesMatch'] and row['sha256Match']
    rows.append(row)

ledger_sha = hashlib.sha256(raw_ledger).hexdigest()
result = {
    'ledgerPath': str(LEDGER),
    'ledgerSHA': ledger_sha,
    'ledgerSHAMatchesExpected': ledger_sha == EXPECTED_LEDGER_SHA,
    'count': len(rows),
    'totalBytes': sum(row['expectedBytes'] for row in rows),
    'actualTotalBytes': sum(row.get('actualBytes', 0) for row in rows),
    'mismatch': sum(not row['exact'] for row in rows),
    'files': rows,
}
OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: value for key, value in result.items() if key != 'files'}, ensure_ascii=False))
