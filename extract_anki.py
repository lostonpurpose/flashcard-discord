#!/usr/bin/env python3
import sqlite3
import json
import sys
from pathlib import Path

def extract_reading_from_bracket(bracketed):
    """Extract reading from format like '大空[おおぞら]' -> 'おおぞら'"""
    import re
    match = re.search(r'\[(.+?)\]', bracketed)
    if match:
        return match.group(1)
    return bracketed

def extract_anki(anki_db_path, output_by_level=True):
    """Extract vocabulary from Anki database, organized by JLPT level."""
    
    try:
        conn = sqlite3.connect(anki_db_path)
        cursor = conn.cursor()
        
        # Query all notes with tags
        cursor.execute("SELECT flds, tags FROM notes")
        all_rows = cursor.fetchall()
        
        vocab_by_level = {
            'jlpt_N5': {},
            'jlpt_N4': {},
            'jlpt_N3': {},
            'jlpt_N2': {},
            'jlpt_N1': {},
            'other': {}
        }
        
        for row in all_rows:
            fields = row[0].split('\x1f')  # Anki field separator
            tags = row[1]
            
            # Fields: [expression, meaning, reading_with_brackets, pos, ...]
            if len(fields) >= 3:
                expression = fields[0].strip()
                meaning = fields[1].strip()
                reading_raw = fields[2].strip()
                
                if expression:
                    # Extract reading from brackets
                    reading = extract_reading_from_bracket(reading_raw)
                    
                    # Parse meanings (split by comma)
                    meanings = [m.strip() for m in meaning.split(',') if m.strip()]
                    
                    # Determine JLPT level from tags
                    level = 'other'
                    for jlpt in ['jlpt_N5', 'jlpt_N4', 'jlpt_N3', 'jlpt_N2', 'jlpt_N1']:
                        if jlpt in tags:
                            level = jlpt
                            break
                    
                    vocab_by_level[level][expression] = {
                        "meanings": meanings,
                        "readings": [reading] if reading else []
                    }
        
        conn.close()
        
        # Print summary
        print("\n=== Extraction Summary ===")
        for level, vocab in vocab_by_level.items():
            if vocab:
                print(f"{level}: {len(vocab)} entries")
                # Show sample
                sample = list(vocab.items())[:2]
                for expr, data in sample:
                    print(f"  - {expr}: {data}")
        
        # Save each level
        if output_by_level:
            for level, vocab in vocab_by_level.items():
                if vocab:
                    filename = f"anki-vocab-{level.replace('_', '-').lower()}.json"
                    with open(filename, 'w', encoding='utf-8') as f:
                        json.dump(vocab, f, ensure_ascii=False, indent=2)
                    print(f"\nSaved {len(vocab)} entries to {filename}")
        
        return vocab_by_level
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 extract_anki.py <path_to_anki21>")
        sys.exit(1)
    
    db_path = sys.argv[1]
    extract_anki(db_path, output_by_level=True)
