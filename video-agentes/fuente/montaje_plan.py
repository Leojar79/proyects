"""Build the split-screen edit plan from the recorded takes.

usage: python3 montaje_plan.py <words.json> <outdir>
Writes plan.js (scene durations + time-warp anchors for montaje.html),
segments.json (footage cuts), captions.ass and sfx_meta.json is produced
later by the renderer.
"""
import json
import os
import sys

# Footage kept from each take: (part, in, out) in that file's seconds.
SEGMENTS = [
    ("p1", 0.70, 10.20),
    ("p2", 1.00, 25.80),
    ("p3", 1.20, 13.96),
    ("p3", 14.97, 23.60),  # drops the "el conecta" stumble
    ("p4", 1.00, 30.60),
]


def g(part, t):
    """Global edit time of second t inside a take."""
    acc = 0.0
    for p, a, b in SEGMENTS:
        if p == part and a <= t <= b + 1e-6:
            return acc + (t - a)
        acc += b - a
    raise ValueError(f"{part}@{t} falls outside the kept footage")


TOTAL = sum(b - a for _, a, b in SEGMENTS)

# scene name -> (global start, [(original scene time, global time of the matching word)])
SCENES = [
    ("hook", g("p1", 0.70), [(1.1, g("p1", 2.1)), (1.75, g("p1", 3.75)), (2.4, g("p1", 4.1))]),
    ("collide", g("p1", 6.0), [(0.9, g("p1", 6.94)), (1.3, g("p1", 7.3)), (1.5, g("p1", 8.46)), (2.2, g("p1", 9.42))]),
    ("mcp", g("p2", 1.15), [(1.1, g("p2", 4.9)), (2.1, g("p2", 6.0)), (2.8, g("p2", 7.0))]),
    ("antes", g("p2", 10.25), [(0.3, g("p2", 12.5)), (1.4, g("p2", 16.0)), (2.6, g("p2", 17.7))]),
    ("ahora", g("p2", 19.0), [(0.2, g("p2", 19.18)), (0.8, g("p2", 22.0)), (2.35, g("p2", 24.9)), (2.8, g("p2", 25.2))]),
    ("paso1", g("p3", 3.55), [(1.3, g("p3", 6.5)), (2.1, g("p3", 7.5))]),
    ("paso2", g("p3", 8.4), [(0.7, g("p3", 9.4)), (1.0, g("p3", 11.0)), (2.0, g("p3", 12.2)), (2.5, g("p3", 12.6))]),
    ("paso3", g("p3", 13.7), [(1.0, g("p3", 16.3)), (1.6, g("p3", 17.9)), (2.2, g("p3", 18.5))]),
    ("paso4", g("p3", 19.3), [(0.9, g("p3", 20.4)), (2.0, g("p3", 22.2))]),
    ("plantillas", g("p4", 1.15), [(0.15, g("p4", 2.7)), (0.5, g("p4", 3.9)), (2.3, g("p4", 9.8)), (3.6, g("p4", 11.2)), (4.6, g("p4", 12.9)), (5.1, g("p4", 13.3))]),
    ("resultado", g("p4", 14.0), [(0.2, g("p4", 14.1)), (0.8, g("p4", 15.4)), (1.4, g("p4", 17.3)), (2.4, g("p4", 18.4))]),
    ("cta", g("p4", 19.55), [(0.2, g("p4", 19.9)), (0.8, g("p4", 20.4)), (2.0, g("p4", 21.4)), (2.2, g("p4", 21.5)), (2.6, g("p4", 22.1))]),
]

# Whisper misspellings -> what was actually said
FIX = {"chatbos": "chatbots", "Cloud": "Claude", "cloud": "Claude", "MCPA": "MCP a", "Páneles,": "Paneles,",
       "webhook": "webhooks", "contrataron": "contratar", "meta": "Meta", "meta,": "Meta,", "meta.": "Meta.",
       "gente": "agente", "quieres": "quiere", "24": "24/7.", "/7.": ""}


def build_plan():
    out = []
    for i, (name, start, anchors) in enumerate(SCENES):
        end = SCENES[i + 1][1] if i + 1 < len(SCENES) else TOTAL
        d = end - start
        pts = [(0.0, 0.0)] + [(o, round(gt - start, 3)) for o, gt in anchors]
        for (o0, n0), (o1, n1) in zip(pts, pts[1:]):
            assert o1 > o0 and n1 > n0, (name, pts)
        out.append({"n": name, "d": round(d, 3), "warp": pts})
    return out


def captions(words_path):
    words = json.load(open(words_path))
    items = []
    for part in ("p1", "p2", "p3", "p4"):
        chunks = words[part + ".f32"]["chunks"]
        for k, c in enumerate(chunks):
            w = c["text"].strip()
            a, b = c["timestamp"]
            b = b if b is not None else a + 0.3
            nxt = chunks[k + 1]["text"].strip() if k + 1 < len(chunks) else ""
            if w == "Los" and part == "p1":
                a = 1.85  # whisper stretched the first word over the coffee sip
            if w.lower() in ("como", "cómo") and nxt in ("lo", "va"):
                w = "¿Cómo"
            if w == "una" and part == "p4":
                w = "un"
            if w == "hizo,":
                w = "hizo?"
            if w == "pasos,":
                w = "pasos?"
            w = FIX.get(w, w)
            if w == "Meta." and part == "p4" and a < 7:
                w = "a Meta."
            if not w:
                continue
            try:
                ga, gb = g(part, a), g(part, min(b, a + 1.2))
            except ValueError:
                continue
            items.append([ga, gb, w, part])
    # group into 1-3 word captions, breaking after punctuation
    groups, cur = [], []
    for it in items:
        if cur and cur[-1][3] != it[3]:
            groups.append(cur)
            cur = []
        cur.append(it)
        txt = it[2]
        if len(cur) == 3 or txt[-1] in ".,?!" or sum(len(x[2]) for x in cur) > 16:
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    return groups


def ass(groups, path):
    def ts(t):
        t = max(0, t)
        return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{t % 60:05.2f}"

    head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Display Black,74,&H00FFFFFF,&H00FFFFFF,&H0066D325,&H00000000,1,0,0,0,100,100,0,0,3,14,0,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = []
    for i, grp in enumerate(groups):
        a = grp[0][0]
        b = groups[i + 1][0][0] if i + 1 < len(groups) else grp[-1][1] + 0.6
        b = min(b, grp[-1][1] + 0.8)
        text = " ".join(x[2] for x in grp).upper()
        lines.append(f"Dialogue: 0,{ts(a)},{ts(b)},Cap,,0,0,0,,{{\\pos(540,1540)\\c&H0B1F12&\\fad(40,0)}}{text}")
    open(path, "w").write(head + "\n".join(lines) + "\n")


if __name__ == "__main__":
    words_path, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    plan = build_plan()
    open(os.path.join(outdir, "plan.js"), "w").write("window.PLAN=" + json.dumps(plan) + ";\n")
    json.dump({"segments": SEGMENTS, "total": TOTAL}, open(os.path.join(outdir, "segments.json"), "w"))
    groups = captions(words_path)
    ass(groups, os.path.join(outdir, "captions.ass"))
    print(f"total {TOTAL:.2f}s, {len(plan)} scenes, {len(groups)} captions")
    for p in plan:
        print(p["n"], p["d"], p["warp"])
