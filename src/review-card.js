import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function reviewCard(userId, cardId, correct) {
  // Get current score and streak
  // look up the card in either table
  let table = 'cards';
  let { rows } = await pool.query(
    'SELECT score, consecutive_correct FROM cards WHERE id = $1 AND user_id = $2',
    [cardId, userId]
  );
  if (!rows.length) {
    // fallback to custom_cards
    const { rows: alt } = await pool.query(
      'SELECT score, consecutive_correct FROM custom_cards WHERE id = $1 AND user_id = $2',
      [cardId, userId]
    );
    if (!alt.length) throw new Error('Card not found');
    rows = alt;
    table = 'custom_cards';
  }
  
  let score = Number(rows[0].score);
  let streak = Number(rows[0].consecutive_correct);
  console.log(`[reviewCard] BEFORE: cardId=${cardId}, userId=${userId}, score=${score}, streak=${streak}, correct=${correct}`);

  // Calculate new score and streak
  let newScore, newStreak;
  if (correct) {
    // Increment streak first so bonus applies immediately
    newStreak = streak + 1;
    if (score < 50) {
      // Set to random value between 52 and 58 (inclusive)
      newScore = Math.floor(Math.random() * 7) + 52;
    } else {
      // Base increase: 4-7 (randomized for variation)
      const baseIncrease = Math.floor(Math.random() * 4) + 4;
      // Score increase: baseIncrease + (5 * newStreak)

      const threeInRowBonus = newStreak >= 3 && newStreak <= 4 ? (25 + baseIncrease) : 0;
      const fiveInRowBonus = newStreak >= 5 && newStreak <= 9 ? (35 + baseIncrease) : 0;
      const tenInRowBonus = newStreak >= 10 ? (50 + baseIncrease) : 0;

      // final calc for score
      newScore = score + baseIncrease + (5 * newStreak) + threeInRowBonus + fiveInRowBonus + tenInRowBonus;
    }
  } else {
    // Reset streak on wrong answer
    newStreak = 0;
    // Penalty: -5 points
    newScore = Math.max(score - 5, 5);
  }

  await pool.query(
    `UPDATE ${table} SET
      score = $1,
      consecutive_correct = $2,
      correct_count = correct_count + $3,
      incorrect_count = incorrect_count + $4
     WHERE id = $5 AND user_id = $6`,
    [newScore, newStreak, correct ? 1 : 0, correct ? 0 : 1, cardId, userId]
  );
  console.log(`[reviewCard] AFTER: cardId=${cardId}, userId=${userId}, score=${newScore}, streak=${newStreak}, correct=${correct}`);
}