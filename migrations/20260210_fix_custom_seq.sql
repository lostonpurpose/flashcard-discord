-- Migration: ensure custom_cards.id uses correct sequence

-- make the default use the dedicated sequence
ALTER TABLE custom_cards
    ALTER COLUMN id SET DEFAULT nextval('custom_cards_id_seq');

-- advance sequence beyond current data
SELECT setval('custom_cards_id_seq', (SELECT COALESCE(MAX(id),0) FROM custom_cards) + 1, false);

-- remove stray duplicate sequence if it exists
DROP SEQUENCE IF EXISTS custom_cards_id_seq1;
