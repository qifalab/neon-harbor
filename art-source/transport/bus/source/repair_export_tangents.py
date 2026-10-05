"""CPU export hygiene for degenerate tangent UVs on surfaces without a normal map.
Positions, normals, UVs, index data, materials and image bytes are never changed.
Refuse to substitute tangent directions on a normal-mapped primitive.
"""
from pathlib import Path
import struct,json,hashlib
import numpy as np
BASE=Path(__file__).resolve().parents[1]
def repair():
 rows=[]
 for path in sorted((BASE/'models').glob('serein-d11-lod*.glb')):
  data=bytearray(path.read_bytes());before=hashlib.sha256(data).hexdigest();jn=struct.unpack_from('<I',data,12)[0];g=json.loads(data[20:20+jn]);bin_start=20+jn+8;changed={}
  def array(i):
   a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];assert a['componentType']==5126
   n={'VEC3':3,'VEC4':4}[a['type']];return np.ndarray((a['count'],n),dtype='<f4',buffer=data,offset=bin_start+v.get('byteOffset',0)+a.get('byteOffset',0),strides=(v.get('byteStride',n*4),4))
  for mesh in g['meshes']:
   for p in mesh['primitives']:
    if 'TANGENT'not in p['attributes']:raise RuntimeError('Missing exported tangents must be fixed at authoring.')
    ta=p['attributes']['TANGENT'];t=array(ta);n=array(p['attributes']['NORMAL']);bad=np.linalg.norm(t[:,:3],axis=1)<.9
    if not bad.any():continue
    if 'normalTexture'in g['materials'][p['material']]:raise RuntimeError('Cannot repair a normal-mapped UV tangent with a fallback.')
    count=0
    for ix in np.flatnonzero(bad):
     normal=n[ix].astype(float);normal/=np.linalg.norm(normal);guide=np.array([1.,0.,0.])if abs(normal[0])<.85 else np.array([0.,1.,0.]);tangent=guide-normal*np.dot(normal,guide);tangent/=np.linalg.norm(tangent)
     t[ix]=[*tangent,1];count+=1
    changed[str(ta)]={'vertices':count,'surface':g['materials'][p['material']]['name'],'method':'normal-orthogonal tangent, only non-normal-mapped surface'}
  path.write_bytes(data);rows.append({'file':path.name,'beforeSha256':before,'afterSha256':hashlib.sha256(data).hexdigest(),'onlyTangentAccessorBytesChanged':True,'changed':changed})
 (BASE/'review/export-tangent-hygiene.json').write_text(json.dumps({'status':'CPU_EXPORT_CORRECTION_NOT_ART_VALIDATION','assets':rows},indent=2)+'\n')
 print('TANGENT_HYGIENE_NON_NORMAL_MAPPED_ONLY',sum(sum(x['vertices']for x in r['changed'].values())for r in rows))
if __name__=='__main__':repair()
