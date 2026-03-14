#!/usr/bin/env python3
import json
from pathlib import Path
import unicodedata

def is_kanji(char):
    """Check if character is a kanji (CJK Unified Ideographs)."""
    return unicodedata.category(char) == 'Lo' and ord(char) >= 0x4E00 and ord(char) <= 0x9FFF

def count_kanji(text):
    """Count kanji characters in text."""
    return sum(1 for c in text if is_kanji(c))

def extract_compounds(input_file, output_file, min_kanji=2):
    """Extract only compounds (multi-kanji entries) from Anki vocab file."""
    
    with open(input_file, 'r', encoding='utf-8') as f:
        vocab = json.load(f)
    
    compounds = {}
    single_kanji = {}
    hiragana_only = {}
    
    for entry, data in vocab.items():
        kanji_count = count_kanji(entry)
        
        if kanji_count >= min_kanji:
            # It's a compound (2+ kanji)
            compounds[entry] = data
        elif kanji_count == 1:
            # Single kanji (we already have these)
            single_kanji[entry] = data
        else:
            # Hiragana only or mixed (conjugations, particles, etc.)
            hiragana_only[entry] = data
    
    # Save compounds
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(compounds, f, ensure_ascii=False, indent=2)
    
    print(f"=== {input_file} ===")
    print(f"Total entries: {len(vocab)}")
    print(f"Compounds (2+ kanji): {len(compounds)}")
    print(f"Single kanji: {len(single_kanji)}")
    print(f"Hiragana/mixed: {len(hiragana_only)}")
    print(f"Saved to: {output_file}")
    print()
    
    # Show sample compounds
    if compounds:
        print("Sample compounds:")
        for entry, data in list(compounds.items())[:5]:
            print(f"  {entry}: {data['meanings'][0] if data['meanings'] else ''}")
    print()
    
    return compounds

if __name__ == "__main__":
    levels = ['n5', 'n4', 'n3', 'n2', 'n1']
    
    for level in levels:
        input_file = f"anki-vocab-jlpt-{level}.json"
        output_file = f"anki-compounds-jlpt-{level}.json"
        
        try:
            extract_compounds(input_file, output_file)
        except FileNotFoundError:
            print(f"File not found: {input_file}")
