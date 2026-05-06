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

      if (challengeMode.isActive(userId)) {
        console.log(`[CRON] Skipping ${discord_user_id} because challenge mode is active`);
        continue;
      }

      const lastSent = last_card_sent ? new Date(last_card_sent) : null;
      const freqMs = (user_freq || 30) * 60 * 1000;
      const timeSinceLast = lastSent ? (now - lastSent) : null;
      console.log(`[CRON] User ${discord_user_id}: lastSent=${lastSent}, freqMs=${freqMs}, timeSinceLast=${timeSinceLast}`);
      if (!lastSent || (now - lastSent) >= freqMs) {
        try {
          const discordUser = await client.users.fetch(discord_user_id);
          // build a pseudo‑message object that will DM the user when reply() is called
          const dmMessage = {
            author: { id: discord_user_id },
            reply: async (msg) => {
              try {
                await discordUser.send(msg);
              } catch (e) {
                /* ignore failures (user closed DMs, etc.) */
              }
            },
          };

          // introduceNextBatch will now be able to send the "Nice work" text and study cards
          const introduced = await introduceNextBatch(userId, dmMessage, 'easy');
          if (introduced) {
            console.log(`[CRON] introduced new batch for ${discord_user_id}`);
          }

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
import * as challengeMode from './challenge-mode.js';

const botToken = process.env.DISCORD_BOT_TOKEN;
if (!botToken) {
  throw new Error('Missing DISCORD_BOT_TOKEN env var');
}

const minimalIntents = [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages];
const privilegedIntents = process.env.APP_ENV === 'test'
  ? []
  : [GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent];

if (process.env.APP_ENV === 'test') {
  console.log('[server.js] TEST MODE: using minimal gateway intents');
}

const client = new Client({
  intents: [...minimalIntents, ...privilegedIntents],
  partials: [Partials.Channel],
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// pendingDeletion maps user_id -> card_front when a deletion awaits confirmation.
// initialization happens after pool creation; the sequence sync occurs at the
// end of the file.
let pendingDeletion = new Map();

// Log environment and database summary for clarity on startup
(function startupLog() {
  try {
    const appEnv = process.env.APP_ENV || 'production';
    const dbUrl = process.env.DATABASE_URL || '';
    let dbSummary = dbUrl;
    try {
      const u = new URL(dbUrl);
      dbSummary = `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname ? u.pathname : ''}`;
    } catch (e) {
      // ignore parse errors
    }
    console.log(`[STARTUP] APP_ENV=${appEnv} DATABASE=${dbSummary}`);
  } catch (e) {
    console.warn('[STARTUP] Failed to log APP_ENV/DATABASE_URL', e);
  }
})();
client.on('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return;

  try {
    const result = await pool.query(
      'INSERT INTO users (discord_user_id, last_card_sent) VALUES ($1, NOW()) ON CONFLICT (discord_user_id) DO NOTHING RETURNING id',
      [member.user.id]
    );

    if (result.rowCount !== 1) {
      // User already exists, skip onboarding for re-joins or returning members.
      return;
    }

    const dmMessage = {
      reply: async (text) => {
        try {
          await member.user.send(text);
        } catch (err) {
          console.error('[guildMemberAdd] failed to DM new member', member.user.tag, err);
        }
      },
    };

    await onboardUser(member.user.id, dmMessage, 'easy');
    console.log(`[guildMemberAdd] Onboarded new member ${member.user.tag}`);
  } catch (err) {
    console.error('[guildMemberAdd] onboarding error for', member.user.tag, err);
  }
});

client.on('messageCreate', async (message) => {
  console.log(`Message received from ${message.author.tag}: "${message.content}" in channel type: ${message.channel.type}`);
  console.log('[server.js] messageCreate handler triggered');

  let userId;
  try {
    // Ignore bot messages
    if (message.author.bot) return;

    // Only handle DMs
    if (message.guild !== null) return;

    const discordUserId = message.author.id;
    const userAnswer = message.content.trim();

    console.log(`DM from ${message.author.tag} (${discordUserId}): ${userAnswer}`);

  // 1. Ensure user exists
  try {
    const result = await pool.query(
      'INSERT INTO users (discord_user_id, last_card_sent) VALUES ($1, NOW()) ON CONFLICT (discord_user_id) DO NOTHING RETURNING id',
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
    if (!userRes.rows.length) {
      console.error('Failed to resolve user row for discordUserId', discordUserId);
      return;
    }
    userId = userRes.rows[0].id;
    // Store last_kanji_sent for later blocking check
    const lastKanjiSent = userRes.rows[0].last_kanji_sent;
  } catch (err) {
    console.error("Failed to insert user", err);
    return;
  }


  // Skip empty messages
  if (!userAnswer) return;
  const userAnswerLower = userAnswer.trim().toLowerCase();

  const challengeMatch = userAnswerLower.match(/^challenge!\s*(\d+)?$/);
  if (challengeMatch) {
    const count = challengeMatch[1] ? parseInt(challengeMatch[1], 10) : 10;
    console.log(`[server.js] challenge command received from ${discordUserId}: count=${count}`);
    await challengeMode.startChallenge(userId, message, count, pool);
    return;
  }

  // handle pending deletion confirmations (yes/no) before any other commands
  if (pendingDeletion.has(userId)) {
    const cardFront = pendingDeletion.get(userId);
    if (userAnswerLower === 'yes') {
      try {
        let deleteResult;
        if (cardFront.endsWith(' (custom)')) {
          deleteResult = await pool.query('DELETE FROM custom_cards WHERE user_id = $1 AND card_front = $2', [userId, cardFront]);
        } else {
          deleteResult = await pool.query('DELETE FROM cards WHERE user_id = $1 AND card_front = $2', [userId, cardFront]);
        }
        pendingDeletion.delete(userId);
        if (deleteResult.rowCount === 0) {
          await message.reply(`No card was found with the front "${cardFront}".`);
        } else if (deleteResult.rowCount === 1) {
          await message.reply(`Card deleted: ${cardFront}`);
        } else {
          await message.reply(`Deleted ${deleteResult.rowCount} cards with the front: ${cardFront}`);
        }
      } catch (err) {
        pendingDeletion.delete(userId);
        console.error('[server.js] delete card failed for', cardFront, err);
        await message.reply(`Sorry, I couldn't delete "${cardFront}" right now.`);
      }
      return;
    } else if (userAnswerLower === 'no') {
      pendingDeletion.delete(userId);
      await message.reply('Deletion cancelled.');
      return;
    }
  }

  // === COMMANDS ===
  // handle standalone keywords first
  if (userAnswerLower === 'sleep!') {
    const sleepUntil = new Date(Date.now() + 7 * 60 * 60 * 1000);
    await pool.query('UPDATE users SET last_card_sent = $1 WHERE id = $2', [sleepUntil.toISOString(), userId]);
    await message.reply('You will not receive new cards for the next 7 hours. Sleep well!');
    return;
  }

  if (userAnswerLower === 'wake!') {
    try {
      const { rows: uf } = await pool.query('SELECT user_freq FROM users WHERE id = $1', [userId]);
      const userFreq = uf.length ? Number(uf[0].user_freq) : 30;
      const lastSent = new Date(Date.now() - (userFreq * 60 * 1000)).toISOString();
      await pool.query('UPDATE users SET last_card_sent = $1 WHERE id = $2', [lastSent, userId]);
      await message.reply(`Woke you up — you'll start receiving cards at your set frequency (${userFreq} minute(s)).`);
    } catch (err) {
      console.error('Failed to process wake! for user', userId, err);
      await message.reply('Sorry, I could not wake you up right now. Try again later.');
    }
    return;
  }

  if (userAnswerLower === 'help!') {
    await message.reply("Commands:\n- `freq = N` to set card frequency in minutes\n- `difficulty = easy|medium|hard` to restart on a different level (not yet implemented)\n- `front = back` to create a custom card (the front will be tagged ` (custom)` )\n- `front :: delete` to remove a regular card; append ` (custom)` to delete a custom one\n- `challenge! N`  (where N is the number of cards) to enter Challenge Mode - you'll get cards one after another like a traditional app. If you just type `challenge!` the default number is 10 \n- `sleep!` / `wake!` to pause or resume sending");
    return;
  }

  // handle = commands next (freq, difficulty, custom card)
  if (userAnswer.includes(' = ')) {
    const parts = userAnswer.split(' = ').map(s => s.trim());
    if (parts[0].toLowerCase() === 'freq' && parts[1]) {
      const freqInt = parseInt(parts[1], 10);
      if (isNaN(freqInt) || freqInt < 1 || freqInt > 1440) {
        await message.reply('Frequency must be an integer between 1 and 1440 (minutes).');
        return;
      }
      await pool.query('UPDATE users SET user_freq = $1 WHERE id = $2', [freqInt, userId]);
      await message.reply(`Card frequency updated: you will get a card every ${freqInt} minute(s).`);
      return;
    }
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
      let [cardFront, cardBack] = parts;
      if (cardFront && cardBack) {
        // tag custom cards in the front text
        if (!cardFront.endsWith(' (custom)')) {
          cardFront = `${cardFront} (custom)`;
        }
        try {
          const cardResult = await pool.query(
            `INSERT INTO custom_cards (user_id, card_front, card_back, introduced, next_review)
             VALUES ($1,$2,$3,TRUE,NOW()) RETURNING id`,
            [userId, cardFront, cardBack]
          );
          const newCardId = cardResult.rows[0].id;

          await pool.query(
            `INSERT INTO user_created_cards (user_id, card_front, card_back, master_card_id)
             VALUES ($1, $2, $3, NULL)`,
            [userId, cardFront, cardBack]
          );

          await message.reply(`Custom card created: ${cardFront} = ${cardBack} (ID: ${newCardId})`);
          return;
        } catch (err) {
          console.error("Failed to create custom card", err);
          await message.reply('Sorry, I couldn\'t create that custom card right now.');
          return;
        }
      }
    }
  }

  // Check if user wants to delete a card (format: "x :: delete")
  const deleteMatch = userAnswer.match(/^(.*)\s*::\s*delete\s*$/i);
  if (deleteMatch) {
    const cardFront = deleteMatch[1].trim();
    if (cardFront) {
      pendingDeletion.set(userId, cardFront);
      await message.reply(`Are you sure you want to delete the card "${cardFront}"? Reply 'yes' or 'no'.`);
      return;
    }
  }


  let cardIdFromQuery;
  let cardTable = 'cards';
  try {
    const cardRes = await pool.query(
      `SELECT id, 'cards' AS table_name
       FROM cards
       WHERE user_id = $1 AND card_front = (SELECT last_kanji_sent FROM users WHERE id = $1)
       UNION ALL
       SELECT id, 'custom_cards' AS table_name
       FROM custom_cards
       WHERE user_id = $1 AND card_front = (SELECT last_kanji_sent FROM users WHERE id = $1)
       ORDER BY table_name ASC
       LIMIT 1`,
      [userId]
    );
    cardIdFromQuery = cardRes.rows[0]?.id;
    cardTable = cardRes.rows[0]?.table_name || 'cards';
  } catch (err) {
    console.error("Failed to get card id", err);
  }

  // If we didn't find a card matching last_kanji_sent (or no card sent yet),
  // tell the user to wait rather than proceeding with answer logic.
  if (!cardIdFromQuery) {
      const replyText = "Please wait for your next card.";
      await message.reply(replyText);
      console.log('[server.js] replied with:', replyText);
      return;
    }
  // 3. Check answer and update review stats
  if (cardIdFromQuery) {

    // check the user's answer against the appropriate card
    let checkResult = null;
    try {
      checkResult = await checkMessage(userAnswerLower, userId);
    } catch (err) {
      console.error("checkMessage failed:", err);
    }

    // Fetch last kanji sent and its meanings from whichever table we found
    const lastKanjiRes = await pool.query(
      `SELECT c.id, c.card_front, c.card_back
       FROM ${cardTable} c
       JOIN users u ON u.id = c.user_id
       WHERE u.id = $1 AND c.card_front = u.last_kanji_sent
       LIMIT 1`,
      [userId]
    );
    const lastKanji = lastKanjiRes.rows[0]?.card_front;
    const cardBack = lastKanjiRes.rows[0]?.card_back;
    // cardIdFromQuery was already set above

    // Parse meanings and normalise comma-separated strings
    let allMeanings;
    try {
      allMeanings = JSON.parse(cardBack);
    } catch {
      allMeanings = [cardBack]; // Old format compatibility
    }
    if (!Array.isArray(allMeanings)) {
      allMeanings = [allMeanings];
    }
    allMeanings = allMeanings.flatMap(m =>
      typeof m === 'string' && m.includes(',')
        ? m.split(',').map(x => x.trim())
        : m
    );

    // Build and send feedback message if right/wrong
    let feedbackText;
    const correct = checkResult !== null;

    // Determine if this is a reading card
    const isReadingCard = lastKanji && lastKanji.trim().endsWith('(reading)');
    // For reading cards, extract the kanji (remove ' (reading)')
    const kanjiOnly = isReadingCard ? lastKanji.replace(/\s*\(reading\)$/,'').trim() : lastKanji;

    if (correct) {
      const matchedMeaning = checkResult.matchedMeaning;
      // Update the specific meaning's progress (only for regular cards)
      if (cardTable === 'cards') {
        await pool.query(
          `INSERT INTO card_meanings (card_id, meaning, correct_count, last_tested)
           VALUES ($1, $2, 1, NOW())
           ON CONFLICT (card_id, meaning)
           DO UPDATE SET correct_count = card_meanings.correct_count + 1, last_tested = NOW()`,
          [cardIdFromQuery, matchedMeaning]
        );
      }

      // Fetch old score for testing - can remove when i confirm scoring updates correctly
      // Use whichever table the card actually came from (cards or custom_cards).
      const scoreTable = cardTable === 'cards' ? 'cards' : 'custom_cards';
      const { rows: oldRows } = await pool.query(
        `SELECT score FROM ${scoreTable} WHERE id = $1 AND user_id = $2`,
        [cardIdFromQuery, userId]
      );
      if (!oldRows.length) throw new Error('Card not found');
      let oldScore = Number(oldRows[0].score);

      // Update review stats before fetching new score/streak
      await reviewCard(userId, cardIdFromQuery, correct, cardTable);

      // Fetch updated score and streak from the correct table as well
      const { rows: updatedRows } = await pool.query(
        `SELECT score, consecutive_correct FROM ${scoreTable} WHERE id = $1 AND user_id = $2`,
        [cardIdFromQuery, userId]
      );
      if (!updatedRows.length) throw new Error('Card not found');
      let score = Number(updatedRows[0].score);
      let streak = Number(updatedRows[0].consecutive_correct);

      // fun awards for big streaks
      let badge = badges(streak);

      // === READINGS INTRODUCTION LOGIC ===
      // Only fire once when the streak hits exactly 5, not on 6/7/etc.
      // only regular cards have a reading_introduced column; skip for customs
      let readingIntroduced = false;
      if (cardTable === 'cards') {
        const { rows: readingIntroRows } = await pool.query(
          'SELECT reading_introduced FROM cards WHERE id = $1',
          [cardIdFromQuery]
        );
        readingIntroduced = readingIntroRows[0]?.reading_introduced;
      }
      console.log(`[READINGS DEBUG] cardFront=${lastKanji} cardId=${cardIdFromQuery} streak=${streak} reading_introduced=${readingIntroduced} isReadingCard=${isReadingCard}`);
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
          const readingCardFront = `${baseKanji} (reading)`;
          const { rows: existingReadingRows } = await pool.query(
            'SELECT id FROM cards WHERE user_id = $1 AND card_front = $2 AND reading_introduced = TRUE',
            [userId, readingCardFront]
          );
          console.log(`[READINGS DEBUG] existingReadingRows=${existingReadingRows.length} readingCardFront=${readingCardFront} userId=${userId}`);

          if (existingReadingRows.length > 0) {
            // The reading card already exists, which means the intro must have previously happened.
            // Ensure the original card is marked as introduced too, but do not repeat the reading message.
            await pool.query('UPDATE cards SET reading_introduced = TRUE WHERE id = $1', [cardIdFromQuery]);
            feedbackText = isReadingCard
              ? `Correct! The reading(s) for ${kanjiOnly} are: ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`
              : `Correct! ${lastKanji} means ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`;
            await message.reply(feedbackText);
            console.log('[server.js] replied with: existing reading already introduced, marking original card true');
          } else {
            // Persist the reading card and mark the source card as introduced before sending any user-facing messages.
            await pool.query('BEGIN');
            try {
              await pool.query(
                `INSERT INTO cards (user_id, card_front, card_back, introduced, reading_introduced)
                 VALUES ($1, $2, $3, TRUE, TRUE)`,
                [userId, readingCardFront, JSON.stringify(readings)]
              );
              await pool.query(
                'UPDATE cards SET reading_introduced = TRUE WHERE id = $1',
                [cardIdFromQuery]
              );
              await pool.query('COMMIT');
              console.log(`[READINGS DEBUG] persisted reading intro for sourceCardId=${cardIdFromQuery} and readingCardFront=${readingCardFront}`);
            } catch (err) {
              await pool.query('ROLLBACK');
              console.error('[READINGS INTRO] failed to persist reading intro state', err);
              throw err;
            }

            feedbackText = isReadingCard
              ? `Correct! The reading(s) for ${baseKanji} are: ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`
              : `Correct! ${lastKanji} means ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`;
            await message.reply(feedbackText);
            console.log('[server.js] replied with:', feedbackText);
            await message.reply(`Congratulations, you answered "${lastKanji}" (${allMeanings.join(', ')}) 5 times in a row!\n\nYou will now start seeing a card asking for ${baseKanji} (reading). Use hiragana to answer. The reading(s) for ${baseKanji} are:\n\n${readings.join('\n')}`);
            console.log('[server.js] replied with: reading intro');
          }
        } else {
          feedbackText = isReadingCard
            ? `Correct! The reading(s) for ${baseKanji} are: ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`
            : `Correct! ${lastKanji} means ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`;
          await message.reply(feedbackText);          console.log('[server.js] replied with:', feedbackText);        }
      } else {
        feedbackText = isReadingCard
          ? `Correct! The reading(s) for ${kanjiOnly} are: ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`
          : `Correct! ${lastKanji} means ${allMeanings.join(', ')} (${badge}streak: ${streak} -- old score: ${oldScore} -- score: ${score})`;
        await message.reply(feedbackText);
        console.log('[server.js] replied with:', feedbackText);
      }
    } else {
      // Track which meaning they failed to answer
      // We'll increment incorrect_count on the least-practiced meaning
      // on wrong answers we update meaning stats too, but only for regular cards
      if (cardTable === 'cards') {
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
      }

      feedbackText = isReadingCard
        ? `Incorrect. The reading(s) for ${kanjiOnly} are: ${allMeanings.join(', ')}`
        : `Incorrect. ${lastKanji} means ${allMeanings.join(', ')}`;
      await message.reply(feedbackText);
      console.log('[server.js] replied with:', feedbackText);
    }

    // Decrease all kanji scores >50 by 1 for this user ONLY when they attempt an answer
    await pool.query(
      'UPDATE cards SET score = GREATEST(score - 1, 5) WHERE user_id = $1 AND introduced = TRUE AND score > 50',
      [userId]
    );
    // apply same penalty to custom cards
    await pool.query(
      'UPDATE custom_cards SET score = GREATEST(score - 1, 5) WHERE user_id = $1 AND introduced = TRUE AND score > 50',
      [userId]
    );

    // Now update review stats for incorrect answers
    if (!correct) {
      await reviewCard(userId, cardIdFromQuery, correct, cardTable);
    }

    // LOCK: Clear last_kanji_sent so further answers are ignored until next card is sent
    await pool.query('UPDATE users SET last_kanji_sent = NULL WHERE id = $1', [userId]);

    if (challengeMode.isActive(userId)) {
      let batchIntroducedAfterChallenge = false;
      const challengeStillActive = await challengeMode.continueChallenge(userId, message, pool, async () => {
        batchIntroducedAfterChallenge = await introduceNextBatch(userId, message, 'easy');
        if (batchIntroducedAfterChallenge) {
          await sendNextCard(userId, message);
        }
      });
      if (challengeStillActive) {
        return;
      }
      if (batchIntroducedAfterChallenge) {
        return;
      }
      // If the challenge just finished, continue to normal delivery so next batch can be introduced.
    }
  } else {
    console.error("No valid cardId found, skipping reviewCard");
  }
  } catch (err) {
    console.error('[server.js] unhandled error in message handler:', err);
    try {
      await message.reply('Sorry, something went wrong processing your message.');
      console.log('[server.js] replied with: error fallback');
    } catch (e) {
      console.error('[server.js] failed to send fallback reply:', e);
    }
    return;
  }

  // 4. Try to introduce the next batch if ready
  if (challengeMode.isActive(userId)) {
    console.log(`[server.js] User ${userId} in challenge mode; skipping normal delivery.`);
    return;
  }
  try {
    if (!userId) {
      console.error('[server.js] userId undefined before introduceNextBatch');
      return;
    }
    const batchIntroduced = await introduceNextBatch(userId, message, 'easy');
    if (batchIntroduced) {
      console.log(`[server.js] new batch introduced for user ${userId}; respecting normal rate limiting before sending the next card`);
    }

    // Now continue to normal delivery so the user's timing still applies
    const { rows: userRows } = await pool.query('SELECT last_card_sent, user_freq FROM users WHERE id = $1', [userId]);
    if (userRows.length) {
      const { last_card_sent, user_freq } = userRows[0];
      const now = new Date();
      const lastSent = last_card_sent ? new Date(last_card_sent) : null;
      // setting user frequency, currently minutes (default 30)
      const freqMs = (user_freq || 30) * 60 * 1000;
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