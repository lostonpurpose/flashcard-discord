#!/usr/bin/env python3
import json
import unicodedata

def is_kanji(char):
    """Check if character is a kanji."""
    return unicodedata.category(char) == 'Lo' and ord(char) >= 0x4E00 and ord(char) <= 0x9FFF

def extract_kanji(text):
    """Extract all kanji from text, return as set."""
    return set(c for c in text if is_kanji(c))

def validate_compounds_vs_your_files(comp_file, prior_kanji_set, current_level_name):
    """Check compounds against YOUR kanji files."""
    
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
    print(f"Valid (all kanji in your file): {len(valid)}")
    print(f"Invalid (missing from your file): {len(invalid)}")
    
    if invalid:
        print("\nInvalid compounds (first 10):")
        for comp, info in list(invalid.items())[:10]:
            print(f"  {comp}: missing {info['missing_kanji']}")
    
    return valid, invalid

def main():
    # Load kanji from YOUR JSON files
    kanji_by_level = {
        'n5': set(),
        'n4': set(),
        'n3': set(),
        'n2': set(),
        'n1': set()
    }
    
    print("=== Loading kanji from YOUR JSON files ===")
    
    # N5 (n5.json + n5-2.json)
    for file in ['src/kanji-n5.json', 'src/kanji-n5-2.json']:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for entry in data.keys():
                if len(extract_kanji(entry)) == 1:
                    kanji_by_level['n5'].add(entry)
        except:
            pass
    print(f"N5: {len(kanji_by_level['n5'])} kanji")
    
    # N4 (n4-1.json + n4-2.json)
    for file in ['src/kanji-n4-1.json', 'src/kanji-n4-2.json']:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for entry in data.keys():
                if len(extract_kanji(entry)) == 1:
                    kanji_by_level['n4'].add(entry)
        except:
            pass
    print(f"N4: {len(kanji_by_level['n4'])} kanji")
    
    # N3 (n3-1.json + n3-2.json)
    for file in ['src/kanji-n3-1.json', 'src/kanji-n3-2.json']:
        try:
            with open(file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            for entry in data.keys():
                if len(extract_kanji(entry)) == 1:
                    kanji_by_level['n3'].add(entry)
        except:
            pass
    print(f"N3: {len(kanji_by_level['n3'])} kanji")
    
    # Now validate compounds
    print("\n=== Validating Compounds Against YOUR Files ===")
    
    # N5 compounds
    prior_kanji = kanji_by_level['n5']
    valid_n5, invalid_n5 = validate_compounds_vs_your_files(
        "n5-compounds.json",
        prior_kanji,
        "N5 Compounds"
    )
    
    # N4 compounds
    prior_kanji = kanji_by_level['n5'] | kanji_by_level['n4']
    valid_n4, invalid_n4 = validate_compounds_vs_your_files(
        "n4-compounds.json",
        prior_kanji,
        "N4 Compounds"
    )
    
    # N3 compounds
    prior_kanji = kanji_by_level['n5'] | kanji_by_level['n4'] | kanji_by_level['n3']
    valid_n3, invalid_n3 = validate_compounds_vs_your_files(
        "n3-compounds.json",
        prior_kanji,
        "N3 Compounds"
    )
    
    # Save validated
    print("\n=== Saving Re-validated Compounds ===")
    for level, valid in [('n5', valid_n5), ('n4', valid_n4), ('n3', valid_n3)]:
        output_file = f"{level}-compounds.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(valid, f, ensure_ascii=False, indent=2)
        print(f"Saved {len(valid)} valid {level.upper()} compounds to {output_file}")

if __name__ == "__main__":
    main()
