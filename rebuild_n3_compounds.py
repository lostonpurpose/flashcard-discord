#!/usr/bin/env python3
import json

# Load all N3 kanji (for prerequisite checking)
n3_kanji = set()
n3_existing = set()
for f in ['src/kanji-n3-1.json', 'src/kanji-n3-2.json']:
    try:
        with open(f) as file:
            data = json.load(file)
            for k in data.keys():
                n3_existing.add(k)
                if len(k) == 1:
                    n3_kanji.add(k)
    except:
        pass

# Load N3 Anki compounds
with open('anki-compounds-jlpt-n3.json') as f:
    n3_comps = json.load(f)

# Filter: compounds not already in base files, with all kanji in N3
filtered = {}
for comp, data in n3_comps.items():
    if comp in n3_existing:
        continue
    kanji = set(c for c in comp if ord(c) >= 0x4E00 and ord(c) <= 0x9FFF)
    if kanji and kanji.issubset(n3_kanji):
        filtered[comp] = data

# Save
with open('n3-compounds-valid.json', 'w', encoding='utf-8') as f:
    json.dump(filtered, f, ensure_ascii=False, indent=2)

print(f"Rebuilt n3-compounds-valid.json: {len(filtered)} valid entries")
print(f"N3 kanji count: {len(n3_kanji)}")
print(f"Anki N3 compounds: {len(n3_comps)}")
print(f"Removed: {len(n3_comps) - len(filtered)} (duplicates or missing kanji)")
