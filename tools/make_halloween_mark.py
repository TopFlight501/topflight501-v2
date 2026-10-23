"""Builds the Halloween logos (public/img/mark-halloween.png and -dark.png): the football becomes a
glowing jack-o'-lantern and a spider dangles from the flight. Run: python tools/make_halloween_mark.py"""
import base64, os
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
mark = base64.b64encode(open(os.path.join(ROOT, 'public/img/mark.png'), 'rb').read()).decode()
DARK_FILTER = 'brightness(0) invert(.85) sepia(.3) hue-rotate(140deg)'   # same as the site's dark-mode logo
S = 4

def svg(col, filt):
    cx, cy, r = 97.5, 170, 60
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{195*S}" height="{320*S}" viewBox="0 0 195 320">
<defs>
 <radialGradient id="pk" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#FFB547"/><stop offset=".55" stop-color="#F28C1B"/><stop offset="1" stop-color="#C85A0C"/></radialGradient>
 <radialGradient id="glow" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="#FFF6B0"/><stop offset=".6" stop-color="#FFD34D"/><stop offset="1" stop-color="#FFB020"/></radialGradient>
</defs>
<image href="data:image/png;base64,{mark}" width="195" height="320" style="filter:{filt}"/>
<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"/>
<ellipse cx="{cx}" cy="{cy+2}" rx="{r-7}" ry="{r-9}" fill="url(#pk)"/>
<ellipse cx="{cx}" cy="{cy+2}" rx="{(r-7)*0.55}" ry="{r-9}" fill="none" stroke="#B4500A" stroke-width="2.2" opacity=".55"/>
<ellipse cx="{cx}" cy="{cy+2}" rx="{(r-7)*0.18}" ry="{r-10}" fill="none" stroke="#B4500A" stroke-width="2" opacity=".45"/>
<polygon points="{cx-30},{cy-6} {cx-12},{cy-6} {cx-21},{cy-24}" fill="url(#glow)"/>
<polygon points="{cx+12},{cy-6} {cx+30},{cy-6} {cx+21},{cy-24}" fill="url(#glow)"/>
<polygon points="{cx-5},{cy+5} {cx+5},{cy+5} {cx},{cy-4}" fill="url(#glow)"/>
<path d="M{cx-34},{cy+13} Q{cx},{cy+20} {cx+34},{cy+13} Q{cx+30},{cy+38} {cx},{cy+41} Q{cx-30},{cy+38} {cx-34},{cy+13} Z" fill="url(#glow)"/>
<rect x="{cx-17}" y="{cy+16}" width="7" height="9" fill="#E07A12"/><rect x="{cx+9}" y="{cy+16}" width="7" height="9" fill="#E07A12"/>
<line x1="171" y1="160" x2="171" y2="214" stroke="{col}" stroke-width="1.2"/>
<g transform="translate(171 219)" fill="{col}" stroke="{col}">
 <ellipse rx="6" ry="7"/><circle cy="-8" r="4"/>
 <g fill="none" stroke-width="1.6" stroke-linecap="round">
  <path d="M-5,-3 l-7,-5 l-3,4 M-6,1 l-8,-1 l-3,5 M-5,4 l-6,5 l-1,5"/><path d="M5,-3 l7,-5 l3,4 M6,1 l8,-1 l3,5 M5,4 l6,5 l1,5"/>
 </g>
 <circle cx="-1.6" cy="-9" r="1.1" fill="#FFD34D" stroke="none"/><circle cx="1.6" cy="-9" r="1.1" fill="#FFD34D" stroke="none"/>
</g></svg>'''

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 195 * S, 'height': 320 * S})
    for name, col, filt in [('mark-halloween.png', '#1E4B57', 'none'), ('mark-halloween-dark.png', '#D4EBEF', DARK_FILTER)]:
        pg.set_content(f'<html><body style="margin:0;background:transparent">{svg(col, filt)}</body></html>'); pg.wait_for_timeout(300)
        tmp = os.path.join(ROOT, '.dev', name); os.makedirs(os.path.dirname(tmp), exist_ok=True)
        pg.screenshot(path=tmp, omit_background=True)
        Image.open(tmp).convert('RGBA').resize((390, 640), Image.LANCZOS).save(os.path.join(ROOT, 'public/img', name), optimize=True)
    b.close()
print('ok')
