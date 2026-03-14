#!/usr/bin/env python3
import sys

def load_keys(filename):
    """Load keys (one per line) from a file and return as set."""
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            return set(line.strip() for line in f if line.strip())
    except FileNotFoundError:
        print(f"Error: {filename} not found")
        sys.exit(1)

def main():
    if len(sys.argv) < 4:
        print("Usage: python3 compare_with_prior.py <site_list> <mine_list> <prior_levels_list...>")
        print("Example: python3 compare_with_prior.py n4-site.txt n4-mine.txt n5-mine.txt")
        sys.exit(1)
    
    site_file = sys.argv[1]
    mine_file = sys.argv[2]
    prior_files = sys.argv[3:] if len(sys.argv) > 3 else []
    
    site_keys = load_keys(site_file)
    mine_keys = load_keys(mine_file)
    
    # Accumulate all prior level kanji
    prior_keys = set()
    for pf in prior_files:
        prior_keys.update(load_keys(pf))
    
    # Missing: in site but not in mine AND not already in prior levels
    missing = site_keys - mine_keys - prior_keys
    
    # Extra: in mine but not in site AND not in prior levels
    extra = mine_keys - site_keys - prior_keys
    
    print(f"=== Comparison Results ===")
    print(f"Official list: {len(site_keys)} entries")
    print(f"Local JSON: {len(mine_keys)} entries")
    print(f"Prior levels: {len(prior_keys)} entries")
    print()
    
    if missing:
        print(f"MISSING ({len(missing)} entries - not in this level's JSON and not in prior levels):")
        for item in sorted(missing):
            print(f"  {item}")
        print()
    else:
        print("MISSING: none")
        print()
    
    if extra:
        print(f"EXTRA ({len(extra)} entries - in JSON but not on official list and not in prior levels):")
        for item in sorted(extra):
            print(f"  {item}")
        print()
    else:
        print("EXTRA: none")
        print()

if __name__ == "__main__":
    main()
