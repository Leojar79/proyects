"""Música de fondo dinámica (124 BPM): parte A con tensión que crece, redoble y subida,
golpe en "La solución" y parte B con bombo constante, bajo a contratiempo y bombeo.
Uso: python3 music2.py newt.json salida.wav"""
import json, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(11)
BPM = 124
BEAT = 60 / BPM
BAR = 4 * BEAT

nt = json.load(open(sys.argv[1]))
END = nt['END']
L = {int(k): v for k, v in nt['NEWT'].items()}
DROP = L[7][0]                     # "La solución…"
BREAK = DROP - 0.45
N = int(SR * (END + 1))
stems = {k: np.zeros(N) for k in ['pad', 'bass', 'arp', 'kick', 'perc', 'fx']}
kick_times = []


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def add(stem, t0, sig, g=1.0):
    k = int(SR * t0)
    if k >= N or t0 < 0:
        return
    sig = sig[: N - k]
    stems[stem][k:k + len(sig)] += sig * g


def env(n, a, r):
    e = np.ones(n)
    na, nr = min(int(SR * a), n // 2), min(int(SR * r), n // 2)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def tt(d):
    return np.arange(int(SR * d)) / SR


def pad_note(f, d):
    t = tt(d)
    s = sum(np.sin(2 * np.pi * f * 2 ** (dt / 12) * t) + 0.3 * np.sin(4 * np.pi * f * 2 ** (dt / 12) * t)
            for dt in (-0.1, 0, 0.1))
    return s * env(len(t), 0.25, 0.4) / 3


def bass_note(f, d):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(4 * np.pi * f * t) + 0.2 * np.sin(6 * np.pi * f * t)
    return np.tanh(1.8 * s) * env(len(t), 0.005, 0.04) * np.exp(-t / 0.35)


def pluck(f, d=0.3):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) + 0.15 * np.sin(6 * np.pi * f * t)
    return s * np.exp(-t / 0.09) * env(len(t), 0.003, 0.03)


def kick():
    t = tt(0.3)
    f = 48 + 110 * np.exp(-t / 0.035)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.13)
    s[:int(SR * 0.004)] += rng.standard_normal(int(SR * 0.004)) * 0.3   # clic de ataque
    return s


def bandnoise(d, lo, hi, tau):
    n = int(SR * d)
    X = np.fft.rfft(rng.standard_normal(n))
    fr = np.fft.rfftfreq(n, 1 / SR)
    X[(fr < lo) | (fr > hi)] = 0
    y = np.fft.irfft(X, n)
    y /= np.max(np.abs(y)) + 1e-9
    return y * np.exp(-np.arange(n) / SR / tau)


HAT = [bandnoise(0.06, 7000, 16000, 0.014) for _ in range(4)]
OHAT = bandnoise(0.25, 6000, 15000, 0.08)
CLAP = [bandnoise(0.2, 900, 4000, 0.05) for _ in range(3)]
SNARE = bandnoise(0.16, 300, 6000, 0.05)
CRASH = bandnoise(2.2, 3500, 16000, 0.6)


def k_at(t, g):
    add('kick', t, kick(), g)
    kick_times.append((t, g))


A_CH = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]      # Am F Dm E
B_CH = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]      # C G Am F

# ---------------- PARTE A (tensión creciente) ----------------
t, bar = 0.0, 0
P_PERO, P_IMAG, P_SNYK = L[2][0], L[4][0], L[16][0]
while t < BREAK - 0.01:
    ch = A_CH[bar % 4]
    d = min(BAR, BREAK - t)
    for m in ch:
        add('pad', t, pad_note(midi(m), d + 0.3), 0.8)
    for s16 in range(16):                                    # bajo en semicorcheas
        ts = t + s16 * BEAT / 4
        if ts >= BREAK:
            break
        acc = 1.0 if s16 % 4 == 0 else 0.55
        add('bass', ts, bass_note(midi(ch[0] - 24), BEAT / 4 * 0.9), acc * (0.55 if ts < P_PERO else 0.8))
    for b in range(4):
        tb = t + b * BEAT
        if tb >= BREAK:
            break
        if tb >= P_PERO or b == 0:
            k_at(tb, 0.75 if tb >= P_PERO else 0.55)
        if tb >= P_SNYK and b in (1, 3):
            add('perc', tb, CLAP[b % 3], 0.4)
        add('perc', tb + BEAT / 2, OHAT if tb >= P_IMAG else HAT[b], 0.18)   # contratiempo
        if tb >= P_IMAG:
            for q in (1, 3):
                add('perc', tb + q * BEAT / 4, HAT[q], 0.1)
    if tb >= P_SNYK:                                         # arpegio tenue en la parte de datos
        for s8 in range(8):
            add('arp', t + s8 * BEAT / 2, pluck(midi(ch[s8 % 3] + 12)), 0.45)
    bar += 1
    t += BAR

