"""Serein D11: newly authored spline/section mesh, not an export of the runtime prototype.
Blender 4.3 CPU authoring/export only. Game basis is +Y up, +Z front; Blender basis
is (x,-z,y). All engineering portals and passenger routes come from baseline JSON.
"""
import bpy, math, json, sys
from pathlib import Path
from collections import defaultdict
from mathutils import Vector
BASE=Path(__file__).resolve().parents[1]
BASELINE=json.loads((BASE/'source/runtime-interface-baseline.json').read_text())
LAYOUT=BASELINE['layout']; SPEC=BASELINE['spec']
TAU=math.pi*2
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
for data in list(bpy.data.materials):bpy.data.materials.remove(data)
scene=bpy.context.scene;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
scene.render.fps=24;scene.frame_start=1;scene.frame_end=25
# No camera, render, bake, modifier evaluation or GPU operation is used.
def to_b(p):return (p[0],-p[2],p[1])
def vadd(a,b):return tuple(x+y for x,y in zip(a,b))
def vmul(a,s):return tuple(x*s for x in a)
def norm(v):l=math.sqrt(sum(x*x for x in v));return tuple(x/l for x in v)
def cross(a,b):return(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def material(name,col,rough=.6,metal=0,alpha=1,emission=None,base=None,normal=None,orm=None):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.diffuse_color=(*col,alpha)
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*col,1)
 p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal;p.inputs['Alpha'].default_value=alpha
 if name=='harbor-paint':p.inputs['Coat Weight'].default_value=.28;p.inputs['Coat Roughness'].default_value=.27
 if emission:p.inputs['Emission Color'].default_value=(*emission,1);p.inputs['Emission Strength'].default_value=.7
 def image_node(file,linear=False):
  t=m.node_tree.nodes.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(BASE/'textures'/file),check_existing=True)
  if linear:t.image.colorspace_settings.name='Non-Color'
  return t
 if base:m.node_tree.links.new(image_node(base).outputs['Color'],p.inputs['Base Color'])
 if normal:
  t=image_node(normal,True);n=m.node_tree.nodes.new('ShaderNodeNormalMap');n.inputs['Strength'].default_value=.30
  m.node_tree.links.new(t.outputs['Color'],n.inputs['Color']);m.node_tree.links.new(n.outputs['Normal'],p.inputs['Normal'])
 if orm:
  t=image_node(orm,True);sep=m.node_tree.nodes.new('ShaderNodeSeparateColor');sep.mode='RGB'
  m.node_tree.links.new(t.outputs['Color'],sep.inputs['Color']);m.node_tree.links.new(sep.outputs['Green'],p.inputs['Roughness']);m.node_tree.links.new(sep.outputs['Blue'],p.inputs['Metallic'])
 m.use_backface_culling=(name=='harbor-glass')
 return m
M={
 'paint':material('harbor-paint',(.035,.104,.105),.39,.17,base='coat-base.png',normal='coat-normal.png',orm='coat-orm.png'),
 'pearl':material('serein-pearl-paint',(.72,.70,.63),.44,.10),
 'dark':material('serein-elastomer',(.017,.025,.025),.9),
 'metal':material('serein-satin-alloy',(.46,.51,.50),.30,.83),
 'steel':material('serein-coated-steel',(.13,.18,.18),.64,.40),
 'glass':material('harbor-glass',(.32,.44,.43),.095,.02,.26),
 'cloth':material('serein-woven-upholstery',(.14,.22,.24),.90,base='fabric-base.png',normal='fabric-normal.png'),
 'floor':material('serein-mineral-rubber',(.05,.06,.06),.93,base='floor-base.png'),
 'interior':material('serein-moulded-liner',(.68,.68,.62),.79),
 'lamp':material('harbor-cabin-light',(.89,.91,.80),.23,emission=(.91,.89,.72)),
 'red':material('serein-red-optic',(.24,.022,.014),.27,emission=(.45,.035,.014)),
 'amber':material('serein-amber-optic',(.5,.2,.02),.25,emission=(.7,.25,.018)),
 'display':material('serein-route-instruments',(.10,.14,.14),.63,base='route-instruments-atlas.png'),
 'livery':material('serein-livery-copper',(.59,.38,.17),.5,.24),
}
M['paintFar']=material('harbor-paint-far',(.0296,.1046,.1022),.45,.17)
# Preserved named parent transforms become real glTF nodes and bind without changing physics.
COLLECTIONS=[];ROOTS=[];PARTS=[];HOOKS=[]
def empty(name,pos=(0,0,0),parent=None,col=None,extras=None):
 o=bpy.data.objects.new(name,None);o.location=to_b(pos);o.empty_display_size=.12;o.empty_display_type='PLAIN_AXES'
 (col or bpy.context.collection).objects.link(o);o.parent=parent;o['logicalName']=name
 for k,v in (extras or {}).items():o[k]=v
 return o

