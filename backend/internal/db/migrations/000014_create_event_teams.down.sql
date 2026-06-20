DROP INDEX IF EXISTS images_team_id_idx;

ALTER TABLE images
    DROP COLUMN IF EXISTS team_id;

DROP TABLE IF EXISTS event_teams;
