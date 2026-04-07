-- Add 'tab' to section_type enum
ALTER TYPE section_type ADD VALUE IF NOT EXISTS 'tab';

-- Add hidden_tabs to song_versions (array of section IDs to hide)
ALTER TABLE song_versions
  ADD COLUMN IF NOT EXISTS hidden_tabs jsonb NOT NULL DEFAULT '[]'::jsonb;
