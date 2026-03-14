import json
import sys

if len(sys.argv) < 2:
    print("Usage: python3 extract_keys.py <json_file>")
    sys.exit(1)

json_file = sys.argv[1]

with open(json_file, 'r', encoding='utf-8') as f:
    data = json.load(f)

for key in sorted(data.keys()):
    print(key)


# python3 extract_keys.py src/kanji-n4-1.json > n4-1-mine.txt 
# python3 extract_keys.py src/kanji-n4-2.json > n4-2-mine.txt
# cat n4-1-mine.txt n4-2-mine.txt > n4-mine.txt