import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function reviewCard(userId, cardId, correct, table = 'cards') {
  // Get current score and streak.
  // `cards` and `custom_cards` have independent id sequences, so ids are not globally unique.
  // The caller should pass the table where the card lives to avoid updating the wrong row.
  let query = `SELECT score, consecutive_correct FROM ${table} WHERE id = $1 AND user_id = $2`;
  let { rows } = await pool.query(query, [cardId, userId]);
  if (!rows.length && table === 'cards') {
    // Fallback only when the caller did not specify a custom table explicitly.
    const { rows: alt } = await pool.query(
      'SELECT score, consecutive_correct FROM custom_cards WHERE id = $1 AND user_id = $2',
      [cardId, userId]
    );
    if (!alt.length) throw new Error('Card not found');
    rows = alt;
    table = 'custom_cards';
  }
  if (!rows.length) throw new Error('Card not found');
  
  let score = Number(rows[0].score);
  let streak = Number(rows[0].consecutive_correct);
  console.log(`[reviewCard] BEFORE: cardId=${cardId}, userId=${userId}, score=${score}, streak=${streak}, correct=${correct}`);

  // Calculate new score and streak
  let newScore, newStreak;
  if (correct) {
    // Increment streak first so bonus applies immediately
    newStreak = streak + 1;
    if (score < 50) {
      // Set to random value between 55 and 58 (inclusive)
      newScore = Math.floor(Math.random() * 7) + 55;
    } else {
      // Base increase: 4-7 (randomized for variation)
      const baseIncrease = Math.floor(Math.random() * 4) + 4;
      // Score increase: baseIncrease + (5 * newStreak)

      const threeInRowBonus = newStreak >= 3 && newStreak <= 4 ? (60 + baseIncrease) : 0;
      const fiveInRowBonus = newStreak >= 5 && newStreak <= 9 ? (100 + (baseIncrease * 6)) : 0;
      const tenInRowBonus = newStreak >= 10  && newStreak <= 14 ? (2000 + (baseIncrease * 12)) : 0;
      const fifteenInRowBounus = newStreak >= 15 ? (300 + (baseIncrease * 30)) : 0;

      // final calc for score
      newScore = score + baseIncrease + (5 * newStreak) + threeInRowBonus + fiveInRowBonus + tenInRowBonus + fifteenInRowBounus;
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