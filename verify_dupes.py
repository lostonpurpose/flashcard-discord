#!/usr/bin/env python3
import json

levels = [
    ('n4', ['src/kanji-n4-1.json', 'src/kanji-n4-2.json']),
    ('n3', ['src/kanji-n3-1.json', 'src/kanji-n3-2.json']),
    ('n2', ['src/kanji-n2-1.json', 'src/kanji-n2-2.json', 'src/kanji-n2-3.json'])
]

for level, base_files in levels:
    base = set()
    for f in base_files:
        with open(f) as file:
            base.update(json.load(file).keys())
    
    with open(f'{level}-compounds-valid.json') as f:
        compounds = json.load(f)
    
    dupes = [c for c in compounds.keys() if c in base]
    print(f"{level}: {len(dupes)} duplicates found")
    if dupes:
        print(f"  Dupes: {dupes[:5]}")
