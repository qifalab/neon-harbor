"""Original small PBR maps; no photograph, external asset or render engine."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont
OUT=Path(__file__).resolve().parents[1]/'textures'
OUT.mkdir(exist_ok=True)
n=512; y,x=np.mgrid[0:n,0:n]; rng=np.random.default_rng(20261004)
noise=rng.normal(0,1,(n,n))
def rgb(name,data): Image.fromarray(np.uint8(np.clip(data,0,255)),'RGB').save(OUT/name,optimize=True)
# Small roughness variation, no fake painted highlight baked into albedo.
paint=np.zeros((n,n,3)); paint[:]=[48,91,90]; paint+=noise[:,:,None]*.85
rgb('coat-base.png',paint)
orm=np.zeros((n,n,3));orm[:,:,0]=255;orm[:,:,1]=99+noise*4;orm[:,:,2]=43
rgb('coat-orm.png',orm)
h=.003*np.sin(x*2*np.pi/7)*np.sin(y*2*np.pi/9)+.0007*noise
dy,dx=np.gradient(h)
rgb('coat-normal.png',np.stack([128-dx*600,128-dy*600,np.ones_like(x)*255],2))
warp=(x%6<2)*1.7+(y%6<2)*1.5 + .8*np.sin((x+y)*2*np.pi/24)
cloth=np.zeros((n,n,3));cloth[:]=[73,93,100];cloth+=(warp+noise*.65)[:,:,None]
rgb('fabric-base.png',cloth)
h=.0035*np.sin(x*2*np.pi/6)*np.sin(y*2*np.pi/6)
dy,dx=np.gradient(h)
rgb('fabric-normal.png',np.stack([128-dx*1700,128-dy*1700,np.ones_like(x)*255],2))
floor=np.zeros((n,n,3));floor[:]=[56,61,63];floor+=noise[:,:,None]*4
specks=rng.random((n,n))<.006;floor[specks]=[105,110,106]
rgb('floor-base.png',floor)
# Authored atlas: fictional mark and route, high-contrast readable instrument labels.
im=Image.new('RGB',(1024,512),(18,28,30));d=ImageDraw.Draw(im)
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def font(size):return ImageFont.truetype(font_path,size)
d.rectangle((0,0,1023,255),fill=(15,24,26))
d.text((32,16),'12',font=font(128),fill=(233,191,106));d.text((225,55),'QUAY LOOP',font=font(54),fill=(233,191,106))
d.text((235,124),'SEREIN / D11',font=font(28),fill=(175,185,169))
# Original two offset arcs: no real operator or manufacturer insignia.
d.arc((730,26,854,150),30,280,fill=(235,222,183),width=9)
d.arc((768,44,892,168),190,80,fill=(235,222,183),width=9)
d.text((730,180),'SEREIN',font=font(29),fill=(235,222,183))
for i in range(3):
 cx=154+i*275;cy=378;r=88;d.ellipse((cx-r,cy-r,cx+r,cy+r),outline=(151,171,168),width=4)
 for a in np.linspace(-3.9,.75,25):
  p=(cx+np.cos(a)*77,cy+np.sin(a)*77);q=(cx+np.cos(a)*69,cy+np.sin(a)*69);d.line([p,q],fill=(220,224,205),width=2)
 d.line([(cx,cy),(cx-34,cy-41)],fill=(232,130,73),width=4)
 d.text((cx-20,cy+17),['km/h','RPM','AIR'][i],font=font(18),fill=(203,213,203))
im.save(OUT/'route-instruments-atlas.png',optimize=True)
print('Original maps:',len(list(OUT.glob('*.png'))),'PNG files')
