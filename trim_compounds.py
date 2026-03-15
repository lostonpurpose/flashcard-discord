#!/usr/bin/env python3
import json
import os

files = [
    'n5-compounds-valid.json',
    'n4-compounds-valid.json', 
    'n3-compounds-valid.json',
    'n2-compounds-valid.json',
    'n1-compounds-valid.json'
]

for fname in files:
    with open(fname, encoding='utf-8') as f:
        data = json.load(f)
    
    # Trim to max 3 meanings and 3 readings
    for comp in data:
        if 'meanings' in data[comp] and isinstance(data[comp]['meanings'], list):
            data[comp]['meanings'] = data[comp]['meanings'][:3]
        if 'readings' in data[comp] and isinstance(data[comp]['readings'], list):
            data[comp]['readings'] = data[comp]['readings'][:3]
    
    with open(fname, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✓ {fname}")

print("\nDone. All compounds trimmed to max 3 meanings + 3 readings.")
