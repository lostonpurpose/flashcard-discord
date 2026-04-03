-- Migration: split user-created cards into separate table

-- 1. create custom_cards table (schema matches cards)
CREATE TABLE IF NOT EXISTS custom_cards (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    card_front VARCHAR(255) NOT NULL,
    card_back TEXT NOT NULL,
    introduced BOOLEAN NOT NULL DEFAULT FALSE,
    next_review TIMESTAMP,
    correct_count INT NOT NULL DEFAULT 0,
    incorrect_count INT NOT NULL DEFAULT 0,
    consecutive_correct INT NOT NULL DEFAULT 0,
    score INT NOT NULL DEFAULT 50,
    UNIQUE(user_id, card_front)
);

-- 2. initialize custom sequence (if not already present)
CREATE SEQUENCE IF NOT EXISTS custom_cards_id_seq START 1;
SELECT setval('custom_cards_id_seq', (SELECT COALESCE(MAX(id),0) FROM custom_cards) + 1, false);

-- 3. copy existing custom rows into custom_cards
INSERT INTO custom_cards (id, user_id, card_front, card_back, introduced,
                           next_review, correct_count, incorrect_count,
                           consecutive_correct, score)
SELECT c.id, c.user_id, c.card_front, c.card_back, c.introduced,
       c.next_review, c.correct_count, c.incorrect_count,
       c.consecutive_correct, c.score
FROM cards c
WHERE c.card_front LIKE '% (custom)'
   OR EXISTS (
      SELECT 1 FROM user_created_cards u
      WHERE u.user_id = c.user_id
        AND u.card_front = c.card_front
        AND u.card_back = c.card_back
   );

-- customs don't have readings or meanings, so we simply discard any
-- existing tracking rather than copying it.
DELETE FROM card_readings
WHERE card_id IN (
  SELECT id FROM cards c
  WHERE c.card_front LIKE '% (custom)'
     OR EXISTS (
        SELECT 1 FROM user_created_cards u
        WHERE u.user_id = c.user_id
          AND u.card_front = c.card_front
          AND u.card_back = c.card_back
     )
);
DELETE FROM card_meanings
WHERE card_id IN (
  SELECT id FROM cards c
  WHERE c.card_front LIKE '% (custom)'
     OR EXISTS (
        SELECT 1 FROM user_created_cards u
        WHERE u.user_id = c.user_id
          AND u.card_front = c.card_front
          AND u.card_back = c.card_back
     )
);

-- 4. remove those rows from cards
DELETE FROM cards
WHERE card_front LIKE '% (custom)'
   OR EXISTS (
      SELECT 1 FROM user_created_cards u
      WHERE u.user_id = cards.user_id
        AND u.card_front = cards.card_front
        AND u.card_back = cards.card_back
   );

-- 5. advance the custom sequence past any imported ids
SELECT setval('custom_cards_id_seq', (SELECT COALESCE(MAX(id),0) FROM custom_cards) + 1, false);
