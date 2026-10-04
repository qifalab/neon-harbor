"""Read-only CPU byte/manifest verification; no server, browser or GPU."""
import hashlib
import json
from pathlib import Path
import struct

EVIDENCE = Path(__file__).resolve().parent
PILOT = EVIDENCE.parents[3]
ROOT = PILOT.parent / 'neon-harbor'

def digest(data, algorithm='sha256'):
    return hashlib.new(algorithm, data).hexdigest()

def record(path):
    data = path.read_bytes()
    return {'bytes': len(data), 'sha256': digest(data)}

def save(name, value):
    (EVIDENCE / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

build_bytes = (PILOT / 'dist/build-info.json').read_bytes()
build = json.loads(build_bytes)
served = {}
for name, expected in sorted(build['assets'].items()):
    source, output = PILOT / name, PILOT / 'dist' / name
    a, b = source.read_bytes(), output.read_bytes()
    served[name] = {'source': {'bytes': len(a), 'sha256': digest(a)},
                    'served': {'bytes': len(b), 'sha256': digest(b)},
                    'buildInfoSha256': expected,
                    'identical': a == b and digest(b) == expected}
actual = {str(p.relative_to(PILOT / 'dist')) for p in (PILOT / 'dist').rglob('*') if p.is_file() and p.name != 'build-info.json'}
expected_set = set(build['assets'])
assert actual == expected_set, 'Served file set differs from manifest'
assert all(r['identical'] for r in served.values()), 'Source/served/build manifest bytes differ'
save('served-source-dictionary.json', {'buildInfo': record(PILOT / 'dist/build-info.json'), 'assetCount': len(served), 'assets': served})

manifest = json.loads((PILOT / 'assets/harbor/workshop/asset-manifest.json').read_text())
originals, embedded = [], []
for model in manifest['models']:
    for item in model['sourceDownloads'] + model['metadataDownloads']:
        data = (PILOT / item['path']).read_bytes()
        assert digest(data) == item['sha256'] and len(data) == item['bytes'], item['path']
        md5 = digest(data, 'md5')
        assert not item.get('officialMd5') or md5 == item['officialMd5'], item['path']
        originals.append({'path': item['path'], 'sha256': digest(data), 'md5': md5, 'officialMd5': item.get('officialMd5'), 'identical': True})
    output = model['output']
    glb = (PILOT / output['path']).read_bytes()
    assert len(glb) == output['bytes'] and digest(glb) == output['sha256'], output['path']
    magic, version, length = struct.unpack_from('<III', glb, 0)
    assert magic == 0x46546c67 and version == 2 and length == len(glb)
    json_size, json_type = struct.unpack_from('<II', glb, 12)
    assert json_type == 0x4e4f534a
    document = json.loads(glb[20:20+json_size])
    binary_header = 20 + json_size
    binary_size, binary_type = struct.unpack_from('<II', glb, binary_header)
    assert binary_type == 0x004e4942
    binary = glb[binary_header+8:binary_header+8+binary_size]
    source_gltf = next(item for item in model['sourceDownloads'] if item['path'].endswith('.gltf'))
    source_document = json.loads((PILOT / source_gltf['path']).read_bytes())
    source_base = (PILOT / source_gltf['path']).parent
    source_binary = (source_base / source_document['buffers'][0]['uri']).read_bytes()
    assert binary[:len(source_binary)] == source_binary, 'Official geometry BIN was altered'
    for key in ['accessors', 'meshes', 'nodes', 'skins', 'animations', 'materials', 'textures', 'samplers', 'scenes', 'scene']:
        assert document.get(key) == source_document.get(key), f'{model["id"]}: original {key} changed'
    assert document['bufferViews'][:len(source_document['bufferViews'])] == source_document['bufferViews'], 'Official geometry bufferViews changed'
    for index, image in enumerate(document['images']):
        view = document['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        data = binary[start:start+view['byteLength']]
        original = (source_base / source_document['images'][index]['uri']).read_bytes()
        assert data == original and image['mimeType'] == 'image/jpeg', 'Official embedded JPEG changed'
        embedded.append({'model': model['id'], 'image': index, 'bytes': len(data), 'sha256': digest(data), 'originalBytesIdentical': True})

root_build_bytes = (ROOT / 'dist/build-info.json').read_bytes()
root_build = json.loads(root_build_bytes)
root_runtime = []
for name, frozen in sorted(root_build['assets'].items()):
    root_source = record(ROOT / name)
    root_served = record(ROOT / 'dist' / name)
    pilot = served.get(name)
    root_runtime.append({'path': name, 'rootFrozenSha256': frozen, 'rootSource': root_source,
                         'rootServed': root_served, 'pilot': pilot,
                         'rootMatchesFrozen': root_source['sha256'] == frozen and root_served['sha256'] == frozen,
                         'same': pilot is not None and pilot['source'] == root_source})
runtime_changes = [row['path'] for row in root_runtime if not row['same']]
assert all(row['rootMatchesFrozen'] for row in root_runtime), 'Root frozen runtime changed'
assert runtime_changes == ['src/main.js', 'src/metropolis-interiors.js'], runtime_changes
runtime_extras = sorted(set(served) - set(root_build['assets']))
expected_extras = sorted([
    'src/harbor-workshop-pilot.js',
    'assets/harbor/workshop/bench_vice_01.glb', 'assets/harbor/workshop/metal_tool_chest.glb',
    'assets/harbor/workshop/asset-manifest.json', 'assets/harbor/workshop/LICENSE-CC0.txt',
    'vendor/three/addons/loaders/GLTFLoader.js', 'vendor/three/addons/utils/BufferGeometryUtils.js',
    'vendor/three/addons/utils/SkeletonUtils.js', 'vendor/three/addons/LICENSE', 'vendor/three/addons/manifest.json',
])
assert runtime_extras == expected_extras, runtime_extras
save('root-frozen-runtime-comparison.json', {'rootBuildInfo': record(ROOT / 'dist/build-info.json'),
     'rootAssetCount': len(root_runtime), 'records': root_runtime, 'expectedDifferences': runtime_changes,
     'pilotOnly': runtime_extras, 'noUnexpectedRuntimeDifferences': True})
rows = []
for name, frozen in sorted(root_build['assets'].items()):
    if not name.startswith('src/'):
        continue
    root = record(ROOT / name)
    pilot = record(PILOT / name) if (PILOT / name).is_file() else None
    rows.append({'path': name, 'rootFrozenSha256': frozen, 'rootCurrent': root, 'pilotSource': pilot,
                 'pilotServed': record(PILOT / 'dist' / name) if (PILOT / 'dist' / name).is_file() else None,
                 'rootMatchesFrozen': root['sha256'] == frozen, 'same': pilot == root})
changed = [row['path'] for row in rows if not row['same']]
assert len(rows) == 52 and all(row['rootMatchesFrozen'] for row in rows), 'Root frozen source changed'
assert changed == ['src/main.js', 'src/metropolis-interiors.js'], changed
pilot_only = sorted(name for name in served if name.startswith('src/') and name not in root_build['assets'])
assert pilot_only == ['src/harbor-workshop-pilot.js'], pilot_only
save('root-frozen-source-comparison.json', {'rootBuildInfo': record(ROOT / 'dist/build-info.json'), 'sourceCount': len(rows),
     'records': rows, 'expectedDifferences': changed, 'pilotOnly': pilot_only, 'noUnexpectedSourceDifferences': True})
save('formal-asset-byte-verification.json', {'sourceDownloads': originals, 'embeddedJpegs': embedded, 'geometrySkinPbrNodesUnchanged': True,
     'jpegBytesUnchanged': True, 'imageDecoding': 'Not performed; CPU byte identity only', 'gpuUsed': False})
summary = {'status': 'passed', 'buildInfoSha256': digest(build_bytes), 'servedAssetCount': len(served),
           'allSourceServedBuildHashesMatch': True, 'allServedFilesCovered': True, 'formalDownloadRecordsVerified': len(originals),
           'originalEmbeddedJpegsVerified': len(embedded), 'rootFrozenSources': len(rows), 'noUnexpectedSourceDifferences': True,
           'rootFrozenRuntimeAssets': len(root_runtime), 'noUnexpectedRuntimeDifferences': True,
           'browserStarted': False, 'serverStarted': False, 'gpuUsed': False}
save('build-consistency-summary.json', summary)
print(json.dumps(summary, ensure_ascii=False, indent=2))
