import 'dotenv/config';
import { Client, ChannelType } from 'discord.js';
import { Pool } from 'pg';

const botToken = process.env.DISCORD_BOT_TOKEN;
if (!botToken) {
  throw new Error('Missing DISCORD_BOT_TOKEN env var');
}

const client = new Client({
  intents: [],
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const { rows: users } = await pool.query('SELECT id, discord_user_id FROM users');
if (!users.length) {
  console.log('No users found in the database.');
  process.exit(0);
}

let successCount = 0;
for (const user of users) {
  const discordUserId = user.discord_user_id;
  const dbUserId = user.id;

  // Decay: reduce only cards with score > 50 by 1 point
  await pool.query(
    'UPDATE cards SET score = GREATEST(score - 1, 5) WHERE user_id = $1 AND introduced = TRUE AND score > 50',
    [dbUserId]
  );

  // Get next card: score <= 50, prioritize unseen
  const { rows: cards } = await pool.query(
    `SELECT * FROM cards
     WHERE user_id = $1 AND introduced = TRUE AND score <= 50
     ORDER BY CASE WHEN correct_count = 0 THEN 0 ELSE 1 END ASC, RANDOM()
     LIMIT 1`,
    [dbUserId]
  );

  if (!cards.length) {
    console.log(`No cards for ${discordUserId}`);
    continue;
  }

  const card = cards[0];
  const message = `${card.card_front} = ?`;

  try {
    await pool.query(
      'UPDATE users SET last_kanji_sent = $1 WHERE id = $2',
      [card.card_front, dbUserId]
    );
  } catch (err) {
    console.error(`Failed to update last_kanji_sent for ${discordUserId}:`, err);
    continue;
  }

  // Wait for client to be ready
  if (!client.isReady()) {
    await client.login(botToken);
    await new Promise(resolve => client.once('ready', resolve));
  }

  try {
    // Get user from Discord
    const discordUser = await client.users.fetch(discordUserId);
    // Send DM
    await discordUser.send(message);
    console.log(`Sent to ${discordUserId}:`, message);
    successCount++;
  } catch (err) {
    console.error(`Discord send failed for user ${discordUserId}`, err.message);
  }
}

console.log(`Done. Sent to ${successCount} user(s).`);

await client.destroy();
await pool.end();