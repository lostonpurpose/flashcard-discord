import { badges } from './badges.js';

export const customChallengeSessions = new Map();

export function isActive(userId) {
  return customChallengeSessions.has(userId);
}

export async function startCustomChallenge(userId, message, requestedCount, pool) {
  if (isActive(userId)) {
    await message.reply('A custom challenge is already active. Answer the current card to continue.');
    return;
  }

  const count = Number(requestedCount) || 10;
  if (count < 1) {
    await message.reply('Challenge size must be 1 or greater.');
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, card_front, card_back, correct_count
     FROM custom_cards
     WHERE user_id = $1
       AND introduced = TRUE
       AND score <= 50
     ORDER BY RANDOM()
     LIMIT $2`,
    [userId, count]
  );

  if (!rows.length) {
    await message.reply('You are out of custom challenge cards.');
    return;
  }

  const session = {
    queue: rows,
    nextIndex: 0,
    requestedCount: count,
    startedAt: new Date().toISOString(),
  };

  customChallengeSessions.set(userId, session);

  await message.reply(`Custom challenge started: ${rows.length} card${rows.length === 1 ? '' : 's'}. Answer each card to continue.`);
  await sendNextCustomChallengeCard(userId, message, pool);
}

async function sendNextCustomChallengeCard(userId, message, pool) {
  const session = customChallengeSessions.get(userId);
  if (!session) return false;

  if (session.nextIndex >= session.queue.length) {
    return false;
  }

  const card = session.queue[session.nextIndex++];
  await pool.query(
    'UPDATE users SET last_card_sent = $1, last_kanji_sent = $2 WHERE id = $3',
    [new Date().toISOString(), card.card_front, userId]
  );
  const badge = badges(Number(card.correct_count));
  await message.reply(`${card.card_front} = ? ${badge}`);
  return true;
}

export async function continueCustomChallenge(userId, message, pool, onChallengeComplete = null) {
  const session = customChallengeSessions.get(userId);
  if (!session) return false;

  if (session.nextIndex >= session.queue.length) {
    const outOfCards = session.queue.length < session.requestedCount;
    customChallengeSessions.delete(userId);
    await message.reply(outOfCards ? 'You are out of custom challenge cards.' : 'Custom challenge complete!');
    if (typeof onChallengeComplete === 'function') {
      await onChallengeComplete();
    }
    return false;
  }

  const hasMore = await sendNextCustomChallengeCard(userId, message, pool);
  if (!hasMore) {
    const outOfCards = session.queue.length < session.requestedCount;
    customChallengeSessions.delete(userId);
    await message.reply(outOfCards ? 'You are out of custom challenge cards.' : 'Custom challenge complete!');
    if (typeof onChallengeComplete === 'function') {
      await onChallengeComplete();
    }
    return false;
  }

  return true;
}
