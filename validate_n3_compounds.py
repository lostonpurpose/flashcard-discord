#!/usr/bin/env python3
import json

# Load all your kanji
n5_kanji = set()
n4_kanji = set()
n3_kanji = set()

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

for f in ['src/kanji-n3-1.json', 'src/kanji-n3-2.json']:
    with open(f) as file:
        data = json.load(file)
        for k in data.keys():
            if len(k) == 1:
                n3_kanji.add(k)

print("Kanji counts:")
print(f"N5: {len(n5_kanji)}")
print(f"N4: {len(n4_kanji)}")
print(f"N3: {len(n3_kanji)}")
print()

# Validate N3 compounds
with open('anki-compounds-jlpt-n3.json') as f:
    n3_comps = json.load(f)

prior_kanji = n5_kanji | n4_kanji | n3_kanji
valid_n3 = {}

for comp, data in n3_comps.items():
    kanji = set(c for c in comp if ord(c) >= 0x4E00 and ord(c) <= 0x9FFF)
    if kanji.issubset(prior_kanji):
        valid_n3[comp] = data

print(f"N3 Compounds:")
print(f"Total in Anki file: {len(n3_comps)}")
print(f"Valid (all kanji in N5+N4+N3): {len(valid_n3)}")
print()
print("Sample valid N3 compounds:")
for comp in sorted(valid_n3.keys())[:15]:
    print(f"  {comp}: {valid_n3[comp]['meanings'][0]}")

# Save to file
with open('n3-compounds-valid.json', 'w', encoding='utf-8') as f:
    json.dump(valid_n3, f, ensure_ascii=False, indent=2)
print(f"\nSaved {len(valid_n3)} valid N3 compounds to n3-compounds-valid.json")
