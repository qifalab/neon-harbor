#!/usr/bin/env python3
"""Original light-weight conversion of pinned CC0 MakeHuman core art.
Parses documented OBJ/MHCLO data; no MakeHuman application code is included.
Produces editable glTF + runtime GLB, 4 materials and a reduced 71-bone FK rig.
"""
from pathlib import Path
import json, math, re, struct, hashlib, io, argparse
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--role',choices=['worker','commuter','shopkeeper'],default='worker');role=parser.parse_args().role
config={'worker':{'macro':'asian-male-young','wardrobe':'male_worksuit01','hair':'short01','skin':'young_asian_male','skinFile':'young_lightskinned_male_diffuse3','file':'worker'},'commuter':{'macro':'asian-male-young','wardrobe':'male_casualsuit03','hair':'short01','skin':'young_asian_male','skinFile':'young_lightskinned_male_diffuse3','file':'commuter'},'shopkeeper':{'macro':'asian-female-young','wardrobe':'female_elegantsuit01','hair':'bob02','skin':'young_asian_female','skinFile':'young_lightskinned_female_diffuse3','file':'shopkeeper'}}[role]
SOURCE=ROOT/'art-source/near-resident/source'; OUTPUT=ROOT/('art-source/near-resident/editable' if role=='worker' else f'art-source/near-resident/editable-{role}'); RUNTIME=ROOT/f'assets/resident/core-{role}'; OUTPUT.mkdir(parents=True,exist_ok=True); RUNTIME.mkdir(parents=True,exist_ok=True)

def obj(path):
 vertices=[];uv=[];faces=[];groups=[];group='body'
 for line in path.read_text().splitlines():
  s=line.split()
  if not s:continue
  if s[0]=='v':vertices.append(list(map(float,s[1:4])))
  elif s[0]=='vt':uv.append(list(map(float,s[1:3])))
  elif s[0]=='g':group=' '.join(s[1:])
  elif s[0]=='f':
   faces.append([(int(p.split('/')[0])-1,int(p.split('/')[1])-1) for p in s[1:]]);groups.append(group)
 return {'vertices':np.asarray(vertices,dtype=np.float64),'uv':np.asarray(uv,dtype=np.float64),'faces':faces,'groups':groups}

def mhclo(path):
 refs=[];coeff=[];offsets=[];scales={};deletes=set();mode=None
 for line in path.read_text().splitlines():
  s=line.split()
  if not s or s[0].startswith('#'):continue
  if s[0] in ['x_scale','y_scale','z_scale']:scales['xyz'.index(s[0][0])]=(int(s[1]),int(s[2]),float(s[3]));continue
  if s[0]=='verts':mode='verts';continue
  if s[0]=='delete_verts':mode='delete';continue
  if mode=='verts' and s[0].lstrip('-').isdigit():
   if len(s)==1:refs.append([int(s[0])]*3);coeff.append([1,0,0]);offsets.append([0,0,0])
   else:refs.append(list(map(int,s[:3])));coeff.append(list(map(float,s[3:6])));offsets.append(list(map(float,s[6:9])))
  elif mode=='delete':
   for a,b in re.findall(r'(\d+)(?:\s+-\s+(\d+))?',line):deletes.update(range(int(a),int(b or a)+1))
 return np.asarray(refs),np.asarray(coeff),np.asarray(offsets),scales,deletes

base=obj(SOURCE/'makehuman/data/3dobjs/base.obj');body=base['vertices'].copy()
for line in (SOURCE/f"makehuman/data/targets/macrodetails/{config['macro']}.target").read_text().splitlines():
 if line and not line.startswith('#'):
  s=line.split();body[int(s[0])]+=np.asarray(list(map(float,s[1:4])))
rig=json.loads((SOURCE/'makehuman/data/rigs/default.mhskel').read_text());oldBones=rig['bones'];oldWeights=json.loads((SOURCE/'makehuman/data/rigs/default_weights.mhw').read_text())['weights']
keep={'root','head','jaw',*[f'spine0{i}' for i in range(1,6)],*[f'neck0{i}' for i in range(1,4)]}
for side in ['L','R']:
 for name in ['clavicle','shoulder01','upperarm01','lowerarm01','wrist','pelvis','upperleg01','lowerleg01','foot','eye','toe1-1']:
  keep.add(f'{name}.{side}')
 for finger in range(1,6):
  for segment in range(1,4):keep.add(f'finger{finger}-{segment}.{side}')
 for finger in range(1,5):keep.add(f'metacarpal{finger}.{side}')
