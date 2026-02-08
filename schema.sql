CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  discord_user_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  last_kanji_sent VARCHAR(255),
  difficulty VARCHAR(50) DEFAULT 'easy',
  user_freq INT NOT NULL DEFAULT 3,
  last_card_sent TIMESTAMP
);

CREATE TABLE cards (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    card_front VARCHAR(255) NOT NULL,
    card_back TEXT NOT NULL,
    introduced BOOLEAN NOT NULL DEFAULT FALSE,
    is_custom BOOLEAN NOT NULL DEFAULT FALSE,
    next_review TIMESTAMP,
    correct_count INT NOT NULL DEFAULT 0,
    incorrect_count INT NOT NULL DEFAULT 0,
    consecutive_correct INT NOT NULL DEFAULT 0,
    score INT NOT NULL DEFAULT 50,
    reading_introduced BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    card_id INT NOT NULL REFERENCES cards(id),
    correct_answer BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    next_review TIMESTAMP NOT NULL
);

CREATE TABLE master_cards (
    id SERIAL PRIMARY KEY,
    card_front VARCHAR(255) NOT NULL,
    card_back TEXT NOT NULL,
    readings TEXT,
    difficulty VARCHAR(50) NOT NULL
);

-- New table to track individual meaning progress
CREATE TABLE card_meanings (
  id SERIAL PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  meaning TEXT NOT NULL,
  correct_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  last_tested TIMESTAMP,
  UNIQUE(card_id, meaning)
);