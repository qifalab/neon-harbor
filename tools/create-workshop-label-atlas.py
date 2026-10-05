#!/usr/bin/env python3
"""Create original, readable workshop labels; no photograph is edited."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json, hashlib

ROOT = Path(__file__).resolve().parents[1]
font = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
labels = [
    ('01  收件 · 待处理', 'RECEIVING / INSPECTION'),
    ('02  修缮工作台', 'REPAIR BENCH / RETURN TOOLS'),
    ('03  完成 · 待领', 'COMPLETED / COLLECTION'),
    ('货运档案 · 检索', 'CARGO RECORDS / REFERENCE'),
    ('登记簿  R-01', 'RECEIVING LOG / 2026'),
    ('零件  A-03', 'SPARES / FITTINGS'),
    ('航运资料  C-02', 'SHIPPING / REFERENCE'),
    ('工具归位 · 保持通道', 'RETURN TOOLS / KEEP AISLE CLEAR'),
]
image = Image.new('RGB', (1024, 1024), '#e6dfc9')
draw = ImageDraw.Draw(image)
large = ImageFont.truetype(font, 55)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 26)
for i, (title, subtitle) in enumerate(labels):
    y = i * 128
    draw.rectangle((0, y, 1023, y + 5), fill='#244e4a')
    draw.text((28, y + 12), title, font=large, fill='#223d39')
    draw.text((31, y + 87), subtitle, font=small, fill='#475a4f')
    draw.rectangle((0, y + 122, 1023, y + 127), fill='#244e4a')
destination = ROOT / 'evidence/authored-source/workshop-labels.png'
destination.parent.mkdir(parents=True, exist_ok=True)
image.save(destination, optimize=True)
record = {'scope': 'Original static environmental labels, not live job/inventory assertions',
          'font': 'Noto Sans CJK and DejaVu Sans installed system fonts; no font file redistributed',
          'pixels': [1024, 1024], 'rows': labels, 'bytes': destination.stat().st_size,
          'sha256': hashlib.sha256(destination.read_bytes()).hexdigest()}
(destination.parent / 'labels-source.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'bytes': record['bytes'], 'sha256': record['sha256']}))