assert len(keep)==71

def ancestor(name):
 while name not in keep and name is not None:name=oldBones[name]['parent']
 return name
parents={name:ancestor(oldBones[name]['parent']) for name in keep}
# Bones are topologically ordered. Bind axes remain world axes, supporting the
# existing +Z-forward character FK API after an offline relaxed standing pose.
names=[]
while len(names)<len(keep):
 names.extend(sorted(name for name in keep if name not in names and (parents[name] is None or parents[name] in names)))
positions={name:np.mean(body[rig['joints'][oldBones[name]['head']]],axis=0) for name in names}
tails={name:np.mean(body[rig['joints'][oldBones[name]['tail']]],axis=0) for name in names}
weights=np.zeros((len(body),len(names)),dtype=np.float64)
for name,entries in oldWeights.items():
 dest=ancestor(name)
 if dest is None:dest='root'
 for vertex,weight in entries:weights[vertex,names.index(dest)]+=weight
weights/=weights.sum(axis=1)[:,None]

wardrobes=[('workwear',SOURCE/f"core-pack/clothes/{config['wardrobe']}/{config['wardrobe']}.obj",SOURCE/f"core-pack/clothes/{config['wardrobe']}/{config['wardrobe']}.mhclo",1),('shoes',SOURCE/'core-pack/clothes/shoes02/shoes02.obj',SOURCE/'core-pack/clothes/shoes02/shoes02.mhclo',1),('hair',SOURCE/f"core-pack/hair/{config['hair']}/{config['hair']}.obj",SOURCE/f"core-pack/hair/{config['hair']}/{config['hair']}.mhclo",2),('eyes',SOURCE/'makehuman/data/eyes/high-poly/high-poly.obj',SOURCE/'makehuman/data/eyes/high-poly/high-poly.mhclo',3)]
meshes=[];delete=set()
for name,op,mp,material in wardrobes:
 mesh=obj(op);refs,c,offset,scale,hidden=mhclo(mp)
 assert len(refs)==len(mesh['vertices']),(name,len(refs),len(mesh['vertices']))
 factors=np.ones(3)
 for axis,(a,b,length) in scale.items():factors[axis]=abs(body[a,axis]-body[b,axis])/length
 mesh['vertices']=(body[refs]*c[:,:,None]).sum(axis=1)+offset*factors
 # Some published barycentric fits contain tiny negative coefficients. Clamp
 # only the inherited skin weights; preserve signed geometric interpolation.
 wc=np.maximum(c,0);wc/=wc.sum(axis=1)[:,None]
 mesh['weights']=(weights[refs]*wc[:,:,None]).sum(axis=1)
 mesh.update(name=name,material=material);meshes.append(mesh);delete.update(hidden)
base['vertices']=body;base['weights']=weights;base.update(name='skin',material=0)
selected=[i for i,g in enumerate(base['groups']) if g=='body' and not any(v in delete for v,t in base['faces'][i])]
base['faces']=[base['faces'][i] for i in selected];base['groups']=['body']*len(selected);meshes.insert(0,base)
# Reduce the original angled arm pose to relaxed arms before rebinding. Real
# anatomical mesh, fingers, skin weights and garment folds are preserved.
transforms={}
for name in names:
 parent=parents[name]
 local=np.eye(4);local[:3,3]=positions[name]-(positions[parent] if parent else 0)
 if name.startswith(('upperarm01.','lowerarm01.')):
  parentRotation=transforms[parent][:3,:3] if parent else np.eye(3)
  side=1 if name.endswith('.L') else -1
  endpoint=positions[f'lowerarm01.{name[-1]}'] if name.startswith('upperarm') else positions[f'wrist.{name[-1]}']
  current=parentRotation@(endpoint-positions[name]);current/=np.linalg.norm(current)
  desired=np.array([side*.156,-.986,.015 if name.startswith('upperarm') else .055]);desired/=np.linalg.norm(desired)
  axis=np.cross(current,desired);cosine=float(np.dot(current,desired));sin2=float(np.dot(axis,axis))
  cross=np.array([[0,-axis[2],axis[1]],[axis[2],0,-axis[0]],[-axis[1],axis[0],0]])
  adjustment=np.eye(3)+cross+cross@cross*((1-cosine)/sin2) if sin2>1e-12 else np.eye(3)
  local[:3,:3]=parentRotation.T@adjustment@parentRotation
 world=transforms[parent]@local if parent else local
 transforms[name]=world
