# python3 test_frames.py out.png beat1 beat2 ...   -> contact sheet of rendered frames (960x540 each, 3 cols)
import sys, math, numpy as np, cv2, time
sys.path.insert(0, '.')
import teaser
from gfx import to_u8, FPS, BEAT
out = sys.argv[1]; beats = [float(x) for x in sys.argv[2:]]
cols = 3; tw, th = 640, 360
sheet = np.zeros((math.ceil(len(beats)/cols)*(th+20), cols*tw, 3), np.uint8)
t0 = time.time()
for k, bb in enumerate(beats):
    f = int(round(bb * BEAT * FPS))
    img = to_u8(teaser.render_frame(f))
    im = cv2.resize(img, (tw, th), interpolation=cv2.INTER_AREA)
    y, x = (k//cols)*(th+20), (k%cols)*tw
    sheet[y+20:y+20+th, x:x+tw] = im
    cv2.putText(sheet, f'B{bb} f{f}', (x+4, y+15), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255,255,0), 1)
cv2.imwrite(out, cv2.cvtColor(sheet, cv2.COLOR_RGB2BGR))
print(out, f'{(time.time()-t0)/len(beats):.2f}s/frame')
