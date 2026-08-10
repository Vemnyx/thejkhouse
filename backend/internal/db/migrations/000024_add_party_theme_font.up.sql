ALTER TABLE parties
    ADD COLUMN IF NOT EXISTS theme_font text NOT NULL DEFAULT 'cinzel-decorative';
