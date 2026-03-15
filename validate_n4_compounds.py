#!/usr/bin/env python3
import json

# Load N5 and N4 kanji
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

print(f"N5 kanji: {len(n5_kanji)}")
print(f"N4 kanji: {len(n4_kanji)}")
print()

# Validate N4 compounds
with open('anki-compounds-jlpt-n4.json') as f:
    n4_comps = json.load(f)

prior_kanji = n5_kanji | n4_kanji
valid_n4 = {}

for comp, data in n4_comps.items():
    kanji = set(c for c in comp if ord(c) >= 0x4E00 and ord(c) <= 0x9FFF)
    if kanji.issubset(prior_kanji):
        valid_n4[comp] = data

print(f"N4 Compounds:")
print(f"Total in Anki file: {len(n4_comps)}")
print(f"Valid (all kanji in N5+N4): {len(valid_n4)}")
print()
print("All valid N4 compounds:")
for comp in sorted(valid_n4.keys()):
    print(f"  {comp}: {valid_n4[comp]['meanings'][0]}")

# Save to file
with open('n4-compounds-valid.json', 'w', encoding='utf-8') as f:
    json.dump(valid_n4, f, ensure_ascii=False, indent=2)
print(f"\nSaved {len(valid_n4)} valid N4 compounds to n4-compounds-valid.json")
