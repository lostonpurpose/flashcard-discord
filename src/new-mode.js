import { badges } from './badges.js';

export const newSessions = new Map();

export function isActive(userId) {
  return newSessions.has(userId);
}

export async function startNewCards(userId, message, pool) {
  if (isActive(userId)) {
    await message.reply('A new-card session is already active. Answer the current card to continue.');
    return;
  }

  const { rows } = await pool.query(
    `SELECT id, card_front, card_back, correct_count
     FROM cards
     WHERE user_id = $1
       AND introduced = TRUE
       AND card_front NOT LIKE '%(reading)'
       AND correct_count = 0
     ORDER BY id ASC`,
    [userId]
  );

  if (!rows.length) {
    await message.reply('You have no new cards waiting in your current batch.');
    return;
  }

  const session = {
    queue: rows,
    nextIndex: 0,
    startedAt: new Date().toISOString(),
  };

  newSessions.set(userId, session);
  await message.reply(`New-card session started: ${rows.length} card${rows.length === 1 ? '' : 's'}. Answer each card to continue.`);
  await sendNextNewCard(userId, message, pool);
}

async function sendNextNewCard(userId, message, pool) {
  const session = newSessions.get(userId);
  if (!session) return false;

  if (session.nextIndex >= session.queue.length) {
    return false;
  }

  const card = session.queue[session.nextIndex++];
  await pool.query(
    'UPDATE users SET last_card_sent = $1, last_kanji_sent = $2 WHERE id = $3',
    [new Date().toISOString(), card.card_front, userId]
  );
  const remaining = session.queue.length - session.nextIndex;
  const badge = badges(Number(card.correct_count));
  await message.reply(`${card.card_front} = ? ${badge} (${remaining} card${remaining === 1 ? '' : 's'} left)`);
  return true;
}

export async function continueNewCards(userId, message, pool) {
  const session = newSessions.get(userId);
  if (!session) return false;

  if (session.nextIndex >= session.queue.length) {
    newSessions.delete(userId);
    await message.reply('New-card session complete!');
    return false;
  }

  const hasMore = await sendNextNewCard(userId, message, pool);
  if (!hasMore) {
    newSessions.delete(userId);
    await message.reply('New-card session complete!');
    return false;
  }

  return true;
}
