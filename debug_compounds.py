#!/usr/bin/env python3
import json

# Load your files
n5_kanji = set()
n4_kanji = set()

for f in ['src/kanji-n5.json', 'src/kanji-n5-2.json']:
    with open(f) as file:
        data = json.load(file)
        for k in data.keys():
            if len(k) == 1:
                n5_kanji.add(k)

for f in ['src/kanji-n4-1.json', 'src/kanji-n4-2.json']:
    with open(f) as file:
        data = json.load(file)
        for k in data.keys():
            if len(k) == 1:
                n4_kanji.add(k)

# Check specific compounds
checks = ['今夜', '家内', '水道', '熱心', '彼女']
for comp in checks:
    kanji = set(c for c in comp if ord(c) >= 0x4E00 and ord(c) <= 0x9FFF)
    in_prior = kanji.issubset(n5_kanji | n4_kanji)
    print(f"{comp}: kanji={kanji}, in_files={in_prior}")
    for k in kanji:
        status = "N5" if k in n5_kanji else ("N4" if k in n4_kanji else "MISSING")
        print(f"  {k}: {status}")
