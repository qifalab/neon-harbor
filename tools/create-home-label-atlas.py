#!/usr/bin/env python3
"""Create original domestic print artwork; no imported photo is altered."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'docs/qa/authored-home/authored-source';out.mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',30)
small=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',18)
im=Image.new('RGB',(1024,1024),'#e7dec9');d=ImageDraw.Draw(im)
labels=[('苔巷的日常','A HOME AT MOSS LANE'),('港湾潮汐记录','HARBOUR TIDE NOTES / OCTOBER'),
 ('十月 · 生活日历','01  02  03  04  05  06  07'),('海风与船','BOOKS / SEA & STORIES'),
 ('晚饭的食谱','RICE / VEGETABLES / SOUP'),('衣物 · 清洗后晾干','WASH / AIR DRY'),
 ('手写笔记','NOTES / RETURN LIBRARY BOOK'),('小城的早晨','THE CITY WAKES AT DAWN')]
for row,(title,sub) in enumerate(labels):
 y=row*128;d.rectangle((12,y+8,1011,y+119),outline='#84765c',width=2)
 d.text((35,y+19),title,font=font,fill='#314c49');d.text((36,y+73),sub,font=small,fill='#645c4c')
 for n in range(7):
  x=652+n*42;d.line((x,y+33,x+21,y+33+(n*13)%48),fill='#75847a',width=3)
im.save(out/'home-prints.png')
print(out/'home-prints.png')
