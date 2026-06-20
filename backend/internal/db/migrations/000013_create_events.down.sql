DROP TABLE IF EXISTS event_user;

DROP INDEX IF EXISTS images_event_id_idx;
DROP INDEX IF EXISTS images_user_ids_idx;

ALTER TABLE images
    DROP COLUMN IF EXISTS user_ids,
    DROP COLUMN IF EXISTS event_id;

DROP TABLE IF EXISTS events;

DROP TYPE IF EXISTS event_type;
