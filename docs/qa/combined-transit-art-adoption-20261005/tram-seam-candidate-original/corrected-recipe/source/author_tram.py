"""Vesper T9 / 曦灯: distinct original double-deck streetcar authoring.
Timber saloon framing, flanged rail wheels at the existing1.44m gauge, riveted
lower skirt and articulated trolley collector. Uses only shared new authoring
helpers, not the runtime prototype mesh or the bus body.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import author_library as A
from author_library import *
STEM='vesper-t9'
A.M['pearl'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.79,.75,.64,1)
A.M['paintFar'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.418,.138,.07,1)
def side_width(y,z):return 1.137-.027*(y/4.4)**2-.060*(max(0,abs(z)-4.20)/.24)**2
def end_surface(x,y,end):return end*(4.43-.135*(abs(x)/1.10)**4-.016*max(0,y-2.3))
for tier in range(3):
 col,root=A.begin_tier(tier,STEM);steps=[3,1,1][tier];long=[28,12,6][tier]
 # A timber-ribbed arched coach roof plus a raised ventilator, rather than bus tumblehome.
 def roof(u,v):return((u-.5)*2.24,4.34+.08*math.cos((u-.5)*math.pi)**1.7-.015*abs(v-.5)*2,(v-.5)*8.60)
 solid_grid('streetcar-arched-roof',roof,[24,12,6][tier],long,'pearl',root,.035,(0,1,0))
 if tier<2:
  prism('central-roof-vent',(0,4.43,-.30),(.62,.14,4.9),.05,'pearl',root,'y',steps)
  for z in(-2.3,-1.3,-.3,.7,1.7):
   for side in(-1,1):prism('vent-louver',(side*.314,4.445,z),(.008,.07,.70),.01,'dark',root,'x',steps)
 # Saloon skins stop around the original left portals.
 for side in(-1,1):
  portals=sorted((d['z']-d['width']/2,d['z']+d['width']/2)for d in LAYOUT['doors']if d['side']==side)
  intervals=[];start=-4.25
  for a,b in portals+[(4.25,4.25)]:
   if a>start:intervals.append((start,a))
   start=max(start,b)
  for a,b in intervals:
   solid_grid('riveted-lower-skirt',lambda u,v:(side*side_width(.27+u*.78,a+(b-a)*v),.27+u*.78,a+(b-a)*v),[5,3,2][tier],max(3,int((b-a)*[7,3,1][tier])),'paint',root,.055,(side,0,0))
   if tier==0:
    for z in[a+.08+i*.28 for i in range(max(1,int((b-a-.12)/.28)))]:
     tube('skirt-rivet',(side*(side_width(.44,z)-.008),.44,z),(side*(side_width(.44,z)+.002),.44,z),.005,'metal',root,6)
  for deck in LAYOUT['decks']:
   ranges=intervals if deck['id']=='lower'else[(-4.25,4.25)]
   y0,y1=deck['y']+.64,deck['y']+1.59
   for a,b in ranges:
    count=max(1,math.ceil((b-a)/1.09))if tier==0 else max(1,math.ceil((b-a)/2.5))
    for wi in range(count):
     za=a+(b-a)*wi/count+.045;zb=a+(b-a)*(wi+1)/count-.045
     fn=lambda u,v:(side*(side_width(y0+(y1-y0)*u,za+(zb-za)*v)-.052),y0+(y1-y0)*u,za+(zb-za)*v)
     solid_grid('saloon-recessed-glass',fn,[6,3,1][tier],[6,2,1][tier],'glass',root,.014,(side,0,0))
     x=side*(side_width((y0+y1)/2,(za+zb)/2)-.034)
     for z in(za-.023,zb+.023):prism('timber-window-rib',(x,(y0+y1)/2,z),(.073,y1-y0+.075,.042),.013,'wood',root,'y',steps)
     for y in(y0-.023,y1+.023):prism('window-rubber-seal',(x,y,(za+zb)/2),(.046,.028,zb-za+.044),.009,'dark',root,'y',steps)
     if tier==0:prism('opening-window-latch',(x-side*.03,y1-.05,(za+zb)/2),(.030,.032,.071),.01,'metal',root,'x',2)
   # The lower transom has real portal cutouts; upper transom is continuous.
   for a,b in ranges:solid_grid('transom-trim',lambda u,v:(side*side_width(y1+.02+.10*u,a+(b-a)*v),y1+.02+.10*u,a+(b-a)*v),2,max(3,int((b-a)*3)),'paint',root,.025,(side,0,0))
  for y0,y1,mat in[(2.29,2.57,'pearl'),(4.045,4.30,'paint')]:solid_grid('carriage-waist',lambda u,v:(side*side_width(y0+(y1-y0)*u,-4.25+8.5*v),y0+(y1-y0)*u,-4.25+8.5*v),3,long,mat,root,.055,(side,0,0))
  # A continuous curved upper saloon spandrel joins the waist to the
  # existing y=3.04 window sill without changing the cabin or lower portals.
  solid_grid('upper-saloon-side-spandrel',lambda u,v:(side*side_width(2.57+.488*u,-4.25+8.5*v),2.57+.488*u,-4.25+8.5*v),3,long,'paint',root,.055,(side,0,0))
  grid('tram-original-bronze-stripe',lambda u,v:(side*(side_width(2.37,-4.22+8.44*v)+.001),2.365+.028*u,-4.22+8.44*v),1,long,'livery',root)
 # The far LOD keeps outer-only skins. Four narrow original-section
 # corner returns close the new saloon band without changing any old part.
 if tier==2:
  for side in(-1,1):
   for end in(-1,1):
    def corner(u,v):
     y=2.57+.488*v;a=(side*side_width(y,end*4.25),y,end*4.25);b=(side*1.09,y,end_surface(side*1.09,y,end))
     return tuple((1-u)*x+u*z for x,z in zip(a,b))
    grid('upper-saloon-far-corner-return',corner,1,1,'paint',root)
 for end in(-1,1):
  for y0,y1,mat in[(.25,1.09,'paint'),(2.08,2.57,'pearl'),(4.035,4.33,'paint')]:
   solid_grid('rounded-carriage-end',lambda u,v:(-1.09+2.18*u,y0+(y1-y0)*v,end_surface(-1.09+2.18*u,y0+(y1-y0)*v,end)),[18,9,4][tier],5,mat,root,.052,(0,0,end))
  # Close the matching end-band gap below the original curved windshield.
  solid_grid('upper-saloon-end-spandrel',lambda u,v:(-1.09+2.18*u,2.57+.518*v,end_surface(-1.09+2.18*u,2.57+.518*v,end)),[18,9,4][tier],4,'paint',root,.052,(0,0,end))
  for deck in LAYOUT['decks']:
   y0,y1=deck['y']+.67,deck['y']+1.60
   solid_grid('wraparound-tram-windshield',lambda u,v:(-.98+1.96*u,y0+(y1-y0)*v,end_surface(-.98+1.96*u,y0+(y1-y0)*v,end)-end*.028),[18,8,4][tier],[10,4,2][tier],'glass',root,.015,(0,0,end))
   for x in(-1.025,1.025):polyline('coach-end-timber-post',[(x,y0-.05,end_surface(x,y0-.05,end)),(x,y1+.05,end_surface(x,y1+.05,end))],.034,'wood',root,[10,6,4][tier])
  for side in(-1,1):
   z=end_surface(side*.79,.87,end)
   prism('tram-sealed-lamp',(side*.79,.87,z+end*.023),(.17,.17,.045),.052,'lamp'if end>0 else'red',root,'z',steps)
  prism('curved-end-impact-beam',(0,.36,end*4.42),(2.08,.13,.09),.05,'dark',root,'y',steps)
  grid('tram-route-08',lambda u,v:(-.62+1.24*u,2.18+.185*v,end*4.425),5,1,'display',root,lambda u,v:(u*.68,.53+v*.45),end<0)
 # Underframe and traction bogies fit the existing track and outer envelope.
 prism('streetcar-steel-underframe',(0,.24,0),(1.83,.24,8.35),.065,'steel',root,'y',steps)
 for z in(-1.30,1.30):
  prism('traction-gearbox',(0,.36,z),(1.35,.26,1.14),.06,'steel',root,'y',steps)
  for side in(-1,1):
   wheel=empty(f'wheel-{"front"if z>0 else"rear"}-{side}',(side*.72,.43,z),root,col,{'radiusMetres':.43,'spinAxis':'X','railGaugeMetres':1.44})
   n=[32,18,10][tier];profile=[(-.055,.17),(-.055,.415),(-.029,.415),(-.026,.43),(.026,.43),(.035,.415),(.055,.415),(.055,.17)]
   verts=[(xx,r*math.cos(i/n*TAU),r*math.sin(i/n*TAU))for xx,r in profile for i in range(n)];uv=[(i/n,j/(len(profile)-1))for j in range(len(profile))for i in range(n)]
   faces=[(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i)for j in range(len(profile)-1)for i in range(n)]
   mesh('flanged-rail-wheel',verts,faces,'metal',wheel,uv)
   tube('traction-wheel-hub',(-.068,0,0),(.068,0,0),.174,'steel',wheel,[18,12,8][tier])
   if tier==0:
    for i in range(6):
     a=i/6*TAU;tube('hub-fixing',(-.07,.11*math.cos(a),.11*math.sin(a)),(.07,.11*math.cos(a),.11*math.sin(a)),.009,'metal',wheel,6)
 # Articulated overhead collector has visible hinges/insulators and a head below4.70.
 for side in(-1,1):
  x=side*.22
  prism('trolley-insulator',(x,4.49,.0),(.085,.075,.11),.019,'dark',root,'y',steps)
  polyline('trolley-collector-arm',[(x,4.505,0),(x,4.59,-.45),(x,4.65,-.05)],.013,'metal',root,[10,6,4][tier])
 tube('collector-head',(-.34,4.67,-.05),(.34,4.67,-.05),.018,'steel',root,[12,8,6][tier])
 A.add_sliding_doors(root,col,tier);A.add_family_interior(root,tier);A.add_hooks(root,col,tier)
A.export_all(STEM)
