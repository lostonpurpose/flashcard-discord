// === EVENT LOOP DELAY MONITORING ===
import { monitorEventLoopDelay } from 'perf_hooks';
const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();
setInterval(() => {
  const mean = Math.round(h.mean / 1e6); // ms
  const max = Math.round(h.max / 1e6); // ms
  if (mean > 50 || max > 200) {
    console.warn(`[EVENT LOOP DELAY] mean: ${mean}ms, max: ${max}ms`);
  } else {
    console.log(`[EVENT LOOP DELAY] mean: ${mean}ms, max: ${max}ms`);
  }
  h.reset();
}, 60000); // Log every minute
// === CRON-BASED KANJI SENDER (using cron npm package) ===
import { CronJob } from 'cron';
let cronRunning = false;
const job = new CronJob('*/30 * * * * *', async () => {
  if (cronRunning) {
    console.warn('[CRON] Previous run still in progress, skipping this tick.');
    return;
  }
  cronRunning = true;
  const start = Date.now();
  try {
    const now = new Date();
    console.log(`[CRON] >>> ENTERED CRON CALLBACK at ${now.toISOString()}`);
    const { rows: users } = await pool.query('SELECT id, discord_user_id, last_card_sent, user_freq FROM users');
    console.log(`[CRON] Checking ${users.length} users`);
    for (const user of users) {
      const { id: userId, discord_user_id, last_card_sent, user_freq } = user;
      const lastSent = last_card_sent ? new Date(last_card_sent) : null;
      const freqMs = (user_freq || 3) * 60 * 1000;
      const timeSinceLast = lastSent ? (now - lastSent) : null;
      console.log(`[CRON] User ${discord_user_id}: lastSent=${lastSent}, freqMs=${freqMs}, timeSinceLast=${timeSinceLast}`);
      if (!lastSent || (now - lastSent) >= freqMs) {
        try {
          const discordUser = await client.users.fetch(discord_user_id);
          await introduceNextBatch(userId, { author: { id: discord_user_id }, reply: async () => {} }, 'easy');
          await sendNextCard(userId, {
            author: { id: discord_user_id },
            client,
            reply: async (msg) => { try { await discordUser.send(msg); } catch (e) { /* ignore DM errors */ } },
          });
          // Update last_card_sent immediately after sending
          await pool.query('UPDATE users SET last_card_sent = $1 WHERE id = $2', [now.toISOString(), userId]);
          console.log(`[CRON] Sent kanji to user ${discord_user_id} and updated last_card_sent`);
        } catch (err) {
          console.error(`[CRON] Failed to send kanji to user ${discord_user_id}:`, err);
        }
      } else {
        console.log(`[CRON] Skipped user ${discord_user_id}: not due yet.`);
      }
    }
  } catch (err) {
    console.error('[CRON] TOP-LEVEL ERROR in cron callback:', err);
  } finally {
    cronRunning = false;
    const elapsed = Date.now() - start;
    console.log(`[CRON] Callback finished in ${elapsed}ms`);
  }
});
job.start();
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { Pool } from 'pg';
import { checkMessage } from './kanji-check.js';
import { onboardUser } from './onboard-user.js';
import { reviewCard } from './review-card.js';
import { introduceNextBatch } from './introduce-next-batch.js';
import { sendNextCard } from './send-next-card.js';
import { badges } from './badges.js';

