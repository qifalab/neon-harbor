"""Editable original pixel source, CC0-1.0. No external photographs or textures."""
from pathlib import Path
from PIL import Image
import random, math
out = Path(__file__).resolve().parent
rng = random.Random(7493)
im = Image.new('RGB', (256, 512))
pix = im.load()
for y in range(512):
    for x in range(256):
        grooves = sum(math.exp(-((x-(k*25+7*math.sin(y*.022+k)))/2.7)**2) for k in range(11))
        value = .73+.16*math.sin(x*.44+y*.025)+rng.random()*.12-min(.45,grooves*.32)
        pix[x,y] = (int(105*value), int(91*value), int(72*value))
im.save(out/'original-bark-albedo.png')
for name,size,low,span in [('original-bark-roughness.png',128,.74,.20),('original-leaf-roughness.png',64,.68,.27)]:
    im = Image.new('RGB', (size,size))
    pix = im.load()
    for y in range(size):
        for x in range(size):
            pix[x,y] = (255, int(255*(low+span*(.35+.65*rng.random()))), 0)
    im.save(out/name)
