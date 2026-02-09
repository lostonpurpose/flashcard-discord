-- Migration: Add reading_introduced column to cards table
ALTER TABLE cards ADD COLUMN reading_introduced BOOLEAN NOT NULL DEFAULT FALSE;
