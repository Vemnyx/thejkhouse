ALTER TABLE users
    ADD COLUMN birthday timestamptz;

ALTER TABLE pending_signups
    ADD COLUMN birthday timestamptz;