def mesh(name,verts,faces,mat,parent,uv=None,smooth=True):
 # Tangent calculation requires triangles/quads; triangulate convex end caps only.
 faces=[face for f in faces for face in ([f]if len(f)<=4 else[(f[0],f[j],f[j+1])for j in range(1,len(f)-1)])]
 if ACTIVE_TIER==2 and mat=='paint':mat='paintFar'
 data=bpy.data.meshes.new(name+'-editable');data.from_pydata([to_b(p) for p in verts],[],faces);data.update()
 data.materials.append(M[mat]);layer=data.uv_layers.new(name='UV0')
 if uv is None:uv=[((p[2]+5.5)/11,(p[1])/4.4) for p in verts]
 for poly in data.polygons:
  poly.use_smooth=smooth
  ids=list(poly.vertices);a,b,c=[uv[i]for i in ids[:3]];area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
  if abs(area)<1e-10:
   # Cap UVs use their own planar coordinates instead of collapsing to a strip.
   p0,p1,p2=[verts[i]for i in ids[:3]];n=cross(tuple(v-u for u,v in zip(p0,p1)),tuple(v-u for u,v in zip(p0,p2)));drop=max(range(3),key=lambda k:abs(n[k]));axes=[k for k in range(3)if k!=drop]
   bounds=[(min(verts[i][k]for i in ids),max(verts[i][k]for i in ids))for k in axes]
   for li in poly.loop_indices:
    point=verts[data.loops[li].vertex_index];layer.data[li].uv=tuple((point[k]-lo)/max(hi-lo,.000001)for k,(lo,hi)in zip(axes,bounds))
  else:
   for li in poly.loop_indices:layer.data[li].uv=uv[data.loops[li].vertex_index]
 o=bpy.data.objects.new(name,data);COLLECTIONS[ACTIVE_TIER].objects.link(o);o.parent=parent;o['authoredPart']=name
 PARTS[ACTIVE_TIER].append({'name':name,'verts':verts,'faces':faces,'uv':uv,'mat':mat,'parent':parent,'object':o})
 return o

def grid(name,fn,nu,nv,mat,parent,uvfn=None,flip=False):
 verts=[];uv=[]
 for j in range(nv+1):
  for i in range(nu+1):
   u=i/nu;v=j/nv;verts.append(fn(u,v));uv.append(uvfn(u,v) if uvfn else (u,v))
 faces=[]
 for j in range(nv):
  for i in range(nu):
   a=j*(nu+1)+i;q=(a,a+1,a+nu+2,a+nu+1);faces.append(q[::-1] if flip else q)
 return mesh(name,verts,faces,mat,parent,uv)

def prism(name,c,size,rad,mat,parent,axis='y',steps=4):
 # Rounded section with four bevel rings, not a scaled hard cube.
 steps=min(steps,[2,1,1][ACTIVE_TIER])
 idx={'x':(1,2,0),'y':(0,2,1),'z':(0,1,2)}[axis];a,b,k=idx
 half=[q/2 for q in size];r=min(rad,half[a]*.95,half[b]*.95,half[k]*.95)
 pts=[];uv=[];rings=[(-half[k],r),(-half[k]+r,0),(half[k]-r,0),(half[k],r)]
 for ri,(depth,inset) in enumerate(rings):
  ra=max(r-inset*.5,.001);ha=half[a]-inset*.6;hb=half[b]-inset*.6
  for corner in range(4):
   angle0=corner*math.pi/2
   for j in range(steps+1):
    ang=angle0+j/steps*math.pi/2
    ca,cb=[(1,1),(-1,1),(-1,-1),(1,-1)][corner]
    pa=(ha-ra)*ca+ra*math.cos(ang)
    pb=(hb-ra)*cb+ra*math.sin(ang)
    p=list(c);p[a]+=pa;p[b]+=pb;p[k]+=depth;pts.append(tuple(p));uv.append((corner/4+j/(4*steps),ri/3))
 count=4*(steps+1);faces=[]
 for ri in range(3):
  for j in range(count):faces.append((ri*count+j,ri*count+(j+1)%count,(ri+1)*count+(j+1)%count,(ri+1)*count+j))
 faces.append(tuple(reversed(range(count))));faces.append(tuple(range(count*3,count*4)))
 a0,a1,a2=[pts[i]for i in faces[0][:3]];nf=cross(tuple(v-u for u,v in zip(a0,a1)),tuple(v-u for u,v in zip(a0,a2)));radial=tuple(sum(pts[i][k]for i in faces[0])/4-c[k]for k in range(3))
 if sum(x*y for x,y in zip(nf,radial))<0:faces=[f[::-1]for f in faces]
 return mesh(name,pts,faces,mat,parent,uv)

