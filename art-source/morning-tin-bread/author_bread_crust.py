#!/usr/bin/env python3
"""Original dry baked crust / crumb atlas. MIT code; CC0 authored maps.
No photographs, external textures, screenshots or baked lighting. NumPy/Pillow.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parent
SIZE=512;SEED=202610059403;WIDTH_M=.304;DEPTH_M=.196

def noise(rng,nx,ny):
 g=rng.uniform(-1,1,(ny,nx));x=np.arange(SIZE)*nx/SIZE;y=np.arange(SIZE)*ny/SIZE
 ix=np.floor(x).astype(int);iy=np.floor(y).astype(int);fx=x-ix;fy=y-iy
 wx=fx*fx*(3-2*fx);wy=fy*fy*(3-2*fy)
 a=g[iy[:,None]%ny,ix[None,:]%nx];b=g[iy[:,None]%ny,(ix[None,:]+1)%nx]
 c=g[(iy[:,None]+1)%ny,ix[None,:]%nx];d=g[(iy[:,None]+1)%ny,(ix[None,:]+1)%nx]
 return (a*(1-wx)+b*wx)*(1-wy[:,None])+(c*(1-wx)+d*wx)*wy[:,None]

def main():
 rng=np.random.default_rng(SEED);x,z=np.meshgrid(np.arange(SIZE)/SIZE,np.arange(SIZE)/SIZE)
 # Baking colour is primarily amber. Low-frequency cloud contrast is deliberately
 # subordinate to narrow, nonperiodic dry cracks and toasted skin blister edges.
 broad=noise(rng,9,7);grain=noise(rng,112,75);fine=noise(rng,187,137)
 crust=np.zeros((SIZE,SIZE,3))+[203,139,70]
 crust+=broad[...,None]*np.array([6,5,3])+grain[...,None]*np.array([9,7,4])
 height=.45+.045*grain+.023*fine;rough=.83+.032*grain
 pores=np.zeros((SIZE,SIZE));skin=np.zeros_like(pores)
 for _ in range(340):
  cx,cz=rng.random(2);rx=rng.uniform(.003,.009);rz=rx*rng.uniform(.5,1.4)
  dx=((x-cx+.5)%1-.5)/rx;dz=((z-cz+.5)%1-.5)/rz
  angle=rng.uniform(-3.14,3.14);u=dx*np.cos(angle)+dz*np.sin(angle);v=-dx*np.sin(angle)+dz*np.cos(angle)
  q=(u*u*(1+.23*np.tanh(v))+v*v*(1+.3*np.tanh(u)))*(1+.32*grain+.19*fine)
  blister=np.exp(-q*1.7);rim=np.exp(-((np.sqrt(np.maximum(q,0))-.92)/.24)**2)
  skin=np.maximum(skin,blister*.18);pores=np.maximum(pores,rim*rng.uniform(.18,.65)*np.clip(.48+grain*1.8+fine*.65,0,1))
 crust-=pores[...,None]*np.array([54,42,22]);crust+=skin[...,None]*np.array([23,17,8])
 height+=skin*.85-pores*.11;rough-=skin*.15;rough+=pores*.06
 # Sparse fractured surface lines have hard edges rather than cloudy circles.
 cracks=np.zeros_like(pores)
 for _ in range(84):
  a=rng.random(2);angle=rng.uniform(0,np.pi*2)
  for j in range(int(rng.integers(2,5))):
   angle+=rng.uniform(-.65,.65);b=a+np.array([np.cos(angle),np.sin(angle)])*rng.uniform(.012,.034)
   ab=b-a;dx=(x-a[0]+.5)%1-.5;dz=(z-a[1]+.5)%1-.5;t=np.clip((dx*ab[0]+dz*ab[1])/(ab@ab),0,1)
   dist=(dx-t*ab[0])**2+(dz-t*ab[1])**2
   line=np.exp(-dist/(2*rng.uniform(.0007,.0012)**2));cracks=np.maximum(cracks,line);a=b
 crust-=cracks[...,None]*np.array([61,45,24]);height-=cracks*.15;rough+=cracks*.08
 # Exposed score crumb is a different dry porous surface, not the crust bump
 # duplicated in beige. Small unequal cavities and flakes never add light/shadow.
 crumb=np.zeros_like(crust)+[224,182,117];cg=noise(rng,81,109);crumb+=cg[...,None]*np.array([9,8,5])
 ch=.56+.055*cg;cr=.91+.017*cg;holes=np.zeros_like(pores)
 for _ in range(470):
  cx,cz=rng.random(2);rx=rng.uniform(.002,.0055);rz=rx*rng.uniform(.5,1.8)
  q=(((x-cx+.5)%1-.5)/rx)**2+(((z-cz+.5)%1-.5)/rz)**2
  hole=np.exp(-q*2.4);holes=np.maximum(holes,hole*rng.uniform(.4,1))
 crumb-=holes[...,None]*np.array([76,61,39]);ch-=holes*.34;cr+=holes*.04
 def atlas(left,right,mode):
  li=Image.fromarray(np.clip(np.rint(left),0,255).astype(np.uint8),mode).resize((384,SIZE),Image.Resampling.LANCZOS)
  ri=Image.fromarray(np.clip(np.rint(right),0,255).astype(np.uint8),mode).resize((128,SIZE),Image.Resampling.LANCZOS)
  a=Image.new(mode,(SIZE,SIZE));a.paste(li,(0,0));a.paste(ri,(384,0));return a
 maps={'bread-crust-albedo.png':atlas(crust,crumb,'RGB'),
       'bread-crust-height.png':atlas(np.clip(height,.04,.94)*255,np.clip(ch,.04,.94)*255,'L'),
       'bread-crust-roughness.png':atlas(np.clip(rough,.73,.94)*255,np.clip(cr,.84,.96)*255,'L')}
 rows=[]
 for name,image in maps.items():
  image.save(ROOT/name,optimize=True);data=(ROOT/name).read_bytes();rows.append({'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
 recipe={'schema':3,'seed':SEED,'size_px':[512,512],'atlas_regions':{'crust':[0,0,.75,1],'independently_authored_dry_crumb':[.75,0,1,1]},'assetLicense':'CC0-1.0','codeLicense':'MIT','originalProceduralInputsOnly':True,'externalPhotosOrTextures':False,'bakedLighting':False,'noScreenshotInput':True,'bumpScaleCrustMetres':.0011,'bumpScaleCrumbMetres':.00065,'crumbUsesOwnAtlasRegionNotCrustRelief':True,'bakePaletteBaseSRGB':[203,139,70],'crustBlisters':340,'fracturePaths':84,'crumbPores':470,'files':rows,'gpuRGBA8MipUpperBoundBytes':512*512*4*3*4//3,'actualVRAMMeasured':False}
 (ROOT/'bread-crust-recipe.json').write_text(json.dumps(recipe,indent=2)+'\n')
 preview=Image.new('RGB',(SIZE*3,SIZE));
 for i,im in enumerate(maps.values()):preview.paste(im.convert('RGB'),(i*SIZE,0))
 preview.save(ROOT/'texture-channel-preview.png',optimize=True)
 print(json.dumps(recipe))
if __name__=='__main__':main()