bind=np.zeros((len(names),4,4))
for i,name in enumerate(names):
 inv=np.eye(4);inv[:3,3]=-positions[name];bind[i]=transforms[name]@inv
newPositions={name:transforms[name][:3,3] for name in names}
for mesh in meshes:
 p=np.column_stack([mesh['vertices'],np.ones(len(mesh['vertices']))]);moved=np.zeros((len(p),3))
 for i in range(len(names)):
  active=mesh['weights'][:,i]>0
  if active.any():moved[active]+=(p[active]@bind[i].T)[:,:3]*mesh['weights'][active,i,None]
 mesh['vertices']=moved
# Physical height is measured from visible anatomical vertices. Foot sole is
# then placed at world Y=0; the game's existing 1.8 m collider is unchanged.
visibleHeights=[mesh['vertices'][sorted({v for face in mesh['faces'] for v,t in face}),1] for mesh in meshes]
top=max(h.max() for h in visibleHeights);sole=min(h.min() for h in visibleHeights)
scale=1.78/(top-sole)
for mesh in meshes:mesh['vertices']*=scale;mesh['vertices'][:,1]-=sole*scale
for name in names:newPositions[name]=newPositions[name]*scale-np.array([0,sole*scale,0])
# The female core skirt's published deletion mask leaves tiny hidden thigh
# patches at its fitted hem. Trim only body faces completely above the actual
# garment hem in the clothed thigh band; retain the exposed calf geometry.
if role=='shopkeeper':
 garment=next(mesh for mesh in meshes if mesh['name']=='workwear')
 hem=min(garment['vertices'][v,1] for face in garment['faces'] for v,t in face)
 legColumns=[i for i,name in enumerate(names) if name.startswith(('upperleg01.', 'lowerleg01.', 'pelvis.'))]
 legInfluence=base['weights'][:,legColumns].sum(axis=1)
 # Hands can pass the same height/X band; exclude them anatomically.
 base['faces']=[face for face in base['faces'] if not (all(legInfluence[v]>.8 for v,t in face)
  and all(base['vertices'][v,1]>hem+.004 for v,t in face)
  and all(abs(base['vertices'][v,0])<.23 for v,t in face)
  and np.mean([base['vertices'][v,1] for v,t in face])<1.02)]


# Local, deliberately modest texture budgets. Wardrobe and shoes share one
# atlas/material; packed ORM stores roughness variation separately from color.
def image(path,size,mode='RGB'):return Image.open(path).convert(mode).resize(size,Image.Resampling.LANCZOS)
def save(im,name):
 if role!='worker' and name in ['skin-basecolor.png','wardrobe-basecolor.png']:
  name=name.replace('.png','.jpg');im.convert('RGB').save(OUTPUT/name,quality=92,subsampling=0,optimize=True)
 else:im.save(OUTPUT/name,optimize=True)
 return name
skin=image(SOURCE/f"core-pack/skins/{config['skin']}/{config['skinFile']}.png",(1024,1024));skinName=save(skin,'skin-basecolor.png')
cloth=image(SOURCE/f"core-pack/clothes/{config['wardrobe']}/{config['wardrobe']}_diffuse.png",(1024,1024))
shoe=image(SOURCE/'core-pack/clothes/shoes02/shoes02_diffuse.png',(1024,1024))
atlas=Image.new('RGB',(1024,2048));atlas.paste(cloth,(0,0));atlas.paste(shoe,(0,1024));wardrobeName=save(atlas,'wardrobe-basecolor.png')
normal=Image.new('RGB',(1024,2048),(128,128,255));normal.paste(image(SOURCE/f"core-pack/clothes/{config['wardrobe']}/{config['wardrobe']}_normal.png",(1024,1024)),(0,0));save(normal,'wardrobe-normal.png')
ao=image(SOURCE/f"core-pack/clothes/{config['wardrobe']}/{config['wardrobe']}_ao.png",(1024,1024),'L')
orm=np.zeros((2048,1024,3),dtype=np.uint8);orm[:,:,0]=255;orm[:1024,:,0]=np.asarray(ao);orm[:,:,1]=220;orm[1024:,:,1]=181
save(Image.fromarray(orm),'wardrobe-orm.png')
save(image(SOURCE/f"core-pack/hair/{config['hair']}/{config['hair']}_diffuse.png",(512,512),'RGBA'),'hair-basecolor.png')
save(image(SOURCE/'makehuman/data/eyes/materials/brown_eye.png',(512,512),'RGBA'),'eyes-basecolor.png')
# glTF textures use top-left image origin, unlike OBJ bottom-left UV.
for mesh in meshes:
 mesh['uv'][:,1]=1-mesh['uv'][:,1]
 if mesh['name'] in ['workwear','shoes']:mesh['uv'][:,1]=(mesh['uv'][:,1]+(1 if mesh['name']=='shoes' else 0))/2

