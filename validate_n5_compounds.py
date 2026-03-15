#!/usr/bin/env python3
import json

# Load N5 kanji only
n5_kanji = set()

for f in ['src/kanji-n5.json', 'src/kanji-n5-2.json']:
    with open(f) as file:
        data = json.load(file)
        for k in data.keys():
            if len(k) == 1:
                n5_kanji.add(k)

print(f"N5 kanji count: {len(n5_kanji)}")
print()

# Validate N5 compounds
with open('anki-compounds-jlpt-n5.json') as f:
    n5_comps = json.load(f)

valid_n5 = {}

for comp, data in n5_comps.items():
    kanji = set(c for c in comp if ord(c) >= 0x4E00 and ord(c) <= 0x9FFF)
    if kanji.issubset(n5_kanji):
        valid_n5[comp] = data

print(f"N5 Compounds:")
print(f"Total in Anki file: {len(n5_comps)}")
print(f"Valid (all kanji in N5): {len(valid_n5)}")
print()
print("All valid N5 compounds:")
for comp in sorted(valid_n5.keys()):
    print(f"  {comp}: {valid_n5[comp]['meanings'][0]}")

# Save to file
with open('n5-compounds-valid.json', 'w', encoding='utf-8') as f:
    json.dump(valid_n5, f, ensure_ascii=False, indent=2)
print(f"\nSaved {len(valid_n5)} valid N5 compounds to n5-compounds-valid.json")
