ALTER TABLE pending_signups
    DROP COLUMN IF EXISTS birthday;

ALTER TABLE users
    DROP COLUMN IF EXISTS birthday;
