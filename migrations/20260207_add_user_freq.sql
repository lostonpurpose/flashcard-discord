-- Migration: Add user_freq column to users table for per-user card frequency
ALTER TABLE users ADD COLUMN user_freq INT NOT NULL DEFAULT 30;
-- Set all existing users to default 30 minutes
UPDATE users SET user_freq = 30 WHERE user_freq IS NULL;

-- Create and initialize a separate sequence for custom cards (>=1e6)
CREATE SEQUENCE IF NOT EXISTS custom_cards_id_seq START 1000000;
SELECT setval('custom_cards_id_seq',
               (SELECT COALESCE(MAX(id), 999999) FROM cards WHERE id >= 1000000) + 1,
               false);

-- ensure custom‑card sequence exists and is positioned past any existing
-- custom ids; helps avoid later collisions when the app draws from it.
CREATE SEQUENCE IF NOT EXISTS custom_cards_id_seq START 1000000;
SELECT setval('custom_cards_id_seq',
               (SELECT COALESCE(MAX(id), 999999) FROM cards WHERE id >= 1000000) + 1,
               false);
