"""Sintetiza los efectos de sonido y los coloca en los tiempos de events.json."""
import json, sys, wave
import numpy as np

SR = 48000
rng = np.random.default_rng(7)


def t_axis(d):
    return np.arange(int(SR * d)) / SR


def env_exp(d, tau, attack=0.003):
    t = t_axis(d)
    a = np.clip(t / attack, 0, 1)
    return a * np.exp(-t / tau)


def sweep_sine(f0, f1, d, curve=1.0):
    t = t_axis(d)
    f = f0 + (f1 - f0) * (t / d) ** curve
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def svf_bandpass(x, fc, q=1.2):
    """Filtro de estado variable con frecuencia central variable en el tiempo."""
    fc = np.broadcast_to(fc, x.shape)
    low = band = 0.0
    out = np.empty_like(x)
    damp = 1.0 / q
    for i in range(len(x)):
        f = 2 * np.sin(np.pi * min(fc[i], SR / 6) / SR)
        high = x[i] - low - damp * band
        band += f * high
        low += f * band
        out[i] = band
    return out


def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):
        s = (1 - a) * x[i] + a * s
        y[i] = s
    return y


def pop():
    d = 0.09
    s = sweep_sine(950, 280, d, 0.5) * env_exp(d, 0.025)
    click = rng.standard_normal(int(SR * 0.003)) * 0.25
    s[: len(click)] += click
    return 0.55 * s


def tick():
    d = 0.02
    return 0.18 * np.sin(2 * np.pi * 2600 * t_axis(d)) * env_exp(d, 0.004, 0.0005)


def boing():
    d = 0.32
    t = t_axis(d)
    f = 280 + 320 * (t / d) + 25 * np.sin(2 * np.pi * 18 * t)
    return 0.32 * np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, 0.11)


def whoosh(d=0.5):
    n = rng.standard_normal(int(SR * d))
    t = t_axis(d)
    fc = 350 * (2500 / 350) ** (t / d)
    b = svf_bandpass(n, fc, q=0.9)
    e = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 2
    e = e * np.where(t < 0.6 * d, 1, 1)  # forma suave de subida y bajada
    return 0.42 * b / (np.max(np.abs(b)) + 1e-9) * e


def thud():
    d = 0.25
    s = sweep_sine(110, 48, d, 0.6) * env_exp(d, 0.07)
    n = lowpass(rng.standard_normal(int(SR * d)), 400) * env_exp(d, 0.03)
    return 0.6 * s + 0.6 * n / (np.max(np.abs(n)) + 1e-9) * 0.4


def scan(d):
    t = t_axis(d)
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * 11 * t)
    hum = (np.sin(2 * np.pi * 190 * t) + 0.4 * np.sin(2 * np.pi * 380 * t)) * trem
    sh = svf_bandpass(rng.standard_normal(len(t)), 3200, q=3) * 0.8
    fade = np.minimum(1, np.minimum(t / 0.25, (d - t) / 0.3))
    fade = np.clip(fade, 0, 1)
    return 0.11 * (hum + sh / (np.max(np.abs(sh)) + 1e-9)) * fade


def tone(f, d, tau, harm=0.0):
    t = t_axis(d)
    return (np.sin(2 * np.pi * f * t) + harm * np.sin(2 * np.pi * 3 * f * t)) * env_exp(d, tau, 0.004)


def alert():
    a = tone(560, 0.13, 0.08, 0.25)
    b = tone(400, 0.22, 0.12, 0.25)
    out = np.zeros(int(SR * 0.38))
    out[: len(a)] += a
    out[int(SR * 0.14): int(SR * 0.14) + len(b)] += b
    return 0.26 * out


def shine():
    out = np.zeros(int(SR * 0.7))
    for i, f in enumerate([880, 1109, 1319, 1760]):
        s = tone(f, 0.4, 0.15)
        k = int(SR * 0.06 * i)
        out[k: k + len(s)] += s
    return 0.13 * out


def ding():
    d = 0.6
    return 0.2 * (tone(1568, d, 0.22) + 0.6 * tone(2093, d, 0.16))


def ticks(d):
    out = np.zeros(int(SR * d) + SR // 10)
    t = 0.0
    while t < d:
        s = tick()
        k = int(SR * t)
        out[k: k + len(s)] += s * 1.8
        t += 0.035 + 0.12 * (t / d) ** 2  # se frena como el contador
    return out


def typing(d):
    out = np.zeros(int(SR * d) + SR // 10)
    t = 0.0
    while t < d:
        n = svf_bandpass(rng.standard_normal(int(SR * 0.012)), 2200 + rng.uniform(-400, 400), q=1.5)
        n *= env_exp(0.012, 0.003, 0.0005)
        k = int(SR * t)
        out[k: k + len(n)] += 0.5 * n / (np.max(np.abs(n)) + 1e-9) * rng.uniform(0.6, 1)
        t += rng.uniform(0.055, 0.11)
    return 0.6 * out


def click():
    d = 0.05
    n = rng.standard_normal(int(SR * 0.004))
    s = tone(1800, d, 0.012)
    s[: len(n)] += n * 0.6
    return 0.32 * s


GEN = {'pop': pop, 'tick': tick, 'boing': boing, 'whoosh': whoosh, 'thud': thud, 'alert': alert,
       'shine': shine, 'ding': ding, 'click': click,
       'scan': scan, 'ticks': ticks, 'typing': typing}
NEEDS_D = {'scan', 'ticks', 'typing'}


def main(events_path, dur, out_path):
    events = json.load(open(events_path))
    mix = np.zeros((int(SR * (dur + 1)), 2))
    for i, (name, t, d) in enumerate(events):
        s = GEN[name](d) if name in NEEDS_D else GEN[name]()
        pan = [-0.25, 0.0, 0.25][i % 3]  # leve movimiento estéreo
        k = int(SR * t)
        seg = mix[k: k + len(s)]
        n = len(seg)
        seg[:, 0] += s[:n] * (1 - pan)
        seg[:, 1] += s[:n] * (1 + pan)
    mix = mix[: int(SR * dur)]
    mix = np.tanh(mix * 1.1) / np.tanh(1.1)     # limitador suave
    mix *= 0.7 / np.max(np.abs(mix))             # pico ≈ -3 dBFS
    pcm = (mix * 32767).astype('<i2')
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print('ok', out_path, len(events), 'efectos')


if __name__ == '__main__':
    main(sys.argv[1], float(sys.argv[2]), sys.argv[3])
