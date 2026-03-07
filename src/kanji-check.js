import { Pool } from "pg";

// Return the specific meaning the user answered, or null if incorrect
export async function checkMessage(userAnswer, userId) {
    console.log('[checkMessage] Called with:', { userAnswer, userId });

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    // Get the most recent kanji sent to the user (the kanji character)
    let lastKanji;
    try {
        const result = await pool.query(
            'SELECT last_kanji_sent FROM users WHERE id = $1',
            [userId]
        );
        lastKanji = result.rows[0]?.last_kanji_sent;
        if (!lastKanji) {
            console.error('[checkMessage] No lastKanji found for user:', userId);
            return null;
        }
        console.log('[checkMessage] lastKanji from DB:', lastKanji);
    } catch (err) {
        console.error('[checkMessage] DB error:', err);
        return null;
    }

    // Look up the correct meanings (array) from cards
    let correctMeanings;
    let cardId;
    try {
        const result = await pool.query(
            `SELECT id, card_back FROM (
                 SELECT id, card_back, 0 as src FROM cards
                 WHERE card_front = $1 AND user_id = $2
               UNION ALL
                 SELECT id, card_back, 1 as src FROM custom_cards
                 WHERE card_front = $1 AND user_id = $2
             ) AS both
             ORDER BY src ASC
             LIMIT 1`,
            [lastKanji, userId]
        );
        cardId = result.rows[0]?.id;
        const cardBack = result.rows[0]?.card_back;
        
        if (!cardBack) {
            console.error('[checkMessage] No correct meanings found for kanji:', lastKanji);
            return null;
        }
        
        // Parse JSON array or handle old format string
        try {
            correctMeanings = JSON.parse(cardBack);
        } catch {
            correctMeanings = [cardBack]; // Old format compatibility
        }
        
        console.log('[checkMessage] correctMeanings from DB:', correctMeanings);
    } catch (err) {
        console.error('[checkMessage] DB error (cards):', err);
        return null;
    }

    // Check if user's answer matches any of the correct meanings
    const userAnswerNormalized = userAnswer.toLowerCase().trim();
    const matchedMeaning = correctMeanings.find(meaning => 
        meaning.toLowerCase().trim() === userAnswerNormalized
    );

    if (matchedMeaning) {
        return { cardId, matchedMeaning, allMeanings: correctMeanings };
    }
    
    return null;
}
