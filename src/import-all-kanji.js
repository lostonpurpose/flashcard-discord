import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const fileMappings = [
  { file: 'kanji-n5.json', difficulty: 'easy' },
  { file: 'kanji-n4.json', difficulty: 'easy' },
  { file: 'kanji-n3-1.json', difficulty: 'medium' },
  { file: 'kanji-n3-2.json', difficulty: 'medium' },
  { file: 'kanji-n2-1.json', difficulty: 'hard' },
  { file: 'kanji-n2-2.json', difficulty: 'hard' },
  { file: 'kanji-n2-3.json', difficulty: 'hard' },
];

async function importKanji() {
  try {
    // Clear existing master_cards
    await pool.query('DELETE FROM master_cards');
    console.log('Cleared existing master_cards');
    
    let totalImported = 0;
    
    for (const { file, difficulty } of fileMappings) {
      const filePath = path.join(__dirname, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      
      console.log(`Importing ${file} as difficulty '${difficulty}'...`);
      
      let count = 0;
      for (const [kanji, kanjiData] of Object.entries(data)) {
        const meanings = JSON.stringify(kanjiData.meanings || []);
        
        await pool.query(
          `INSERT INTO master_cards (card_front, card_back, difficulty)
           VALUES ($1, $2, $3)`,
          [kanji, meanings, difficulty]
        );
        count++;
      }
      
      console.log(`✓ Imported ${count} kanji from ${file}`);
      totalImported += count;
    }
    
    console.log(`\n✓ Total: ${totalImported} kanji imported`);
    
    // Show summary
    const summary = await pool.query(
      `SELECT difficulty, COUNT(*) as count FROM master_cards GROUP BY difficulty ORDER BY difficulty`
    );
    console.log('\nMaster cards by difficulty:');
    summary.rows.forEach(row => console.log(`  ${row.difficulty}: ${row.count}`));
    
    process.exit(0);
  } catch (err) {
    console.error('Error importing kanji:', err);
    process.exit(1);
  }
}

importKanji();
