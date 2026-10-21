"""Música de fondo muy dinámica (128 BPM) sincronizada con la narración.
Intro filtrada que se abre → tensión con bajo sincopado → redoble + tartamudeo + platillo en reversa →
GOLPE en "la solución" con melodía gancho → pausa en "Con un solo prompt" → 2º golpe en "Si la skill sale limpia" → final.
Uso: python3 music3.py newt.json salida.wav"""
import json, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(21)
BPM = 128
BEAT = 60 / BPM
BAR = 4 * BEAT
S16 = BEAT / 4

nt = json.load(open(sys.argv[1]))
END = nt['END']
L = {int(k): v for k, v in nt['NEWT'].items()}
T_PERO, T_IMAG, T_SNYK = L[2][0], L[4][0], L[16][0]
DROP = L[7][0]
BREAK2, DROP2 = L[11][0], L[12][0]
N = int(SR * (END + 1))
ST = {k: np.zeros(N) for k in ['pad', 'bass', 'arp', 'lead', 'kick', 'perc', 'fx']}
kicks = []


def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def tt(d):
    return np.arange(max(1, int(SR * d))) / SR


def add(stem, t0, sig, g=1.0):
    k = int(SR * t0)
    if t0 < 0 or k >= N:
        return
    sig = sig[: N - k]
    ST[stem][k:k + len(sig)] += sig * g


def env(n, a, r):
    e = np.ones(n)
    na, nr = min(int(SR * a), n // 2), min(int(SR * r), n // 2)
    if na:
        e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def saw(f, t, n=9):
    return sum(((-1) ** (h + 1)) * np.sin(2 * np.pi * f * h * t) / h for h in range(1, n + 1) if f * h < 16000)


def pad_note(f, d):
    t = tt(d)
    s = sum(saw(f * 2 ** (dt / 12), t, 5) for dt in (-0.12, 0, 0.12)) / 3
    return s * env(len(t), 0.2, 0.35) * 0.6


def bass_note(f, d, bright=1.0):
    t = tt(d)
    s = np.sin(2 * np.pi * f * t) + 0.45 * bright * saw(2 * f, t, 4)
    return np.tanh(1.6 * s) * env(len(t), 0.004, 0.03) * np.exp(-t / 0.4)


def pluck(f, d=0.25):
    t = tt(d)
    return saw(f, t, 6) * np.exp(-t / 0.07) * env(len(t), 0.002, 0.02)


def lead_note(f, d):
    t = tt(d)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.15, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    s = sum(((-1) ** (h + 1)) * np.sin(ph * h) / h for h in range(1, 8)) + 0.5 * np.sin(ph * 0.5)
    return s * env(len(t), 0.01, 0.08) * (0.75 + 0.25 * np.exp(-t / 0.2))


def kick(g=1.0):
    t = tt(0.32)
    f = 46 + 120 * np.exp(-t / 0.03)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.14)
    s[:int(SR * 0.003)] += rng.standard_normal(int(SR * 0.003)) * 0.35
    return np.tanh(1.4 * s) * g


def noise(d, lo, hi, tau):
    n = max(2, int(SR * d))
    X = np.fft.rfft(rng.standard_normal(n))
    fr = np.fft.rfftfreq(n, 1 / SR)
    X[(fr < lo) | (fr > hi)] = 0
    y = np.fft.irfft(X, n)
    y /= np.max(np.abs(y)) + 1e-9
    return y * np.exp(-np.arange(n) / SR / tau)


HAT = [noise(0.05, 7500, 16000, 0.012) for _ in range(4)]
OHAT = noise(0.3, 6000, 15000, 0.09)
CLAP = [noise(0.22, 900, 4500, 0.055) for _ in range(3)]
SNARE = noise(0.18, 250, 7000, 0.06)
CRASH = noise(2.4, 3500, 16000, 0.7)
TOM = [np.sin(2 * np.pi * np.cumsum(f0 * (1 + 0.6 * np.exp(-tt(0.25) / 0.03))) / SR) * np.exp(-tt(0.25) / 0.09)
       for f0 in (180, 140, 105)]


def k_at(t, g=1.0):
    add('kick', t, kick(g))
    kicks.append((t, g))


A_CH = [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]]       # Am F Dm E
B_CH = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]       # Am F C G (épico)
# gancho de la melodía (por compás: (semicorchea, nota, duración en semicorcheas))
HOOK = [[(0, 76, 3), (3, 74, 1), (4, 72, 2), (6, 69, 2), (8, 72, 3), (11, 74, 1), (12, 76, 4)],
        [(0, 77, 3), (3, 76, 1), (4, 74, 2), (6, 72, 2), (8, 69, 6), (14, 72, 2)],
        [(0, 72, 3), (3, 74, 1), (4, 76, 2), (6, 79, 2), (8, 76, 4), (12, 74, 4)],
        [(0, 74, 3), (3, 72, 1), (4, 71, 2), (6, 67, 2), (8, 71, 4), (12, 74, 2), (14, 76, 2)]]


