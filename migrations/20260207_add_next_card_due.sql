-- Migration: Add next_card_due column to users table for global per-user card interval
ALTER TABLE users ADD COLUMN next_card_due TIMESTAMP;
-- Set all existing users' next_card_due to NOW so they are immediately eligible
UPDATE users SET next_card_due = NOW() WHERE next_card_due IS NULL;
