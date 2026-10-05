#!/usr/bin/env python3
"""Reproduce the two new official models, without replacing the old manifest.

--offline validates this candidate's acquired raw sources. The optional cart
is deliberately excluded from runtime because the five official models would
exceed the strict 12,000,000-byte room budget.
"""
from pathlib import Path
from datetime import datetime, timezone
import importlib.util, json

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('official_acquisition', ROOT / 'tools/acquire-workshop-assets.py')
official = importlib.util.module_from_spec(spec)
spec.loader.exec_module(official)
official.EVIDENCE = ROOT / 'docs/qa/authored-workshop/acquisition'
official.ASSETS = ROOT / 'assets/harbor/workshop'
verified = json.loads((ROOT / 'docs/qa/art-planning-2026-10-04/verified-sources.json').read_text())
by_id = {item['id']: item for item in verified['models']}
records = [official.acquire(asset_id, by_id[asset_id]) for asset_id in ['metal_office_desk', 'wooden_bookshelf_worn']]
path = official.ASSETS / 'asset-manifest.json'
manifest = json.loads(path.read_text())
manifest['models'] = [item for item in manifest['models'] if item['id'] not in {'metal_office_desk', 'wooden_bookshelf_worn'}] + records
manifest['runtimeBytes'] = sum(item['output']['bytes'] for item in manifest['models'])
manifest['generatedAt'] = datetime.now(timezone.utc).isoformat()
assert manifest['runtimeBytes'] <= 12000000
path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'mode': 'offline byte validation' if official.OFFLINE else 'official network acquisition',
                  'newModels': [{'id': item['id'], **item['output']} for item in records]}, indent=2))
