with open('n4-site.txt','r',encoding='utf-8') as f:
    site = {l.strip() for l in f if l.strip() and not l.startswith('FLASHCARDS')}
with open('n4-mine.txt','r',encoding='utf-8') as f:
    mine = {l.strip() for l in f if l.strip()}
missing = sorted(site - mine)
extra = sorted(mine - site)
print('site count', len(site))
print('mine count', len(mine))
print(f'missing ({len(missing)}):')
for m in missing:
    print(f'  {m}')
print(f'\nextra ({len(extra)}):')
for e in extra:
    print(f'  {e}')