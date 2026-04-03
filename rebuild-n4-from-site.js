import fs from 'fs';
import path from 'path';

const cwd = process.cwd();
const n4ListFile = path.join(cwd, 'n4-site.txt');
const n4a = path.join(cwd, 'src', 'kanji-n4-1.json');
const n4b = path.join(cwd, 'src', 'kanji-n4-2.json');
const n4out = path.join(cwd, 'src', 'kanji-n4-1.rebuilt.json');
const n4compounds = path.join(cwd, 'n4-compounds-valid.json');
const n4compoundsOut = path.join(cwd, 'n4-compounds-rebuilt.json');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error('readJson failed', file, e.message); return {}; }
}

function readKanjiList(file) {
  const contents = fs.readFileSync(file, 'utf8');
  return contents.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}

const n4Chars = readKanjiList(n4ListFile);
const n4Set = new Set(n4Chars);

const n4DataA = readJson(n4a);
const n4DataB = readJson(n4b);

const merged = {};
for (const ch of n4Chars) {
  if (n4DataA[ch]) merged[ch] = n4DataA[ch];
  else if (n4DataB[ch]) merged[ch] = n4DataB[ch];
  else merged[ch] = { meanings: ['(meaning missing)'], readings: [] };
}

fs.writeFileSync(n4out, JSON.stringify(merged, null, 2), 'utf8');
console.log('Wrote rebuilt N4 kanji file', n4out, 'count', Object.keys(merged).length);

const compounds = readJson(n4compounds);
const compoundsOut = {};
for (const [word, info] of Object.entries(compounds)) {
  if ([...word].every(ch => n4Set.has(ch))) {
    compoundsOut[word] = info;
  }
}
fs.writeFileSync(n4compoundsOut, JSON.stringify(compoundsOut, null, 2), 'utf8');
console.log('Wrote rebuilt N4 compounds file', n4compoundsOut, 'count', Object.keys(compoundsOut).length);

console.log('Done. Alternatively copy', n4out, '-> src/kanji-n4-1.json and re-import with node src/import-all-kanji.js');