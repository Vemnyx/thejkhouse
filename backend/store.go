package main

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type userStore struct {
	pool *pgxpool.Pool
}

func openUserStore(pool *pgxpool.Pool) *userStore {
	return &userStore{pool: pool}
}

func (s *userStore) createUser(ctx context.Context, firebaseUID, email, firstName, lastName string, birthday *time.Time, role Role) (*User, error) {
	if !role.Valid() {
		role = RoleGuest
	}

	var user User
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO users (firebase_uid, email, first_name, last_name, birthday, role)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, firebase_uid, email, first_name, last_name, birthday, avatar_url, role, created_at`,
		firebaseUID,
		email,
		firstName,
		lastName,
		birthday,
		int(role),
	).Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Birthday,
		&user.AvatarURL,
		&user.Role,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (s *userStore) confirmUserByEmail(ctx context.Context, firebaseUID, email, firstName, lastName string, birthday *time.Time, role Role) (*User, error) {
	if !role.Valid() {
		role = RoleGuest
	}

	var user User
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO users (firebase_uid, email, first_name, last_name, birthday, role)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (email) DO UPDATE SET
		   firebase_uid = EXCLUDED.firebase_uid,
		   first_name = EXCLUDED.first_name,
		   last_name = EXCLUDED.last_name,
		   birthday = EXCLUDED.birthday,
		   role = EXCLUDED.role
		 RETURNING id, firebase_uid, email, first_name, last_name, birthday, avatar_url, role, created_at`,
		firebaseUID,
		email,
		firstName,
		lastName,
		birthday,
		int(role),
	).Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Birthday,
		&user.AvatarURL,
		&user.Role,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (s *userStore) getUserByFirebaseUID(ctx context.Context, firebaseUID string) (*User, error) {
	var user User
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, firebase_uid, email, first_name, last_name, birthday, avatar_url, role, created_at
		 FROM users WHERE firebase_uid = $1`,
		firebaseUID,
	).Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Birthday,
		&user.AvatarURL,
		&user.Role,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (s *userStore) getUserByID(ctx context.Context, id int64) (*User, error) {
	var user User
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, firebase_uid, email, first_name, last_name, birthday, avatar_url, role, created_at
		 FROM users WHERE id = $1`,
		id,
	).Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Birthday,
		&user.AvatarURL,
		&user.Role,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (s *userStore) listUsers(ctx context.Context) ([]User, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT id, firebase_uid, email, first_name, last_name, birthday, avatar_url, role, created_at
		 FROM users
		 ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]User, 0)
	for rows.Next() {
		var user User
		if err := rows.Scan(
			&user.ID,
			&user.FirebaseUID,
			&user.Email,
			&user.FirstName,
			&user.LastName,
			&user.Birthday,
			&user.AvatarURL,
			&user.Role,
			&user.CreatedAt,
		); err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return users, nil
}

