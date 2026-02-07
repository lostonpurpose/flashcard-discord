import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function sendNextCard(userId, message) {
  // Get new cards (score = 50) and review cards (score < 50)
  // Debug logging for card selection
  // Remove or comment out after debugging

  // Only select cards whose next_review is null or in the past (enforce interval)
  const now = new Date();
  const { rows: newCards } = await pool.query(
    `SELECT * FROM cards WHERE user_id = $1 AND introduced = TRUE AND score = 50 AND (next_review IS NULL OR next_review <= NOW())`,
    [userId]
  );
  const { rows: reviewCards } = await pool.query(
    `SELECT * FROM cards WHERE user_id = $1 AND introduced = TRUE AND score < 50 AND (next_review IS NULL OR next_review <= NOW())`,
    [userId]
  );

  console.log(`[sendNextCard] newCards: ${newCards.length}, reviewCards: ${reviewCards.length}`);

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

  // Get user's frequency (in hours)
  const { rows: userRows } = await pool.query('SELECT user_freq FROM users WHERE id = $1', [userId]);
  const userFreq = userRows.length ? userRows[0].user_freq : 3;
  // Set next_review to user_freq hours from now
  const nextReview = new Date(Date.now() + userFreq * 60 * 60 * 1000);
  await pool.query('UPDATE cards SET next_review = $1 WHERE id = $2', [nextReview, card.id]);
  
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
      // All meanings are at 0, just send plain kanji
      promptText = card.card_front;
    }
  } else {
    // All meanings are balanced, send plain kanji
    promptText = card.card_front;
  }
  await message.reply(promptText);
  return true;

}