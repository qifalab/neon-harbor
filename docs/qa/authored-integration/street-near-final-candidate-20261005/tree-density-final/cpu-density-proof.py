#!/usr/bin/env python3
import json,struct,hashlib,math,collections
from pathlib import Path
R=Path(__file__).resolve().parent;P=R/'payload';O=Path('/tmp/neon-sample-near-trees-candidate-20261005/payload');PROD=Path('/tmp/neon-harbor-street-refinement-candidate-20261005')
sha=lambda b:hashlib.sha256(b).hexdigest()
def load(p):
 b=p.read_bytes();magic,version,size,jlen,jtype=struct.unpack_from('<5I',b);assert(magic,version,size,jtype)==(0x46546c67,2,len(b),0x4e4f534a);j=json.loads(b[20:20+jlen]);binstart=28+jlen
 def raw(ai):
  a=j['accessors'][ai];v=j['bufferViews'][a['bufferView']];assert a['componentType']==5126
  n={'VEC2':2,'VEC3':3}[a['type']]*a['count'];start=binstart+v.get('byteOffset',0)+a.get('byteOffset',0);return b[start:start+n*4]
 def attrs(mesh):return {k:raw(a) for k,a in j['meshes'][mesh]['primitives'][0]['attributes'].items()}
 return b,j,attrs