# Normals average across geometry vertices, not UV splits, so UV seam vertices
# remain smoothly lit; discrete hair-card layers retain their original topology.
def expand(mesh):
 verts=mesh['vertices'];normals=np.zeros_like(verts);triangles=[]
 for face in mesh['faces']:
  for i in range(1,len(face)-1):
   tri=[face[0],face[i],face[i+1]];a,b,c=[verts[t[0]] for t in tri];n=np.cross(b-a,c-a)
   if np.linalg.norm(n)<1e-12:continue
   for vertex,tex in tri:normals[vertex]+=n
   triangles.append(tri)
 length=np.linalg.norm(normals,axis=1);length[length==0]=1;normals/=length[:,None]
 mapping={};p=[];n=[];uv=[];w=[];j=[];indices=[]
 for tri in triangles:
  for key in tri:
   if key not in mapping:
    vertex,tex=key;mapping[key]=len(p);p.append(verts[vertex]);n.append(normals[vertex]);uv.append(mesh['uv'][tex])
    order=np.argsort(mesh['weights'][vertex])[::-1][:4];ws=mesh['weights'][vertex,order];ws/=ws.sum();j.append(order);w.append(ws)
   indices.append(mapping[key])
 return {'name':mesh['name'],'material':mesh['material'],'position':np.asarray(p,dtype='<f4'),'normal':np.asarray(n,dtype='<f4'),'uv':np.asarray(uv,dtype='<f4'),'joints':np.asarray(j,dtype='<u2'),'weights':np.asarray(w,dtype='<f4'),'indices':np.asarray(indices,dtype='<u2')}
expanded=[expand(m) for m in meshes]
# Combine the clothes and shoes into one primitive, keeping four total draws.
a,b=expanded[1:3];wardrobe={key:np.concatenate([a[key],b[key]]) for key in ['position','normal','uv','joints','weights']};wardrobe['indices']=np.concatenate([a['indices'].astype('<u4'),b['indices'].astype('<u4')+len(a['position'])]).astype('<u2');wardrobe.update(name='wardrobe',material=1)
expanded=[expanded[0],wardrobe,*expanded[3:]]

blob=bytearray();views=[];accessors=[]
def accessor(data,component,type,target=None,minmax=False):
 while len(blob)%4:blob.append(0)
 offset=len(blob);blob.extend(data.tobytes());v={'buffer':0,'byteOffset':offset,'byteLength':data.nbytes}
 if target:v['target']=target
 views.append(v);a={'bufferView':len(views)-1,'componentType':component,'count':len(data),'type':type}
 if minmax:a.update(min=np.min(data,axis=0).astype(float).tolist(),max=np.max(data,axis=0).astype(float).tolist())
 accessors.append(a);return len(accessors)-1
nodes=[{'name':f'Near {role} · licensed core anatomy','children':[1]+list(range(1+len(names),1+len(names)+4))}]
for name in names:
 parent=parents[name];pos=newPositions[name]-(newPositions[parent] if parent else 0)
 node={'name':name.replace('.', '_'),'translation':pos.tolist(),'extras':{'makehumanJoint':name}}
 children=[1+names.index(n) for n in names if parents[n]==name]
 if children:node['children']=children
 nodes.append(node)