def tube(name,a,b,r,mat,parent,n=10):
 d=norm(tuple(y-x for x,y in zip(a,b)));u=norm(cross(d,(0,1,0) if abs(d[1])<.9 else (1,0,0)));v=cross(d,u)
 verts=[];uv=[]
 for ring,p in enumerate((a,b)):
  for i in range(n):
   ang=i/n*TAU;verts.append(vadd(p,vadd(vmul(u,r*math.cos(ang)),vmul(v,r*math.sin(ang)))));uv.append((i/n,ring))
 faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 faces+=[tuple(reversed(range(n))),tuple(range(n,n*2))]
 return mesh(name,verts,faces,mat,parent,uv)

def polyline(name,points,r,mat,parent,n=8):
 for i in range(len(points)-1):tube(name+f'-joint-{i}',points[i],points[i+1],r,mat,parent,n)

def side_x(y,z):
 # Continuous subtle tumblehome and front/rear wrap; widest at the lower waist.
 return 1.269-.018*(max(0,y-1)/3.4)**1.3-.10*(max(0,abs(z)-5.12)/.36)**2

def front_z(x,y,end=1):
 # Compound surface: nose convexity, upper cab rake and radius at each corner.
 z=5.40+.085*math.exp(-((y-.67)/.40)**2)-.050*max(0,y-2.2)/2.2-.115*(abs(x)/1.25)**4
 return end*z

def solid_grid(name,fn,nu,nv,mat,parent,thickness,direction,uvfn=None):
 # Explicit outside, inside and four aperture reveal surfaces.
 a0,a1,a2=fn(0,0),fn(.01,0),fn(0,.01)
 nf=cross(tuple(v-u for u,v in zip(a0,a1)),tuple(v-u for u,v in zip(a0,a2)));flip=sum(x*y for x,y in zip(nf,direction))<0
 a=grid(name+'-outer',fn,nu,nv,mat,parent,uvfn,flip)
 if ACTIVE_TIER==2:return a
 inner=lambda u,v:vadd(fn(u,v),vmul(direction,-thickness))
 grid(name+'-inner',inner,nu,nv,mat,parent,uvfn,not flip)
 for edge in range(4):
  def strip(t,q,e=edge):
   u,v=[(t,0),(1,t),(1-t,1),(0,1-t)][e]
   return vadd(fn(u,v),vmul(direction,-q*thickness))
  grid(name+f'-reveal-{edge}',strip,nu if edge%2==0 else nv,1,mat,parent)

