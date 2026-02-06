import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function reviewCard(userId, cardId, correct) {
  // Get current score and streak
  const { rows } = await pool.query(
    'SELECT score, consecutive_correct FROM cards WHERE id = $1 AND user_id = $2',
    [cardId, userId]
  );
  if (!rows.length) throw new Error('Card not found');
  
  let score = Number(rows[0].score);
  let streak = Number(rows[0].consecutive_correct);

  // Calculate new score and streak
  let newScore, newStreak;
  if (correct) {
    // Base increase: 4-7 (randomized for variation)
    const baseIncrease = Math.floor(Math.random() * 4) + 4;
    // Score increase: baseIncrease + (3 * current_streak)
    newScore = score + baseIncrease + (3 * streak);
    // Then increment streak for next time
    newStreak = streak + 1;
  } else {
    // Reset streak on wrong answer
    newStreak = 0;
    // Penalty: -5 points
    newScore = Math.max(score - 5, 5);
  }

  await pool.query(
    `UPDATE cards SET
      score = $1,
      consecutive_correct = $2,
      correct_count = correct_count + $3,
      incorrect_count = incorrect_count + $4
     WHERE id = $5 AND user_id = $6`,
    [newScore, newStreak, correct ? 1 : 0, correct ? 0 : 1, cardId, userId]
  );
}