func (s *userStore) updateUserProfile(ctx context.Context, firebaseUID, firstName, lastName string, birthday *time.Time) (*User, error) {
	var user User
	err := s.pool.QueryRow(
		ctx,
		`UPDATE users
		 SET first_name = $2, last_name = $3, birthday = $4
		 WHERE firebase_uid = $1
		 RETURNING id, firebase_uid, email, first_name, last_name, birthday, avatar_url, role, created_at`,
		firebaseUID,
		firstName,
		lastName,
		birthday,
	).Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Birthday,
		&user.AvatarURL,
		&user.Role,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (s *userStore) updateUserAvatar(ctx context.Context, firebaseUID, avatarURL string) (*User, error) {
	var user User
	err := s.pool.QueryRow(
		ctx,
		`UPDATE users
		 SET avatar_url = $2
		 WHERE firebase_uid = $1
		 RETURNING id, firebase_uid, email, first_name, last_name, birthday, avatar_url, role, created_at`,
		firebaseUID,
		avatarURL,
	).Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Birthday,
		&user.AvatarURL,
		&user.Role,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

func (s *userStore) deleteUser(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}

	return nil
}

func (s *userStore) upsertPendingSignup(ctx context.Context, firebaseUID, email, firstName, lastName string, birthday *time.Time, role Role, tokenHash []byte, expiresAt time.Time) (*PendingSignup, error) {
	if !role.Valid() {
		role = RoleGuest
	}

	var pending PendingSignup
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO pending_signups (firebase_uid, email, first_name, last_name, birthday, role, token_hash, expires_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (email) DO UPDATE SET
		   firebase_uid = EXCLUDED.firebase_uid,
		   first_name = EXCLUDED.first_name,
		   last_name = EXCLUDED.last_name,
		   birthday = EXCLUDED.birthday,
		   role = EXCLUDED.role,
		   token_hash = EXCLUDED.token_hash,
		   expires_at = EXCLUDED.expires_at,
		   created_at = now()
		 RETURNING id, firebase_uid, email, first_name, last_name, birthday, role, token_hash, expires_at, created_at`,
		firebaseUID,
		email,
		firstName,
		lastName,
		birthday,
		int(role),
		tokenHash,
		expiresAt,
	).Scan(
		&pending.ID,
		&pending.FirebaseUID,
		&pending.Email,
		&pending.FirstName,
		&pending.LastName,
		&pending.Birthday,
		&pending.Role,
		&pending.TokenHash,
		&pending.ExpiresAt,
		&pending.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &pending, nil
}

func (s *userStore) getPendingSignupByTokenHash(ctx context.Context, tokenHash []byte) (*PendingSignup, error) {
	var pending PendingSignup
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, firebase_uid, email, first_name, last_name, birthday, role, token_hash, expires_at, created_at
		 FROM pending_signups WHERE token_hash = $1`,
		tokenHash,
	).Scan(
		&pending.ID,
		&pending.FirebaseUID,
		&pending.Email,
		&pending.FirstName,
		&pending.LastName,
		&pending.Birthday,
		&pending.Role,
		&pending.TokenHash,
		&pending.ExpiresAt,
		&pending.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &pending, nil
}

func (s *userStore) getPendingSignupByFirebaseUID(ctx context.Context, firebaseUID string) (*PendingSignup, error) {
	var pending PendingSignup
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, firebase_uid, email, first_name, last_name, birthday, role, token_hash, expires_at, created_at
		 FROM pending_signups WHERE firebase_uid = $1`,
		firebaseUID,
	).Scan(
		&pending.ID,
		&pending.FirebaseUID,
		&pending.Email,
		&pending.FirstName,
		&pending.LastName,
		&pending.Birthday,
		&pending.Role,
		&pending.TokenHash,
		&pending.ExpiresAt,
		&pending.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &pending, nil
}

func (s *userStore) getPendingSignupByEmail(ctx context.Context, email string) (*PendingSignup, error) {
	var pending PendingSignup
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, firebase_uid, email, first_name, last_name, birthday, role, token_hash, expires_at, created_at
		 FROM pending_signups WHERE email = $1`,
		email,
	).Scan(
		&pending.ID,
		&pending.FirebaseUID,
		&pending.Email,
		&pending.FirstName,
		&pending.LastName,
		&pending.Birthday,
		&pending.Role,
		&pending.TokenHash,
		&pending.ExpiresAt,
		&pending.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &pending, nil
}

func (s *userStore) deletePendingSignup(ctx context.Context, id int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM pending_signups WHERE id = $1`, id)
	return err
}

func (s *userStore) createImage(ctx context.Context, imageURL string, date time.Time, partyID *int64, eventID *int64, teamID *int64, homepage bool, notes string, userIDs []int32) (*Image, error) {
	var image Image
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO images (image_url, date, party_id, event_id, team_id, homepage, notes, user_ids)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, image_url, date, party_id, event_id, team_id, user_ids, homepage, notes, uploaded_at`,
		imageURL,
		date,
		partyID,
		eventID,
		teamID,
		homepage,
		notes,
		userIDs,
	).Scan(
		&image.ID,
		&image.ImageURL,
		&image.Date,
		&image.PartyID,
		&image.EventID,
		&image.TeamID,
		&image.UserIDs,
		&image.Homepage,
		&image.Notes,
		&image.UploadedAt,
	)
	if err != nil {
		return nil, err
	}

	return &image, nil
}

func (s *userStore) listImages(ctx context.Context) ([]Image, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT id, image_url, date, party_id, event_id, team_id, user_ids, homepage, notes, uploaded_at
		 FROM images
		 ORDER BY uploaded_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	images := make([]Image, 0)
	for rows.Next() {
		var image Image
		if err := rows.Scan(&image.ID, &image.ImageURL, &image.Date, &image.PartyID, &image.EventID, &image.TeamID, &image.UserIDs, &image.Homepage, &image.Notes, &image.UploadedAt); err != nil {
			return nil, err
		}
		images = append(images, image)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return images, nil
}

func (s *userStore) getImage(ctx context.Context, id int64) (*Image, error) {
	var image Image
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, image_url, date, party_id, event_id, team_id, user_ids, homepage, notes, uploaded_at
		 FROM images WHERE id = $1`,
		id,
	).Scan(&image.ID, &image.ImageURL, &image.Date, &image.PartyID, &image.EventID, &image.TeamID, &image.UserIDs, &image.Homepage, &image.Notes, &image.UploadedAt)
	if err != nil {
		return nil, err
	}

	return &image, nil
}

func (s *userStore) updateImageHomepage(ctx context.Context, id int64, homepage bool) (*Image, error) {
	return s.updateImage(ctx, id, &homepage, nil, nil, nil)
}

func (s *userStore) updateImage(ctx context.Context, id int64, homepage *bool, userIDs *[]int32, eventID *int64, teamID *int64) (*Image, error) {
	var image Image
	var homepageArg any
	if homepage != nil {
		homepageArg = *homepage
	}
	var userIDsArg any
	if userIDs != nil {
		userIDsArg = *userIDs
	}
	var eventIDArg any
	if eventID != nil {
		eventIDArg = *eventID
	}
	var teamIDArg any
	if teamID != nil {
		teamIDArg = *teamID
	}
	err := s.pool.QueryRow(
		ctx,
		`UPDATE images
		 SET homepage = COALESCE($2::boolean, homepage),
		     user_ids = COALESCE($3::integer[], user_ids),
		     event_id = COALESCE($4::integer, event_id),
		     team_id = COALESCE($5::integer, team_id)
		 WHERE id = $1
		 RETURNING id, image_url, date, party_id, event_id, team_id, user_ids, homepage, notes, uploaded_at`,
		id,
		homepageArg,
		userIDsArg,
		eventIDArg,
		teamIDArg,
	).Scan(&image.ID, &image.ImageURL, &image.Date, &image.PartyID, &image.EventID, &image.TeamID, &image.UserIDs, &image.Homepage, &image.Notes, &image.UploadedAt)
	if err != nil {
		return nil, err
	}

	return &image, nil
}

func (s *userStore) deleteImage(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM images WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}

	return nil
}

func (s *userStore) listParties(ctx context.Context) ([]Party, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT id, label, date, summary, partiful_url, media_url, theme_primary, theme_accent, theme_background, theme_font, byom
		 FROM parties
		 ORDER BY date DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	parties := make([]Party, 0)
	for rows.Next() {
		var party Party
		if err := rows.Scan(
			&party.ID,
			&party.Label,
			&party.Date,
			&party.Summary,
			&party.PartifulURL,
			&party.MediaURL,
			&party.ThemePrimary,
			&party.ThemeAccent,
			&party.ThemeBackground,
			&party.ThemeFont,
			&party.Byom,
		); err != nil {
			return nil, err
		}
		parties = append(parties, party)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return parties, nil
}

func (s *userStore) getPartyByID(ctx context.Context, id int64) (Party, error) {
	var party Party
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, label, date, summary, partiful_url, media_url, theme_primary, theme_accent, theme_background, theme_font, byom
		 FROM parties
		 WHERE id = $1`,
		id,
	).Scan(
		&party.ID,
		&party.Label,
		&party.Date,
		&party.Summary,
		&party.PartifulURL,
		&party.MediaURL,
		&party.ThemePrimary,
		&party.ThemeAccent,
		&party.ThemeBackground,
		&party.ThemeFont,
		&party.Byom,
	)
	if err != nil {
		return Party{}, err
	}
	return party, nil
}

func (s *userStore) createParty(ctx context.Context, label string, date time.Time, summary, partifulURL, mediaURL, themePrimary, themeAccent, themeBackground, themeFont string, byom bool) (Party, error) {
	var party Party
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO parties (label, date, summary, partiful_url, media_url, theme_primary, theme_accent, theme_background, theme_font, byom)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 RETURNING id, label, date, summary, partiful_url, media_url, theme_primary, theme_accent, theme_background, theme_font, byom`,
		label,
		date,
		summary,
		partifulURL,
		mediaURL,
		themePrimary,
		themeAccent,
		themeBackground,
		themeFont,
		byom,
	).Scan(
		&party.ID,
		&party.Label,
		&party.Date,
		&party.Summary,
		&party.PartifulURL,
		&party.MediaURL,
		&party.ThemePrimary,
		&party.ThemeAccent,
		&party.ThemeBackground,
		&party.ThemeFont,
		&party.Byom,
	)
	if err != nil {
		return Party{}, err
	}

	return party, nil
}

func (s *userStore) updateParty(ctx context.Context, id int64, label string, date time.Time, summary, partifulURL, mediaURL, themePrimary, themeAccent, themeBackground, themeFont string, byom bool) (Party, error) {
	var party Party
	err := s.pool.QueryRow(
		ctx,
		`UPDATE parties
		 SET label = $2, date = $3, summary = $4, partiful_url = $5, media_url = $6, theme_primary = $7, theme_accent = $8, theme_background = $9, theme_font = $10, byom = $11
		 WHERE id = $1
		 RETURNING id, label, date, summary, partiful_url, media_url, theme_primary, theme_accent, theme_background, theme_font, byom`,
		id,
		label,
		date,
		summary,
		partifulURL,
		mediaURL,
		themePrimary,
		themeAccent,
		themeBackground,
		themeFont,
		byom,
	).Scan(
		&party.ID,
		&party.Label,
		&party.Date,
		&party.Summary,
		&party.PartifulURL,
		&party.MediaURL,
		&party.ThemePrimary,
		&party.ThemeAccent,
		&party.ThemeBackground,
		&party.ThemeFont,
		&party.Byom,
	)
	if err != nil {
		return Party{}, err
	}

	return party, nil
}

func (s *userStore) deleteParty(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM parties WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}

	return nil
}

func (s *userStore) listPartyAttendees(ctx context.Context, partyID int64) ([]PartyAttendee, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT id, party_id, user_id, first_name, last_name, email, plus_one_of, note, rsvp_status, metadata, created_at
		 FROM party_attendees
		 WHERE party_id = $1
		 ORDER BY created_at, id`,
		partyID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	attendees := make([]PartyAttendee, 0)
	for rows.Next() {
		var attendee PartyAttendee
		var metadata []byte
		if err := rows.Scan(
			&attendee.ID,
			&attendee.PartyID,
			&attendee.UserID,
			&attendee.FirstName,
			&attendee.LastName,
			&attendee.Email,
			&attendee.PlusOneOf,
			&attendee.Note,
			&attendee.RsvpStatus,
			&metadata,
			&attendee.CreatedAt,
		); err != nil {
			return nil, err
		}
		attendee.Metadata = json.RawMessage(metadata)
		attendees = append(attendees, attendee)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return attendees, nil
}

func (s *userStore) getPartyAttendeeByID(ctx context.Context, id int64) (PartyAttendee, error) {
	var attendee PartyAttendee
	var metadata []byte
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, party_id, user_id, first_name, last_name, email, plus_one_of, note, rsvp_status, metadata, created_at
		 FROM party_attendees
		 WHERE id = $1`,
		id,
	).Scan(
		&attendee.ID,
		&attendee.PartyID,
		&attendee.UserID,
		&attendee.FirstName,
		&attendee.LastName,
		&attendee.Email,
		&attendee.PlusOneOf,
		&attendee.Note,
		&attendee.RsvpStatus,
		&metadata,
		&attendee.CreatedAt,
	)
	if err != nil {
		return PartyAttendee{}, err
	}
	attendee.Metadata = json.RawMessage(metadata)
	return attendee, nil
}

func (s *userStore) getPartyAttendeeByUser(ctx context.Context, partyID, userID int64) (PartyAttendee, error) {
	var attendee PartyAttendee
	var metadata []byte
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, party_id, user_id, first_name, last_name, email, plus_one_of, note, rsvp_status, metadata, created_at
		 FROM party_attendees
		 WHERE party_id = $1 AND user_id = $2`,
		partyID,
		userID,
	).Scan(
		&attendee.ID,
		&attendee.PartyID,
		&attendee.UserID,
		&attendee.FirstName,
		&attendee.LastName,
		&attendee.Email,
		&attendee.PlusOneOf,
		&attendee.Note,
		&attendee.RsvpStatus,
		&metadata,
		&attendee.CreatedAt,
	)
	if err != nil {
		return PartyAttendee{}, err
	}
	attendee.Metadata = json.RawMessage(metadata)
	return attendee, nil
}

func (s *userStore) createPartyAttendee(ctx context.Context, partyID int64, userID *int64, firstName, lastName, email string, plusOneOf *int64, note string, metadata json.RawMessage) (PartyAttendee, error) {
	if len(metadata) == 0 || !json.Valid(metadata) {
		metadata = json.RawMessage([]byte("{}"))
	}
	var attendee PartyAttendee
	var savedMetadata []byte
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO party_attendees (party_id, user_id, first_name, last_name, email, plus_one_of, note, rsvp_status, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		 RETURNING id, party_id, user_id, first_name, last_name, email, plus_one_of, note, rsvp_status, metadata, created_at`,
		partyID,
		userID,
		firstName,
		lastName,
		email,
		plusOneOf,
		note,
		PartyRsvpStatusGoing,
		metadata,
	).Scan(
		&attendee.ID,
		&attendee.PartyID,
		&attendee.UserID,
		&attendee.FirstName,
		&attendee.LastName,
		&attendee.Email,
		&attendee.PlusOneOf,
		&attendee.Note,
		&attendee.RsvpStatus,
		&savedMetadata,
		&attendee.CreatedAt,
	)
	if err != nil {
		return PartyAttendee{}, err
	}
	attendee.Metadata = json.RawMessage(savedMetadata)
	return attendee, nil
}

func (s *userStore) upsertPartyAttendeeForUser(ctx context.Context, partyID, userID int64, firstName, lastName, email, note string, rsvpStatus PartyRsvpStatus, metadata json.RawMessage) (PartyAttendee, error) {
	if len(metadata) == 0 || !json.Valid(metadata) {
		metadata = json.RawMessage([]byte("{}"))
	}
	var attendee PartyAttendee
	var savedMetadata []byte
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO party_attendees (party_id, user_id, first_name, last_name, email, note, rsvp_status, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 ON CONFLICT (party_id, user_id) WHERE user_id IS NOT NULL
		 DO UPDATE SET
		   first_name = EXCLUDED.first_name,
		   last_name = EXCLUDED.last_name,
		   email = EXCLUDED.email,
		   note = EXCLUDED.note,
		   rsvp_status = EXCLUDED.rsvp_status,
		   metadata = EXCLUDED.metadata
		 RETURNING id, party_id, user_id, first_name, last_name, email, plus_one_of, note, rsvp_status, metadata, created_at`,
		partyID,
		userID,
		firstName,
		lastName,
		email,
		note,
		rsvpStatus,
		metadata,
	).Scan(
		&attendee.ID,
		&attendee.PartyID,
		&attendee.UserID,
		&attendee.FirstName,
		&attendee.LastName,
		&attendee.Email,
		&attendee.PlusOneOf,
		&attendee.Note,
		&attendee.RsvpStatus,
		&savedMetadata,
		&attendee.CreatedAt,
	)
	if err != nil {
		return PartyAttendee{}, err
	}
	attendee.Metadata = json.RawMessage(savedMetadata)
	return attendee, nil
}

func (s *userStore) deletePartyAttendeePlusOnes(ctx context.Context, attendeeID int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM party_attendees WHERE plus_one_of = $1`, attendeeID)
	return err
}

func (s *userStore) deletePartyAttendee(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM party_attendees WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func scanPartySignupItem(row interface {
	Scan(dest ...any) error
}) (PartySignupItem, error) {
	var item PartySignupItem
	err := row.Scan(
		&item.ID,
		&item.PartyID,
		&item.UserID,
		&item.Label,
		&item.Note,
		&item.HostCreated,
		&item.SortOrder,
		&item.CreatedAt,
	)
	return item, err
}

func (s *userStore) listPartySignupItems(ctx context.Context, partyID int64) ([]PartySignupItem, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT id, party_id, user_id, label, note, host_created, sort_order, created_at
		 FROM party_signup_items
		 WHERE party_id = $1
		 ORDER BY sort_order, id`,
		partyID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]PartySignupItem, 0)
	for rows.Next() {
		item, err := scanPartySignupItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (s *userStore) getPartySignupItemByID(ctx context.Context, id int64) (PartySignupItem, error) {
	return scanPartySignupItem(s.pool.QueryRow(
		ctx,
		`SELECT id, party_id, user_id, label, note, host_created, sort_order, created_at
		 FROM party_signup_items
		 WHERE id = $1`,
		id,
	))
}

func (s *userStore) createPartySignupItem(ctx context.Context, partyID int64, userID *int64, label, note string, hostCreated bool) (PartySignupItem, error) {
	return scanPartySignupItem(s.pool.QueryRow(
		ctx,
		`INSERT INTO party_signup_items (party_id, user_id, label, note, host_created, sort_order)
		 VALUES (
		   $1, $2, $3, $4, $5,
		   (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM party_signup_items WHERE party_id = $1)
		 )
		 RETURNING id, party_id, user_id, label, note, host_created, sort_order, created_at`,
		partyID,
		userID,
		label,
		note,
		hostCreated,
	))
}

func (s *userStore) updatePartySignupItem(ctx context.Context, id int64, userID *int64, label, note string) (PartySignupItem, error) {
	item, err := scanPartySignupItem(s.pool.QueryRow(
		ctx,
		`UPDATE party_signup_items
		 SET user_id = $2, label = $3, note = $4
		 WHERE id = $1
		 RETURNING id, party_id, user_id, label, note, host_created, sort_order, created_at`,
		id,
		userID,
		label,
		note,
	))
	if err != nil {
		return PartySignupItem{}, err
	}
	return item, nil
}

func (s *userStore) deletePartySignupItem(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM party_signup_items WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *userStore) listEvents(ctx context.Context) ([]Event, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT id, label, party_id, start_date, end_date, completed_at, type, description, metadata
		 FROM events
		 ORDER BY COALESCE(start_date, end_date, completed_at, now()) DESC, id DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := make([]Event, 0)
	for rows.Next() {
		var event Event
		var metadata []byte
		if err := rows.Scan(
			&event.ID,
			&event.Label,
			&event.PartyID,
			&event.StartDate,
			&event.EndDate,
			&event.CompletedAt,
			&event.Type,
			&event.Description,
			&metadata,
		); err != nil {
			return nil, err
		}
		event.Metadata = json.RawMessage(metadata)
		events = append(events, event)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return events, nil
}

func (s *userStore) createEvent(ctx context.Context, label string, partyID *int64, startDate *time.Time, endDate *time.Time, eventType EventType, description string, eventMetadata json.RawMessage) (Event, error) {
	var event Event
	var metadata []byte
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO events (label, party_id, start_date, end_date, type, description, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id, label, party_id, start_date, end_date, completed_at, type, description, metadata`,
		label,
		partyID,
		startDate,
		endDate,
		eventType,
		description,
		eventMetadata,
	).Scan(
		&event.ID,
		&event.Label,
		&event.PartyID,
		&event.StartDate,
		&event.EndDate,
		&event.CompletedAt,
		&event.Type,
		&event.Description,
		&metadata,
	)
	if err != nil {
		return Event{}, err
	}
	event.Metadata = json.RawMessage(metadata)

	return event, nil
}

func (s *userStore) getEventByID(ctx context.Context, id int64) (Event, error) {
	var event Event
	var metadata []byte
	err := s.pool.QueryRow(
		ctx,
		`SELECT id, label, party_id, start_date, end_date, completed_at, type, description, metadata
		 FROM events WHERE id = $1`,
		id,
	).Scan(
		&event.ID,
		&event.Label,
		&event.PartyID,
		&event.StartDate,
		&event.EndDate,
		&event.CompletedAt,
		&event.Type,
		&event.Description,
		&metadata,
	)
	if err != nil {
		return Event{}, err
	}
	event.Metadata = json.RawMessage(metadata)
	return event, nil
}

func (s *userStore) updateEventMetadata(ctx context.Context, id int64, metadata json.RawMessage) (Event, error) {
	var event Event
	var savedMetadata []byte
	err := s.pool.QueryRow(
		ctx,
		`UPDATE events
		 SET metadata = $2
		 WHERE id = $1
		 RETURNING id, label, party_id, start_date, end_date, completed_at, type, description, metadata`,
		id,
		metadata,
	).Scan(
		&event.ID,
		&event.Label,
		&event.PartyID,
		&event.StartDate,
		&event.EndDate,
		&event.CompletedAt,
		&event.Type,
		&event.Description,
		&savedMetadata,
	)
	if err != nil {
		return Event{}, err
	}
	event.Metadata = json.RawMessage(savedMetadata)
	return event, nil
}

func (s *userStore) startEvent(ctx context.Context, id int64, startDate time.Time) (Event, error) {
	var event Event
	var metadata []byte
	err := s.pool.QueryRow(
		ctx,
		`UPDATE events
		 SET start_date = COALESCE(start_date, $2)
		 WHERE id = $1
		 RETURNING id, label, party_id, start_date, end_date, completed_at, type, description, metadata`,
		id,
		startDate,
	).Scan(
		&event.ID,
		&event.Label,
		&event.PartyID,
		&event.StartDate,
		&event.EndDate,
		&event.CompletedAt,
		&event.Type,
		&event.Description,
		&metadata,
	)
	if err != nil {
		return Event{}, err
	}
	event.Metadata = json.RawMessage(metadata)
	return event, nil
}

func (s *userStore) completeEvent(ctx context.Context, id int64, completedAt time.Time) (Event, error) {
	var event Event
	var metadata []byte
	err := s.pool.QueryRow(
		ctx,
		`UPDATE events
		 SET completed_at = COALESCE(completed_at, $2)
		 WHERE id = $1
		 RETURNING id, label, party_id, start_date, end_date, completed_at, type, description, metadata`,
		id,
		completedAt,
	).Scan(
		&event.ID,
		&event.Label,
		&event.PartyID,
		&event.StartDate,
		&event.EndDate,
		&event.CompletedAt,
		&event.Type,
		&event.Description,
		&metadata,
	)
	if err != nil {
		return Event{}, err
	}
	event.Metadata = json.RawMessage(metadata)
	return event, nil
}

func (s *userStore) deleteEvent(ctx context.Context, id int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM events WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *userStore) getEventDetail(ctx context.Context, id int64) (EventDetail, error) {
	event, err := s.getEventByID(ctx, id)
	if err != nil {
		return EventDetail{}, err
	}
	users, err := s.listEventUsers(ctx, id)
	if err != nil {
		return EventDetail{}, err
	}
	teams, err := s.listEventTeams(ctx, id)
	if err != nil {
		return EventDetail{}, err
	}
	attendees, err := s.listEventAttendees(ctx, id)
	if err != nil {
		return EventDetail{}, err
	}
	rounds, err := s.listEventRounds(ctx, id)
	if err != nil {
		return EventDetail{}, err
	}
	return EventDetail{Event: event, Users: users, Teams: teams, Attendees: attendees, Rounds: rounds}, nil
}

func (s *userStore) listEventRounds(ctx context.Context, eventID int64) ([]EventRound, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT id, event_id, round_number, position, participant_one, participant_two, winner, completed_at, metadata, created_at
		 FROM event_rounds
		 WHERE event_id = $1
		 ORDER BY round_number, position`,
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rounds := make([]EventRound, 0)
	for rows.Next() {
		var round EventRound
		var participantOne []byte
		var participantTwo []byte
		var winner []byte
		var metadata []byte
		if err := rows.Scan(
			&round.ID,
			&round.EventID,
			&round.RoundNumber,
			&round.Position,
			&participantOne,
			&participantTwo,
			&winner,
			&round.CompletedAt,
			&metadata,
			&round.CreatedAt,
		); err != nil {
			return nil, err
		}
		round.ParticipantOne = nullableRawMessage(participantOne)
		round.ParticipantTwo = nullableRawMessage(participantTwo)
		round.Winner = nullableRawMessage(winner)
		round.Metadata = json.RawMessage(metadata)
		rounds = append(rounds, round)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return rounds, nil
}

func (s *userStore) listEventUsers(ctx context.Context, eventID int64) ([]EventUser, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT event_id, user_id, contestant, metadata
		 FROM event_user
		 WHERE event_id = $1
		 ORDER BY user_id`,
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]EventUser, 0)
	for rows.Next() {
		var user EventUser
		var metadata []byte
		if err := rows.Scan(&user.EventID, &user.UserID, &user.Contestant, &metadata); err != nil {
			return nil, err
		}
		user.Metadata = json.RawMessage(metadata)
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return users, nil
}

func (s *userStore) listEventTeams(ctx context.Context, eventID int64) ([]EventTeam, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT id, event_id, name, user_ids, metadata
		 FROM event_teams
		 WHERE event_id = $1
		 ORDER BY id`,
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	teams := make([]EventTeam, 0)
	for rows.Next() {
		var team EventTeam
		var metadata []byte
		if err := rows.Scan(&team.ID, &team.EventID, &team.Name, &team.UserIDs, &metadata); err != nil {
			return nil, err
		}
		team.Metadata = json.RawMessage(metadata)
		teams = append(teams, team)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return teams, nil
}

func (s *userStore) createEventTeam(ctx context.Context, eventID int64, name string, userIDs []int32) (EventTeam, error) {
	var team EventTeam
	var metadata []byte
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO event_teams (event_id, name, user_ids)
		 VALUES ($1, $2, $3)
		 RETURNING id, event_id, name, user_ids, metadata`,
		eventID,
		name,
		userIDs,
	).Scan(&team.ID, &team.EventID, &team.Name, &team.UserIDs, &metadata)
	if err != nil {
		return EventTeam{}, err
	}
	team.Metadata = json.RawMessage(metadata)
	return team, nil
}

func (s *userStore) upsertEventUser(ctx context.Context, eventID int64, userID int64, contestant bool, metadata json.RawMessage) (EventUser, error) {
	var eventUser EventUser
	var savedMetadata []byte
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO event_user (event_id, user_id, contestant, metadata)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (event_id, user_id)
		 DO UPDATE SET contestant = EXCLUDED.contestant, metadata = EXCLUDED.metadata
		 RETURNING event_id, user_id, contestant, metadata`,
		eventID,
		userID,
		contestant,
		metadata,
	).Scan(&eventUser.EventID, &eventUser.UserID, &eventUser.Contestant, &savedMetadata)
	if err != nil {
		return EventUser{}, err
	}
	eventUser.Metadata = json.RawMessage(savedMetadata)
	return eventUser, nil
}

func (s *userStore) deleteEventContestant(ctx context.Context, eventID int64, userIDs []int32, teamID *int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if len(userIDs) > 0 {
		if _, err := tx.Exec(ctx, `DELETE FROM event_user WHERE event_id = $1 AND user_id = ANY($2::integer[])`, eventID, userIDs); err != nil {
			return err
		}
	}
	if teamID != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM event_teams WHERE event_id = $1 AND id = $2`, eventID, *teamID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *userStore) upsertEventVote(ctx context.Context, eventID int64, userID int64, metadata json.RawMessage) (EventVote, error) {
	var vote EventVote
	var savedMetadata []byte
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO event_votes (event_id, user_id, metadata)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (event_id, user_id)
		 DO UPDATE SET metadata = EXCLUDED.metadata
		 RETURNING event_id, user_id, metadata`,
		eventID,
		userID,
		metadata,
	).Scan(&vote.EventID, &vote.UserID, &savedMetadata)
	if err != nil {
		return EventVote{}, err
	}
	vote.Metadata = json.RawMessage(savedMetadata)
	return vote, nil
}

func (s *userStore) listEventVotes(ctx context.Context, eventID int64) ([]EventVote, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT event_id, user_id, metadata
		 FROM event_votes
		 WHERE event_id = $1
		 ORDER BY user_id`,
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	votes := make([]EventVote, 0)
	for rows.Next() {
		var vote EventVote
		var metadata []byte
		if err := rows.Scan(&vote.EventID, &vote.UserID, &metadata); err != nil {
			return nil, err
		}
		vote.Metadata = json.RawMessage(metadata)
		votes = append(votes, vote)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return votes, nil
}

func (s *userStore) listEventAttendees(ctx context.Context, eventID int64) ([]EventAttendee, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT event_id, user_id, metadata, created_at
		 FROM event_attendees
		 WHERE event_id = $1
		 ORDER BY created_at, user_id`,
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	attendees := make([]EventAttendee, 0)
	for rows.Next() {
		var attendee EventAttendee
		var metadata []byte
		if err := rows.Scan(&attendee.EventID, &attendee.UserID, &metadata, &attendee.CreatedAt); err != nil {
			return nil, err
		}
		attendee.Metadata = json.RawMessage(metadata)
		attendees = append(attendees, attendee)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return attendees, nil
}

func (s *userStore) upsertEventAttendee(ctx context.Context, eventID int64, userID int64, metadata json.RawMessage) (EventAttendee, error) {
	if len(metadata) == 0 || !json.Valid(metadata) {
		metadata = json.RawMessage([]byte("{}"))
	}
	var attendee EventAttendee
	var savedMetadata []byte
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO event_attendees (event_id, user_id, metadata)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (event_id, user_id)
		 DO UPDATE SET metadata = EXCLUDED.metadata
		 RETURNING event_id, user_id, metadata, created_at`,
		eventID,
		userID,
		metadata,
	).Scan(&attendee.EventID, &attendee.UserID, &savedMetadata, &attendee.CreatedAt)
	if err != nil {
		return EventAttendee{}, err
	}
	attendee.Metadata = json.RawMessage(savedMetadata)
	return attendee, nil
}

func (s *userStore) deleteEventAttendee(ctx context.Context, eventID int64, userID int64) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM event_attendees WHERE event_id = $1 AND user_id = $2`, eventID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *userStore) replaceEventRounds(ctx context.Context, eventID int64, rounds []bracketRoundSeed, startedAt time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM event_rounds WHERE event_id = $1`, eventID); err != nil {
		return err
	}
	for _, round := range rounds {
		if _, err := tx.Exec(
			ctx,
			`INSERT INTO event_rounds (event_id, round_number, position, participant_one, participant_two, metadata)
			 VALUES ($1, $2, $3, $4, $5, $6)`,
			eventID,
			round.RoundNumber,
			round.Position,
			round.ParticipantOne,
			round.ParticipantTwo,
			json.RawMessage([]byte("{}")),
		); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE events SET start_date = COALESCE(start_date, $2) WHERE id = $1`, eventID, startedAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *userStore) updateEventRoundReport(ctx context.Context, eventID int64, roundID int64, metadata json.RawMessage) (EventRound, error) {
	var round EventRound
	var participantOne []byte
	var participantTwo []byte
	var winner []byte
	var savedMetadata []byte
	err := s.pool.QueryRow(
		ctx,
		`UPDATE event_rounds
		 SET metadata = $3
		 WHERE event_id = $1 AND id = $2
		 RETURNING id, event_id, round_number, position, participant_one, participant_two, winner, completed_at, metadata, created_at`,
		eventID,
		roundID,
		metadata,
	).Scan(
		&round.ID,
		&round.EventID,
		&round.RoundNumber,
		&round.Position,
		&participantOne,
		&participantTwo,
		&winner,
		&round.CompletedAt,
		&savedMetadata,
		&round.CreatedAt,
	)
	if err != nil {
		return EventRound{}, err
	}
	round.ParticipantOne = nullableRawMessage(participantOne)
	round.ParticipantTwo = nullableRawMessage(participantTwo)
	round.Winner = nullableRawMessage(winner)
	round.Metadata = json.RawMessage(savedMetadata)
	return round, nil
}

func (s *userStore) completeEventRound(ctx context.Context, eventID int64, roundID int64, winner json.RawMessage, completedAt time.Time) error {
	tag, err := s.pool.Exec(
		ctx,
		`UPDATE event_rounds
		 SET winner = $3, completed_at = COALESCE(completed_at, $4)
		 WHERE event_id = $1 AND id = $2`,
		eventID,
		roundID,
		winner,
		completedAt,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

func (s *userStore) insertEventRounds(ctx context.Context, eventID int64, rounds []bracketRoundSeed) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, round := range rounds {
		if _, err := tx.Exec(
			ctx,
			`INSERT INTO event_rounds (event_id, round_number, position, participant_one, participant_two, metadata)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (event_id, round_number, position) DO NOTHING`,
			eventID,
			round.RoundNumber,
			round.Position,
			round.ParticipantOne,
			round.ParticipantTwo,
			json.RawMessage([]byte("{}")),
		); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func nullableRawMessage(value []byte) json.RawMessage {
	if value == nil {
		return nil
	}
	return json.RawMessage(value)
}

func (s *userStore) getHomepageHTML(ctx context.Context) (string, error) {
	var html string
	err := s.pool.QueryRow(ctx, `SELECT html FROM homepage LIMIT 1`).Scan(&html)
	if err != nil {
		if isNotFound(err) {
			return "", nil
		}
		return "", err
	}

	return html, nil
}

func (s *userStore) updateHomepageHTML(ctx context.Context, html string) (string, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `DELETE FROM homepage`); err != nil {
		return "", err
	}
	if err := tx.QueryRow(ctx, `INSERT INTO homepage (html) VALUES ($1) RETURNING html`, html).Scan(&html); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", err
	}

	return html, nil
}

func (s *userStore) listHomepageImages(ctx context.Context) ([]Image, error) {
	rows, err := s.pool.Query(
		ctx,
		`SELECT id, image_url, date, party_id, event_id, team_id, user_ids, homepage, notes, uploaded_at
		 FROM images
		 WHERE homepage = true
		 ORDER BY uploaded_at DESC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	images := make([]Image, 0)
	for rows.Next() {
		var image Image
		if err := rows.Scan(&image.ID, &image.ImageURL, &image.Date, &image.PartyID, &image.EventID, &image.TeamID, &image.UserIDs, &image.Homepage, &image.Notes, &image.UploadedAt); err != nil {
			return nil, err
		}
		images = append(images, image)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return images, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func isNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}

func (s *userStore) close() {
	s.pool.Close()
}
