ALTER TABLE party_attendees
ADD COLUMN IF NOT EXISTS rsvp_status text NOT NULL DEFAULT 'going';

ALTER TABLE party_attendees
ADD CONSTRAINT party_attendees_rsvp_status_check
CHECK (rsvp_status IN ('going', 'maybe', 'not_going'));