for tier in range(3):
 ACTIVE_TIER=tier
 col=bpy.data.collections.new(f'Serein-D11-LOD{tier}-editable');scene.collection.children.link(col);COLLECTIONS.append(col);PARTS.append([])
 root=empty(f'bus-detail-{tier}',col=col,extras={'assetId':'nh-serein-d11-authored-v1','tier':tier,'axis':'+Z front,+Y up','units':'metres','status':'authored candidate; native review pending'})
 ROOTS.append(root)
 steps=[5,3,1][tier];segments=[32,16,8][tier]
 # Single arched roof skin with inner liner. Its centre reaches4.4 and edges blend at4.18.
 def roof(u,v):
  x=(u-.5)*2.50;z=(v-.5)*10.60
  return(x,4.26+.14*math.cos((u-.5)*math.pi)**1.8-.025*(abs(z)/5.3)**8,z)
 solid_grid('compound-roof',roof,segments,[30,14,6][tier],'pearl',root,.044,(0,1,0))
 # Side structural panels, wheel openings and true portal apertures.
 for side in (-1,1):
  doors=[d for d in LAYOUT['doors'] if d['side']==side]
  intervals=[];start=-5.28
  for a,b in sorted([(d['z']-d['width']/2,d['z']+d['width']/2) for d in doors])+[(5.28,5.28)]:
   if a>start:intervals.append((start,a))
   start=max(start,b)
  for j,(a,b) in enumerate(intervals):
   def low(v):
    z=a+(b-a)*v;bottom=.26
    for wz in(-3.44,2.65):
     dz=abs(z-wz)
     if dz<.48:bottom=max(bottom,.43+math.sqrt(.48**2-dz**2))
    return z,bottom
   def skin(u,v):
    z,base=low(v);y=base+u*(1.015-base)
    return(side*side_x(y,z),y,z)
   solid_grid(f'lower-fluted-side-{side}-{j}',skin,[5,3,2][tier],max(4,int((b-a)*[16,4,2][tier])),'paint',root,.065,(side,0,0))
  # Upper deck and interdeck waist use continuous side curvature across the full length.
  for y0,y1,mat,label in[(2.065,2.29,'pearl','lower-header'),(2.29,2.51,'pearl','swept-waist'),(4.03,4.25,'paint','upper-header')]:
   ranges=intervals if y0<2.28 else [(-5.28,5.28)]
   for a,b in ranges:
    solid_grid(f'{label}-{side}',lambda u,v:(side*side_x(y0+(y1-y0)*u,a+(b-a)*v),y0+(y1-y0)*u,a+(b-a)*v),4,max(3,int((b-a)*[3,1.4,.65][tier])),mat,root,.057,(side,0,0))
  # Continuous upper-deck spandrel closes the .49 m gap below the real
  # recessed glazing. It follows the original compound side surface, overlaps
  # the waist/sill slightly, and stays outside the unchanged cabin clearance.
  solid_grid(f'upper-deck-side-spandrel-{side}',lambda u,v:(side*side_x(2.49+.528*u,-5.28+10.56*v),2.49+.528*u,-5.28+10.56*v),2,[22,12,8][tier],'paint',root,.057,(side,0,0))
  # Authentic recessed double-wall glazing. Frames do not bridge either lower portal.
  for deck in LAYOUT['decks']:
   y0=deck['y']+.60;y1=deck['y']+1.60
   ranges=intervals if deck['id']=='lower' else[(-5.28,5.28)]
   for ri,(a,b) in enumerate(ranges):
    count=max(1,math.ceil((b-a)/1.38)) if tier==0 else 1;pitch=(b-a)/count
    for wi in range(count):
     za=a+wi*pitch+.045;zb=a+(wi+1)*pitch-.045
     def pane(u,v,aa=za,bb=zb,yy0=y0,yy1=y1):
      y=yy0+(yy1-yy0)*u;z=aa+(bb-aa)*v
      return(side*(side_x(y,z)-.050+.003*math.sin(u*math.pi)),y,z)
     solid_grid(f'{deck["id"]}-recessed-pane-{side}-{ri}-{wi}',pane,[6,2,1][tier],[4,2,1][tier],'glass',root,.014,(side,0,0))
     # A gasket, metal reveal and cabin trim form separate structural layers.
     framex=side*(side_x((y0+y1)/2,(za+zb)/2)-.035)
     for zz in(za-.022,zb+.022):
      prism('window-mullion',(framex,(y0+y1)/2,zz),(.063,y1-y0+.105,.041),.014,'dark',root,steps=steps)
      if tier<2:prism('inner-window-reveal',(framex-side*.036,(y0+y1)/2,zz),(.026,y1-y0+.03,.030),.008,'interior',root,steps=steps)
     for yy in(y0-.025,y1+.025):prism('window-gasket',(framex,yy,(za+zb)/2),(.055,.038,zb-za+.07),.012,'dark',root,steps=steps)
  # Original livery as a controlled smooth ribbon, no copied real operator mark.
  grid(f'copper-sweep-{side}',lambda u,v:(side*(side_x(2.365+.035*math.sin((v-.2)*math.pi),-5.18+10.36*v)+.001),2.365+u*.025+.035*math.sin((v-.2)*math.pi),-5.18+10.36*v),2,segments,'livery',root)
 # Far surfaces omit thickness by design; explicit corner returns keep only
 # the new upper enclosure watertight where side and end section rails meet.
 if tier==2:
  for side in(-1,1):
   for end in(-1,1):
    def corner(u,v):
     y=2.49+.528*v;a=(side*side_x(y,end*5.28),y,end*5.28);b=(side*1.235,y,front_z(side*1.235,y,end))
     return tuple((1-u)*x+u*z for x,z in zip(a,b))
    grid(f'upper-deck-far-corner-return-{side}-{end}',corner,1,1,'paint',root)
 # Wrapped front/rear fascias. Glazing is curved independently from the painted lower nose.
 for end in(-1,1):
  for y0,y1,mat,label in[(.18,1.025,'paint','sculpted-nose'),(2.08,2.53,'pearl','continuous-front-belt'),(4.01,4.30,'paint','roof-return')]:
   solid_grid(f'{label}-{end}',lambda u,v:(-1.235+2.47*u,y0+(y1-y0)*v,front_z(-1.235+2.47*u,y0+(y1-y0)*v,end)),[24,8,6][tier],[8,3,2][tier],mat,root,.065,(0,0,end))
  # The same upper enclosure wraps both ends up to the existing windshield.
  solid_grid(f'upper-deck-end-spandrel-{end}',lambda u,v:(-1.235+2.47*u,2.51+.518*v,front_z(-1.235+2.47*u,2.51+.518*v,end)),[12,8,6][tier],2,'paint',root,.065,(0,0,end))
  for dy in(.44,2.40):
   y0=dy+.61;y1=dy+1.62
   solid_grid(f'compound-windshield-{end}-{dy}',lambda u,v:(-1.085+2.17*u,y0+(y1-y0)*v,front_z(-1.085+2.17*u,y0+(y1-y0)*v,end)-end*.036),[24,8,5][tier],[16,4,3][tier],'glass',root,.017,(0,0,end))
   for xx in(-1.15,1.15):
    polyline('wrapped-A-pillar',[(xx,y0-.075,front_z(xx,y0-.075,end)),(xx,y0+.43,front_z(xx,y0+.43,end)),(xx,y1+.08,front_z(xx,y1+.08,end))],.060,'paint',root,[12,8,5][tier])
   for yy in(y0-.04,y1+.04):
    polyline('windscreen-seal',[(xx,yy,front_z(xx,yy,end)-end*.02) for xx in[-1.09,-.75,0,.75,1.09]],.021,'dark',root,[10,6,4][tier])
  # Lamp bezels, individual lenses and indicator chambers at a recess in the nose.
  for side in(-1,1):
   xx=side*.89;zz=front_z(xx,.83,end)+end*.003
   prism('lamp-bucket',(xx,.83,zz),(.48,.205,.08),.065,'dark',root,'z',steps)
   for off,mat in[(-.13,'lamp' if end>0 else'red'),(.06,'lamp' if end>0 else'red'),(.17,'amber')]:
    prism('separate-lamp-optic',(xx+off*side,.83,zz+end*.028),(.10,.102,.032),.039,mat,root,'z',steps)
    if tier==0:
     for line in(-.025,0,.025):prism('lens-fluting',(xx+off*side+line,.83,zz+end*.046),(.003,.065,.002),.001,mat,root,'z',2)
  prism('recessed-bumper',(0,.35,end*5.385),(2.37,.135,.14),.055,'dark',root,'y',steps)
  # Route aperture UV uses only the atlas upper half.
  zz=front_z(0,2.235,end)+end*.004
  grid('original-route-display',lambda u,v:(-.73+1.46*u,2.17+.185*v,zz),[8,4,1][tier],1,'display',root,lambda u,v:(u*.68,.53+v*.45),end<0)
  if tier==0:
   for side in(-1,1):
    points=[(side*.20,1.18,end*5.402),(side*.64,1.63,end*5.385)]
    polyline('windscreen-wiper',points,.010,'dark',root,8)
 # Four independently rotating wheel hubs with authored tyre shoulder, rim bowls and fixing structure.
 for z in(-3.44,2.65):
  for side in(-1,1):
   wheel=empty(f'wheel-{"front" if z>0 else "rear"}-{side}',(side*1.135,.43,z),root,col,{'radiusMetres':.43,'spinAxis':'X'})
   segments_w=[36,20,10][tier]
   # Profile across the axle direction: sidewall bulge -> tread shoulder -> opposite sidewall.
   profile=[(-.135,.29),(-.133,.37),(-.115,.421),(-.083,.43),(.083,.43),(.115,.421),(.133,.37),(.135,.29)]
   verts=[];uv=[]
   for j,(xx,r) in enumerate(profile):
    for i in range(segments_w):
     a=i/segments_w*TAU;verts.append((xx,r*math.cos(a),r*math.sin(a)));uv.append((i/segments_w,j/(len(profile)-1)))
   faces=[(j*segments_w+i,j*segments_w+(i+1)%segments_w,(j+1)*segments_w+(i+1)%segments_w,(j+1)*segments_w+i)for j in range(len(profile)-1)for i in range(segments_w)]
   mesh('round-shouldered-tyre',verts,faces,'dark',wheel,uv)
   for outward in(-1,1):
    # Dished alloy rather than a flat silver cylinder.
    profile_r=[(outward*.137,.27),(outward*.119,.24),(outward*.108,.15),(outward*.126,.08),(outward*.128,0)]
    verts=[];uv=[]
    for j,(xx,r) in enumerate(profile_r):
     for i in range(segments_w):
      a=i/segments_w*TAU;verts.append((xx,r*math.cos(a),r*math.sin(a)));uv.append((.5+.5*math.cos(a)*r/.27,.5+.5*math.sin(a)*r/.27))
    faces=[(j*segments_w+i,j*segments_w+(i+1)%segments_w,(j+1)*segments_w+(i+1)%segments_w,(j+1)*segments_w+i)for j in range(len(profile_r)-1)for i in range(segments_w)]
    mesh('dished-rim',verts,faces,'metal',wheel,uv)
    if tier==0:
     for i in range(8):
      a=i/8*TAU;yy=.105*math.cos(a);zz=.105*math.sin(a)
      tube('hub-fastener',(outward*.125,yy,zz),(outward*.132,yy,zz),.013,'steel',wheel,6)
     # Vent apertures represented by inset dark bowl panels, not a noisy texture.
     for i in range(10):
      a=i/10*TAU;prism('rim-vent',(outward*.12,.194*math.cos(a),.194*math.sin(a)),(.009,.039,.062),.012,'dark',wheel,'x',3)
   if tier==0:
    # Narrow grooves stay within tread radius, grouped for efficient static part export.
    for i in range(36):
     a=i/36*TAU;points=[(-.077,.427*math.cos(a),.427*math.sin(a)),(.077,.427*math.cos(a+.03),.427*math.sin(a+.03))]
     polyline('tread-channel',points,.0015,'steel',wheel,4)
 # Hardware doorway pivots exactly match runtime ids. Leaves retract along local Z.
 for d in LAYOUT['doors']:
  pivot=empty(d['id'],(d['x']-d['side']*.045,d['sillY'],d['z']),root,col,{'engineeringPortalId':d['id']})
  for sign in(-1,1):
   closed=sign*d['width']/4;slide=sign*d['width']/2
   leaf=empty(d['id']+f'-leaf-{sign}',(0,0,closed),pivot,col,{'closedZ':closed,'slide':slide})
   leaf.keyframe_insert('location',frame=1);leaf.location=to_b((0,0,closed+slide));leaf.keyframe_insert('location',frame=25);leaf.location=to_b((0,0,closed))
   w=d['width']/2-.032
   prism('door-leaf-lower',(0,.22,0),(.060,.43,w),.025,'paint',leaf,'x',steps)
   prism('door-leaf-pane',(0,1.10,0),(.016,1.245,w-.06),.027,'glass',leaf,'x',steps)
   for zz in(-w/2,w/2):prism('door-stile',(0,1.15,zz),(.059,1.315,.031),.009,'dark',leaf,'x',steps)
   for yy in(.465,1.805):prism('door-edge-seal',(0,yy,0),(.058,.03,w),.009,'dark',leaf,'x',steps)
   if tier<2:
    tube('inside-grab-handle',(.038,.80,.035),(.038,1.18,.035),.010,'metal',leaf,8)
    prism('door-handle-mount',(0,.80,.035),(.075,.019,.025),.006,'metal',leaf,'x',steps)
    prism('door-handle-mount',(0,1.18,.035),(.075,.019,.025),.006,'metal',leaf,'x',steps)
  # Jambs remain beyond the actual capsule's open portal interval.
  for edge in(-1,1):prism('door-fixed-jamb',(-1.225,d['sillY']+.91,d['z']+edge*(d['width']/2+.025)),(.075,1.82,.04),.012,'metal',root,'y',steps)
 if tier<2:
  # Deck slabs are exactly split around the entire original stairwell; underside keeps headroom.
  for surf in LAYOUT['walkSurfaces']:
   prism('deck-'+surf['id'],((surf['minX']+surf['maxX'])/2,surf['y']-.0375,(surf['minZ']+surf['maxZ'])/2),
    (surf['maxX']-surf['minX'],.075,surf['maxZ']-surf['minZ']),.005,'floor',root,'y',2)
  for seat in LAYOUT['seats']:
   x,y,z,w=seat['x'],seat['floorY'],seat['z'],seat['width'];n=[8,2][tier]
   # Crowned bucket cushion and curved back shell: shape responds to contact, no identical cube padding.
   def cushion(u,v):
    xx=x+(u-.5)*w;zz=z+(v-.5)*.55
    yy=y+.44+.048*math.sin(u*math.pi)*math.sin(v*math.pi)-.012*math.sin(v*math.pi)**2
    return(xx,yy,zz)
   solid_grid('sculpted-seat-cushion-'+seat['id'],cushion,n,[6,2][tier],'cloth',root,.085,(0,1,0))
   def back(u,v):
    xx=x+(u-.5)*(w-.008);yy=y+.52+.62*v
    zz=z-.268-.046*v+.040*math.sin(u*math.pi)*math.sin(v*math.pi)+.010*math.cos(v*math.pi)
    return(xx,yy,zz)
   solid_grid('ergonomic-seat-back-'+seat['id'],back,n,[10,3][tier],'cloth',root,.038,(0,0,1))
   # A genuine frame: floor bolted legs, lower cross member, shell support and end grab.
   for dx in((-w*.34,w*.34) if tier==0 else (0,)):
    polyline('bent-seat-frame',[(x+dx,y+.06,z-.18),(x+dx,y+.365,z-.18),(x+dx,y+.40,z+.15)],.020,'steel',root,[10,6][tier])
    if tier==0:prism('seat-foot-fastening',(x+dx,y+.015,z-.18),(.091,.025,.12),.016,'metal',root,'y',3)
   tube('seat-underbrace',(x-w*.34,y+.29,z-.18),(x+w*.34,y+.29,z-.18),.019,'steel',root,[10,6][tier])
   if tier==0:polyline('seatback-grip',[(x-w*.33,y+1.09,z-.31),(x-w*.33,y+1.14,z-.31),(x+w*.33,y+1.14,z-.31),(x+w*.33,y+1.09,z-.31)],.015,'metal',root,[10,6][tier])
   if tier==0:
    for dx in(-w*.44,w*.44):polyline('seat-stitched-edge',[(x+dx,y+.535,z-.28),(x+dx,y+.87,z-.29),(x+dx,y+1.06,z-.30)],.002,'livery',root,5)
  stair=LAYOUT['stairs'][0];run=stair['run'];rise=stair['rise'];direction=-1;tread=run/12
  for i in range(12):
   z=stair['startZ']-tread*(i+.5);y=stair['fromY']+rise*(i+1)/12
   prism('stair-rubber-tread',(stair['x'],y-.022,z),(stair['width'],.044,tread+.003),.006,'floor',root,'y',2)
   prism('stair-brushed-nosing',(stair['x'],y-.011,z+tread/2-.01),(stair['width']-.03,.021,.026),.005,'metal',root,'y',2)
   prism('stair-riser',(stair['x'],y-rise/24-.023,z+tread/2),(stair['width'],rise/12,.018),.004,'interior',root,'y',2)
   if tier==0:
    for xx in(-.19,.19):prism('anti-slip-insert',(stair['x']+xx,y+.001,z),(.018,.002,tread-.035),.001,'dark',root,'y',1)
  for side in(-1,1):
   xx=stair['x']+side*(stair['width']/2-.024)
   tube('stair-structural-stringer',(xx,stair['fromY']-.02,stair['startZ']),(xx,stair['toY']-.02,stair['endZ']),.026,'steel',root,[12,8][tier])
   tube('stair-continuous-handrail',(xx,stair['fromY']+.83,stair['startZ']),(xx,stair['toY']+.83,stair['endZ']),.020,'metal',root,[14,8][tier])
   for i in range([7,4][tier]):
    t=i/([7,4][tier]-1);yy=stair['fromY']+rise*t;zz=stair['startZ']-run*t
    tube('stair-post',(xx,yy+.02,zz),(xx,yy+.83,zz),.012,'metal',root,[10,6][tier])
    prism('stair-post-foot',(xx,yy+.02,zz),(.05,.017,.066),.007,'steel',root,'y',2)
  for deck in LAYOUT['decks']:
   ceiling=deck['ceilingY'];hole=stair['hole']
   for xx in(-.59,.59):
    ranges=[(-4.72,4.72)]
    if deck['id']=='lower' and xx+.045>hole['minX'] and xx-.045<hole['maxX']:
     ranges=[(-4.72,hole['minZ']), (hole['maxZ'],4.72)]
    for a,b in ranges:
     if b-a<.1:continue
     prism('ceiling-fixture',(xx,ceiling-.024,(a+b)/2),(.095,.045,b-a),.012,'interior',root,'y',steps)
     prism('linear-diffuser',(xx,ceiling-.048,(a+b)/2),(.058,.008,b-a-.04),.004,'lamp',root,'y',steps)
   for zz in(-3.4,-1.8,.40,1.95):
    xx=.41
    tube('standing-grab-post',(xx,deck['y']+.07,zz),(xx,ceiling-.10,zz),.016,'metal',root,[12,8][tier])
    for yy in(deck['y']+.07,ceiling-.10):prism('post-attachment',(xx,yy,zz),(.063,.022,.071),.010,'steel',root,'y',steps)
   # Window sill and roof edge are trimmed; kept outside the centre walkway.
   for side in(-1,1):
    gaps=sorted((p['z']-p['width']/2,p['z']+p['width']/2)for p in LAYOUT['doors']if p['side']==side and deck['id']=='lower')
    start=-5.175
    for a,b in gaps+[(5.175,5.175)]:
     if a>start:prism('interior-side-sill',(side*1.157,deck['y']+.56,(start+a)/2),(.032,.055,a-start),.016,'interior',root,'y',steps)
     start=max(start,b)
  d=LAYOUT['driver'];x,y,z=d['x'],d['floorY'],d['z']
  prism('driver-console-sculpted',(x,y+.80,z+.27),(.78,.45,.46),.065,'dark',root,'y',steps)
  prism('driver-seat-base',(x,y+.42,z-.3),(.51,.115,.47),.075,'cloth',root,'y',steps)
  prism('driver-seat-back',(x,y+.78,z-.54),(.50,.61,.10),.046,'cloth',root,'z',steps)
  tube('steering-column',(x,y+.55,z+.11),(x,y+.96,z-.06),.024,'steel',root,12)
  points=[(x+.168*math.sin(i/32*TAU),y+1.01+.14*math.cos(i/32*TAU),z-.072-.052*math.cos(i/32*TAU))for i in range(33)]
  polyline('steering-wheel',points,.014,'dark',root,[8,6][tier])
  for a in(0,TAU/3,TAU*2/3):tube('steering-spoke',(x,y+1.01,z-.072),(x+.15*math.sin(a),y+1.01+.12*math.cos(a),z-.072-.046*math.cos(a)),.008,'metal',root,6)
  # Instrument atlas is a real dashboard plane, bounded by the original console blocker.
  grid('three-gauge-dashboard',lambda u,v:(x-.32+.64*u,y+1.055+.055*v,z+.14-.20*v),8,2,'display',root,lambda u,v:(u*.90,.025+v*.43))
  if tier==0:
   for i in range(5):prism('tactile-console-switch',(x-.25+i*.105,y+1.027,z-.008),(.048,.028,.038),.008,'metal' if i<3 else'amber',root,'y',3)
 # Stable semantic hooks, independent of detail geometry and never registered as physics.
 hooks=[('hook-driver-eye',(d['x'],d['floorY']+1.62,d['z']-.18))] if tier<2 else[]
 for seat in LAYOUT['seats']:hooks.append(('hook-'+seat['id'],(seat['x'],seat['floorY']+.44,seat['z'])))
 for d in LAYOUT['doors']:hooks += [('hook-'+d['id']+'-inside',tuple(d['inside'][k]for k in('x','y','z'))),('hook-'+d['id']+'-outside',tuple(d['outside'][k]for k in('x','y','z')))]
 for p,label in zip(LAYOUT['stairs'][0]['waypoints'],('bottom-landing','first-tread','last-tread','top-landing')):hooks.append(('hook-stair-'+label,tuple(p[k]for k in('x','y','z'))))
 for name,pos in hooks:empty(name,pos,root,col,{'role':'render-only-hangpoint','physicsAuthoritative':False})
 HOOKS.append([{'name':name,'position':pos}for name,pos in hooks])
