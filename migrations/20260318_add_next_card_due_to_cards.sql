-- Add next_card_due column to cards and custom_cards tables
ALTER TABLE cards ADD COLUMN next_card_due TIMESTAMP;
ALTER TABLE custom_cards ADD COLUMN next_card_due TIMESTAMP;

-- Set all existing cards' next_card_due to NOW so they are immediately eligible
UPDATE cards SET next_card_due = NOW() WHERE next_card_due IS NULL;
UPDATE custom_cards SET next_card_due = NOW() WHERE next_card_due IS NULL;