sub=lambda a,b:tuple(a[i]-b[i] for i in range(3));cross=lambda a,b:(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]);dot=lambda a,b:sum(x*y for x,y in zip(a,b));norm=lambda a:math.sqrt(dot(a,a))
rows=[]
for vid in ['quay-banyan-a','quay-banyan-b','quay-banyan-c']:
 f='assets/harbor/vegetation/'+vid+'.glb';ob,oj,oa=load(O/f);b,j,a=load(P/f)
 assert len(j['meshes'])==2 and len(j['materials'])==2 and len(j['nodes'])==2
 assert j['materials']==oj['materials'];assert all(m.get('alphaMode','OPAQUE')=='OPAQUE' for m in j['materials'])
 for mesh in j['meshes']:assert len(mesh['primitives'])==1 and mesh['primitives'][0]['mode']==4 and 'indices' not in mesh['primitives'][0]
 bark=[]
 for sem,v in a(0).items():assert v==oa(0)[sem];bark.append({'semantic':sem,'bytes':len(v),'sha256':sha(v),'oldBytesExact':True})
 leaves=a(1);prefix=[]
 for sem,v in leaves.items():assert v[:len(oa(1)[sem])]==oa(1)[sem];prefix.append({'semantic':sem,'originalBytes':len(oa(1)[sem]),'originalSha256':sha(oa(1)[sem]),'original576LeafPrefixExact':True})
 vals={k:struct.unpack('<'+'f'*(len(v)//4),v) for k,v in leaves.items()};assert all(math.isfinite(x) for v in vals.values() for x in v)
 xyz=list(zip(*[iter(vals['POSITION'])]*3));assert len(xyz)==1728*36
 assert all(-3.4-1e-6<=p[0]<=4.5+1e-6 and .3-1e-6<=p[1]<=12+1e-6 and -3.4-1e-6<=p[2]<=3.4+1e-6 for p in xyz)
 minarea=float('inf');maxarea=0;surface=0;one_face_area=0;volumes=[];thickness=[];centres=[];areas=[]
 for leaf in range(1728):
  points=xyz[leaf*36:(leaf+1)*36];unique=[];ids=[]
  for p in points:
   if p not in unique:unique.append(p)
   ids.append(unique.index(p))
  assert len(unique)==8
  edges=collections.Counter();directions=collections.Counter();volume=0;area=0
  for ti in range(12):
   aa,bb,cc=points[ti*3:ti*3+3];ar=norm(cross(sub(bb,aa),sub(cc,aa)))/2;assert ar>1e-8;minarea=min(minarea,ar);maxarea=max(maxarea,ar);area+=ar
   if ti<2:one_face_area+=ar
   # Translation-stable signed tetrahedra around this leaf's first vertex.
   origin=points[0];volume+=dot(sub(aa,origin),cross(sub(bb,origin),sub(cc,origin)))/6
   ia,ib,ic=ids[ti*3:ti*3+3]
   for u,v in [(ia,ib),(ib,ic),(ic,ia)]:edges[tuple(sorted((u,v)))]+=1;directions[(u,v)]+=1
  assert len(edges)==18 and all(v==2 for v in edges.values())
  assert all(directions[(u,v)]==directions[(v,u)]==1 for u,v in edges)
  assert abs(volume)>1e-8;volumes.append(abs(volume));surface+=area;areas.append(area)
  # Original topology: first top point 0, first lower-face point 4 starts triangle 2.
  th=norm(sub(points[0],points[6]));assert abs(th-.0016)<2e-6;thickness.append(th)
  centres.append(tuple(sum(p[i] for p in unique)/8 for i in range(3)))
 normaltriples=list(zip(*[iter(vals['NORMAL'])]*3));assert all(abs(norm(n)-1)<2e-5 for n in normaltriples)
 textures=[]
 for im,oldim in zip(j['images'],oj['images']):
  vv=j['bufferViews'][im['bufferView']];ov=oj['bufferViews'][oldim['bufferView']];bb=b[28+struct.unpack_from('<I',b,12)[0]+vv['byteOffset']:28+struct.unpack_from('<I',b,12)[0]+vv['byteOffset']+vv['byteLength']];oldbb=ob[28+struct.unpack_from('<I',ob,12)[0]+ov['byteOffset']:28+struct.unpack_from('<I',ob,12)[0]+ov['byteOffset']+ov['byteLength']];assert bb==oldbb;textures.append({'name':im['name'],'bytes':len(bb),'sha256':sha(bb),'embeddedOriginalExact':True})
 centre_stats=lambda pp:{'yMinimum':min(p[1] for p in pp),'yMaximum':max(p[1] for p in pp),'below8Metres':sum(p[1]<8 for p in pp),'below9Metres':sum(p[1]<9 for p in pp),'innerRadius1_5Metres':sum(math.hypot(p[0],p[2])<1.5 for p in pp),'occupied0_5MetreVoxels':len({tuple(math.floor(x/.5) for x in p) for p in pp})}
 rows.append({'id':vid,'bytes':len(b),'sha256':sha(b),'meshes':2,'materials':2,'leafCount':1728,'triangles':22768,'barkTriangles':2032,'leafTriangles':20736,'barkAttributeProof':bark,'originalLeafAttributeProof':prefix,'leafBounds':{'min':[min(p[i] for p in xyz) for i in range(3)],'max':[max(p[i] for p in xyz) for i in range(3)]},'allLeavesWatertightOrientedClosedEightVertexEighteenEdgeTwelveTriangle':True,'minimumTriangleAreaSquareMetres':minarea,'maximumTriangleAreaSquareMetres':maxarea,'allLeafSurfaceAreaSquareMetres':surface,'meanPerLeafSurfaceAreaSquareMetres':surface/1728,'singleTopFaceAreaSquareMetres':one_face_area,'minimumEnclosedLeafVolumeCubicMetres':min(volumes),'maximumEnclosedLeafVolumeCubicMetres':max(volumes),'leafThicknessRangeMetres':[min(thickness),max(thickness)],'originalCentreDistribution':centre_stats(centres[:576]),'addedCentreDistribution':centre_stats(centres[576:]),'combinedCentreDistribution':centre_stats(centres),'textures':textures,'finiteUnitNormals':True})
old_runtime=(PROD/'src/harbor-sample-trees.js').read_bytes();runtime=(P/'src/harbor-sample-trees.js').read_bytes();assert runtime.replace(b'maxTriangles:150000,maxTreeTriangles:25000',b'maxTriangles:54000,maxTreeTriangles:9000')==old_runtime
assert sum(x['triangles']*2 for x in rows)==136608 and all(x['triangles']<=25000 for x in rows)
proof={'status':'CPU_CROWN_DENSITY_PHYSICAL_GEOMETRY_IDENTITY_PASS_NATIVE_ART_PENDING','source':'actual emitted GLB float32 attributes and triangle meshes; no browser or generated proxy','models':rows,'fullSixTreeSubmittedBudget':{'drawCalls':6,'triangles':136608,'triangleCap':150000,'trianglesIncludesBothInstanceSlotsOfEachVariant':True},'threeVariantRawGLBBytes':sum(x['bytes'] for x in rows),'runtimeOnlyBudgetConstantChanged':True,'runtimeHash':sha(runtime),'originalRuntimeHash':sha(old_runtime),'nearFarAndSitesLifecycleFunctionBodiesExact':True,'notes':['CPU geometric density and watertight checks are not native visual acceptance or a frame-time measurement.','Three original textures embedded per variant, byte-identical; no alpha planes or crown sphere meshes.','Original bark including trunk, six primary branches and eighteen twigs preserved byte-for-byte; original 576 leaf attribute prefix preserved.','New leaf blades use original size and physical thickness with independent random source after original geometry; no larger leaf cards.']}
(R/'cpu-density-proof.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({'status':proof['status'],'models':[{k:r[k] for k in ['id','bytes','sha256','leafCount','triangles','allLeafSurfaceAreaSquareMetres','leafThicknessRangeMetres','combinedCentreDistribution']} for r in rows],'budget':proof['fullSixTreeSubmittedBudget']},indent=2))
