"""Edita y masteriza la voz: recorta pausas largas y aplica una cadena de locución profesional.
Uso: python3 voice.py entrada.wav salida.wav newt.json"""
import json, re, subprocess, sys

SRC, OUT, NEWT = sys.argv[1:4]

# inicio y fin (s) de cada frase en la grabación original (toma 51)
ORIG = {0: (1.82, 11.90), 1: (12.46, 14.15), 2: (14.62, 16.91), 3: (17.26, 22.50), 4: (23.30, 26.51),
        5: (27.00, 30.40), 6: (30.42, 33.16), 16: (33.70, 42.60), 7: (43.12, 44.60), 8: (44.74, 48.84),
        9: (49.40, 54.61), 10: (55.14, 60.36), 11: (61.60, 64.84), 12: (65.07, 67.01), 13: (67.27, 70.87),
        14: (71.30, 73.70), 15: (74.22, 75.75)}
MAXGAP, LEAD = 0.5, 0.45

order = sorted(ORIG, key=lambda k: ORIG[k][0])
segs, cur = [], ORIG[order[0]][0] - 0.2
for i, k in enumerate(order):
    e = ORIG[k][1]
    if i + 1 < len(order):
        ns = ORIG[order[i + 1]][0]
        if ns - e > MAXGAP:
            segs.append((cur, e + 0.22)); cur = ns - 0.18
    else:
        segs.append((cur, e + 0.4))
pos, sm = LEAD, []
for s, e in segs:
    sm.append((s, e, pos)); pos += e - s


def m(t):
    for s, e, p in sm:
        if s - 0.001 <= t <= e + 0.001:
            return p + (t - s)
    raise ValueError(t)


json.dump({'NEWT': {k: [round(m(a), 3), round(m(b), 3)] for k, (a, b) in ORIG.items()}, 'END': round(pos + 1.6, 2)},
          open(NEWT, 'w'))

edit = [f'[0:a]atrim={s:.3f}:{e:.3f},asetpts=PTS-STARTPTS,afade=t=in:d=0.025,afade=t=out:st={e - s - 0.05:.3f}:d=0.05[s{i}]'
        for i, (s, e) in enumerate(segs)]
chain = ','.join([
    f'concat=n={len(segs)}:v=0:a=1',
    'highpass=f=95:p=2', 'highpass=f=95:p=2',                # retumbe y golpes de aire (24 dB/oct)
    'afftdn=nr=10:nf=-50:tn=1',                              # reducción de ruido suave
    'agate=threshold=0.006:ratio=2.5:attack=4:release=180:range=0.12',  # limpia entre palabras
    'lowshelf=f=160:g=1.5',                                   # calidez
    'equalizer=f=320:t=q:w=1.1:g=-3.5',                       # quita lo "encajonado"
    'equalizer=f=650:t=q:w=1.5:g=-1.2',
    'equalizer=f=2800:t=q:w=1.2:g=2.5',                       # presencia / inteligibilidad
    'equalizer=f=4800:t=q:w=1.0:g=3',                         # rellena el hueco del micrófono del celular
    'highshelf=f=10500:g=2.5',                                # aire
    'aexciter=amount=1.5:drive=6:blend=0:freq=4500:ceil=16000',  # armónicos para brillo
    'deesser=i=0.5:m=0.5:f=0.5',
    'acompressor=threshold=-26dB:ratio=3.5:attack=3:release=80:knee=4:makeup=3dB',
    'acompressor=threshold=-16dB:ratio=2.5:attack=12:release=180:knee=6',
    'alimiter=limit=0.89:attack=3:release=40',
    f'adelay={int(LEAD * 1000)}',
])
graph = ';'.join(edit + [''.join(f'[s{i}]' for i in range(len(segs))) + chain + '[pre]'])
tmp = OUT + '.pre.wav'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', SRC, '-filter_complex', graph, '-map', '[pre]',
                '-ar', '48000', '-ac', '1', tmp], check=True)

# normalización en dos pasadas (lineal, sin bombeo) a -14 LUFS
r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', tmp, '-af',
                    'loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json', '-f', 'null', '-'],
                   capture_output=True, text=True).stderr
mj = json.loads(re.search(r'\{[^{}]*"input_i"[^{}]*\}', r, re.S).group(0))
ln = (f"loudnorm=I=-14:TP=-1.5:LRA=7:measured_I={mj['input_i']}:measured_TP={mj['input_tp']}:"
      f"measured_LRA={mj['input_lra']}:measured_thresh={mj['input_thresh']}:offset={mj['target_offset']}:linear=true")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-af', ln, '-ar', '48000', '-ac', '2', OUT], check=True)
print('ok', OUT, len(segs), 'segmentos', round(pos, 2), 's')
