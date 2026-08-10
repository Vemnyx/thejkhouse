ALTER TABLE parties
    ADD COLUMN IF NOT EXISTS theme_primary text NOT NULL DEFAULT '#f2b8c4',
    ADD COLUMN IF NOT EXISTS theme_accent text NOT NULL DEFAULT '#b8926a';
