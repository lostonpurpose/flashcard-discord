#!/usr/bin/env python3
import json

# Load all existing kanji (as keys)
existing = set()
for f in ['src/kanji-n5.json', 'src/kanji-n5-2.json',
          'src/kanji-n4-1.json', 'src/kanji-n4-2.json',
          'src/kanji-n3-1.json', 'src/kanji-n3-2.json',
          'src/kanji-n2-1.json', 'src/kanji-n2-2.json', 'src/kanji-n2-3.json']:
    try:
        with open(f) as file:
            data = json.load(file)
            existing.update(data.keys())
    except:
        pass

print(f"Existing kanji entries: {len(existing)}")
print()

# Check each compound file for duplicates
files = [
    ('n5-compounds-valid.json', True),
    ('n4-compounds-valid.json', True),
    ('n3-compounds-valid.json', True),
    ('n2-compounds-valid.json', True),
    ('n1-compounds-valid.json', True),
]

for fname, remove_dupes in files:
    with open(fname, encoding='utf-8') as f:
        data = json.load(f)
    
    before = len(data)
    
    # Filter out compounds that are already in kanji files
    filtered = {k: v for k, v in data.items() if k not in existing}
    
    after = len(filtered)
    dupes = before - after
    
    if remove_dupes:
        with open(fname, 'w', encoding='utf-8') as f:
            json.dump(filtered, f, ensure_ascii=False, indent=2)
    
    print(f"{fname}: {before} → {after} ({dupes} duplicates removed)")
    if dupes > 0:
        removed = [k for k in data.keys() if k not in filtered]
        print(f"  Removed: {', '.join(removed[:5])}" + ("..." if len(removed) > 5 else ""))
        print()
