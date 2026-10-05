#!/usr/bin/env python3
"""Record actual packed bytes and the original/CC0 source split."""
from pathlib import Path
from hashlib import sha256
import json
ROOT=Path(__file__).resolve().parents[1]
dest=ROOT/'assets/harbor/home/asset-manifest.json'
manifest=json.loads(dest.read_text());manifest['models']=[m for m in manifest['models'] if m['id'] in ['sofa_03','old_bed_frame']]
def final_paths(value):
    if isinstance(value,dict): return {key:final_paths(item) for key,item in value.items()}
    if isinstance(value,list): return [final_paths(item) for item in value]
    if isinstance(value,str) and value.startswith('evidence/'):
        return 'docs/qa/authored-home/'+value.removeprefix('evidence/')
    return value
textures=final_paths([json.loads((ROOT/'docs/qa/authored-home/acquisition/wood-planks-verified.json').read_text()),json.loads((ROOT/'docs/qa/authored-home/acquisition/linen/verified-textures.json').read_text())])
for source in textures[1]['files']:
    source['path']='docs/qa/authored-home/acquisition/linen/'+source['filename']
for floor in ['lobby','gallery']:
 r=json.loads((ROOT/f'docs/qa/authored-home/authored-source/home-{floor}-fittings.json').read_text())
 src=[{'path':'tools/create-authored-home-glbs.mjs','role':'Original metric mesh authoring / batched three-tier GLB exporter'},
      {'path':'src/harbor-home-authored.js','role':'Original matching occupied furniture footprints and unchanged room/core planning'},
      {'path':'tools/create-home-label-atlas.py','role':'Original domestic text/print artwork; font files not redistributed'}]
 for s in src:
  b=(ROOT/s['path']).read_bytes();s.update(bytes=len(b),sha256=sha256(b).hexdigest())
 manifest['models'].append({'id':r['id'],'license':'MIT for original geometry/print artwork; CC0-1.0 for embedded acquired wood/cotton maps',
  'originalLicensePath':'assets/harbor/home/LICENSE-NEON-AUTHORED.txt','authors':{'Neon Harbor contributors':'Original metric modelling, domestic arrangement, prints and three tiers'},
  'sources':src,'embeddedTextureSources':textures if floor=='lobby' else textures[:1],
  'output':r['output'],'geometry':{'triangles':r['totalPackedTriangles'],'primitives':r['meshCount'],'materials':r['materialCount'],'skins':0,'animations':0},
  'tiers':r['tiers'],'textureProcessing':'None on official JPEGs; new original PNG print atlas created from text/vector artwork',
  'geometryProcessing':'Original geometry with individual edged panels, open frames, lathed bowls and soft folded bedding; batched by tier/material'})
manifest.update(version=1,scope='south-079 original four rooms on two unchanged adjacent floors; native art/walking unaccepted',
 license='Mixed MIT original geometry/print artwork and CC0-1.0 acquired official geometry/textures',runtimeBytes=sum(m['output']['bytes']for m in manifest['models']),
 runtimeBudget={'totalByteLimit':12000000,'triangleLimit':150000,'mainColourPassMeshLimit':35,'scope':'Whole authored two-floor dwelling, including both official models; actual GPU overhead unmeasured'},
 officialTextureSources=textures)
dest.write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n');print(manifest['runtimeBytes'])
