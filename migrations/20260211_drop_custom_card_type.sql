-- Migration: drop obsolete card_type column from custom_cards

ALTER TABLE custom_cards DROP COLUMN IF EXISTS card_type;
