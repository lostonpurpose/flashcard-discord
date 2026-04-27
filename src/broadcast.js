import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { Pool } from 'pg';

const botToken = process.env.DISCORD_BOT_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const messageText = process.argv.slice(2).join(' ').trim() ||
  'New feature: challenge! is now available. Type `challenge!` to try it.';

if (!botToken) {
  console.error('Missing DISCORD_BOT_TOKEN env var');
  process.exit(1);
}

if (!databaseUrl) {
  console.error('Missing DATABASE_URL env var');
  process.exit(1);
}

if (!messageText) {
  console.error('Please provide a message to send to users. Example: node src/broadcast.js "Your text here"');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel],
});

const pool = new Pool({ connectionString: databaseUrl });

client.once('ready', async () => {
  console.log(`Broadcast bot logged in as ${client.user.tag}`);
  try {
    const { rows: users } = await pool.query(
      'SELECT discord_user_id FROM users WHERE discord_user_id IS NOT NULL'
    );

    console.log(`Broadcasting to ${users.length} users`);
    let success = 0;
    let failed = 0;

    for (const { discord_user_id } of users) {
      try {
        const discordUser = await client.users.fetch(discord_user_id);
        await discordUser.send(messageText);
        success += 1;
      } catch (err) {
        failed += 1;
        console.warn(`Failed to DM ${discord_user_id}:`, err.message || err);
      }
    }

    console.log(`Broadcast complete. Success: ${success}, Failed: ${failed}`);
  } catch (err) {
    console.error('Broadcast failed:', err);
  } finally {
    await pool.end();
    await client.destroy();
    process.exit(0);
  }
});

client.login(botToken).catch((err) => {
  console.error('Discord login failed:', err);
  process.exit(1);
});
