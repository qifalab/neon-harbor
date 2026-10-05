#!/usr/bin/env python3
"""Read exact isolated outputs; constrain every changed accessor to band meshes."""
import datetime
import hashlib
import json
from pathlib import Path
import struct
import numpy as np

ROOT = Path(__file__).resolve().parent
ORIGINAL = Path('/workspace/neon-candidates/harbor-material-lighting-final-20261005')

def read_glb(path):
    data = path.read_bytes()
    size = struct.unpack_from('<I',data,12)[0]
    document = json.loads(data[20:20+size])
    binary = data[28+size:]
    def array(index):
        a = document['accessors'][index]
        v = document['bufferViews'][a['bufferView']]
        width = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']]
        dtype = np.dtype({5126:'<f4',5123:'<u2',5125:'<u4',5121:'u1'}[a['componentType']])
        offset = v.get('byteOffset',0)+a.get('byteOffset',0)
        return np.ndarray((a['count'],width),dtype=dtype,buffer=binary,offset=offset,
            strides=(v.get('byteStride',width*dtype.itemsize),dtype.itemsize)).copy()
    def image(index):
        v = document['bufferViews'][document['images'][index]['bufferView']]
        return binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
    return data,document,array,image

tiers=[]
for tier in range(3):
    name=f'vesper-t9-lod{tier}.glb'
    control=ROOT/'control-original-recipe/models'/name
    corrected=ROOT/'corrected-recipe/models'/name
    original=ORIGINAL/'assets/harbor/transport/tram'/name
    old,doc,a,image=read_glb(control)
    new,new_doc,new_a,new_image=read_glb(corrected)
    assert old==original.read_bytes(),'Control must reproduce original runtime GLB byte for byte'
    assert doc==new_doc,'Unexpected glTF metadata, node, hook, material, transform or accessor layout change'
    assert len(old)==len(new)
    changed=[];unchanged=[]
    for mesh_index,mesh in enumerate(doc['meshes']):
        for primitive_index,p in enumerate(mesh['primitives']):
            assert np.array_equal(a(p['indices']),new_a(p['indices'])),'Index/topology changed'
            delta=[]
            for attribute,index in p['attributes'].items():
                before=a(index);after=new_a(index)
                if np.array_equal(before,after):
                    continue
                rows=np.flatnonzero(np.any(before!=after,axis=1))
                pos_before=a(p['attributes']['POSITION'])[rows]
                pos_after=new_a(p['attributes']['POSITION'])[rows]
                for values in (pos_before,pos_after):
                    assert np.all((values[:,1]>=2.549999)&(values[:,1]<=3.088001)),'Changed vertex outside intended height band'
                    assert np.all((np.abs(values[:,0])>1)|(np.abs(values[:,2])>4)),'Changed vertex outside intended side/end surfaces'
                delta.append({'attribute':attribute,'accessor':index,'changedRows':len(rows),
                    'oldAffectedPositionMin':pos_before.min(axis=0).tolist(),
                    'oldAffectedPositionMax':pos_before.max(axis=0).tolist(),
                    'newAffectedPositionMin':pos_after.min(axis=0).tolist(),
                    'newAffectedPositionMax':pos_after.max(axis=0).tolist()})
            node_names=[node['name'] for node in doc['nodes'] if node.get('mesh')==mesh_index]
            if delta:
                expected=f'LOD{tier}-tram-detail-{tier}-'+('paintFar' if tier==2 else 'paint')+'-batch'
                assert node_names==[expected],'Any non-band/root paint batch changed'
                changed.append({'mesh':mesh_index,'nodeNames':node_names,'primitive':primitive_index,'changedAttributes':delta})
            else:
                unchanged.append({'mesh':mesh_index,'nodeNames':node_names,'primitive':primitive_index})
    assert len(changed)==1,'Expected one existing paint-root primitive, no new draw'
    images=[{'index':i,'sha256':hashlib.sha256(image(i)).hexdigest(),'bytes':len(image(i)),
        'exactlyUnchanged':image(i)==new_image(i)} for i in range(len(doc.get('images',[])))]
    assert all(row['exactlyUnchanged'] for row in images)
    tiers.append({'tier':tier,'originalGLBPath':str(original),'controlReproducesOriginalExactly':True,
        'originalSHA256':hashlib.sha256(old).hexdigest(),'correctedSHA256':hashlib.sha256(new).hexdigest(),
        'bytesUnchanged':len(new),'entireGlTFJSONMetadataExactlyUnchanged':True,
        'allIndicesTopologyExactlyUnchanged':True,'allNodeTransformsHookPositionsMaterialsExactlyUnchanged':True,
        'changedPrimitives':changed,'unchangedPrimitives':unchanged,'embeddedImages':images})

proof={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope':'Actual original/control/corrected three GLBs; all accessor changes bounded to existing upper saloon side/end spandrels/corner band; no renderer or visual/native journey pass',
    'actualGPUExecuted':False,'originalAssetsMutated':False,'rootSourceMutated':False,
    'tiers':tiers,'allThreeControlExportsByteReproduceOriginal':True,
    'noAdditionalPrimitivesTrianglesMaterialsTexturesHooksOrPhysics':True}
(ROOT/'actual-export-comparison-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({'threeOriginalControlExportsExact':True,'changedPrimitives':[(t['tier'],t['changedPrimitives']) for t in tiers],
    'imageBytesAllExact':True},indent=2))