def bars(t0, t1):
    t, i = t0, 0
    while t < t1 - 0.02:
        yield i, t, min(BAR, t1 - t)
        i += 1
        t += BAR


# ======================= PARTE A =======================
BREAK = DROP - 0.4
build0 = BREAK - 2 * BAR
for i, t, d in bars(0.0, BREAK):
    ch = A_CH[i % 4]
    for m in ch:
        add('pad', t, pad_note(midi(m), d + 0.25), 0.7)
    # bajo sincopado (patrón de 16 pasos)
    pat = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0]
    for s in range(16):
        ts = t + s * S16
        if ts < BREAK and pat[s]:
            note = ch[0] - 24 + (12 if s in (13, 14) else 0)
            add('bass', ts, bass_note(midi(note), S16 * 1.6, 0.6 if ts < T_PERO else 1.0), 0.9 if s % 4 == 0 else 0.7)
    for b in range(4):
        tb = t + b * BEAT
        if tb >= BREAK:
            break
        if tb < build0:
            k_at(tb, 0.85)                                        # bombo constante desde el inicio
        if tb >= T_PERO and b in (1, 3) and tb < build0:
            add('perc', tb, CLAP[b % 3], 0.45)
        add('perc', tb + BEAT / 2, OHAT, 0.16 if tb >= T_IMAG else 0.09)
        if tb >= T_IMAG:
            for q in (1, 3):
                add('perc', tb + q * S16, HAT[q], 0.12)
    if t >= T_SNYK - 0.01:                                        # arpegio en la parte de datos
        for s in range(16):
            add('arp', t + s * S16, pluck(midi([ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24][s % 4])), 0.5)
    if i % 4 == 3 and t + BAR < build0:                           # remate de toms cada 4 compases
        for q, tom in enumerate(TOM):
            add('perc', t + 3 * BEAT + q * S16 * 1.3, tom, 0.35)

# redoble que acelera + tartamudeo + platillo en reversa
x = build0
while x < BREAK - 0.01:
    p = (x - build0) / (BREAK - build0)
    step = BEAT / 2 if p < 0.4 else (S16 if p < 0.8 else S16 / 2)
    add('perc', x, SNARE, 0.12 + 0.5 * p)
    if p < 0.75 and abs((x - build0) % BEAT) < 1e-6:
        k_at(x, 0.6 + 0.3 * p)
    x += step
rd = BREAK - build0
r = tt(rd)
add('fx', build0, noise(rd, 1200, 12000, 1e9) * (r / rd) ** 2.2, 0.45)
add('fx', build0, np.sin(2 * np.pi * np.cumsum(180 * 2 ** (3.5 * r / rd)) / SR) * (r / rd) ** 2, 0.18)
rev = CRASH[::-1][-int(SR * 1.2):]
add('fx', BREAK - len(rev) / SR, rev * np.linspace(0, 1, len(rev)) ** 2, 0.3)

# ======================= GOLPES =======================


def impact(t, g=1.0):
    d = tt(1.8)
    boom = np.sin(2 * np.pi * np.cumsum(34 + 70 * np.exp(-d / 0.06)) / SR) * np.exp(-d / 0.6)
    add('fx', t, boom, 0.8 * g)
    add('perc', t, CRASH, 0.4 * g)


impact(DROP)

# ======================= PARTE B =======================
def part_b(t0, t1, start_bar=0, big=True):
    for i, t, d in bars(t0, t1):
        bi = i + start_bar
        ch = B_CH[bi % 4]
        for m in ch + [ch[0] + 12]:
            add('pad', t, pad_note(midi(m), d + 0.25), 0.6)
        for b in range(4):
            tb = t + b * BEAT
            if tb >= t1:
                break
            k_at(tb, 1.0)
            add('bass', tb + BEAT / 2, bass_note(midi(ch[0] - 12), BEAT / 2 * 0.85), 0.9)
            add('bass', tb + 3 * S16, bass_note(midi(ch[0] - 12), S16 * 0.9), 0.5)
            if b in (1, 3):
                add('perc', tb, CLAP[b % 3], 0.55)
            for q in range(4):
                add('perc', tb + q * S16, HAT[q], 0.24 if q == 2 else 0.11)
            add('perc', tb + BEAT / 2, OHAT, 0.12)
        seq = [ch[0] + 12, ch[2] + 12, ch[1] + 24, ch[2] + 12]
        for s in range(16):
            ts = t + s * S16
            if ts < t1:
                add('arp', ts, pluck(midi(seq[s % 4] + (12 if s % 8 == 6 else 0))), 0.75 if s % 4 == 0 else 0.45)
        if big:
            for (s, n, ln) in HOOK[bi % 4]:
                ts = t + s * S16
                if ts < t1:
                    add('lead', ts, lead_note(midi(n), ln * S16 * 0.95))
        if bi % 4 == 3 and t + BAR <= t1 + 0.01:               # remate cada 4 compases
            for q in range(4):
                add('perc', t + 3 * BEAT + q * S16, SNARE, 0.25 + 0.12 * q)
        if bi % 8 == 0 and bi > 0:
            add('perc', t, CRASH, 0.22)


