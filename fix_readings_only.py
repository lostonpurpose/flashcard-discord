sti#!/usr/bin/env python3
import sqlite3
import json
import re

def extract_reading_from_bracket(bracketed):
    """Extract reading from format like '真[ま]ん 中[なか]' -> 'まんなか'"""
    import unicodedata
    result = ''
    i = 0
    while i < len(bracketed):
        if bracketed[i] == '[':
            # Find closing bracket and extract reading
            j = bracketed.find(']', i)
            if j != -1:
                result += bracketed[i+1:j]
                i = j + 1
            else:
                i += 1
        elif bracketed[i] == ' ':
            # Skip spaces
            i += 1
        else:
            char = bracketed[i]
            # Check if it's kana (hiragana or katakana), not kanji
            cat = unicodedata.category(char)
            # Include if it's not a CJK ideograph (kanji)
            if not (ord(char) >= 0x4E00 and ord(char) <= 0x9FFF):
                # It's kana or other character, include it
                result += char
            i += 1
    return result

# Extract from Anki
conn = sqlite3.connect('./anki/collection.anki21')
cursor = conn.cursor()

cursor.execute("SELECT flds, tags FROM notes")
all_rows = cursor.fetchall()

anki_data = {}

for row in all_rows:
    fields = row[0].split('\x1f')
    tags = row[1]
    
    if len(fields) >= 3:
        expression = fields[0].strip()
        reading_raw = fields[2].strip()
        
        if expression:
            reading = extract_reading_from_bracket(reading_raw)
            anki_data[expression] = reading

conn.close()

print(f"Extracted {len(anki_data)} entries from Anki")
print(f"Sample: 真ん中 -> {anki_data.get('真ん中', 'NOT FOUND')}")
print()

# Now merge with existing compound files
files = [
    'n5-compounds-valid.json',
    'n4-compounds-valid.json',
    'n3-compounds-valid.json',
    'n2-compounds-valid.json',
    'n1-compounds-valid.json',
]

for fname in files:
    try:
        with open(fname, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        updated = 0
        for compound in data:
            if compound in anki_data:
                new_reading = anki_data[compound]
                old_reading = data[compound]['readings'][0] if data[compound]['readings'] else ''
                
                if new_reading != old_reading:
                    data[compound]['readings'] = [new_reading]
                    updated += 1
        
        # Save back
        with open(fname, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"✓ {fname}: updated {updated} readings")
    
    except FileNotFoundError:
        print(f"✗ {fname}: not found")
