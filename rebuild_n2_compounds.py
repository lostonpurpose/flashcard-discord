#!/usr/bin/env python3
import json

# Load all N2 kanji (for prerequisite checking)
n2_kanji = set()
n2_existing = set()
for f in ['src/kanji-n2-1.json', 'src/kanji-n2-2.json', 'src/kanji-n2-3.json']:
    try:
        with open(f) as file:
            data = json.load(file)
            for k in data.keys():
                n2_existing.add(k)
                if len(k) == 1:
                    n2_kanji.add(k)
    except:
        pass

# Load N2 Anki compounds
with open('anki-compounds-jlpt-n2.json') as f:
    n2_comps = json.load(f)

# Filter: compounds not already in base files, with all kanji in N2
filtered = {}
for comp, data in n2_comps.items():
    if comp in n2_existing:
        continue
    kanji = set(c for c in comp if ord(c) >= 0x4E00 and ord(c) <= 0x9FFF)
    if kanji and kanji.issubset(n2_kanji):
        filtered[comp] = data

# Save
with open('n2-compounds-valid.json', 'w', encoding='utf-8') as f:
    json.dump(filtered, f, ensure_ascii=False, indent=2)

print(f"Rebuilt n2-compounds-valid.json: {len(filtered)} valid entries")
print(f"N2 kanji count: {len(n2_kanji)}")
print(f"Anki N2 compounds: {len(n2_comps)}")
print(f"Removed: {len(n2_comps) - len(filtered)} (duplicates or missing kanji)")
