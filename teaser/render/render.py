# Full render: python3 render.py [start end] -> ../out/frames/f_0000.png ...
import os, sys, time
import multiprocessing as mp
import cv2
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), 'out', 'frames')

def work(rng):
    sys.path.insert(0, HERE)
    import teaser
    from gfx import to_u8
    a, b = rng
    for f in range(a, b):
        img = to_u8(teaser.render_frame(f))
        cv2.imwrite(os.path.join(OUT, f'f_{f:04d}.png'), cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_PNG_COMPRESSION, 1])
    return b - a

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    s = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    e = int(sys.argv[2]) if len(sys.argv) > 2 else 900
    chunk = 15
    jobs = [(i, min(e, i + chunk)) for i in range(s, e, chunk)]
    t0 = time.time()
    done = 0
    with mp.Pool(4) as pool:
        for n in pool.imap_unordered(work, jobs):
            done += n
            if done % 150 < chunk:
                print(f'{done}/{e - s} frames  {time.time() - t0:.0f}s', flush=True)
    print('total', round(time.time() - t0), 's')