part_b(DROP, BREAK2 - 0.02, 0, True)
# pausa: solo pad + arpegio filtrado, sube tensión
for i, t, d in bars(BREAK2, DROP2):
    ch = B_CH[i % 4]
    for m in ch:
        add('pad', t, pad_note(midi(m), d + 0.25), 0.55)
    for s in range(16):
        ts = t + s * S16
        if ts < DROP2:
            add('arp', ts, pluck(midi([ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24][s % 4])), 0.35)
r2 = DROP2 - BREAK2
if r2 > 0.5:
    rr = tt(r2)
    add('fx', BREAK2, noise(r2, 1500, 12000, 1e9) * (rr / r2) ** 2, 0.3)
    xs = DROP2 - min(1.0, r2 / 2)
    while xs < DROP2 - 0.01:
        add('perc', xs, SNARE, 0.35)
        xs += S16
impact(DROP2, 0.8)
part_b(DROP2, END, 0, True)

# ======================= bombeo, mezcla =======================
pump = np.ones(N)
for (tk, g) in kicks:
    k, n = int(SR * tk), int(SR * BEAT)
    if k >= N:
        continue
    e = 1 - 0.7 * g * np.exp(-np.arange(n) / SR / 0.1)
    pump[k:k + n] = np.minimum(pump[k:k + n], e[: min(n, N - k)])
ST['pad'] *= pump
ST['bass'] *= 0.45 + 0.55 * pump
ST['arp'] *= 0.6 + 0.4 * pump
ST['lead'] *= 0.75 + 0.25 * pump

# filtro que se abre en la intro (STFT, frecuencia de corte creciente hasta "Pero…")
def opening_filter(x, t_open):
    n_fft, hop = 2048, 512
    win = np.hanning(n_fft)
    y = np.zeros_like(x); wsum = np.zeros_like(x)
    fr = np.fft.rfftfreq(n_fft, 1 / SR)
    stop = int(SR * (t_open + 0.5))
    for k in range(0, min(len(x), stop) - n_fft, hop):
        tc = (k + n_fft / 2) / SR
        fc = 300 * (16000 / 300) ** min(1, (tc / t_open) ** 1.6)
        g = 1 / np.sqrt(1 + (fr / fc) ** 8)
        X = np.fft.rfft(x[k:k + n_fft] * win) * g
        y[k:k + n_fft] += np.fft.irfft(X, n_fft) * win
        wsum[k:k + n_fft] += win ** 2
    done = np.maximum(wsum, 1e-6)
    out = x.copy()
    cut = min(len(x), stop) - n_fft
    out[:cut] = y[:cut] / done[:cut]
    return out


lv = {'pad': 0.16, 'bass': 0.32, 'arp': 0.11, 'lead': 0.13, 'kick': 0.55, 'perc': 0.3, 'fx': 0.35}
end = int(SR * END)
music = sum(ST[k][:end] * lv[k] for k in ['pad', 'bass', 'arp', 'lead', 'kick', 'perc'])
music = opening_filter(music, T_PERO)
music += ST['fx'][:end] * lv['fx']
fi = int(SR * 0.3)
music[:fi] *= np.linspace(0, 1, fi)
fo = int(SR * 2.0)
music[end - fo:] *= np.linspace(1, 0, fo) ** 1.4
music = np.tanh(music * 1.25)
side = ST['arp'][:end] * lv['arp'] + ST['perc'][:end] * lv['perc'] * 0.4 + ST['lead'][:end] * lv['lead'] * 0.3
side = opening_filter(side, T_PERO)
Lc = music + 0.25 * np.roll(side, int(SR * 0.011))
Rc = music + 0.25 * np.roll(side, -int(SR * 0.008))
st = np.stack([Lc, Rc], 1)
st *= 0.85 / np.max(np.abs(st))
with wave.open(sys.argv[2], 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((st * 32767).astype('<i2').tobytes())
print('ok', sys.argv[2], f'golpe {DROP:.2f}s, pausa {BREAK2:.2f}s, 2º golpe {DROP2:.2f}s')
