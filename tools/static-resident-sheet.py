"""Low-cost orthographic geometry/UV diagnostic, not a game screenshot."""
from pathlib import Path
import json,numpy as np,argparse
from PIL import Image,ImageDraw
parser=argparse.ArgumentParser();parser.add_argument('--role',choices=['worker','commuter','shopkeeper'],default='worker');role=parser.parse_args().role
ROOT=Path(__file__).resolve().parents[1];P=ROOT/('art-source/near-resident/editable' if role=='worker' else f'art-source/near-resident/editable-{role}');g=json.loads((P/f'{role}.gltf').read_text());b=(P/f'{role}.bin').read_bytes();manifest=json.loads((ROOT/f'assets/resident/core-{role}/manifest.json').read_text())
def access(i):
 a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];typ={5126:'<f4',5123:'<u2'}[a['componentType']];w={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];return np.frombuffer(b,dtype=typ,count=a['count']*w,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,w)
items=[]
for mesh in g['meshes']:
 p=mesh['primitives'][0];a=p['attributes'];position=access(a['POSITION']);tri=access(p['indices']).reshape(-1,3);uv=access(a['TEXCOORD_0']);mat=g['materials'][p['material']];index=mat['pbrMetallicRoughness']['baseColorTexture']['index'];im=Image.open(P/g['images'][g['textures'][index]['source']]['uri']).convert('RGBA');pixels=np.asarray(im);tex=np.clip(uv[tri].mean(axis=1),0,1);xy=(tex*np.array([im.width-1,im.height-1])).astype(int);color=pixels[xy[:,1],xy[:,0]].copy();factor=mat['pbrMetallicRoughness'].get('baseColorFactor',[1,1,1,1]);color[:,:3]=(color[:,:3]*np.array(factor[:3])**(1/2.2)).astype('uint8');items.append((position[tri],color))
image=Image.new('RGB',(1500,1100),(219,216,207));draw=ImageDraw.Draw(image)
for column,(angle,title) in enumerate([(0,'FRONT'),(-.65,'THREE QUARTER'),(-np.pi/2,'PROFILE')]):
 c,s=np.cos(angle),np.sin(angle);rot=np.array([[c,0,s],[0,1,0],[-s,0,c]]);polygons=[]
 for tris,colors in items:
  p=tris@rot.T;norm=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);norm/=np.maximum(np.linalg.norm(norm,axis=1)[:,None],1e-9)
  # Diagnostic light only: no game atmosphere, shadows, exposure or AO.
  illumination=.45+.55*np.clip(norm@np.array([-.3,.5,.8]),0,1)
  for face,color,value in zip(p,colors,illumination):
   if color[3]<115:continue
   screen=[(float(column*500+250+x*475),float(1000-y*475)) for x,y,z in face]
   polygons.append((face[:,2].mean(),screen,tuple(int(x) for x in np.clip(color[:3]*value,0,255))))
 for depth,face,color in sorted(polygons,key=lambda p:p[0]):draw.polygon(face,fill=color)
 draw.text((column*500+165,50),title,fill=(35,47,42));draw.line([(column*500+40,1000),(column*500+460,1000)],fill=(110,115,104),width=2)
draw.text((40,1055),f'CC0 core {role} | {manifest["triangles"]:,} triangles / 71 bones / 4 materials | STATIC DIAGNOSTIC, NOT NATIVE HIGH',fill=(35,47,42));out=ROOT/f'docs/static-core-{role}.png';image.save(out);print(out)
