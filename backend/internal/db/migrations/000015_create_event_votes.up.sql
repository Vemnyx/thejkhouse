CREATE TABLE IF NOT EXISTS event_votes (
    event_id integer NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_votes_event_id_idx ON event_votes (event_id);
CREATE INDEX IF NOT EXISTS event_votes_user_id_idx ON event_votes (user_id);
