"""Música de fondo original estilo chiptune para el video de simulación (93 s).

Se sintetiza todo con código (sin samples ni material de terceros): ondas de pulso
de banda limitada, bajo triangular, ruido para la batería y efectos cortos.
La estructura sigue las secciones de sim/voz.json y los golpes caen en los
momentos en que la voz nombra algo (sello, preguntas, monedas, GAME OVER, cierre).

Uso: python3 sim/musica.py  ->  audio/musica.wav (estéreo, 48 kHz, 93.0 s)
"""
import json
import os
import wave

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
SR = 48000
VOZ = json.load(open(os.path.join(AQUI, 'voz.json'), encoding='utf-8'))
DUR = float(VOZ['duracion'])
N = int(round(DUR * SR))
BPM = 110.0
NEGRA = 60.0 / BPM
COMPAS = 4 * NEGRA
SEC = {s['id']: (s['inicio'], s['fin']) for s in VOZ['secciones']}

rng = np.random.default_rng(1984)
L = np.zeros(N)
R = np.zeros(N)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def envolvente(n, ataque=0.004, caida=0.08, sostener=0.6, relajar=0.03):
    t = np.arange(n) / SR
    dur = n / SR
    env = np.ones(n) * sostener
    a = t < ataque
    env[a] = t[a] / ataque
    d = (t >= ataque) & (t < ataque + caida)
    env[d] = 1 - (1 - sostener) * (t[d] - ataque) / caida
    r = t > dur - relajar
    env[r] *= np.clip((dur - t[r]) / relajar, 0, 1)
    return env


def pulso(f, n, duty=0.25, techo=9000.0, vibrato=0.0):
    """Onda de pulso de banda limitada (suma de armónicos hasta `techo` Hz)."""
    t = np.arange(n) / SR
    fase = 2 * np.pi * f * t
    if vibrato:
        fase += vibrato * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.15, 0, 1)
    x = np.zeros(n)
    k_max = int(min(techo, SR / 2 - 500) // f)
    for k in range(1, max(k_max, 1) + 1):
        a = (2 / (k * np.pi)) * np.sin(np.pi * k * duty)
        x += a * np.cos(k * fase - np.pi * k * duty)
    return x - x.mean()


def triangulo(f, n, techo=4000.0):
    t = np.arange(n) / SR
    x = np.zeros(n)
    k = 1
    while k * f < min(techo, SR / 2 - 500):
        x += ((-1) ** ((k - 1) // 2)) * np.sin(2 * np.pi * k * f * t) / (k * k)
        k += 2
    return x * 8 / np.pi ** 2


def ruido_filtrado(n, bajo=None, alto=None):
    x = rng.standard_normal(n)
    X = np.fft.rfft(x)
    fr = np.fft.rfftfreq(n, 1 / SR)
    m = np.ones_like(fr)
    if bajo:
        m *= 1 / (1 + (bajo / np.maximum(fr, 1)) ** 4)
    if alto:
        m *= 1 / (1 + (fr / alto) ** 4)
    return np.fft.irfft(X * m, n)


def poner(x, inicio, gan=1.0, pan=0.0):
    i0 = int(round(inicio * SR))
    if i0 >= N:
        return
    x = x[: N - i0]
    l = np.cos((pan + 1) * np.pi / 4) * gan
    r = np.sin((pan + 1) * np.pi / 4) * gan
    L[i0 : i0 + len(x)] += x * l
    R[i0 : i0 + len(x)] += x * r


def nota(midi, inicio, dur, gan, pan=0.0, duty=0.25, techo=6000.0, vibrato=0.0, **env):
    n = max(int(dur * SR), 64)
    poner(pulso(hz(midi), n, duty, techo, vibrato) * envolvente(n, **env), inicio, gan, pan)


def bajo(midi, inicio, dur, gan):
    n = max(int(dur * SR), 64)
    poner(triangulo(hz(midi), n) * envolvente(n, 0.004, 0.05, 0.8, 0.02), inicio, gan, 0.0)


def bombo(inicio, gan=0.9):
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    f = 50 + 110 * np.exp(-t * 28)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 18)
    poner(x, inicio, gan)


def caja(inicio, gan=0.5):
    n = int(0.14 * SR)
    t = np.arange(n) / SR
    x = ruido_filtrado(n, 900, 7000) * np.exp(-t * 26) * 0.7 + np.sin(2 * np.pi * 185 * t) * np.exp(-t * 30) * 0.5
    poner(x, inicio, gan, 0.05)


def platillo(inicio, gan=0.18, abierto=False):
    n = int((0.22 if abierto else 0.035) * SR)
    t = np.arange(n) / SR
    x = ruido_filtrado(n, 7000, 15000) * np.exp(-t * (10 if abierto else 90))
    poner(x, inicio, gan, 0.25)


def golpe_crash(inicio, gan=0.25):
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    poner(ruido_filtrado(n, 3000, 14000) * np.exp(-t * 3.5), inicio, gan, -0.1)


# --- Armonía -----------------------------------------------------------------
# La menor (Am F C G) en casi todo; el cierre se abre a mayor (C G Am F) y termina en Do mayor.
MENOR = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [48, 52, 55]), (55, [55, 59, 62])]
MAYOR = [(48, [48, 52, 55]), (55, [55, 59, 62]), (57, [57, 60, 64]), (53, [53, 57, 60])]


