CREATE TABLE IF NOT EXISTS event_attendees (
    event_id integer NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_attendees_event_id_idx ON event_attendees (event_id);
CREATE INDEX IF NOT EXISTS event_attendees_user_id_idx ON event_attendees (user_id);
