-- Migration: create table to track pending cards for users
CREATE TABLE pending_cards (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id INT NOT NULL,
    card_table VARCHAR(20) NOT NULL CHECK (card_table IN ('cards','custom_cards')),
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    answered BOOLEAN NOT NULL DEFAULT FALSE
);

-- optionally add an index for quick lookup
CREATE INDEX IF NOT EXISTS pending_user_unanswered_idx ON pending_cards(user_id, answered, sent_at DESC);
