import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function onboardUser(discordUserId, message, difficulty = 'easy') {
  // Get user id
  const { rows: userRows } = await pool.query(
    'SELECT id FROM users WHERE discord_user_id = $1',
    [discordUserId]
  );
  if (!userRows.length) throw new Error('User not found');
  const userId = userRows[0].id;

  // Get first 5 master cards by id
  const { rows: cardRows } = await pool.query(
    'SELECT card_front, card_back FROM master_cards WHERE difficulty = $1 ORDER BY id ASC LIMIT 5',
    [difficulty]
  );

  // Insert into cards table for this user
  const { rows: userFreqRows } = await pool.query('SELECT user_freq FROM users WHERE id = $1', [userId]);
  const userFreq = userFreqRows.length ? userFreqRows[0].user_freq : 3;
  for (const card of cardRows) {
    const insertResult = await pool.query(
      `INSERT INTO cards (user_id, card_front, card_back, introduced)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id`,
      [userId, card.card_front, card.card_back]
    );
    const newCardId = insertResult.rows[0].id;

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
  }

  // Send the very first welcome greeting
  await message.reply("Welcome to the Kanji Study Discord Bot!\nYou'll be getting a kanji every few hours (actually defaults to 3 minutes at the moment). Just respond to each kanji question with your answer like a regular Discord message.\n\nThere are many things you can do, like creating your own cards, changing how often you receive cards, etc. For a menu with all options just type 'help!' (with the exclamation point) at any time (that feature coming soon... just ask Will for all options).\n\nHere are your first five kanji to learn:");

  // Send study message (kanji + meaning) for each card
  for (const card of cardRows) {
    await message.reply(`${card.card_front} = ${card.card_back}`);
  }

  // Send spacing message
  await message.reply("\n/\n/\n/\n/\n/\n/\n/\n/\n/\n/(Scroll up for your first five cards to avoid accidentally seeing the meanings!)");
}