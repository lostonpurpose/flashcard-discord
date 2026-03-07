-- Migration: drop obsolete columns from custom_cards

ALTER TABLE custom_cards DROP COLUMN IF EXISTS card_type;
ALTER TABLE custom_cards DROP COLUMN IF EXISTS reading_introduced;
