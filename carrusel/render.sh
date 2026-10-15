#!/bin/bash
# uso: ./render.sh slideN  -> genera slideN.png (1254x1254)
cd "$(dirname "$0")"
/opt/pw-browsers/chromium-1194/chrome-linux/chrome --headless --no-sandbox --disable-gpu --hide-scrollbars --window-size=1254,1500 --screenshot=/tmp/_$1.png file:///home/user/proyects/carrusel/$1.html >/dev/null 2>&1
python3 -I -c "from PIL import Image;Image.open('/tmp/_$1.png').crop((0,0,1254,1254)).save('$1.png')"