primitives=[]
for i,m in enumerate(expanded):
 attrs={k:accessor(m[v],5123 if k=='JOINTS_0' else 5126,'VEC2' if k=='TEXCOORD_0' else 'VEC4' if k in ['JOINTS_0','WEIGHTS_0'] else 'VEC3',34962,k=='POSITION') for k,v in [('POSITION','position'),('NORMAL','normal'),('TEXCOORD_0','uv'),('JOINTS_0','joints'),('WEIGHTS_0','weights')]}
 primitive={'attributes':attrs,'indices':accessor(m['indices'],5123,'SCALAR',34963),'material':m['material']}
 primitives.append({'name':m['name'],'primitives':[primitive]});nodes.append({'name':m['name'],'mesh':i,'skin':0})
inv=[]
for name in names:
 matrix=np.eye(4,dtype='<f4');matrix[:3,3]=-newPositions[name];inv.append(matrix.T.reshape(16))
ibm=accessor(np.asarray(inv,dtype='<f4'),5126,'MAT4')
files=[skinName,wardrobeName,'wardrobe-normal.png','wardrobe-orm.png','hair-basecolor.png','eyes-basecolor.png']
materials=[{'name':'CC0 anatomical skin','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':.64},'extras':{'surfaceKind':'skin','source':f"MakeHuman core {config['skin']}"}},{'name':'CC0 woven workwear and leather shoes','pbrMetallicRoughness':{'baseColorTexture':{'index':1},'metallicFactor':0,'roughnessFactor':1,'metallicRoughnessTexture':{'index':3}},'normalTexture':{'index':2,'scale':.7},'occlusionTexture':{'index':3,'strength':.35},'extras':{'surfaceKind':'cloth','source':f"MakeHuman core {config['wardrobe']}/shoes02"}},{'name':'CC0 cropped hair cards','alphaMode':'MASK','alphaCutoff':.45,'doubleSided':True,'pbrMetallicRoughness':{'baseColorTexture':{'index':4},'baseColorFactor':([.07,.035,.018,1] if role=='shopkeeper' else [1,1,1,1]),'metallicFactor':0,'roughnessFactor':.82},'extras':{'surfaceKind':'hair'}},{'name':'CC0 brown eyes','alphaMode':'MASK','alphaCutoff':.35,'pbrMetallicRoughness':{'baseColorTexture':{'index':5},'metallicFactor':0,'roughnessFactor':.18},'extras':{'surfaceKind':'eye'}}]
# Small original FK cycles are animation data, not a claim of motion capture or
# terrain IK. Runtime locational simulation owns translation and yaw.
def quaternion(axis,angle):
 q=[0,0,0,math.cos(angle/2)];q[axis]=math.sin(angle/2);return q
animations=[]
for title,steps,duration,amp,knee in [('NH walk FK',17,1.05,.38,.53),('NH stair FK',17,1.35,.5,.72),('NH idle FK',9,3.2,.015,.018)]:
 times=np.linspace(0,duration,steps,dtype='<f4');time=accessor(times,5126,'SCALAR',minmax=True);channels=[];samplers=[]
 for name,axis,fn in [(f'upperleg01.{s}',0,lambda t,s=s:amp*math.sin(t+(math.pi if s=='R' else 0))) for s in ['L','R']]+[(f'lowerleg01.{s}',0,lambda t,s=s:knee*max(0,math.sin(t+(math.pi if s=='R' else 0)))) for s in ['L','R']]+[(f'upperarm01.{s}',0,lambda t,s=s:-amp*.58*math.sin(t+(math.pi if s=='R' else 0))) for s in ['L','R']]+[('head',1,lambda t:.022*math.sin(t))]:
  rot=np.asarray([quaternion(axis,fn(float(t)*2*math.pi/duration)) for t in times],dtype='<f4');out=accessor(rot,5126,'VEC4');samplers.append({'input':time,'output':out,'interpolation':'LINEAR'});channels.append({'sampler':len(samplers)-1,'target':{'node':1+names.index(name),'path':'rotation'}})
 animations.append({'name':title,'samplers':samplers,'channels':channels})
