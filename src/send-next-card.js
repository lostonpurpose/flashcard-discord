import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function sendNextCard(userId, message) {
  // Get the next card due for review
  const { rows } = await pool.query(
    `SELECT c.* FROM cards c
     WHERE c.user_id = $1 AND c.introduced = TRUE
     ORDER BY CASE WHEN c.correct_count = 0 THEN 0 ELSE 1 END ASC, c.score ASC
     LIMIT 1`,
    [userId]
  );

  if (rows.length === 0) {
    return false; // No cards due
  }

  const card = rows[0];
  
  // Parse meanings
  let allMeanings;
  try {
    allMeanings = JSON.parse(card.card_back);
  } catch {
    allMeanings = [card.card_back];
  }

  // If only one meaning, just send the kanji
  if (allMeanings.length === 1) {
    await pool.query('UPDATE users SET last_kanji_sent = $1 WHERE id = $2', [card.card_front, userId]);
    
    await message.reply(card.card_front);
    return true;
  }

  // For multiple meanings, check progress on each
  const meaningStatsRes = await pool.query(
    `SELECT meaning, correct_count FROM card_meanings WHERE card_id = $1 ORDER BY correct_count ASC`,
    [card.id]
  );

  // Initialize meanings if they don't exist yet
  if (meaningStatsRes.rows.length === 0) {
    for (const meaning of allMeanings) {
      await pool.query(
        `INSERT INTO card_meanings (card_id, meaning) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [card.id, meaning]
      );
    }
    // Just send the plain kanji for first time
    await pool.query('UPDATE users SET last_kanji_sent = $1 WHERE id = $2', [card.card_front, userId]);
    
    await message.reply(card.card_front);
    return true;
  }

  // Check if any meaning is lagging by 3 or more
  const meaningStats = meaningStatsRes.rows;
  const maxCount = Math.max(...meaningStats.map(m => m.correct_count));
  const laggingMeanings = meaningStats.filter(m => maxCount - m.correct_count >= 3);

  let promptText;
  if (laggingMeanings.length > 0) {
    // Need to specify which meaning(s) to answer
    const knownMeanings = meaningStats
      .filter(m => !laggingMeanings.find(lm => lm.meaning === m.meaning))
      .map(m => m.meaning);
    
    if (knownMeanings.length > 0) {
      const knownText = knownMeanings.join(', ');
      promptText = `${card.card_front} means ${knownText}, and ?`;
    } else {
      // All meanings are at 0, just send plain kanji
      promptText = card.card_front;
    }
  } else {
    // All meanings are balanced, send plain kanji
    promptText = card.card_front;
  }

  await pool.query('UPDATE users SET last_kanji_sent = $1 WHERE id = $2', [card.card_front, userId]);
  
  await message.reply(promptText);
  
  return true;
}