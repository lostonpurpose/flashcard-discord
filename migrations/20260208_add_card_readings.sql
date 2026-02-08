-- Migration: Create card_readings table for tracking kanji readings per card
CREATE TABLE card_readings (
    id SERIAL PRIMARY KEY,
    card_id INT NOT NULL REFERENCES cards(id),
    reading VARCHAR(255) NOT NULL,
    correct_count INT NOT NULL DEFAULT 0,
    incorrect_count INT NOT NULL DEFAULT 0,
    last_tested TIMESTAMP
);
