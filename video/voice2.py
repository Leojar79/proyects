"""Arma la locución con pausas controladas y la masteriza.
Cada frase se recorta de la grabación y se colocan silencios a propósito:
pausa corta entre frases y pausa larga antes de cada cambio de tema.
Uso: python3 voice2.py entrada.wav salida.wav newt.json"""
import json, re, subprocess, sys

SRC, OUT, NEWT = sys.argv[1:4]
SR = 48000

# (inicio, fin) de cada frase en la grabación "esta si"; orden = orden hablado
ORIG = {0: (2.30, 13.40), 1: (13.45, 15.50), 2: (15.97, 18.14), 3: (18.66, 24.48), 4: (25.14, 29.20),
        5: (29.49, 33.05), 6: (33.50, 36.34), 16: (37.20, 47.49), 7: (47.83, 50.00), 8: (50.03, 54.19),
        9: (54.86, 61.37), 10: (61.69, 67.12), 11: (68.10, 71.16), 12: (71.77, 73.29), 13: (73.70, 78.62),
        14: (78.94, 80.95), 15: (81.22, 82.66)}
SHORT, LONG = 0.45, 0.85
LONG_BEFORE = {2, 4, 16, 7, 9, 11, 14}      # cambios de tema
PRE, POST = 0.10, 0.16                     # margen para no cortar respiración ni colas
LEAD = 0.5

order = sorted(ORIG, key=lambda k: ORIG[k][0])
# fusiona frases pegadas (sin silencio real entre ellas)
groups = []
for k in order:
    if groups and ORIG[k][0] - ORIG[groups[-1][-1]][1] < 0.12:
        groups[-1].append(k)
    else:
        groups.append([k])

pieces, newt, pos = [], {}, LEAD
for gi, g in enumerate(groups):
    if gi > 0:
        pos += (LONG if g[0] in LONG_BEFORE else SHORT) - (PRE + POST)   # silencio real entre palabras
    s = ORIG[g[0]][0] - PRE
    e = ORIG[g[-1]][1] + POST
    for k in g:
        newt[k] = [round(pos + (ORIG[k][0] - s), 3), round(pos + (ORIG[k][1] - s), 3)]
    pieces.append((s, e, pos))
    pos += e - s
total = pos
json.dump({'NEWT': newt, 'END': round(total + 1.6, 2)}, open(NEWT, 'w'))

edit = [f'[0:a]atrim={s:.3f}:{e:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={e - s - 0.04:.3f}:d=0.04,'
        f'adelay={int(p * 1000)}[p{i}]' for i, (s, e, p) in enumerate(pieces)]
chain = ','.join([
    f'amix=inputs={len(pieces)}:normalize=0',
    'highpass=f=90:p=2', 'highpass=f=90:p=2',               # retumbe / golpes de aire
    'agate=threshold=0.004:ratio=2:attack=3:release=200:range=0.2',
    'lowshelf=f=170:g=1.5',                                  # calidez
    'equalizer=f=300:t=q:w=1.1:g=-3',                        # encajonado
    'equalizer=f=700:t=q:w=1.4:g=-1',
    'equalizer=f=2700:t=q:w=1.2:g=2.5',                      # presencia
    'equalizer=f=5000:t=q:w=1.2:g=2',                        # claridad de consonantes
    'aexciter=amount=1.6:drive=6:blend=0:freq=5500:ceil=17000',  # brillo sobre los 12 kHz que faltan
    'highshelf=f=11000:g=2',
    'deesser=i=0.5:m=0.5:f=0.5',
    'acompressor=threshold=-26dB:ratio=3:attack=4:release=90:knee=4:makeup=3dB',
    'acompressor=threshold=-16dB:ratio=2.2:attack=12:release=180:knee=6',
    'volume=6dB',
    'alimiter=limit=0.84:attack=2:release=60:level=0',
])
graph = ';'.join(edit + [''.join(f'[p{i}]' for i in range(len(pieces))) + chain + f',apad=whole_dur={total + 0.3:.3f}[pre]'])
tmp = OUT + '.pre.wav'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-filter_complex', graph, '-map', '[pre]',
                '-ar', str(SR), '-ac', '1', tmp], check=True)
# ganancia exacta a -14 LUFS + limitador de picos (-1.5 dBTP)
for _ in range(2):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', tmp, '-af', 'ebur128', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1])
    gain = -14.0 - I
    nxt = OUT + f'.g{_}.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af',
                    f'volume={gain:.2f}dB,alimiter=limit=0.84:attack=1:release=60:level=0',
                    '-ar', str(SR), '-ac', '1', nxt], check=True)
    tmp = nxt
    if abs(gain) < 0.3:
        break
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', nxt, '-ac', '2', OUT], check=True)
print('ok', OUT, len(pieces), 'bloques,', round(total, 2), 's de voz')
print(json.dumps(newt))
