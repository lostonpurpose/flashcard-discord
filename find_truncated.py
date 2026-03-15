#!/usr/bin/env python3
import json
import re

# Find entries with suspiciously short readings
files = ['n5-compounds-valid.json', 'n4-compounds-valid.json', 'n3-compounds-valid.json', 'n2-compounds-valid.json', 'n1-compounds-valid.json']

for fname in files:
    try:
        with open(fname, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        suspicious = []
        for comp, entry in data.items():
            reading = entry.get('readings', [''])[0] if entry.get('readings') else ''
            # If reading is 1-2 characters of pure hiragana, probably truncated
            if reading and len(reading) <= 2 and all(0x3040 <= ord(c) <= 0x309F for c in reading):
                suspicious.append((comp, reading))
        
        if suspicious:
            print(f"\n{fname}: {len(suspicious)} suspicious entries")
            for comp, reading in suspicious[:10]:
                print(f"  {comp}: {reading}")
        else:
            print(f"\n{fname}: OK")
    
    except FileNotFoundError:
        print(f"\n{fname}: not found")
