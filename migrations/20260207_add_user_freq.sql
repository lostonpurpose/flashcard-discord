-- Migration: Add user_freq column to users table for per-user card frequency
ALTER TABLE users ADD COLUMN user_freq INT NOT NULL DEFAULT 3;
-- Set all existing users to default 3 hours
UPDATE users SET user_freq = 3 WHERE user_freq IS NULL;