const botToken = process.env.DISCORD_BOT_TOKEN;
if (!botToken) {
  throw new Error('Missing DISCORD_BOT_TOKEN env var');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

client.on('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  console.log(`Message received from ${message.author.tag}: "${message.content}" in channel type: ${message.channel.type}`);
  console.log('[server.js] messageCreate handler triggered');
  
  // Ignore bot messages
  if (message.author.bot) return;

  // Only handle DMs
  if (message.guild !== null) return;

  const discordUserId = message.author.id;
  const userAnswer = message.content.trim();

  console.log(`DM from ${message.author.tag} (${discordUserId}): ${userAnswer}`);

  // 1. Ensure user exists
  let userId;
  try {
    const result = await pool.query(
      'INSERT INTO users (discord_user_id) VALUES ($1) ON CONFLICT (discord_user_id) DO NOTHING RETURNING id',
      [discordUserId]
    );
    if (result.rowCount === 1) {
      console.log("Inserted new user", discordUserId);
      try {
        await onboardUser(discordUserId, message, 'easy');
        return;
      } catch (err) {
        console.error("onboardUser failed:", err);
        return;
      }
    } else {
      console.log("User already exists", discordUserId);
    }
    // Get userId for later use
    const userRes = await pool.query('SELECT id, last_kanji_sent FROM users WHERE discord_user_id = $1', [discordUserId]);
    userId = userRes.rows[0].id;
    // Store last_kanji_sent for later blocking check
    const lastKanjiSent = userRes.rows[0].last_kanji_sent;
  } catch (err) {
    console.error("Failed to insert user", err);
    return;
  }


  // Skip empty messages
  if (!userAnswer) return;

  // Handle 'sleep!' command to pause card delivery for 7 hours
  if (userAnswer.trim().toLowerCase() === 'sleep!') {
    // Set last_card_sent to now + 7 hours
    const sleepUntil = new Date(Date.now() + 7 * 60 * 60 * 1000);
    await pool.query('UPDATE users SET last_card_sent = $1 WHERE id = $2', [sleepUntil.toISOString(), userId]);
    await message.reply('You will not receive new cards for the next 7 hours. Sleep well!');
    return;
  }

  // Check if user is creating a custom card, needs help, frequency change, or changing difficulty (format: "x = y")
  
  if (userAnswer.trim().toLowerCase() === 'help!') {
    await message.reply('Welcome to the help menu! Here are some commands you can use:\n\nCREATE CARDS\nTo create your own cards send a message in this format: card front = card back. For example, 犬 = dog. Super simple.\n\nFREQUENCY\nTo change how often you receive cards, type "freq =" followed by the number in minutes. So freq = 10 will send you a card every 10 minutes. You can type any number up to 1440 (one day).\n\nSLEEP MODE\nBed time? Type "sleep!" and you won\'t get any card for 7 hours.');
    return;
  }
  
  if (userAnswer.includes(' = ')) {
    const parts = userAnswer.split(' = ').map(s => s.trim());
    // Check if it's a frequency change command
    if (parts[0].toLowerCase() === 'freq' && parts[1]) {
      const freqInt = parseInt(parts[1], 10);
      if (isNaN(freqInt) || freqInt < 1 || freqInt > 24) {
        await message.reply('Frequency must be an integer between 1 and 24 (hours).');
        return;
      }
      await pool.query('UPDATE users SET user_freq = $1 WHERE id = $2', [freqInt, userId]);
      await message.reply(`Card frequency updated: you will get a card every ${freqInt} minutes(s).`);
      return;
    }
    // Check if it's a difficulty change command
    if (parts[0].toLowerCase() === 'difficulty' && parts[1]) {
      const newDifficulty = parts[1].toLowerCase();
      if (['easy', 'medium', 'hard'].includes(newDifficulty)) {
        try {
          await pool.query('UPDATE users SET difficulty = $1 WHERE id = $2', [newDifficulty, userId]);
          await pool.query('DELETE FROM cards WHERE user_id = $1', [userId]);
          await onboardUser(discordUserId, message, newDifficulty);
          await message.reply(`Difficulty changed to ${newDifficulty}. Your progress has been reset.`);
          return;
        } catch (err) {
          console.error("Failed to change difficulty", err);
        }
      }
    } else {
      // Custom card creation
      const [cardFront, cardBack] = parts;
      if (cardFront && cardBack) {
        try {
          // Find the next available custom card id above 1,000,000
          const { rows: maxRows } = await pool.query(`SELECT MAX(id) AS max_id FROM cards WHERE id >= 1000000`);
          let nextCustomId = 1000001;
          if (maxRows[0].max_id && maxRows[0].max_id >= 1000000) {
            nextCustomId = maxRows[0].max_id + 1;
          }
          // Insert into cards table with custom id
          const cardResult = await pool.query(
            `INSERT INTO cards (id, user_id, card_front, card_back, introduced, next_review) VALUES ($1, $2, $3, $4, TRUE, NOW()) RETURNING id`,
            [nextCustomId, userId, cardFront, cardBack]
          );
          const newCardId = cardResult.rows[0].id;
          // Insert into user_created_cards table
          await pool.query(
            `INSERT INTO user_created_cards (user_id, card_front, card_back, master_card_id) VALUES ($1, $2, $3, NULL)`,
            [userId, cardFront, cardBack]
          );
          await message.reply(`Custom card created: ${cardFront} = ${cardBack} (ID: ${newCardId})`);
          return;
        } catch (err) {
          console.error("Failed to create custom card", err);
        }
      }
    }
  }

  // ...existing code...

  // Check if user wants to delete a card (format: "x :: delete")
  if (userAnswer.includes(' :: delete')) {
    const cardFront = userAnswer.replace(' :: delete', '').trim();
    
    if (cardFront) {
      try {
        const deleteResult = await pool.query(
          'DELETE FROM cards WHERE user_id = $1 AND card_front = $2 RETURNING card_front, card_back',
          [userId, cardFront]
        );
        
        if (deleteResult.rowCount > 0) {
          const deletedCard = deleteResult.rows[0];
          await message.reply(`Card deleted: ${deletedCard.card_front} = ${deletedCard.card_back}`);
        } else {
          await message.reply(`Card not found: ${cardFront}`);
        }
        return;
      } catch (err) {
        console.error("Failed to delete card", err);
      }
    }
  }

  // Skip webhook processing for 'help'
  if (userAnswer.toLowerCase() === 'help') {
    await message.reply("Commands:\n- `difficulty = easy|medium|hard` - Change difficulty\n- `front = back` - Create custom card\n- `front :: delete` - Delete a card");
    return;
  }

  const userAnswerLower = userAnswer.toLowerCase();

  let cardId;
  try {
    const cardRes = await pool.query(
      'SELECT id FROM cards WHERE user_id = $1 AND card_front = (SELECT last_kanji_sent FROM users WHERE id = $1) LIMIT 1',
      [userId]
    );
    cardId = cardRes.rows[0]?.id;
  } catch (err) {
    console.error("Failed to get card id", err);
  }

  // Block answer attempts if no card is available
  if (!cardId && !userAnswer.includes(' = ') && !userAnswer.includes(' :: delete') && userAnswer.toLowerCase() !== 'help') {
    await message.reply("Please wait for your next card.");
    return;
  }

  // 3. Check answer and update review stats
  if (cardId) {
    let checkResult = null;
    try {
      checkResult = await checkMessage(userAnswerLower, userId);
    } catch (err) {
      console.error("checkMessage failed:", err);
    }

    // Fetch last kanji sent and its meanings from cards table
    const lastKanjiRes = await pool.query(
      'SELECT c.id, c.card_front, c.card_back FROM cards c JOIN users u ON u.id = c.user_id WHERE u.id = $1 AND c.card_front = u.last_kanji_sent LIMIT 1',
      [userId]
    );
    const lastKanji = lastKanjiRes.rows[0]?.card_front;
    const cardBack = lastKanjiRes.rows[0]?.card_back;
    const cardIdFromQuery = lastKanjiRes.rows[0]?.id;

    // Parse meanings
    let allMeanings;
    try {
      allMeanings = JSON.parse(cardBack);
    } catch {
      allMeanings = [cardBack]; // Old format compatibility
    }

    // Build and send feedback message if right/wrong
    let feedbackText;
    const correct = checkResult !== null;

    // Determine if this is a reading card
    const isReadingCard = lastKanji && lastKanji.trim().endsWith('(reading)');
    // For reading cards, extract the kanji (remove ' (reading)')
    const kanjiOnly = isReadingCard ? lastKanji.replace(/\s*\(reading\)$/,'').trim() : lastKanji;

    if (correct) {
      const matchedMeaning = checkResult.matchedMeaning;
      // Update the specific meaning's progress
      await pool.query(
        `INSERT INTO card_meanings (card_id, meaning, correct_count, last_tested)
         VALUES ($1, $2, 1, NOW())
         ON CONFLICT (card_id, meaning)
         DO UPDATE SET correct_count = card_meanings.correct_count + 1, last_tested = NOW()`,
        [cardIdFromQuery, matchedMeaning]
      );

      // Fetch old score for testing - can remove when i confirm scoring updates correctly
      const { rows: oldRows } = await pool.query(
        'SELECT score FROM cards WHERE id = $1 AND user_id = $2',
        [cardIdFromQuery, userId]
      );
      if (!oldRows.length) throw new Error('Card not found');
      let oldScore = Number(oldRows[0].score);

      // Update review stats before fetching new score/streak
      await reviewCard(userId, cardIdFromQuery, correct);

      // Fetch updated score and streak
      const { rows: updatedRows } = await pool.query(
        'SELECT score, consecutive_correct FROM cards WHERE id = $1 AND user_id = $2',
        [cardIdFromQuery, userId]
      );
      if (!updatedRows.length) throw new Error('Card not found');
      let score = Number(updatedRows[0].score);
      let streak = Number(updatedRows[0].consecutive_correct);

      // fun awards for big streaks
      let badge = badges(streak);

      // === READINGS INTRODUCTION LOGIC ===
      // Check if streak is 5 and readings not introduced
      const { rows: readingIntroRows } = await pool.query(
        'SELECT reading_introduced FROM cards WHERE id = $1',
        [cardIdFromQuery]
      );
      const readingIntroduced = readingIntroRows[0]?.reading_introduced;
      console.log(`[READINGS DEBUG] streak: ${streak}, cardId: ${cardIdFromQuery}, reading_introduced: ${readingIntroduced}`);
      if (streak >= 5 && !readingIntroduced) {
        // Fetch readings from master_cards table
        // Always use the original kanji (no '(reading)') for reading card creation
        const baseKanji = lastKanji ? lastKanji.replace(/\s*\(reading\)$/,'').trim() : '';
        const { rows: masterRows } = await pool.query(
          'SELECT readings FROM master_cards WHERE card_front = $1',
          [baseKanji]
        );
        let readings = [];
        if (masterRows.length && masterRows[0].readings) {
          try {
            readings = JSON.parse(masterRows[0].readings);
          } catch {
            readings = [];
          }
        }
        if (readings.length) {
          // Use new template for reading card intro message
          feedbackText = isReadingCard
            ? `Correct! The reading(s) for ${baseKanji} are: ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`
            : `Correct! ${lastKanji} means ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`;
          await message.reply(feedbackText);
          await message.reply(`Congratulations, you answered "${lastKanji}" (${allMeanings.join(', ')}) 5 times in a row!\n\nYou will now start seeing a card asking for ${baseKanji} (reading). Use hiragana to answer. The reading(s) for ${baseKanji} are:\n\n${readings.join('\n')}`);
          // Always create reading card as 'KANJI (reading)'
          let readingCardFront = `${baseKanji} (reading)`;
          await pool.query(
            `INSERT INTO cards (user_id, card_front, card_back, introduced, reading_introduced)
             VALUES ($1, $2, $3, TRUE, TRUE)`,
            [userId, readingCardFront, JSON.stringify(readings)]
          );
          // Mark original card as reading_introduced
          await pool.query(
            'UPDATE cards SET reading_introduced = TRUE WHERE id = $1',
            [cardIdFromQuery]
          );
        } else {
          feedbackText = isReadingCard
            ? `Correct! The reading(s) for ${baseKanji} are: ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`
            : `Correct! ${lastKanji} means ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`;
          await message.reply(feedbackText);
        }
      } else {
        feedbackText = isReadingCard
          ? `Correct! The reading(s) for ${kanjiOnly} are: ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`
          : `Correct! ${lastKanji} means ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`;
        await message.reply(feedbackText);
      }
    } else {
      // Track which meaning they failed to answer
      // We'll increment incorrect_count on the least-practiced meaning
      const meaningStatsRes = await pool.query(
        `SELECT meaning, correct_count FROM card_meanings WHERE card_id = $1 ORDER BY correct_count ASC LIMIT 1`,
        [cardIdFromQuery]
      );

      if (meaningStatsRes.rows.length > 0) {
        const leastPracticedMeaning = meaningStatsRes.rows[0].meaning;
        await pool.query(
          `UPDATE card_meanings SET incorrect_count = incorrect_count + 1, last_tested = NOW()
           WHERE card_id = $1 AND meaning = $2`,
          [cardIdFromQuery, leastPracticedMeaning]
        );
      }

      feedbackText = isReadingCard
        ? `Incorrect. The reading(s) for ${kanjiOnly} are: ${allMeanings.join(', ')}`
        : `Incorrect. ${lastKanji} means ${allMeanings.join(', ')}`;
      await message.reply(feedbackText);
    }

    // Decrease all kanji scores >50 by 1 for this user ONLY when they attempt an answer
    await pool.query(
      'UPDATE cards SET score = GREATEST(score - 1, 5) WHERE user_id = $1 AND introduced = TRUE AND score > 50',
      [userId]
    );

    // Now update review stats for incorrect answers
    if (!correct) {
      await reviewCard(userId, cardId, correct);
    }

    // LOCK: Clear last_kanji_sent so further answers are ignored until next card is sent
    await pool.query('UPDATE users SET last_kanji_sent = NULL WHERE id = $1', [userId]);

  } else {
    console.error("No valid cardId found, skipping reviewCard");
  }

  // 4. Try to introduce the next batch if ready
  try {
    const batchIntroduced = await introduceNextBatch(userId, message, 'easy');
    // Check user's last_card_sent and user_freq
    const { rows: userRows } = await pool.query('SELECT last_card_sent, user_freq FROM users WHERE id = $1', [userId]);
    if (userRows.length) {
      const { last_card_sent, user_freq } = userRows[0];
      const now = new Date();
      const lastSent = last_card_sent ? new Date(last_card_sent) : null;
      // seeting user frequency, currently minutes ============== must change back to hours
      const freqMs = (user_freq || 3) * 60 * 1000;
      const timeSinceLast = lastSent ? (now - lastSent) : null;
      const timeLeft = lastSent ? (freqMs - timeSinceLast) : 0;
      // ...existing code (removed interval debug logging and DM)...
      if (!lastSent || (now - lastSent) >= freqMs) {
        // ...existing code (removed debug log and DM for sendNextCard call)...
        await sendNextCard(userId, message);
      } else {
        // ...existing code (removed debug log and DM for not sending new card)...
      }
    }
  } catch (err) {
    console.error("introduceNextBatch/sendNextCard failed:", err);
  }
});

client.login(botToken);