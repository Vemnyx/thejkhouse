DROP INDEX IF EXISTS pending_signups_firebase_uid_key;

DELETE FROM pending_signups WHERE encrypted_password IS NULL;

ALTER TABLE pending_signups
    DROP COLUMN firebase_uid,
    ALTER COLUMN encrypted_password SET NOT NULL;
