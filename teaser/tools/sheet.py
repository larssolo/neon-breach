# Contact sheet: python3 sheet.py <clipdir> <out.png> [step] [cols] [crop=x,y,w,h logical]
import sys, json, pathlib
from PIL import Image, ImageDraw, ImageFont
d = pathlib.Path(sys.argv[1]); out = sys.argv[2]
step = int(sys.argv[3]) if len(sys.argv) > 3 else 15
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 8
frames = sorted(d.glob('f_*.png'))[::step]
meta = json.loads((d / 'meta.json').read_text())
W = 200; H = int(W * 2844 / 1600)
sheet = Image.new('RGB', (cols * W, ((len(frames) + cols - 1) // cols) * (H + 14)), (20, 20, 20))
dr = ImageDraw.Draw(sheet)
for i, f in enumerate(frames):
    im = Image.open(f).convert('RGB').resize((W, H), Image.BILINEAR)
    x, y = (i % cols) * W, (i // cols) * (H + 14)
    sheet.paste(im, (x, y + 14))
    idx = int(f.stem[2:])
    st = meta['frames'][idx]
    b = st.get('boss')
    lab = f"{idx} t{idx/30:.1f} eb{st['nEB']}" + (f" hp{b['hp']/b['maxHp']:.2f}" if b else '')
    dr.text((x + 2, y + 1), lab, fill=(255, 255, 0))
sheet.save(out)
print(out, sheet.size, 'events:', {k: sum(1 for e in meta['events'] if e['name'] == k) for k in set(e['name'] for e in meta['events'])})
