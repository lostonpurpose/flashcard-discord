#!/usr/bin/env python3
import json
import unicodedata

def is_kanji(char):
    """Check if character is a kanji."""
    return unicodedata.category(char) == 'Lo' and ord(char) >= 0x4E00 and ord(char) <= 0x9FFF

def extract_kanji(text):
    """Extract all kanji from text, return as set."""
    return set(c for c in text if is_kanji(c))

def validate_compounds(comp_file, prior_kanji_set, current_level_name):
    """
    Check if all kanji in compounds exist in prior levels or current level.
    Remove compounds with missing kanji.
    """
    
    with open(comp_file, 'r', encoding='utf-8') as f:
        compounds = json.load(f)
    
    valid = {}
    invalid = {}
    
    for compound, data in compounds.items():
        kanji_in_compound = extract_kanji(compound)
        
        # Check if all kanji are available
        if kanji_in_compound.issubset(prior_kanji_set):
            valid[compound] = data
        else:
            missing = kanji_in_compound - prior_kanji_set
            invalid[compound] = {
                "data": data,
                "missing_kanji": list(missing)
            }
    
    print(f"\n=== {current_level_name} ===")
    print(f"Total compounds: {len(compounds)}")
    print(f"Valid (prereqs met): {len(valid)}")
    print(f"Invalid (missing kanji): {len(invalid)}")
    
    if invalid:
        print("\nSample invalid compounds (first 5):")
        for comp, info in list(invalid.items())[:5]:
            print(f"  {comp}: missing {info['missing_kanji']}")
    
    return valid, invalid

def main():
    # Load all kanji from our existing JSON files
    kanji_by_level = {
        'n5': set(),
        'n4': set(),
        'n3': set(),
        'n2': set(),
        'n1': set()
    }
    
    # Load single kanji from anki vocab files (these are our authoritative source)
    print("=== Loading kanji from Anki vocab ===")
    for level in ['n5', 'n4', 'n3', 'n2', 'n1']:
        file = f"anki-vocab-jlpt-{level}.json"
        try:
            with open(file, 'r', encoding='utf-8') as f:
                vocab = json.load(f)
            
            # Extract single kanji
            for entry in vocab.keys():
                if len(extract_kanji(entry)) == 1:
                    kanji_by_level[level].add(entry)
            
            print(f"{level.upper()}: {len(kanji_by_level[level])} kanji")
        except FileNotFoundError:
            print(f"File not found: {file}")
    
    # Now validate compounds for each level
    print("\n=== Validating Compounds ===")
    
    # N5 compounds: need N5 kanji
    prior_kanji = kanji_by_level['n5']
    valid_n5, invalid_n5 = validate_compounds(
        "anki-compounds-jlpt-n5.json", 
        prior_kanji,
        "N5 Compounds"
    )
    
    # N4 compounds: need N5 + N4 kanji
    prior_kanji = kanji_by_level['n5'] | kanji_by_level['n4']
    valid_n4, invalid_n4 = validate_compounds(
        "anki-compounds-jlpt-n4.json",
        prior_kanji,
        "N4 Compounds"
    )
    
    # N3 compounds: need N5 + N4 + N3 kanji
    prior_kanji = kanji_by_level['n5'] | kanji_by_level['n4'] | kanji_by_level['n3']
    valid_n3, invalid_n3 = validate_compounds(
        "anki-compounds-jlpt-n3.json",
        prior_kanji,
        "N3 Compounds"
    )
    
    # N2 compounds: need N5 + N4 + N3 + N2 kanji
    prior_kanji = kanji_by_level['n5'] | kanji_by_level['n4'] | kanji_by_level['n3'] | kanji_by_level['n2']
    valid_n2, invalid_n2 = validate_compounds(
        "anki-compounds-jlpt-n2.json",
        prior_kanji,
        "N2 Compounds"
    )
    
    # N1 compounds: need N5 + N4 + N3 + N2 + N1 kanji
    prior_kanji = kanji_by_level['n5'] | kanji_by_level['n4'] | kanji_by_level['n3'] | kanji_by_level['n2'] | kanji_by_level['n1']
    valid_n1, invalid_n1 = validate_compounds(
        "anki-compounds-jlpt-n1.json",
        prior_kanji,
        "N1 Compounds"
    )
    
    # Save validated compounds
    print("\n=== Saving Validated Compounds ===")
    for level, valid in [('n5', valid_n5), ('n4', valid_n4), ('n3', valid_n3), ('n2', valid_n2), ('n1', valid_n1)]:
        output_file = f"anki-compounds-valid-{level}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(valid, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(valid)} valid {level.upper()} compounds to {output_file}")

if __name__ == "__main__":
    main()
