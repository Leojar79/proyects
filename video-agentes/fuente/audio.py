"""Synthesize a 120 BPM beat plus SFX synced to the composition's events.

usage: python3 audio.py <meta.json> <out.wav>
meta.json comes from render.cjs: {"total": secs, "sfx": [[t, type], ...]}
"""
import json
import sys
import wave

import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def env(n, k):
    return np.exp(-np.arange(n) / SR * k)


def sweep(f0, f1, dur, k):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-tt * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, k)


def noise(dur):
    return rng.uniform(-1, 1, int(dur * SR))


def lowpass(x, w):
    return np.convolve(x, np.ones(w) / w, mode="same")


def highpass(x):
    return np.diff(x, prepend=0)


def add(*xs):
    out = np.zeros(max(len(x) for x in xs))
    for x in xs:
        out[: len(x)] += x
    return out


def tone(f, dur, k, shape="sin"):
    n = int(dur * SR)
    ph = 2 * np.pi * f * np.arange(n) / SR
    w = np.sin(ph) if shape == "sin" else np.sign(np.sin(ph)) * 0.5
    return w * env(n, k)


# ---- instruments ----
kick = sweep(160, 45, 0.45, 8) * 1.0
snare = lowpass(noise(0.25), 3) * env(int(0.25 * SR), 22) * 0.5 + tone(190, 0.25, 30) * 0.35
hat = highpass(noise(0.06)) * env(int(0.06 * SR), 70) * 0.25


def sfx(kind):
    if kind == "hit":
        return add(sweep(220, 50, 0.4, 10) * 1.1, lowpass(noise(0.2), 2) * env(int(0.2 * SR), 25) * 0.6)
    if kind == "boom":
        n = int(1.6 * SR)
        return sweep(120, 32, 1.6, 2.5) * 1.3 + lowpass(noise(1.6), 12) * env(n, 3) * 0.9
    if kind == "whoosh":
        n = int(0.45 * SR)
        a = np.sin(np.linspace(0, np.pi, n)) ** 2
        x = noise(0.45)
        lo = lowpass(x, 40)
        hi = x - lowpass(x, 4)
        mix = np.linspace(0, 1, n)
        return (lo * (1 - mix) * 3 + hi * mix * 0.6) * a * 0.9
    if kind == "pop":
        return sweep(900, 520, 0.12, 30) * 0.5
    if kind in ("tick", "click"):
        return highpass(noise(0.025)) * env(int(0.025 * SR), 150) * (0.5 if kind == "tick" else 0.9)
    if kind == "ding":
        return (tone(1318.5, 0.6, 7) + tone(1975.5, 0.6, 9) * 0.6) * 0.3
    if kind == "stamp":
        return add(sweep(140, 40, 0.5, 9) * 1.2, lowpass(noise(0.3), 1) * env(int(0.3 * SR), 18) * 0.8)
    if kind == "glitch":
        out = np.zeros(int(0.45 * SR))
        for i in range(9):
            s = int(i * 0.05 * SR)
            seg = tone(rng.uniform(150, 1600), 0.04, 5, "sq") * 0.35
            out[s : s + len(seg)] += seg[: len(out) - s]
        return out
    if kind == "type":
        out = np.zeros(int(1.4 * SR))
        t = 0.0
        while t < 1.3:
            s = int(t * SR)
            c = sfx("tick") * rng.uniform(0.5, 1)
            out[s : s + len(c)] += c[: len(out) - s]
            t += rng.uniform(0.05, 0.11)
        return out
    if kind == "win":
        out = np.zeros(int(1.2 * SR))
        for i, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
            s = int(i * 0.08 * SR)
            n = tone(f, 0.8, 5) * 0.28 + tone(f * 2, 0.8, 8) * 0.08
            out[s : s + len(n)] += n[: len(out) - s]
        return out
    raise ValueError(kind)


def place(buf, x, t, g=1.0):
    s = int(t * SR)
    if s < 0:
        x, s = x[-s:], 0
    e = min(len(buf), s + len(x))
    if e > s:
        buf[s:e] += x[: e - s] * g


def main(meta_path, out_path):
    meta = json.load(open(meta_path))
    total = meta["total"]
    n = int((total + 0.5) * SR)
    music = np.zeros(n)
    duck = np.ones(n)
    beat_start = 3.6 + 0.9  # the drop lands on the logo collision
    bpm_t = 0.5
    roots = [55.0, 43.65, 65.41, 49.0]  # A F C G
    t = beat_start
    i = 0
    while t < total - 0.3:
        place(music, kick, t, 0.9)
        k = int(t * SR)
        d = np.linspace(0.35, 1, int(0.22 * SR))
        duck[k : k + len(d)] = np.minimum(duck[k : k + len(d)], d[: max(0, min(len(d), n - k))])
        if i % 2 == 1:
            place(music, snare, t, 0.8)
        place(music, hat, t + 0.25, 1)
        if i % 4 == 3:
            place(music, hat, t + 0.375, 0.7)
        t += bpm_t
        i += 1
    # bass + pad, 2 bars per chord
    tt = np.arange(n) / SR
    bar = ((tt - beat_start) // 4).astype(int) % 4
    f = np.array(roots)[bar]
    ph = 2 * np.pi * np.cumsum(f) / SR
    bass = (np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)) * 0.32
    pad = sum(np.sin(ph * m + j) for j, m in enumerate([4, 5, 6])) * 0.035
    on = (tt >= beat_start) & (tt < total - 0.2)
    music += (bass + pad) * on * duck
    # intro riser under the hook
    riser_n = int(beat_start * SR)
    r = lowpass(noise(beat_start), 6) * np.linspace(0, 1, riser_n) ** 3 * 0.25
    music[:riser_n] += r
    # outro fade
    fade = np.clip((total - tt) / 1.2, 0, 1)
    music *= fade

    fx = np.zeros(n)
    gains = {"whoosh": 0.8, "hit": 0.9, "boom": 1.0, "pop": 0.7, "tick": 0.6, "click": 0.8,
             "ding": 0.8, "stamp": 1.0, "glitch": 0.8, "type": 0.7, "win": 0.9}
    for t0, kind in meta["sfx"]:
        off = -0.25 if kind == "whoosh" else 0.0
        place(fx, sfx(kind), t0 + off, gains[kind])

    mix = music * 0.6 + fx * 0.75
    mix = np.tanh(mix * 1.4) / np.tanh(1.4)
    mix = mix / np.max(np.abs(mix)) * 0.89
    stereo = np.stack([mix, mix], axis=1)
    with wave.open(out_path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((stereo * 32767).astype(np.int16).tobytes())


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