# redoble + subida hacia el cambio
roll0 = BREAK - 2 * BAR
x = roll0
while x < BREAK:
    p = (x - roll0) / (BREAK - roll0)
    step = BEAT / 2 if p < 0.5 else (BEAT / 4 if p < 0.85 else BEAT / 8)
    add('perc', x, SNARE, 0.15 + 0.45 * p)
    x += step
rd = BREAK - roll0
r = tt(rd)
riser = bandnoise(rd, 1500, 10000, 1e9) * (r / rd) ** 2
riser += 0.4 * np.sin(2 * np.pi * np.cumsum(220 * 2 ** (3 * r / rd)) / SR) * (r / rd) ** 2
add('fx', roll0, riser, 0.35)

# ---------------- GOLPE en "La solución" ----------------
tb_ = tt(1.8)
boom = np.sin(2 * np.pi * np.cumsum(36 + 60 * np.exp(-tb_ / 0.07)) / SR) * np.exp(-tb_ / 0.55)
add('fx', DROP, boom, 0.8)
add('perc', DROP, CRASH, 0.35)

# ---------------- PARTE B (energía) ----------------
t, bar = DROP, 0
OUT = END - 2.0
while t < END - 0.05:
    ch = B_CH[bar % 4]
    d = min(BAR, END - t)
    for m in ch + [ch[0] + 12]:
        add('pad', t, pad_note(midi(m), d + 0.3), 0.75)
    for b in range(4):
        tb = t + b * BEAT
        if tb >= END:
            break
        k_at(tb, 0.95)                                        # bombo constante
        add('bass', tb + BEAT / 2, bass_note(midi(ch[0] - 12), BEAT / 2 * 0.8), 0.95)   # bajo a contratiempo
        if b in (1, 3):
            add('perc', tb, CLAP[b % 3], 0.5)
        for q in range(4):
            add('perc', tb + q * BEAT / 4, HAT[q], 0.22 if q == 2 else 0.11)
    seq = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[2] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24]
    for s16 in range(16):
        ts = t + s16 * BEAT / 4
        if ts < END:
            add('arp', ts, pluck(midi(seq[s16 % 8])), 0.8 if s16 % 4 == 0 else 0.5)
    if bar % 8 == 7:                                          # remate cada 8 compases
        for q in range(4):
            add('perc', t + 3 * BEAT + q * BEAT / 4, SNARE, 0.25 + 0.1 * q)
    if bar % 8 == 0 and bar > 0:
        add('perc', t, CRASH, 0.2)
    bar += 1
    t += BAR

# ---------------- bombeo (sidechain del bombo sobre pad y bajo) ----------------
pump = np.ones(N)
for (tk, g) in kick_times:
    k = int(SR * tk)
    n = int(SR * BEAT)
    e = 1 - 0.65 * g * np.exp(-np.arange(n) / SR / 0.11)
    pump[k:k + n] = np.minimum(pump[k:k + n], e[: max(0, min(n, N - k))])
stems['pad'] *= pump
stems['bass'] *= 0.5 + 0.5 * pump
stems['arp'] *= 0.7 + 0.3 * pump

lv = {'pad': 0.20, 'bass': 0.30, 'arp': 0.12, 'kick': 0.55, 'perc': 0.30, 'fx': 0.35}
out = sum(stems[k] * lv[k] for k in stems)
end = int(SR * END)
out = out[:end]
fi = int(SR * 0.4)
out[:fi] *= np.linspace(0, 1, fi)
fo = int(SR * 2.2)
out[end - fo:] *= np.linspace(1, 0, fo) ** 1.5
out = np.tanh(out * 1.3)
# estéreo: arpegio y hats algo abiertos
side = (stems['arp'][:end] * lv['arp'] + stems['perc'][:end] * lv['perc'] * 0.5)
L_ = out + 0.25 * np.roll(side, int(SR * 0.009))
R_ = out + 0.25 * np.roll(side, -int(SR * 0.007))
st = np.stack([L_, R_], 1)
st *= 0.85 / np.max(np.abs(st))
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
print('ok', sys.argv[2], 'golpe en', round(DROP, 2), 's')
