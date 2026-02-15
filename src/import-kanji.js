import fs from 'fs';
import { Pool } from 'pg';
import 'dotenv/config';


const [,, jsonFile, difficulty, kanjiLevel] = process.argv;

if (!jsonFile || !difficulty || !kanjiLevel) {
  console.error('Usage: node import-kanji.js <jsonFile> <difficulty> <kanji_level>');
  process.exit(1);
}

const kanji = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  for (const [kanjiChar, data] of Object.entries(kanji)) {
    // Extract meanings array from the new structure { meanings: [...], readings: [...] }
    let meaningsArray;
    let readingsArray;
    if (typeof data === 'object' && data.meanings && Array.isArray(data.meanings)) {
      meaningsArray = data.meanings;
      readingsArray = Array.isArray(data.readings) ? data.readings : [];
    } else if (Array.isArray(data)) {
      meaningsArray = data;
      readingsArray = [];
    } else {
      meaningsArray = [data];
      readingsArray = [];
    }
    const meaningsJson = JSON.stringify(meaningsArray);
    const readingsJson = JSON.stringify(readingsArray);
    await pool.query(
      'INSERT INTO master_cards (card_front, card_back, readings, difficulty, kanji_level) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING',
      [kanjiChar, meaningsJson, readingsJson, difficulty, kanjiLevel]
    );
  }
  await pool.end();
  console.log('Import complete');
})();