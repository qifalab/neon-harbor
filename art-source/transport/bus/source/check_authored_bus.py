"""Bounded CPU checks of the three candidate files only; no world, browser or GPU."""
from pathlib import Path
import struct,json,hashlib,math,time
import numpy as np
BASE=Path(__file__).resolve().parents[1]
L=json.loads((BASE/'source/runtime-interface-baseline.json').read_bytes())['layout']
DT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
W={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def sha(b):return hashlib.sha256(b).hexdigest()
def read_glb(path):
 b=path.read_bytes();magic,version,length=struct.unpack_from('<III',b)
 assert magic==0x46546c67 and version==2 and length==len(b)
 at=12;chunks={}
 while at<len(b):
  n,t=struct.unpack_from('<II',b,at);chunks[t]=b[at+8:at+8+n];at+=8+n
 g=json.loads(chunks[0x4e4f534a]);data=chunks[0x004e4942]
 assert not any('uri'in v for v in g.get('buffers',[]))
 assert not any('uri'in v for v in g.get('images',[]))
 def accessor(i):
  a=g['accessors'][i];view=g['bufferViews'][a['bufferView']];dtype=np.dtype(DT[a['componentType']]);width=W[a['type']]
  offset=view.get('byteOffset',0)+a.get('byteOffset',0);stride=view.get('byteStride',width*dtype.itemsize)
  return np.ndarray((a['count'],width),dtype=dtype,buffer=data,offset=offset,strides=(stride,dtype.itemsize)).copy()
 return b,g,accessor

def matrix(n,openness=0):
 if 'matrix'in n:return np.array(n['matrix'],float).reshape(4,4,order='F')
 x,y,z,w=n.get('rotation',(0,0,0,1));s=n.get('scale',(1,1,1))
 r=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
             [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
             [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
 m=np.eye(4);m[:3,:3]=r@np.diag(s);m[:3,3]=n.get('translation',(0,0,0))
 if 'closedZ'in n.get('extras',{}):m[2,3]=n['extras']['closedZ']+n['extras']['slide']*openness
 return m

def world_triangles(g,a,openness=0):
 blocks=[]
 def visit(i,parent):
  n=g['nodes'][i];m=parent@matrix(n,openness)
  if 'mesh'in n:
   for p in g['meshes'][n['mesh']]['primitives']:
    pos=a(p['attributes']['POSITION']).astype(float);pos=pos@m[:3,:3].T+m[:3,3]
    ix=a(p['indices']).reshape(-1);blocks.append(pos[ix].reshape(-1,3,3))
  for j in n.get('children',[]):visit(j,m)
 for root in g['scenes'][g.get('scene',0)]['nodes']:visit(root,np.eye(4))
 return np.concatenate(blocks)

def ray_hits(tri,origin,axis,end):
 # Axis-aligned analytic triangle intersections. Broadphase keeps this CPU proof small.
 p=np.array(origin);other=[k for k in range(3)if k!=axis]
 mask=np.ones(len(tri),bool)
 for k in other:mask&=(tri[:,:,k].min(1)-1e-7<=p[k])&(tri[:,:,k].max(1)+1e-7>=p[k])
 t=tri[mask]
 if not len(t):return []
 u,v=other;a=t[:,0];b=t[:,1];c=t[:,2]
 d=(b[:,u]-a[:,u])*(c[:,v]-a[:,v])-(b[:,v]-a[:,v])*(c[:,u]-a[:,u])
 keep=np.abs(d)>1e-11;a,b,c,d=a[keep],b[keep],c[keep],d[keep]
 alpha=((p[u]-a[:,u])*(c[:,v]-a[:,v])-(p[v]-a[:,v])*(c[:,u]-a[:,u]))/d
 beta=((b[:,u]-a[:,u])*(p[v]-a[:,v])-(b[:,v]-a[:,v])*(p[u]-a[:,u]))/d
 coord=a[:,axis]+alpha*(b[:,axis]-a[:,axis])+beta*(c[:,axis]-a[:,axis])
 good=(alpha>=-1e-7)&(beta>=-1e-7)&(alpha+beta<=1+1e-7)
 low,high=sorted((p[axis],end));good&=(coord>low+1e-6)&(coord<high-1e-6)
 return coord[good].tolist()

started=time.monotonic();report={'status':'CPU_ONLY_NATIVE_REVIEW_PENDING','scope':'three authored GLBs and immutable original bus layout; not a city/test/browser run','tiers':[],'issues':[]}
for tier in range(3):
 path=BASE/'models'/f'serein-d11-lod{tier}.glb';b,g,a=read_glb(path)
 triangles=0;attributes=set();bad=[]
 for i,m in enumerate(g['meshes']):
  for p in m['primitives']:
   assert p.get('mode',4)==4
   attributes|=set(p['attributes']);indices=a(p['indices']).reshape(-1);triangles+=len(indices)//3
   assert len(indices)%3==0 and indices.max()<len(a(p['attributes']['POSITION']))
   for name,accessor in p['attributes'].items():
    data=a(accessor);assert np.isfinite(data).all(),(tier,name)
    if name in('NORMAL','TANGENT'):
     norms=np.linalg.norm(data[:,:3],axis=1)
     if np.any(norms<.90):bad.append({'mesh':m.get('name',i),'attribute':name,'nonUnitCount':int((norms<.90).sum())})
   if 'TANGENT'not in p['attributes']:report['issues'].append(f'LOD{tier} primitive lacks tangent: {m.get("name",i)}')
 names=[n.get('name','')for n in g['nodes']]
 for d in L['doors']:
  assert names.count(d['id'])==1
  node=g['nodes'][names.index(d['id'])]
  assert len(node['children'])==2
  for child in node['children']:assert all(k in g['nodes'][child]['extras']for k in('closedZ','slide'))
 for name in('wheel-front--1','wheel-front-1','wheel-rear--1','wheel-rear-1'):assert names.count(name)==1
 assert f'bus-detail-{tier}'in names
 bounds=[];portal=[]
 for openness in(0,.5,1):
  tri=world_triangles(g,a,openness);lo=tri.min((0,1));hi=tri.max((0,1))
  bounds.append({'doorOpenness':openness,'min':lo.tolist(),'max':hi.tolist()})
  if not(np.all(lo>=np.array([-1.275,0,-5.5])-2e-6)and np.all(hi<=np.array([1.275,4.4,5.5])+2e-6)):
   report['issues'].append(f'LOD{tier} envelope at door openness{openness}')
  if openness in(0,1):
   for door in L['doors']:
    for dz in(-.22,0,.22):
     for dy in(.25,.95,1.79):
      origin=(door['outside']['x'],door['sillY']+dy,door['z']+dz)
      hits=ray_hits(tri,origin,0,0)
      row={'doorId':door['id'],'open':bool(openness),'dz':dz,'heightAboveFloor':dy,'hitCount':len(hits)};portal.append(row)
      if openness==1 and hits:report['issues'].append(f'LOD{tier} open portal obstruction {row}')
 # Identical whole stairs/seat/door hooks independent of the visible LOD choice.
 expected_hooks={f'hook-{s["id"]}'for s in L['seats']}|{f'hook-stair-{x}'for x in('bottom-landing','first-tread','last-tread','top-landing')}
 assert expected_hooks.issubset(set(names))
 heads=[];treads=[]
 if tier<2:
  stair=L['stairs'][0];tri=world_triangles(g,a,0)
  for i in range(37):
   u=i/36;z=stair['startZ']+(stair['endZ']-stair['startZ'])*u;y=stair['fromY']+stair['rise']*u
   for dx in(-.22,0,.22):
    hits=ray_hits(tri,(stair['x']+dx,y+.30,z),1,y+1.79)
    if hits:heads.append({'fraction':u,'dx':dx,'hits':hits[:5]})
  for i in range(12):
   u=(i+.5)/12;z=stair['startZ']+(stair['endZ']-stair['startZ'])*u;y=stair['fromY']+stair['rise']*(i+1)/12
   hits=ray_hits(tri,(stair['x'],y+.25,z),1,y-.1);near=[h for h in hits if abs(h-y)<.007]
   treads.append({'tread':i,'expectedY':y,'nearExpectedHits':len(near)})
   if not near:report['issues'].append(f'LOD{tier} missing thin tread {i}')
  if heads:report['issues'].append(f'LOD{tier} stair standing-head obstruction ({len(heads)} samples)')
 for item in bad:report['issues'].append(f'LOD{tier} invalid direction attribute {item}')
 report['tiers'].append({'tier':tier,'file':path.name,'bytes':len(b),'sha256':sha(b),'triangles':triangles,'materialCount':len(g['materials']),
   'primitiveCount':sum(len(m['primitives'])for m in g['meshes']),'attributes':sorted(attributes),'imagesEmbedded':len(g.get('images',[])),
   'externalUris':0,'extensionsRequired':g.get('extensionsRequired',[]),'bounds':bounds,'portalSamples':portal,
   'stairHeadHitSamples':heads,'treadSamples':treads,'canonicalHooks':len(expected_hooks),'unitDirectionIssues':bad})
report['totalGlbBytes']=sum(t['bytes']for t in report['tiers']);report['wallSeconds']=time.monotonic()-started
report['budgetChecks']={'nearTrianglesAtMost120k':report['tiers'][0]['triangles']<=120000,'eachModelMaterialsAtMost16':all(t['materialCount']<=16 for t in report['tiers']),
 'threeGlbPayloadAtMost12MBDecimal':report['totalGlbBytes']<=12000000,'nearPayloadAtMost12MBDecimal':report['tiers'][0]['bytes']<=12000000}
report['staticChecksPassed']=not report['issues']and all(report['budgetChecks'].values())
(BASE/'review/cpu-asset-check.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':report['status'],'staticChecksPassed':report['staticChecksPassed'],'tiers':[(t['tier'],t['triangles'],t['materialCount'],t['bytes'])for t in report['tiers']],
 'totalGlbBytes':report['totalGlbBytes'],'wallSeconds':report['wallSeconds'],'issues':report['issues'][:12],'issueCount':len(report['issues'])},indent=2))
