-- Migration: remove obsolete card_type column from cards table
ALTER TABLE cards DROP COLUMN IF EXISTS card_type;