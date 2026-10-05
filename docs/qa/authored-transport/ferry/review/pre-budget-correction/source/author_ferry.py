"""Lacuna F26 / 澄弧: independent original double-deck harbour launch.
Station-lofted hull, cambered canopy with the real stair aperture, timber saloons,
wraparound pilothouse, deck cleats, liferings, mast, vents and navigation fittings.
No runtime hull mesh or bus/tram body is exported or renamed.
"""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
import author_library as A
from author_library import *
STEM='lacuna-f26'
A.M['floor']=material('marine-teak-deck',(.32,.21,.11),.87,base='timber-base.png')
A.M['green']=material('marine-green-optic',(.018,.16,.06),.28,emission=(.035,.4,.1))
A.M['pearl'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.77,.74,.65,1)
A.M['paintFar'].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(.052,.104,.092,1)
def hull_width(z):
 u=abs(z)/13
 return 3.49*(1-.965*u**6)*(1-.010*math.cos(u*math.pi))
def deck_width(z):
 u=abs(z)/13
 return min(3.29,3.5*(1-.91*u**5)*(1-.025*math.cos(u*math.pi))-.13)
def cabin_width(z):return min(3.16,deck_width(z)-.06)
def interval_holes(start,end,holes):
 ranges=[]
 for a,b in sorted(holes)+[(end,end)]:
  if a>start:ranges.append((start,a))
  start=max(start,b)
 return ranges
