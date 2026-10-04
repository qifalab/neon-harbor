from pathlib import Path
import hashlib
import json

folder = Path('/workspace/scratch/neon-harbor-art-pilot/docs/qa/art-pilot/native-validation-2026-10-04')
body = (folder/'metadata.json').read_bytes()
metadata = json.loads(body)
scenario = metadata['scenarios'][0]
rows = []
for event in scenario['events']:
    pilot = event.get('pilot') or {}
    rows.append({'kind': event['kind'], 'detail': event.get('detail'), 'at': event['at'],
                 'simulationTime': event['simulationTime'], 'position': event['position'],
                 'memory': event['renderer']['memory'], 'camera': event.get('camera'),
                 'pilot': {key: pilot.get(key) for key in ('status', 'assetCount', 'releasedAssets', 'boneTextureCount')},
                 'pilotGeometryCount': sum(item['geometries'] for item in pilot.get('resources', [])),
                 'pilotTextureCount': sum(item['textures'] for item in pilot.get('resources', []))})
ledger_bytes = (folder/'archive-ledger.json').read_bytes()
ledger = json.loads(ledger_bytes)
issues = []
for row in ledger['files']:
    raw = (folder/row['path']).read_bytes()
    if (len(raw), hashlib.sha256(raw).hexdigest()) != (row['bytes'], row['sha256']):
        issues.append(row['path'])
events = scenario['failureSnapshot']['city']['interior']['workshopPilotEvents']
result = {'scope': 'Readonly closed first native failure evidence and archived exact source; no browser, GPU, build or formal test',
          'metadataSHA256': hashlib.sha256(body).hexdigest(),
          'captureStatus': metadata['status'], 'captureManifestSHA256': metadata['buildInfoSha256'],
          'captureMethodSHA256': metadata['methodHashes']['tools/capture-workshop-pilot.mjs'],
          'archiveLedgerSHA256': hashlib.sha256(ledger_bytes).hexdigest(),
          'archiveRows': len(ledger['files']), 'archiveExact': not issues, 'archiveIssues': issues,
          'memory': scenario['memory'], 'timeline': rows,
          'assetReleases': [event for event in events if event['kind'] == 'asset-released'],
          'failure': metadata['failure'],
          'limitation': 'Original capture has global counters and CPU inventory/dispose counts, but no GPU-registered geometry UUID ledger. Source counts alone cannot uniquely attribute +35.'}
Path('/tmp/neon-art-native-fail-evidence-summary.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({key: result[key] for key in ('captureStatus', 'captureManifestSHA256', 'captureMethodSHA256', 'archiveLedgerSHA256', 'archiveRows', 'archiveExact', 'archiveIssues', 'limitation')}, indent=2))
