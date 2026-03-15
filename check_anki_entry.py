#!/usr/bin/env python3
import sqlite3

# Check what's in the Anki DB for 真ん中
conn = sqlite3.connect('./anki/collection.anki21')
cursor = conn.cursor()

# Query for 真ん中
cursor.execute("SELECT flds, tags FROM notes WHERE flds LIKE '%真ん中%'")
rows = cursor.fetchall()

print(f"Found {len(rows)} entries with 真ん中")
for row in rows:
    fields = row[0].split('\x1f')
    tags = row[1]
    print(f"\nFields: {len(fields)}")
    for i, f in enumerate(fields[:5]):
        print(f"  [{i}]: {f[:100]}")
    print(f"Tags: {tags}")

conn.close()
