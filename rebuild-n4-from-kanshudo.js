import fs from 'fs';
import path from 'path';

const root = process.cwd();
const srcDir = path.join(root, 'src');

const config = {
  n4KanjiListFile: path.join(root, 'n4-kanji-list.json'),
  outputN4File: path.join(srcDir, 'kanji-n4-1.generated.json'),
  outputCompoundFile: path.join(root, 'n4-compounds-auto.json'),
  n4SourceFiles: [
    path.join(srcDir, 'kanji-n4-1.json'),
    path.join(srcDir, 'kanji-n4-2.json'),
    path.join(root, 'anki-vocab-jlpt-n4.json'),
  ],
  existingCompoundFile: path.join(root, 'n4-compounds-valid.json')
};

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error('Failed to load', filePath, err.message);
    return null;
  }
}

function uniqueKanjiFromObject(obj) {
  if (!obj) return new Set();
  return new Set(Object.keys(obj));
}

(async () => {
  const n4List = loadJson(config.n4KanjiListFile);
  if (!n4List || !Array.isArray(n4List)) {
    console.error('Expected n4-kanji-list.json as array of kanji. Create this file from Kanshudo N4 list.');
    process.exit(1);
  }

  const n4KanjiSet = new Set(n4List);

  // merge sources
  const sources = config.n4SourceFiles.map(loadJson);
  const merged = {};

  for (const kanji of n4List) {
    for (const src of sources) {
      if (!src) continue;
      if (Object.prototype.hasOwnProperty.call(src, kanji)) {
        merged[kanji] = src[kanji];
        break;
      }
    }
    if (!merged[kanji]) {
      // fallback: kanji may be in any source by exact match of one-character item
      for (const src of sources) {
        if (!src) continue;
        if (Object.prototype.hasOwnProperty.call(src, kanji)) {
          merged[kanji] = src[kanji];
          break;
        }
      }
    }
    if (!merged[kanji]) {
      merged[kanji] = {
        meanings: ['(UNKNOWN meaning)'],
        readings: []
      };
      console.warn(`Kanji missing in source: ${kanji}`);
    }
  }

  fs.writeFileSync(config.outputN4File, JSON.stringify(merged, null, 2), 'utf8');
  console.log('Wrote new N4 file:', config.outputN4File, 'entries:', Object.keys(merged).length);

  // compounds from existing valid file, filtered by component kanji in N4.
  const compounds = loadJson(config.existingCompoundFile);
  const filteredCompounds = {};
  if (compounds) {
    for (const [cpd, info] of Object.entries(compounds)) {
      const chars = [...cpd];
      const allPartsInN4 = chars.every(ch => n4KanjiSet.has(ch));
      if (allPartsInN4) filteredCompounds[cpd] = info;
    }
  }
  fs.writeFileSync(config.outputCompoundFile, JSON.stringify(filteredCompounds, null, 2), 'utf8');
  console.log('Wrote n4 compounds from existing valid set:', config.outputCompoundFile, 'entries:', Object.keys(filteredCompounds).length);

  console.log('Done. If you want, rename output to src/kanji-n4-1.json and rerun import-all-kanji.js');
})();