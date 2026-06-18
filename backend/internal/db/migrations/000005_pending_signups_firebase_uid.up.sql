ALTER TABLE pending_signups
    ADD COLUMN firebase_uid text,
    ALTER COLUMN encrypted_password DROP NOT NULL;

UPDATE pending_signups SET encrypted_password = NULL;

CREATE UNIQUE INDEX pending_signups_firebase_uid_key
    ON pending_signups (firebase_uid)
    WHERE firebase_uid IS NOT NULL;