def acorde(t):
    prog = MAYOR if t >= SEC['cierre'][0] else MENOR
    return prog[int(t // COMPAS) % 4]


def seccion(t):
    for k, (a, b) in SEC.items():
        if a <= t < b:
            return k
    return 'cierre'


# Intensidad por sección: (bajo, arpegio, bombo, caja, platillo)
PERFIL = {
    'gancho': (1, 1, 1, 1, 1),
    'quees': (1, 1, 1, 0, 1),
    'decisiones': (1, 1, 1, 1, 1),
    'comoresponde': (1, 0.6, 0, 0, 0.5),
    'juego': (1, 1, 1, 1, 1),
    'numeros': (1, 1, 1, 1, 1),
    'aclaracion': (0.7, 0, 0, 0, 0),
    'cierre': (1, 0.8, 1, 1, 1),
}

FIN_MUSICA = 89.9  # acorde final; después solo la cola

# --- Bajo, arpegios y batería sobre la rejilla de corcheas/semicorcheas ----------
semi = NEGRA / 4
paso = 0
t = 0.0
while t < FIN_MUSICA - 0.01:
    sec = seccion(t)
    pb, pa, pk, ps, ph = PERFIL[sec]
    raiz, tonos = acorde(t)
    tiempo_en_compas = paso % 16
    numeros_fuerte = sec == 'numeros' and t >= 62.0

    # Bajo: corcheas raíz-raíz-octava-raíz (en aclaración, blancas suaves).
    if sec == 'aclaracion':
        if tiempo_en_compas in (0, 8):
            bajo(raiz - 12, t, NEGRA * 2 * 0.95, 0.30)
    elif tiempo_en_compas % 2 == 0:
        oct_ = 12 if tiempo_en_compas in (4, 12) else 0
        bajo(raiz - 12 + oct_, t, semi * 1.8, 0.36 * pb)

    # Arpegio de pulso fino (12.5 %), suave y con armónicos limitados para dejar espacio a la voz.
    if pa > 0:
        orden = [0, 1, 2, 1] if not numeros_fuerte else [0, 1, 2, 3]
        n_ = orden[tiempo_en_compas % 4]
        midi = (tonos + [tonos[0] + 12])[n_] + (24 if numeros_fuerte else 12)
        nota(midi, t, semi * 0.9, 0.055 * pa, pan=-0.35, duty=0.125, techo=2600,
             ataque=0.003, caida=0.05, sostener=0.35, relajar=0.02)

    # Batería.
    if pk and (tiempo_en_compas in (0, 8) or (numeros_fuerte and tiempo_en_compas in (4, 12))):
        bombo(t, 0.55 * pk)
    if ps and tiempo_en_compas in (4, 12):
        caja(t, 0.22 * ps)
    if ph:
        if numeros_fuerte or tiempo_en_compas % 2 == 0:
            platillo(t, (0.06 if tiempo_en_compas % 4 else 0.09) * ph)

    paso += 1
    t = paso * semi

# --- Pads de la aclaración (pulso 50 %, ataque lento, ligeramente desafinados en estéreo) -----
a0, a1 = SEC['aclaracion']
t = a0
while t < a1 - 0.05:
    raiz, tonos = acorde(t)
    dur = min(COMPAS, a1 - t)
    for m in tonos:
        for pan, desaf in ((-0.6, -0.07), (0.6, 0.07)):
            nota(m + 12 + desaf, t, dur, 0.035, pan=pan, duty=0.5, techo=1800,
                 ataque=0.35, caida=0.3, sostener=0.8, relajar=0.4)
    t += COMPAS

# --- Pequeño motivo melódico solo en los huecos sin voz -------------------------
frases = VOZ['frases']
huecos = [(0.0, frases[0]['inicio'])] + [(a['fin'], b['inicio']) for a, b in zip(frases, frases[1:])]
MOTIVO = [76, 79, 81, 79]  # mi-sol-la-sol, dos octavas arriba del La
for a, b in huecos:
    if b - a < 0.7 or a > FIN_MUSICA:
        continue
    n_notas = min(len(MOTIVO), int((b - a - 0.15) / (NEGRA / 2)))
    for k in range(n_notas):
        nota(MOTIVO[k], a + 0.08 + k * NEGRA / 2, NEGRA / 2 * 0.9, 0.05, pan=0.3, duty=0.25,
             techo=5000, vibrato=0.25, ataque=0.005, caida=0.08, sostener=0.5, relajar=0.04)

# --- Golpes y efectos sincronizados con la voz -----------------------------------------
# 6.94 s: "¿Cuál aguantaría más?" -> cae el sello.
bombo(6.94, 0.9)
caja(6.94, 0.5)
golpe_crash(6.94, 0.18)
for m in (45, 52, 57, 60, 64):
    nota(m, 6.94, 0.6, 0.06, duty=0.25, techo=4000, ataque=0.002, caida=0.25, sostener=0.3, relajar=0.15)

# Tarjetas de pregunta: blips de menú.
for tt in (20.44, 21.6, 23.38, 25.0):
    nota(84, tt, 0.05, 0.05, pan=0.2, duty=0.5, techo=6000, ataque=0.002, caida=0.03, sostener=0.5, relajar=0.01)
    nota(88, tt + 0.05, 0.07, 0.05, pan=0.2, duty=0.5, techo=6000, ataque=0.002, caida=0.03, sostener=0.5, relajar=0.02)

# "Se cobra cada token": monedas suaves.
for tt in (32.3, 33.3, 34.3):
    nota(83, tt, 0.07, 0.045, pan=0.4, duty=0.5, techo=7000, ataque=0.001, caida=0.02, sostener=0.8, relajar=0.01)
    nota(88, tt + 0.07, 0.28, 0.045, pan=0.4, duty=0.5, techo=7000, ataque=0.001, caida=0.2, sostener=0.2, relajar=0.06)

# GAME OVER (sin presupuesto): arpegios descendentes a 66.0 (GPT) y 68.3 (Opus).
for tt in (66.0, 68.3):
    for k, m in enumerate((76, 72, 69, 64)):
        nota(m, tt + k * 0.075, 0.09, 0.05, pan=-0.1, duty=0.25, techo=5000, ataque=0.002, caida=0.05, sostener=0.5, relajar=0.02)

# 70.0 s: "Jev, miles de viajeros" -> subida y acorde brillante.
for k, m in enumerate((69, 72, 76, 81, 84)):
    nota(m, 69.62 + k * 0.075, 0.09, 0.05, pan=0.15, duty=0.25, techo=6000, ataque=0.002, caida=0.05, sostener=0.5, relajar=0.02)
bombo(70.0, 0.7)
golpe_crash(70.0, 0.14)
for m in (60, 64, 67, 72, 76):
    nota(m, 70.0, 0.9, 0.045, duty=0.25, techo=5000, ataque=0.003, caida=0.4, sostener=0.35, relajar=0.3)

# Acorde final en Do mayor con cola hasta el final.
bombo(FIN_MUSICA, 0.6)
golpe_crash(FIN_MUSICA, 0.12)
bajo(36, FIN_MUSICA, DUR - FIN_MUSICA - 0.05, 0.32)
for m in (48, 55, 60, 64, 67, 72):
    nota(m, FIN_MUSICA, DUR - FIN_MUSICA - 0.05, 0.045, duty=0.5, techo=3000,
         ataque=0.01, caida=0.8, sostener=0.5, relajar=1.6)

# --- Mezcla interna: limpiar continua, normalizar y escribir -------------------------------
est = np.stack([L, R], axis=1)
est -= est.mean(axis=0)
pico = np.max(np.abs(est))
est *= 0.89 / pico  # ~ -1 dBFS de pico
# Fundidos de entrada y salida.
fi = int(0.02 * SR)
est[:fi] *= np.linspace(0, 1, fi)[:, None]
fo = int(1.2 * SR)
est[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 2

os.makedirs(os.path.join(RAIZ, 'audio'), exist_ok=True)
salida = os.path.join(RAIZ, 'audio', 'musica.wav')
with wave.open(salida, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(est, -1, 1) * 32767).astype('<i2').tobytes())
print(f'Listo: {salida} ({N / SR:.3f} s)')