scene.frame_set(1)
for image in bpy.data.images:
 if image.filepath:image.pack()
# Save the editable source before batching. Nothing from harbor-vehicle-models geometry is imported.
bpy.ops.wm.save_as_mainfile(filepath=str(BASE/'source/serein-d11-master.blend'),compress=True)
# glTF batches retain named independent dynamic nodes; source blend retains individual authored parts.
stats=[]
for tier in range(3):
 ACTIVE_TIER=tier
 grouped=defaultdict(list)
 for part in PARTS[tier]:grouped[(part['parent'],part['mat'])].append(part)
 for (parent,mat),parts in grouped.items():
  verts=[];faces=[];uv=[]
  for part in parts:
   offset=len(verts);verts.extend(part['verts']);uv.extend(part['uv']);faces.extend(tuple(i+offset for i in f)for f in part['faces'])
  old=len(PARTS[tier])
  o=mesh(f'LOD{tier}-{parent.name}-{mat}-batch',verts,faces,mat,parent,uv);PARTS[tier]=PARTS[tier][:old]
  o['componentIds']='|'.join(p['name']for p in parts)
  for part in parts:bpy.data.objects.remove(part['object'],do_unlink=True)
 # Blender globally uniquifies object names; export each LOD with canonical runtime names.
 for i,obj in enumerate(bpy.data.objects):obj.name=f'unselected-authoring-{i}'
 for obj in COLLECTIONS[tier].objects:obj.name=obj.get('logicalName',obj.get('authoredPart',obj.name))
 bpy.ops.object.select_all(action='DESELECT')
 for obj in COLLECTIONS[tier].objects:obj.select_set(True)
 bpy.context.view_layer.objects.active=ROOTS[tier]
 path=BASE/'models'/f'serein-d11-lod{tier}.glb'
 bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True,
   export_apply=False,export_texcoords=True,export_normals=True,export_tangents=True,export_materials='EXPORT',
   export_extras=True,export_animations=False,export_cameras=False,export_lights=False,export_draco_mesh_compression_enable=False)
 tris=sum(len(f)-2 for p in PARTS[tier]for f in p['faces']);mats=sorted(set(p['mat']for p in PARTS[tier]))
 stats.append({'tier':tier,'authoredTrianglesBeforeExport':tris,'materialCount':len(mats),'authoredParts':len(PARTS[tier]),'staticAndDynamicBatchMeshes':len(grouped),'bytes':path.stat().st_size,'hooks':HOOKS[tier]})
 print('BOUNDED_ASSET_EXPORT',tier,tris,path.stat().st_size)
(BASE/'review/authoring-stats.json').write_text(json.dumps({'status':'AUTHORING_EXPORT_ONLY_NATIVE_REVIEW_PENDING','units':'metres','axis':'+Y up,+Z front','tiers':stats},indent=2)+'\n')
print('SOURCE_AND_THREE_GLB_READY_NO_RENDER')

import importlib.util
repair_spec=importlib.util.spec_from_file_location('repair_export',BASE/'source/repair_export_tangents.py')
repair_module=importlib.util.module_from_spec(repair_spec);repair_spec.loader.exec_module(repair_module);repair_module.repair()
