import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function introduceNextBatch(userId, message, difficulty = 'easy') {
  // 1. Get all cards for user with their mastery status
  const { rows: userCards } = await pool.query(
    `SELECT c.id, c.card_front, c.card_back, c.correct_count
     FROM cards c
     WHERE c.user_id = $1 AND c.introduced = TRUE AND c.is_custom = FALSE
     ORDER BY c.id ASC`,
    [userId]
  );

  // 2. Split into batches of 5
  const batches = [];
  for (let i = 0; i < userCards.length; i += 5) {
    batches.push(userCards.slice(i, i + 5));
  }

  // 3. Find the latest full batch (ignore partial trailing batch)
  const fullBatches = batches.filter(batch => batch.length === 5);
  const currentBatch = fullBatches[fullBatches.length - 1];

  // 4. Check if current batch is mastered (all answered correctly at least once)
  const mastered = currentBatch && currentBatch.length === 5 && currentBatch.every(card => card.correct_count >= 1);

  if (mastered) {
    // 5. Get next 5 master_cards not yet assigned to user, filtered by difficulty
    const { rows: nextCards } = await pool.query(
      `SELECT card_front, card_back FROM master_cards
       WHERE difficulty = $2
       AND card_front NOT IN (
         SELECT card_front FROM cards WHERE user_id = $1
       )
       ORDER BY id ASC LIMIT 5`,
      [userId, difficulty]
    );

    if (nextCards.length === 0) {
      // No more cards available
      await message.reply("You've completed all available cards at this difficulty level! 🎉");
      return false;
    }

    // Send message telling them about next 5 kanji
    await message.reply("Nice work! You're on to the next 5 cards. Here they are:");

    // 6. Insert new cards and send study messages
    for (const card of nextCards) {
      const insertResult = await pool.query(
        `INSERT INTO cards (user_id, card_front, card_back, introduced)
         VALUES ($1, $2, $3, TRUE)
         RETURNING id`,
        [userId, card.card_front, card.card_back]
      );
      
      const newCardId = insertResult.rows[0].id;
      
      // Initialize card_meanings for each meaning
      let meanings;
      try {
        meanings = JSON.parse(card.card_back);
      } catch {
        meanings = [card.card_back];
      }
      
      for (const meaning of meanings) {
        await pool.query(
          `INSERT INTO card_meanings (card_id, meaning) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newCardId, meaning]
        );
      }
      // Send next five flashcards to learn via Discord
      const meaningText = meanings.join(', ');
      await message.reply(`${card.card_front} = ${meaningText}`);
    }

    // Send spacing message
    await message.reply("\n/\n/\n/\n/\n/\n/\n\n/\n/\n/(This block is to keep you from seeing the answers :). Scroll up for the new words!)");

    return true; // Next batch introduced
  }
  return false; // Not ready for next batch
}