"""Builds the deterministic capture harness from the live game files (run from teaser/).
- harness/game.patched.js: game.js with a fixed 800x1422 logical field + supersampled drawing
- harness/index.html: the game's own page, local fonts, no backdrop/audio, 1600x2844 canvas"""
import pathlib
import re
import shutil

T = pathlib.Path(__file__).resolve().parent.parent
GAME = T.parent
H = T / 'harness'

src = (GAME / 'game.js').read_text()
for a, b in [
    ("const VW = cvs.width;   // 800", "const VW = 800;"),
    ("const VH = cvs.height;  // 1000", "const VH = 1422;"),
    ("function drawScene(dt) {\n  ctx.save();",
     "function drawScene(dt) {\n  ctx.setTransform(window.__SS,0,0,window.__SS,0,0);\n  ctx.save();"),
]:
    assert src.count(a) == 1, f'game.js changed, patch point not found: {a!r}'
    src = src.replace(a, b)
(H / 'game.patched.js').write_text(src)
for f in ('sectors.js', 'config.js'):
    shutil.copy(GAME / f, H / f)

html = (GAME / 'index.html').read_text()
html = re.sub(r'<link rel="preconnect"[^>]*>\n', '', html)
html = re.sub(r'<link href="https://fonts.googleapis.com[^>]*>\n', '', html)
html = html.replace('<link rel="stylesheet" href="style.css">',
                    '<style>@font-face{font-family:"Press Start 2P";src:url(../fonts/PressStart2P.ttf)}'
                    '@font-face{font-family:"VT323";src:url(../fonts/VT323.ttf)}'
                    'body{margin:0;background:#000} .overlay,#coin-screen,#hud,#crt{display:none!important} '
                    'canvas#game{width:400px;height:711px}</style>')
html = html.replace('<canvas id="game" width="800" height="1422"></canvas>',
                    '<canvas id="game" width="1600" height="2844"></canvas>')
html = html.replace(' src="audio/start.mp3"', '').replace(' src="audio/game.mp3"', '')
html = html.replace('<script src="config.js"></script>', '<script src="init.js"></script>\n<script src="config.js"></script>')
html = html.replace('<script src="game.js"></script>', '<script src="game.patched.js"></script>\n<script src="harness.js"></script>')
html = html.replace('<script src="backdrop.js"></script>\n', '')
assert 'harness.js' in html and 'init.js' in html and '2844' in html
(H / 'index.html').write_text(html)
print('harness built')
