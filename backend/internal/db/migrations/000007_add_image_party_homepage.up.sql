ALTER TABLE images
    ADD COLUMN party_id integer REFERENCES parties (id) ON DELETE SET NULL,
    ADD COLUMN homepage boolean NOT NULL DEFAULT false;
