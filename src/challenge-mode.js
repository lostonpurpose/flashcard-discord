import { badges } from './badges.js';

export const challengeSessions = new Map();

export function isActive(userId) {
  return challengeSessions.has(userId);
}

export async function startChallenge(userId, message, requestedCount, pool) {
  if (isActive(userId)) {
    await message.reply('A challenge is already active. Answer the current card to continue.');
    return;
  }

  const count = Number(requestedCount) || 10;
  if (count < 1) {
    await message.reply('Challenge size must be 1 or greater.');
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, card_front, card_back, correct_count, is_custom
     FROM (
       SELECT id, card_front, card_back, correct_count, FALSE AS is_custom
       FROM cards
       WHERE user_id = $1
         AND introduced = TRUE
         AND score <= 50
       UNION ALL
       SELECT id, card_front, card_back, correct_count, TRUE AS is_custom
       FROM custom_cards
       WHERE user_id = $1
         AND introduced = TRUE
         AND score <= 50
     ) AS combined
     ORDER BY RANDOM()
     LIMIT $2`,
    [userId, count]
  );

  if (!rows.length) {
    await message.reply('You are out of challenge cards.');
    return;
  }

  const session = {
    queue: rows,
    nextIndex: 0,
    requestedCount: count,
    startedAt: new Date().toISOString(),
  };

  challengeSessions.set(userId, session);

  await message.reply(`Challenge mode started: ${rows.length} card${rows.length === 1 ? '' : 's'}. Answer each card to continue.`);
  await sendNextChallengeCard(userId, message, pool);
}

async function sendNextChallengeCard(userId, message, pool) {
  const session = challengeSessions.get(userId);
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

export async function continueChallenge(userId, message, pool, onChallengeComplete = null) {
  const session = challengeSessions.get(userId);
  if (!session) return false;

  if (session.nextIndex >= session.queue.length) {
    const outOfCards = session.queue.length < session.requestedCount;
    challengeSessions.delete(userId);
    await message.reply(outOfCards ? 'You are out of challenge cards.' : 'Challenge complete!');
    if (typeof onChallengeComplete === 'function') {
      await onChallengeComplete();
    }
    return false;
  }

  const hasMore = await sendNextChallengeCard(userId, message, pool);
  if (!hasMore) {
    const outOfCards = session.queue.length < session.requestedCount;
    challengeSessions.delete(userId);
    await message.reply(outOfCards ? 'You are out of challenge cards.' : 'Challenge complete!');
    if (typeof onChallengeComplete === 'function') {
      await onChallengeComplete();
    }
    return false;
  }

  return true;
}
