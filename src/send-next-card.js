import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function sendNextCard(userId, message) {
      // Send debug info directly to the user
      // ...existing code (removed debug DM to user)...
    // Get all new and review cards (ignore next_review)
    const { rows: newCards } = await pool.query(
      `SELECT * FROM cards WHERE user_id = $1 AND introduced = TRUE AND score = 50`,
      [userId]
    );
    const { rows: reviewCards } = await pool.query(
      `SELECT * FROM cards WHERE user_id = $1 AND introduced = TRUE AND score < 50`,
      [userId]
    );

    // ...existing code (removed debug reply to user)...

  if (newCards.length === 0 && reviewCards.length === 0) {
    return false; // No cards due
  }

  // Weighted random: reviewCards 3x as likely as newCards
  let pickGroup;
  if (newCards.length === 0) {
    pickGroup = reviewCards;
    console.log('[sendNextCard] Picking from reviewCards (only group available)');
  } else if (reviewCards.length === 0) {
    pickGroup = newCards;
    console.log('[sendNextCard] Picking from newCards (only group available)');
  } else {
    // 0-3: review, 4: new (3:1 odds)
    const r = Math.floor(Math.random() * 4);
    pickGroup = r < 3 ? reviewCards : newCards;
    console.log(`[sendNextCard] Weighted pick: ${r < 3 ? 'reviewCards' : 'newCards'}`);
  }

  // Pick a random card from the chosen group
  const card = pickGroup[Math.floor(Math.random() * pickGroup.length)];
  console.log(`[sendNextCard] Picked card: ${card.card_front}, score: ${card.score}`);

  // Update last_card_sent to NOW for this user
  await pool.query('UPDATE users SET last_card_sent = NOW() WHERE id = $1', [userId]);
  
  // Parse meanings
  let allMeanings;
  try {
    allMeanings = JSON.parse(card.card_back);
  } catch {
    allMeanings = [card.card_back];
  }

  // Restore multiple meaning prompt logic
  await pool.query('UPDATE users SET last_kanji_sent = $1 WHERE id = $2', [card.card_front, userId]);
  if (allMeanings.length === 1) {
    await message.reply(`${card.card_front} = ?`);
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
    await message.reply(`${card.card_front} = ?`);
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
      // All meanings are at 0, use kanji = ?
      promptText = `${card.card_front} = ?`;
    }
  } else {
    // All meanings are balanced, use kanji = ?
    promptText = `${card.card_front} = ?`;
  }
  await message.reply(promptText);
  return true;

}