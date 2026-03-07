-- Migration: Add user_freq column to users table for per-user card frequency
ALTER TABLE users ADD COLUMN user_freq INT NOT NULL DEFAULT 30;
-- Set all existing users to default 30 minutes
UPDATE users SET user_freq = 30 WHERE user_freq IS NULL;

-- create/initialize sequence for custom cards (contents now in custom_cards table)
CREATE SEQUENCE IF NOT EXISTS custom_cards_id_seq;
SELECT setval('custom_cards_id_seq',
               (SELECT COALESCE(MAX(id), 0) FROM custom_cards) + 1,
               false);

