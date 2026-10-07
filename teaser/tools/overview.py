# overview: rows of thumbnails for several clips. python3 overview.py out.png step clip1 clip2 ...
import sys, json, pathlib
from PIL import Image, ImageDraw
out, step, names = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
SCR = pathlib.Path(__file__).resolve().parent.parent
TW, TH, COLS = 112, 199, 16
rows = []
for n in names:
    d = SCR / 'clips' / n
    meta = json.loads((d / 'meta.json').read_text())
    fr = sorted(d.glob('f_*.png'))[::step][:COLS]
    row = Image.new('RGB', (COLS * TW, TH + 12), (25, 25, 25))
    dr = ImageDraw.Draw(row)
    for i, f in enumerate(fr):
        row.paste(Image.open(f).convert('RGB').resize((TW, TH), Image.BILINEAR), (i * TW, 12))
        dr.text((i * TW + 2, 0), f"{n[:9]} {int(f.stem[2:])}", fill=(255, 255, 0))
    rows.append(row)
img = Image.new('RGB', (COLS * TW, len(rows) * (TH + 12)))
for i, r in enumerate(rows): img.paste(r, (0, i * (TH + 12)))
img.save(out); print(out, img.size)
