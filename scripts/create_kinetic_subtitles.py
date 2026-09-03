#!/usr/bin/env python3
from pathlib import Path

# Timings refined from Whisper's word timestamps and the supplied canonical lyrics.
phrases = [
    (150, 1060, "bottom", [("Kila", 0.00, 0.30), ("kila", 0.30, 0.74), ("mani", 0.74, 1.06)]),
    (150, 1060, "bottom", [("kalaavaru", 1.06, 2.08), ("rani", 2.08, 3.10)]),
    (150, 1060, "bottom", [("ghallughallu", 3.10, 3.52), ("mane", 3.52, 3.74)]),
    (150, 1060, "bottom", [("kadhaakali", 3.74, 4.90), ("kaanee", 4.90, 5.35)]),
    (170, 220, "top", [("kallem", 5.35, 5.90), ("leni", 5.90, 6.26), ("kallalloni", 6.26, 7.36)]),
    (170, 220, "top", [("kavvintalni", 7.36, 8.48), ("hello", 8.48, 8.74), ("ani", 8.74, 9.26)]),
    (150, 1060, "bottom", [("chal", 9.26, 10.16), ("mohanaanga", 10.16, 10.98)]),
    (150, 1060, "bottom", [("sukhalaku", 10.98, 11.88), ("bonee", 11.88, 12.40)]),
    (170, 230, "top", [("chaligili", 12.40, 13.30), ("annee", 13.30, 13.80)]),
    (170, 230, "top", [("polo", 13.80, 14.38), ("mani", 14.38, 14.78), ("ponee", 14.78, 15.50)]),
    (150, 1060, "bottom", [("sigge", 15.50, 15.95), ("leni", 15.95, 16.30), ("singaaraanni", 16.30, 17.32)]),
    (150, 1060, "bottom", [("chindinchanee", 17.32, 18.26), ("chalo", 18.26, 18.66), ("honey", 18.66, 19.14)]),
]

def ass_time(seconds: float) -> str:
    cs = round(seconds * 100)
    h, cs = divmod(cs, 360000)
    m, cs = divmod(cs, 6000)
    s, cs = divmod(cs, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"

def styled_phrase(words, active):
    chunks = []
    for i, (word, _, _) in enumerate(words):
        if i == active:
            # Gold active word gets a quick 112% -> 100% beat-synced pop and a soft glow.
            chunks.append(r"{\c&H44C3F6&\3c&H251400&\bord5\fscx112\fscy112\t(0,170,\fscx100\fscy100)}" + word)
        else:
            chunks.append(r"{\c&HFFFFFF&\3c&H101010&\bord4\fscx100\fscy100}" + word)
    return " ".join(chunks)

header = r"""[Script Info]
Title: Kinetic brush-script lyric typography
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 2
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Kinetic,Kaushan Script,60,&H00FFFFFF,&H0044C3F6,&HDC101010,&H80000000,0,0,0,0,100,100,0,0,1,4,3,5,30,30,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

events = []
for x, y, _, words in phrases:
    phrase_start = words[0][1]
    phrase_end = words[-1][2]
    for idx, (_, start, end) in enumerate(words):
        # A short fade keeps cuts polished while each word remains tightly synchronized.
        text = rf"{{\an5\pos({x + 210},{y})\fad(90,90)}}" + styled_phrase(words, idx)
        events.append(f"Dialogue: 0,{ass_time(start)},{ass_time(end)},Kinetic,,0,0,0,,{text}")

out = Path("work/kinetic-lyrics.ass")
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(header + "\n".join(events) + "\n", encoding="utf-8")
print(f"Wrote {out} with {len(events)} word-synced events")
