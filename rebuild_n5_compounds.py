#!/usr/bin/env python3
import json

# Load ONLY N5 kanji
n5_kanji = set()
n5_existing = set()  # Track what's already in base N5 files
for f in ['src/kanji-n5.json', 'src/kanji-n5-2.json']:
    try:
        with open(f) as file:
            data = json.load(file)
            for k in data.keys():
                n5_existing.add(k)  # Track all entries (single kanji + compounds)
                if len(k) == 1:  # Single kanji only
                    n5_kanji.add(k)
    except:
        pass

# Load N5 Anki compounds
with open('anki-compounds-jlpt-n5.json') as f:
    n5_comps = json.load(f)

# Filter: ONLY compounds where ALL kanji are in N5 AND not already in base files
filtered = {}
for comp, data in n5_comps.items():
    # Skip if already in base N5 files
    if comp in n5_existing:
        continue
    # Extract kanji from compound
    kanji = set(c for c in comp if ord(c) >= 0x4E00 and ord(c) <= 0x9FFF)
    # Keep only if all kanji are in N5
    if kanji and kanji.issubset(n5_kanji):
        filtered[comp] = data

# Save
with open('n5-compounds-valid.json', 'w', encoding='utf-8') as f:
    json.dump(filtered, f, ensure_ascii=False, indent=2)

print(f"Restored n5-compounds-valid.json: {len(filtered)} valid entries")
print(f"N5 kanji count: {len(n5_kanji)}")
print(f"Anki N5 compounds: {len(n5_comps)}")
print(f"Removed: {len(n5_comps) - len(filtered)} (missing kanji or other reasons)")
