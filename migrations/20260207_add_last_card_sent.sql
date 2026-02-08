-- Migration: Add last_card_sent column to users table for global per-user card timing
ALTER TABLE users ADD COLUMN last_card_sent TIMESTAMP;
-- Set all existing users' last_card_sent to NOW so they are immediately eligible
UPDATE users SET last_card_sent = NOW() WHERE last_card_sent IS NULL;
