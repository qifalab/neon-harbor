#!/usr/bin/env python3
"""Acquire official CC0 sources and embed their unchanged BIN/JPEGs in GLB.

No mesh generation, simplification, texture re-encoding or rig baking occurs.
Run from any directory; all outputs stay inside this isolated worktree.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from hashlib import md5, sha256
from pathlib import Path
from urllib.request import Request, urlopen
import copy
import json
import struct
import sys

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/qa/art-pilot'
ASSETS = ROOT / 'assets/harbor/workshop'
IDS = ['bench_vice_01', 'metal_tool_chest']
OFFLINE = '--offline' in sys.argv


def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=60) as response:
        return response.read()


def digest(data):
    return sha256(data).hexdigest()


def acquire(asset_id, verified):
    directory = EVIDENCE / 'sources' / asset_id
    directory.mkdir(parents=True, exist_ok=True)
    files_bytes = (directory / 'files.json').read_bytes() if OFFLINE else fetch('https://api.polyhaven.com/files/' + asset_id)
    info_bytes = (directory / 'info.json').read_bytes() if OFFLINE else fetch('https://api.polyhaven.com/info/' + asset_id)
    files, info = json.loads(files_bytes), json.loads(info_bytes)
    (directory / 'files.json').write_bytes(files_bytes)
    (directory / 'info.json').write_bytes(info_bytes)
    spec = files['gltf']['1k']['gltf']
    source_records = []

    def download(item):
        name, record = item
        data = (directory / name).read_bytes() if OFFLINE else fetch(record['url'])
        assert len(data) == record['size'], (asset_id, name, 'official size mismatch')
        assert md5(data).hexdigest() == record['md5'], (asset_id, name, 'official MD5 mismatch')
        destination = directory / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        return {'path': str(destination.relative_to(ROOT)), 'sourceUri': name,
                'url': record['url'], 'bytes': len(data), 'officialMd5': record['md5'],
                'sha256': digest(data)}

    gltf_name = asset_id + '_1k.gltf'
    items = [(gltf_name, spec)] + list(spec['include'].items())
    with ThreadPoolExecutor(max_workers=5) as executor:
        source_records = list(executor.map(download, items))
    original = (directory / gltf_name).read_bytes()
    assert digest(original) == verified['sha256'], (asset_id, 'previous verified glTF SHA mismatch')
    gltf = json.loads(original)
    packed = copy.deepcopy(gltf)
    binary = bytearray()
    offsets = []
    for buffer in gltf.get('buffers', []):
        while len(binary) % 4:
            binary.append(0)
        offsets.append(len(binary))
        payload = (directory / buffer['uri']).read_bytes()
        assert len(payload) == buffer['byteLength']
        binary.extend(payload)
    for view in packed.get('bufferViews', []):
        view['byteOffset'] = view.get('byteOffset', 0) + offsets[view['buffer']]
        view['buffer'] = 0
    for image in packed.get('images', []):
        assert 'uri' in image and not image['uri'].startswith('data:'), 'only acquired official JPEGs expected'
        payload = (directory / image.pop('uri')).read_bytes()
        while len(binary) % 4:
            binary.append(0)
        image['bufferView'] = len(packed['bufferViews'])
        image['mimeType'] = 'image/jpeg'
        packed['bufferViews'].append({'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(payload)})
        binary.extend(payload)
    packed['buffers'] = [{'byteLength': len(binary)}]
    json_chunk = json.dumps(packed, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    json_chunk += b' ' * ((-len(json_chunk)) % 4)
    binary += b'\0' * ((-len(binary)) % 4)
    output = (struct.pack('<III', 0x46546c67, 2, 12 + 8 + len(json_chunk) + 8 + len(binary))
              + struct.pack('<II', len(json_chunk), 0x4e4f534a) + json_chunk
              + struct.pack('<II', len(binary), 0x004e4942) + binary)
    destination = ASSETS / (asset_id + '.glb')
    destination.write_bytes(output)
    triangles = sum(packed['accessors'][primitive['indices']]['count'] // 3
                    for mesh in packed['meshes'] for primitive in mesh['primitives'])
    assert triangles == verified['geometryTriangles']
    primitives = sum(len(mesh['primitives']) for mesh in packed['meshes'])
    return {'id': asset_id, 'license': 'CC0-1.0', 'licenseUrl': 'https://polyhaven.com/license',
            'authors': info.get('authors'), 'sourcePage': 'https://polyhaven.com/a/' + asset_id,
            'filesApi': 'https://api.polyhaven.com/files/' + asset_id,
            'infoApi': 'https://api.polyhaven.com/info/' + asset_id,
            'sourceDownloads': source_records,
            'metadataDownloads': [{'path': str((directory / name).relative_to(ROOT)), 'url': url,
                                   'bytes': len(payload), 'sha256': digest(payload)}
                                  for name, url, payload in [('files.json', 'https://api.polyhaven.com/files/' + asset_id, files_bytes),
                                                             ('info.json', 'https://api.polyhaven.com/info/' + asset_id, info_bytes)]],
            'output': {'path': str(destination.relative_to(ROOT)), 'bytes': len(output), 'sha256': digest(output)},
            'geometry': {'triangles': triangles, 'primitives': primitives, 'materials': len(packed.get('materials', [])),
                         'skins': len(packed.get('skins', [])), 'animations': len(packed.get('animations', []))},
            'textureResolution': 'official 1K', 'textureProcessing': 'None; embedded original JPEG bytes',
            'geometryProcessing': 'None; original accessors, vertex/index BIN, scene nodes and skin retained',
            'sourceBuffersNote': 'Official 1K glTF intentionally references the shared 4K/8K BIN URL; texture resolution does not alter mesh geometry.'}


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    verified = json.loads((EVIDENCE / 'verified-sources.json').read_text())
    by_id = {item['id']: item for item in verified['models']}
    records = [acquire(asset_id, by_id[asset_id]) for asset_id in IDS]
    total = sum(item['output']['bytes'] for item in records)
    assert total <= 12 * 1024 * 1024, 'GLBs exceed 12 MiB pilot target'
    manifest = {'version': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(),
                'sourceMode': 'offline verified archive' if OFFLINE else 'official network acquisition',
                'scope': 'Two real official assets for isolated south-086 workshop pilot; no visual approval yet',
                'license': 'CC0-1.0', 'licenseUrl': 'https://polyhaven.com/license',
                'generationTool': 'tools/acquire-workshop-assets.py', 'runtimeBytes': total,
                'models': records}
    (ASSETS / 'asset-manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    (ASSETS / 'LICENSE-CC0.txt').write_text('These two model assets are dedicated to the public domain under CC0 1.0 by their Poly Haven authors.\nLicense: https://polyhaven.com/license\nLegal text: https://creativecommons.org/publicdomain/zero/1.0/legalcode\nSee asset-manifest.json for authors, source URLs and original/generated hashes.\n')
    print(json.dumps({'runtimeBytes': total, 'models': [{'id': r['id'], 'bytes': r['output']['bytes'], **r['geometry']} for r in records]}, indent=2))


if __name__ == '__main__':
    main()