for tier in range(3):
 col,root=A.begin_tier(tier,STEM);n=[64,32,16][tier];rings=[16,10,6][tier]
 # A newly designed faired section blends keel, chine, shoulder and sheer.
 # Waterline y0; deepest keel stays at-0.98 within the unchanged-1m envelope.
 def hull(u,v):
  z=(u-.5)*26;w=hull_width(z);angle=v*TAU
  x=w*math.sin(angle)*(1-.08*max(0,math.cos(angle)))
  y=.16+1.14*math.cos(angle)
  # Keel lifts towards each stem; boat is not an extruded flat-ended box.
  if y<0:y+=.16*(abs(z)/13)**6
  return(x,y,z)
 grid('fair-station-loft-hull',hull,n,rings,'paint',root)
 # Both ends close with a curved stem plate below the deck.
 for end in(-1,1):
  z=end*13;w=hull_width(z)
  solid_grid('rounded-stem',lambda u,v:(w*(u-.5)*2,-.82+2.12*v,z-end*.005*math.sin(v*math.pi)),[8,4,2][tier],[12,6,3][tier],'paint',root,.02,(0,0,end))
 # Continuous rubrail and distinct waterline band follow the station shape.
 for side in(-1,1):
  points=[]
  for i in range(n+1):
   z=-12.85+25.7*i/n;points.append((side*(hull_width(z)+.004),.85,z))
  polyline('marine-rubrail',points,.024,'dark',root,[10,6,4][tier])
  grid('authored-waterline-ribbon',lambda u,v:(side*(hull_width(-12.82+25.64*v)*.985),.045+.085*u,-12.82+25.64*v),1,n,'livery',root)
 # Salon frames conform to the same logical rail/deck perimeter and true portal gaps.
 for deck in LAYOUT['decks']:
  fy=deck['y'];roof_y=3.57 if deck['id']=='lower' else 5.97
  for side in(-1,1):
   doors=[d for d in LAYOUT['doors']if d['side']==side and deck['id']=='lower']
   gaps=[(d['z']-d['width']/2,d['z']+d['width']/2)for d in doors]
   ranges=interval_holes(-9.52,9.52,gaps)
   for a,b in ranges:
    count=max(1,math.ceil((b-a)/1.42))if tier==0 else max(1,math.ceil((b-a)/3.0))
    for wi in range(count):
     za=a+(b-a)*wi/count+.043;zb=a+(b-a)*(wi+1)/count-.043
     fn=lambda u,v:(side*(cabin_width(za+(zb-za)*v)-.028),fy+.53+1.28*u,za+(zb-za)*v)
     solid_grid('marine-recessed-pane',fn,[6,3,1][tier],[6,2,1][tier],'glass',root,.016,(side,0,0))
     for z in(za-.021,zb+.021):
      x=side*cabin_width(z)
      prism('saloon-timber-upright',(x,fy+1.19,z),(.07,2.20,.050),.016,'wood',root,'y',[3,1,1][tier])
     for y in(fy+.50,fy+1.84):
      grid('pane-bronze-reveal',lambda u,v:(side*(cabin_width(za+(zb-za)*v)+.008),y+.032*u,za+(zb-za)*v),1,max(2,int((zb-za)*4)),'metal',root)
    # Lower skirts never bridge the two original portals on either bank.
    solid_grid('saloon-wood-spandrel',lambda u,v:(side*cabin_width(a+(b-a)*v),fy+.10+.38*u,a+(b-a)*v),3,max(3,int((b-a)*3)),'wood',root,.035,(side,0,0))
   # Handrails follow taper; each doorway leaves the entire width clear.
   rail_ranges=interval_holes(-11.4,11.4,gaps)
   for a,b in rail_ranges:
    pts=[(side*deck_width(a+(b-a)*i/[18,9,4][tier]),fy+1.01,a+(b-a)*i/[18,9,4][tier])for i in range([18,9,4][tier]+1)]
    polyline('continuous-curved-bulwark',pts,.024,'metal',root,[10,6,4][tier])
    for i in range(max(1,int((b-a)/1.6))+1):
     z=a+(b-a)*i/max(1,int((b-a)/1.6));x=side*deck_width(z)
     tube('bulwark-stanchion',(x,fy+.02,z),(x,fy+1.01,z),.020,'steel',root,[10,6,4][tier])
   if deck['id']=='lower':
    for d in doors:
     # 1.84m doorway: beam begins above actual1.8m passenger body.
     tube('portal-overhead-beam',(side*2.90,fy+1.865,d['z']-d['width']/2),(side*3.46,fy+1.865,d['z']-d['width']/2),.020,'metal',root,[10,6,4][tier])
     tube('portal-overhead-beam',(side*2.90,fy+1.865,d['z']+d['width']/2),(side*3.46,fy+1.865,d['z']+d['width']/2),.020,'metal',root,[10,6,4][tier])
  # End rails keep the open fore/aft deck and original balcony circulation.
  for z in(-11.4,11.4):
   w=deck_width(z);tube('deck-end-guard',(-w,fy+1.01,z),(w,fy+1.01,z),.024,'metal',root,[12,8,4][tier])
  if deck['id']=='upper':
   # Upper canopy, generous standing headroom and continuous camber.
   solid_grid('upper-cambered-canopy',lambda u,v:((u-.5)*2*(cabin_width(-9.63+19.26*v)+.12),5.99+.13*math.sin(u*math.pi),-9.63+19.26*v),[20,10,5][tier],[48,24,12][tier],'pearl',root,.075,(0,1,0))
  elif tier<2:
   # Lower canopy is split from actual upper walk surfaces, preserving the complete stair hole.
   for surf in LAYOUT['walkSurfaces']:
    if surf['deckId']!='upper':continue
    xa,xb,za,zb=surf['minX'],surf['maxX'],surf['minZ'],surf['maxZ']
    solid_grid('lower-aperture-canopy',lambda u,v:(xa+(xb-xa)*u,3.57+.035*math.sin(u*math.pi),za+(zb-za)*v),[3,2][tier],1,'pearl',root,.072,(0,1,0))
 # Distinct wraparound pilothouse sits inside the original upper driver envelope.
 dx,dz=0,LAYOUT['driver']['z'];fy=LAYOUT['driver']['floorY']
 for side in(-1,1):
  solid_grid('pilothouse-lower-return',lambda u,v:(side*(1.27-.05*math.sin(u*math.pi)),fy+.09+.67*u,dz-1.03+2.06*v),4,[14,7,3][tier],'pearl',root,.055,(side,0,0))
  solid_grid('pilothouse-wrap-glass',lambda u,v:(side*(1.238-.045*math.sin(v*math.pi)),fy+.81+1.13*u,dz-.95+1.90*v),[8,4,1][tier],[12,6,2][tier],'glass',root,.018,(side,0,0))
 for end in(-1,1):
  solid_grid('pilothouse-forward-glass',lambda u,v:(-1.20+2.4*u,fy+.81+1.13*v,dz+end*(1.019-.055*(abs(u-.5)*2)**4)),[18,8,4][tier],[10,5,2][tier],'glass',root,.018,(0,0,end))
  for x in(-1.245,1.245):tube('pilothouse-corner-frame',(x,fy+.76,dz+end*.98),(x,fy+1.99,dz+end*.98),.025,'wood',root,[12,8,6][tier])
 solid_grid('pilot-crown-roof',lambda u,v:((u-.5)*2.78,fy+2.01+.065*math.sin(u*math.pi),dz-1.17+2.34*v),[16,8,4][tier],[12,6,3][tier],'pearl',root,.06,(0,1,0))
 grid('ferry-route-03',lambda u,v:(-.65+1.3*u,fy+.35+.21*v,dz+1.053),4,1,'display',root,lambda u,v:(u*.68,.53+v*.45))
 # Deck equipment is connected and lies outside all original aisle and doorway paths.
 for side in(-1,1):
  for z in(-9.75,9.75):
   x=side*2.12
   tube('deck-cleat-base',(x,1.31,z),(x,1.51,z),.066,'metal',root,[12,8,6][tier])
   tube('deck-cleat-horns',(x-.26,1.50,z),(x+.26,1.50,z),.038,'metal',root,[12,8,6][tier])
  if tier==0:
   for z in(-8.45,8.45):
    x=side*(cabin_width(z)+.041);r=.29
    pts=[(x,2.35+r*math.cos(i/36*TAU),z+r*math.sin(i/36*TAU))for i in range(37)]
    polyline('original-lifering',pts,.055,'red',root,10)
    for angle in(0,math.pi/2,math.pi,math.pi*1.5):
     yy=2.35+r*math.cos(angle);zz=z+r*math.sin(angle)
     prism('lifering-white-band',(x,yy,zz),(.123,.081,.090),.019,'pearl',root,'x',3)
    tube('lifering-wall-bracket',(x-side*.05,2.66,z),(x,2.66,z),.018,'metal',root,8)
  prism('navigation-lamp-body',(side*2.75,5.96,7.32),(.16,.13,.15),.035,'dark',root,'y',[3,1,1][tier])
  prism('navigation-optic',(side*2.75,5.965,7.32),(.10,.09,.155),.026,'red'if side<0 else'green',root,'y',[3,1,1][tier])
 # Funnel has separate lips, vents and connected exhaust crown.
 prism('marine-exhaust-funnel',(0,6.46,-1.25),(.86,.73,.97),.12,'paint',root,'y',[3,1,1][tier])
 prism('exhaust-rain-cap',(0,6.865,-1.25),(.98,.08,1.06),.036,'dark',root,'y',[3,1,1][tier])
 for side in(-1,1):
  for z in(-1.52,-1.34,-1.16,-.98):prism('engine-exhaust-louver',(side*.431,6.50,z),(.012,.32,.085),.012,'metal',root,'x',[3,1,1][tier])
 tube('navigation-mast',(0,6.10,2.80),(0,6.935,2.80),.031,'metal',root,[14,8,6][tier])
 tube('mast-yard',(-.66,6.71,2.80),(.66,6.71,2.80),.018,'metal',root,[12,8,6][tier])
 prism('mast-head-light',(0,6.958,2.80),(.078,.074,.078),.025,'lamp',root,'y',[3,1,1][tier])
 A.add_sliding_doors(root,col,tier);A.add_family_interior(root,tier);A.add_hooks(root,col,tier)
A.export_all(STEM)
