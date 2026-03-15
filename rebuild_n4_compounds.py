#!/usr/bin/env python3
import json

# Load all N4 kanji (for prerequisite checking)
n4_kanji = set()
n4_existing = set()
for f in ['src/kanji-n4-1.json', 'src/kanji-n4-2.json']:
    try:
        with open(f) as file:
            data = json.load(file)
            for k in data.keys():
                n4_existing.add(k)
                if len(k) == 1:
                    n4_kanji.add(k)
    except:
        pass

# Load N4 Anki compounds
with open('anki-compounds-jlpt-n4.json') as f:
    n4_comps = json.load(f)

# Filter: compounds not already in base files, with all kanji in N4
filtered = {}
for comp, data in n4_comps.items():
    if comp in n4_existing:
        continue
    kanji = set(c for c in comp if ord(c) >= 0x4E00 and ord(c) <= 0x9FFF)
    if kanji and kanji.issubset(n4_kanji):
        filtered[comp] = data

# Save
with open('n4-compounds-valid.json', 'w', encoding='utf-8') as f:
    json.dump(filtered, f, ensure_ascii=False, indent=2)

print(f"Rebuilt n4-compounds-valid.json: {len(filtered)} valid entries")
print(f"N4 kanji count: {len(n4_kanji)}")
print(f"Anki N4 compounds: {len(n4_comps)}")
print(f"Removed: {len(n4_comps) - len(filtered)} (duplicates or missing kanji)")
