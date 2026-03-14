#!/usr/bin/env python3

def load_keys(fn):
    try:
        with open(fn) as f:
            return set(line.strip() for line in f if line.strip())
    except FileNotFoundError:
        print(f"Error: {fn} not found")
        return set()

top300 = load_keys('top-300.txt')
n5 = load_keys('n5-site.txt')
n4 = load_keys('n4-site.txt')

jlpt = n5 | n4
not_in_freq = sorted(jlpt - top300)

print(f"=== JLPT N5+N4 NOT in Top-300 Frequency ===")
print(f"JLPT total: {len(jlpt)}")
print(f"Also in top-300: {len(jlpt & top300)}")
print(f"NOT in top-300: {len(not_in_freq)}")
print()
print("JLPT kanji NOT in top-300 freq:")
for k in not_in_freq:
    print(f"  {k}")
