#!/usr/bin/env python3
import sys

def load_keys(filename):
    """Load keys (one per line) from a file and return as ordered list."""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        print(f"Error: {filename} not found")
        sys.exit(1)

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 find_freq_gaps.py <freq_list> <jlpt_level_1> [jlpt_level_2] ...")
        print("Example: python3 find_freq_gaps.py top-300-freq.txt n5-site.txt")
        print("Example: python3 find_freq_gaps.py top-550-freq.txt n5-site.txt n4-site.txt")
        sys.exit(1)
    
    freq_file = sys.argv[1]
    jlpt_files = sys.argv[2:]
    
    freq_list = load_keys(freq_file)
    
    # Accumulate all JLPT kanji
    jlpt_keys = set()
    for jf in jlpt_files:
        jlpt_keys.update(load_keys(jf))
    
    # Find which freq kanji are NOT in JLPT
    gaps = [k for k in freq_list if k not in jlpt_keys]
    
    print(f"=== Frequency Gap Analysis ===")
    print(f"Top frequency kanji checked: {len(freq_list)}")
    print(f"JLPT coverage: {len([k for k in freq_list if k in jlpt_keys])}")
    print(f"Gaps (freq kanji NOT in JLPT): {len(gaps)}")
    print()
    
    if gaps:
        print("GAPS (add these to next JLPT level):")
        for item in gaps:
            print(f"  {item}")
    else:
        print("No gaps - all top frequency kanji already covered by JLPT!")

if __name__ == "__main__":
    main()
