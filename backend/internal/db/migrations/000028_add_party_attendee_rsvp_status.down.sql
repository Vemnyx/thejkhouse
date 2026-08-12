ALTER TABLE party_attendees
DROP CONSTRAINT IF EXISTS party_attendees_rsvp_status_check;

ALTER TABLE party_attendees
DROP COLUMN IF EXISTS rsvp_status;
