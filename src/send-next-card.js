import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function sendNextCard(userId, message) {
      // Send debug info directly to the user
      // ...existing code (removed debug DM to user)...
    // Get all new and review cards (ignore next_review)

    // include customs by unioning custom_cards
    const { rows: newCards } = await pool.query(
        `SELECT id, user_id, card_front, card_back, introduced, next_review, next_card_due,
                correct_count, incorrect_count, consecutive_correct, score, reading_introduced, FALSE AS is_custom
         FROM cards WHERE user_id = $1 AND introduced = TRUE AND score = 50
         UNION ALL
         SELECT id, user_id, card_front, card_back, introduced, next_review, next_card_due,
                correct_count, incorrect_count, consecutive_correct, score, FALSE AS reading_introduced, TRUE AS is_custom
         FROM custom_cards WHERE user_id = $1 AND introduced = TRUE AND score = 50`,
        [userId]
    );
    const { rows: reviewCards } = await pool.query(
        `SELECT id, user_id, card_front, card_back, introduced, next_review, next_card_due,
                correct_count, incorrect_count, consecutive_correct, score, reading_introduced, FALSE AS is_custom
         FROM cards WHERE user_id = $1 AND introduced = TRUE AND score < 50
         UNION ALL
         SELECT id, user_id, card_front, card_back, introduced, next_review, next_card_due,
                correct_count, incorrect_count, consecutive_correct, score, FALSE AS reading_introduced, TRUE AS is_custom
         FROM custom_cards WHERE user_id = $1 AND introduced = TRUE AND score < 50`,
        [userId]
    );

    // split the 50‑score cards into fresh (never answered) vs answered
    const freshNew = newCards.filter(c => Number(c.correct_count) === 0);
    const answeredNew = newCards.filter(c => Number(c.correct_count) > 0);

    // Debug: print all candidate cards
    console.log('[sendNextCard] Candidate reviewCards:', reviewCards.map(c => ({id: c.id, front: c.card_front, score: c.score, reading: c.reading_introduced})));
    console.log('[sendNextCard] Candidate answeredNew:', answeredNew.map(c => ({id: c.id, front: c.card_front, score: c.score, reading: c.reading_introduced})));
    console.log('[sendNextCard] Candidate freshNew:', freshNew.map(c => ({id: c.id, front: c.card_front, score: c.score, reading: c.reading_introduced})));

    if (freshNew.length === 0 && answeredNew.length === 0 && reviewCards.length === 0) {
        return false; // No cards due
    }

    // Weighted random across three pools
    // weights: reviewCards=3, freshNew=2, answeredNew=1
    let pickGroup;
    if (reviewCards.length === 0 && freshNew.length === 0 && answeredNew.length > 0) {
        pickGroup = answeredNew;
        console.log('[sendNextCard] Picking from answeredNew (only group available)');
    } else if (reviewCards.length === 0 && answeredNew.length === 0 && freshNew.length > 0) {
        pickGroup = freshNew;
        console.log('[sendNextCard] Picking from freshNew (only group available)');
    } else if (freshNew.length === 0 && answeredNew.length === 0 && reviewCards.length > 0) {
        pickGroup = reviewCards;
        console.log('[sendNextCard] Picking from reviewCards (only group available)');
    } else {
        // compute total weight
        const totalWeight = (reviewCards.length ? 3 : 0) + (freshNew.length ? 2 : 0) + (answeredNew.length ? 1 : 0);
        const r = Math.floor(Math.random() * totalWeight);
        if (reviewCards.length && r < 3) {
            pickGroup = reviewCards;
            console.log('[sendNextCard] Weighted pick: reviewCards');
        } else if (freshNew.length && r < (3 + 2)) {
            pickGroup = freshNew;
            console.log('[sendNextCard] Weighted pick: freshNew');
        } else {
            pickGroup = answeredNew;
            console.log('[sendNextCard] Weighted pick: answeredNew');
        }
    }

    // Debug: print pickGroup before picking
    console.log('[sendNextCard] pickGroup:', pickGroup.map(c => ({id: c.id, front: c.card_front, score: c.score, reading: c.reading_introduced, back: c.card_back})));

    // Pick a random card from the chosen group
    const card = pickGroup[Math.floor(Math.random() * pickGroup.length)];
    console.log('[sendNextCard] Picked card FULL:', card);
    
    // Extra: print all cards for this user/kanji for debugging
    try {
      const { rows: allDupes } = await pool.query(
        `SELECT id, card_front, score, reading_introduced, card_back
         FROM cards WHERE user_id = $1 AND card_front = $2
         UNION ALL
         SELECT id, card_front, score, NULL AS reading_introduced, card_back
         FROM custom_cards WHERE user_id = $1 AND card_front = $2`,
        [userId, card.card_front]
      );
      console.log(`[sendNextCard] ALL cards for user ${userId} and kanji ${card.card_front}:`, allDupes);
    } catch (e) {
      console.error('[sendNextCard] Error fetching dupes:', e);
    }

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
      // Always use card.card_front as-is for the prompt
      await message.reply(`${card.card_front} = ? [cardId: ${card.id}]`);
      return true;
    }
    // no return yet for multi-meaning cards, but still log ID for telemetry
    console.log(`[sendNextCard] multi-meaning card selected id=${card.id}`);

  // For multiple meanings, check progress on each – only for regular cards
  let meaningStatsRes;
  if (!card.is_custom) {
    meaningStatsRes = await pool.query(
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
      await message.reply(`${card.card_front} = ? [cardId: ${card.id}]`);
      return true;
    }
  } else {
    // custom card, skip meaning tracking
    await message.reply(`${card.card_front} = ? [cardId: ${card.id}]`);
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
  await message.reply(`${promptText} [cardId: ${card.id}]`);
  return true;

}