gltf={'asset':{'version':'2.0','generator':'Neon Harbor independent CC0 core conversion','copyright':'CC0 MakeHuman Team / Data Collection AB / Joel Palmius / Jonas Hauquier; NH conversion and FK under project MIT'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':nodes,'meshes':primitives,'skins':[{'name':'Reduced MakeHuman core FK 71','joints':list(range(1,1+len(names))),'skeleton':1,'inverseBindMatrices':ibm}],'materials':materials,'images':[{'uri':f} for f in files],'textures':[{'source':i,'sampler':0} for i in range(len(files))],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],'accessors':accessors,'bufferViews':views,'buffers':[{'uri':f"{config['file']}.bin",'byteLength':len(blob)}],'animations':animations,'extras':{'heightMetres':1.78,'nearDistanceMetres':18,'maximumVisibleNearResidents':12,'materialBudget':4,'jointBudget':72,'authoredMotion':'Original FK cycles; no mocap or ground IK','sourceAssetLicense':'CC0-1.0','codeLicense':'MIT','restPose':'Relaxed standing, +Z forward, sole Y=0'}}
(OUTPUT/f"{config['file']}.bin").write_bytes(blob);(OUTPUT/f"{config['file']}.gltf").write_text(json.dumps(gltf,indent=2))
# Embed exact same payload and local PNGs into runtime GLB.
packed=json.loads(json.dumps(gltf));packed['buffers']=[{'byteLength':0}]
for i,f in enumerate(files):
 while len(blob)%4:blob.append(0)
 b=(OUTPUT/f).read_bytes();packed['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':len(b)});blob.extend(b);packed['images'][i]={'bufferView':len(packed['bufferViews'])-1,'mimeType':'image/jpeg' if f.endswith('.jpg') else 'image/png'}
while len(blob)%4:blob.append(0)
packed['buffers'][0]['byteLength']=len(blob);js=json.dumps(packed,separators=(',',':'),ensure_ascii=False).encode();js+=b' '*(-len(js)%4)
header=struct.pack('<4sII',b'glTF',2,12+8+len(js)+8+len(blob));(RUNTIME/f"{config['file']}.glb").write_bytes(header+struct.pack('<I4s',len(js),b'JSON')+js+struct.pack('<I4s',len(blob),b'BIN\x00')+blob)
manifest={'name':f'NH near {role} core prototype','role':role,'macroTarget':config['macro'],'fitEdits':(['Additional hidden thigh coverage above actual skirt hem; bob02 material tinted brown.'] if role=='shopkeeper' else []),'wardrobeAsset':config['wardrobe'],'hairAsset':config['hair'],'sources':{'bodyCommit':json.loads((SOURCE/'download-manifest.json').read_text())['repoCommit'],'officialPack':json.loads((SOURCE/'official-core-download-manifest.json').read_text())['url']},'materials':len(materials),'bones':len(names),'triangles':sum(len(m['indices'])//3 for m in expanded),'meshes':[{'name':m['name'],'vertices':len(m['position']),'triangles':len(m['indices'])//3,'boundsMin':np.min(m['position'],axis=0).astype(float).tolist(),'boundsMax':np.max(m['position'],axis=0).astype(float).tolist()} for m in expanded],'physicalHeightMetres':1.78,'rawSourceBodyTriangles':26756,'maskedBodyTriangles':len(expanded[0]['indices'])//3,'restBounds':{'min':np.min(np.concatenate([m['position'] for m in expanded]),axis=0).astype(float).tolist(),'max':np.max(np.concatenate([m['position'] for m in expanded]),axis=0).astype(float).tolist()},'originalFKClips':[a['name'] for a in animations],'textures':[{'name':f,'pixels':list(Image.open(OUTPUT/f).size),'bytes':(OUTPUT/f).stat().st_size} for f in files],'files':[],'acceptance':{'staticDataOnly':True,'browserReviewed':False,'nativeHighReviewed':False,'runtimeActionChainReviewed':False,'hardwarePerformanceMeasured':False,'finalArtAccepted':False},'limitations':[f'One {role} body/wardrobe, part of a three-asset prototype; not the complete resident collection.','Original FK animation, no terrain IK, root-motion retarget or motion capture.','Hair card alpha, garment seams and shoulders require native High inspection.','Skin color source is a diffuse asset, not a complete calibrated scan-based PBR set.','Existing far LODs are intentionally retained by the candidate factory.']}
for f in [*sorted(OUTPUT.iterdir()), RUNTIME/f"{config['file']}.glb"]:
 if f.name=='manifest.json':continue
 b=f.read_bytes();manifest['files'].append({'path':f.relative_to(ROOT).as_posix(),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
(RUNTIME/'manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps({k:manifest[k] for k in ['triangles','materials','bones','meshes','restBounds','textures']},indent=2))
