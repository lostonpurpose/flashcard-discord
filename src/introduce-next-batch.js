import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function introduceNextBatch(userId, message, difficulty = 'easy') {
  // 1. Get all *meaning* cards the user has seen (exclude readings)
  const { rows: userCards } = await pool.query(
    `SELECT id, card_front, card_back, score, correct_count
     FROM cards
     WHERE user_id = $1
       AND introduced = TRUE
       AND card_front NOT LIKE '%(reading)'
     ORDER BY id ASC`,
    [userId]
  );

  // 2. Require each batch card to be answered correctly at least once
  const uncompletedCards = userCards.filter(c => Number(c.correct_count) === 0);

  // if there's at least one uncompleted batch card, don't introduce more.
  if (uncompletedCards.length > 0) {
    console.log('[introduceNextBatch] still have', uncompletedCards.length, 'uncompleted cards (correct_count=0):', uncompletedCards.map(c=>c.card_front));
    return false;
  }

  // otherwise all meaning cards have been answered and we can pull the next five
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
  console.log(`[introduceNextBatch] introduced ${nextCards.length} new cards for user ${userId}`);

  // 6. Insert new cards and send study messages
  for (const card of nextCards) {
      let newCardId;
      try {
        const insertResult = await pool.query(
          `INSERT INTO cards (user_id, card_front, card_back, introduced)
           VALUES ($1, $2, $3, TRUE)
           RETURNING id`,
          [userId, card.card_front, card.card_back]
        );
        newCardId = insertResult.rows[0].id;
      } catch (err) {
        if (err.code === '23505' && err.constraint === 'cards_pkey') {
          await pool.query(`SELECT setval('cards_id_seq',
              (SELECT COALESCE(MAX(id),0) FROM cards) + 1, false)`);
          const retry = await pool.query(
            `INSERT INTO cards (user_id, card_front, card_back, introduced)
             VALUES ($1, $2, $3, TRUE)
             RETURNING id`,
            [userId, card.card_front, card.card_back]
          );
          newCardId = retry.rows[0].id;
        } else throw err;
      }

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

      // Import readings for this card from master_cards
      const { rows: readingRows } = await pool.query(
        `SELECT readings FROM master_cards WHERE card_front = $1 AND difficulty = $2`,
        [card.card_front, difficulty]
      );
      if (readingRows.length && readingRows[0].readings) {
        let readings;
        try {
          readings = JSON.parse(readingRows[0].readings);
        } catch {
          readings = [];
        }
        for (const reading of readings) {
          await pool.query(
            `INSERT INTO card_readings (card_id, reading) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [newCardId, reading]
          );
        }
      }

      // Send next five flashcards to learn via Discord
      const meaningText = meanings.join(', ');
      await message.reply(`${card.card_front} = ${meaningText}`);
    }

  // Send spacing message
  await message.reply("*\n*\n*\n*\n*\n*\n*\n*\n*\n*\n*(This block is to keep you from seeing the answers :). Scroll up for the new words!)");

  return true; // Next batch introduced
}