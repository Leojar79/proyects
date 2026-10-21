"""Música de fondo original: parte A (problema, tensión) y parte B (solución, brillante).
Uso: python3 music.py newt.json salida.wav"""
import json, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(3)
BPM = 100
BEAT = 60 / BPM
BAR = 4 * BEAT

nt = json.load(open(sys.argv[1]))
END = nt['END']
DROP = nt['NEWT']['7'][0]          # "La solución…"
BREAK = DROP - 0.55                # silencio breve antes del cambio
N = int(SR * (END + 1))
mix = {k: np.zeros(N) for k in ['pad', 'bass', 'arp', 'drums', 'fx']}


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def add(stem, t0, sig):
    k = int(SR * t0)
    if k >= N:
        return
    sig = sig[: N - k]
    mix[stem][k:k + len(sig)] += sig


def adsr(n, a, r):
    e = np.ones(n)
    na, nr = min(int(SR * a), n // 2), min(int(SR * r), n // 2)
    e[:na] = np.linspace(0, 1, na) if na else 1
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def pad_note(f, d):
    t = np.arange(int(SR * d)) / SR
    s = np.zeros_like(t)
    for det in (-0.12, 0, 0.12):           # leve desafinado = calidez
        ff = f * 2 ** (det / 12)
        s += np.sin(2 * np.pi * ff * t) + 0.25 * np.sin(4 * np.pi * ff * t) + 0.08 * np.sin(6 * np.pi * ff * t)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 0.25 * t)
    return s * trem * adsr(len(t), 0.5, 0.7) / 3


def bass_note(f, d):
    t = np.arange(int(SR * d)) / SR
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return np.tanh(1.5 * s) * adsr(len(t), 0.02, 0.15)


def pluck(f, d=0.45):
    t = np.arange(int(SR * d)) / SR
    s = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.1 * np.sin(6 * np.pi * f * t)
    return s * np.exp(-t / 0.16) * adsr(len(t), 0.004, 0.05)


def kick():
    d = 0.32
    t = np.arange(int(SR * d)) / SR
    f = 45 + 85 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.11)


def bandnoise(d, lo, hi, tau):
    n = int(SR * d)
    x = rng.standard_normal(n)
    X = np.fft.rfft(x)
    fr = np.fft.rfftfreq(n, 1 / SR)
    X[(fr < lo) | (fr > hi)] = 0
    y = np.fft.irfft(X, n)
    y /= np.max(np.abs(y)) + 1e-9
    return y * np.exp(-np.arange(n) / SR / tau)


def hat():
    return bandnoise(0.05, 7000, 16000, 0.012)


def clap():
    return bandnoise(0.18, 900, 3500, 0.045)


# ---------- armonía ----------
# A (tensión): Am – F – Dm – E      B (solución): C – G – Am – F
A_CH = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]
B_CH = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]]


def section(t0, t1, chords, bright):
    bar = 0
    t = t0
    while t < t1 - 0.05:
        d = min(BAR, t1 - t)
        ch = chords[bar % 4]
        for m in ch:
            add('pad', t, pad_note(midi(m), d + 0.6) * (0.9 if bright else 1.0))
        add('bass', t, bass_note(midi(ch[0] - 24), d) * 0.9)
        if bright:
            add('pad', t, pad_note(midi(ch[0] + 12), d + 0.6) * 0.35)
        for b in range(8):                       # corcheas
            tb = t + b * BEAT / 2
            if tb >= t1:
                break
            if bright:                           # arpegio brillante
                seq = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24]
                add('arp', tb, pluck(midi(seq[b % 4])) * (1.0 if b % 2 == 0 else 0.7))
            elif t >= 11.9:                      # pulso grave desde "Pero…"
                add('bass', tb, bass_note(midi(ch[0] - 12), BEAT / 2 * 0.9) * 0.25)
        for b in range(4):                       # batería
            tb = t + b * BEAT
            if tb >= t1:
                break
            if bright or t >= 32.0:              # bombo desde Snyk / en la solución
                if b in (0, 2):
                    add('drums', tb, kick() * (0.9 if bright else 0.6))
            if bright and b in (1, 3):
                add('drums', tb, clap() * 0.35)
        if bright or t >= 22.6:                  # hi-hats desde "Imagina…"
            for b in range(16 if bright else 8):
                tb = t + b * (BEAT / 4 if bright else BEAT / 2)
                if tb < t1:
                    add('drums', tb, hat() * (0.22 if b % 2 == 0 else 0.12))
        bar += 1
        t += BAR


section(0.0, BREAK, A_CH, False)
section(DROP, END, B_CH, True)

# subida antes del cambio + golpe en "La solución"
rd = 3.0
t = np.arange(int(SR * rd)) / SR
riser = bandnoise(rd, 2000, 9000, 1e9) * (t / rd) ** 2 * 0.5
riser += 0.25 * np.sin(2 * np.pi * np.cumsum(300 * 2 ** (3 * t / rd)) / SR) * (t / rd) ** 2
add('fx', BREAK - rd + 0.05, riser)
tb = np.arange(int(SR * 1.6)) / SR
boom = np.sin(2 * np.pi * np.cumsum(38 + 50 * np.exp(-tb / 0.08)) / SR) * np.exp(-tb / 0.5)
add('fx', DROP, boom * 0.9)

# ---------- mezcla de stems ----------
lv = {'pad': 0.22, 'bass': 0.35, 'arp': 0.13, 'drums': 0.30, 'fx': 0.30}
out = sum(mix[k] * lv[k] for k in mix)
fade_in = int(SR * 1.0)
out[:fade_in] *= np.linspace(0, 1, fade_in)
fo = int(SR * 2.5)
end = int(SR * END)
out[end - fo:end] *= np.linspace(1, 0, fo)
out = out[:end]
out = np.tanh(out * 1.2)
out *= 0.8 / np.max(np.abs(out))
st = np.stack([out, out], 1)
# leve ensanchado estéreo del arpegio
arp = mix['arp'][:end] * lv['arp'] * 0.8 / np.max(np.abs(out) + 1e-9)
st[:, 0] += 0.15 * np.roll(arp, int(SR * 0.012))
st[:, 1] -= 0.0
st *= 0.85 / np.max(np.abs(st))
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
print('ok', sys.argv[2], 'drop en', round(DROP, 2))
