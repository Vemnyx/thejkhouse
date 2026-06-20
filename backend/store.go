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
		 RETURNING id, firebase_uid, email, first_name, last_name, birthday, role, created_at`,
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
		 RETURNING id, firebase_uid, email, first_name, last_name, birthday, role, created_at`,
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
		`SELECT id, firebase_uid, email, first_name, last_name, birthday, role, created_at
		 FROM users WHERE firebase_uid = $1`,
		firebaseUID,
	).Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Birthday,
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
		`SELECT id, firebase_uid, email, first_name, last_name, birthday, role, created_at
		 FROM users WHERE id = $1`,
		id,
	).Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Birthday,
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
		`SELECT id, firebase_uid, email, first_name, last_name, birthday, role, created_at
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
		 RETURNING id, firebase_uid, email, first_name, last_name, birthday, role, created_at`,
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
		`SELECT id, label, date, html
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
		if err := rows.Scan(&party.ID, &party.Label, &party.Date, &party.HTML); err != nil {
			return nil, err
		}
		parties = append(parties, party)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return parties, nil
}

func (s *userStore) createParty(ctx context.Context, label string, date time.Time, html string) (Party, error) {
	var party Party
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO parties (label, date, html)
		 VALUES ($1, $2, $3)
		 RETURNING id, label, date, html`,
		label,
		date,
		html,
	).Scan(&party.ID, &party.Label, &party.Date, &party.HTML)
	if err != nil {
		return Party{}, err
	}

	return party, nil
}

func (s *userStore) updateParty(ctx context.Context, id int64, label string, date time.Time, html string) (Party, error) {
	var party Party
	err := s.pool.QueryRow(
		ctx,
		`UPDATE parties
		 SET label = $2, date = $3, html = $4
		 WHERE id = $1
		 RETURNING id, label, date, html`,
		id,
		label,
		date,
		html,
	).Scan(&party.ID, &party.Label, &party.Date, &party.HTML)
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

func (s *userStore) createEvent(ctx context.Context, label string, partyID *int64, startDate *time.Time, endDate *time.Time, eventType EventType, description string) (Event, error) {
	var event Event
	var metadata []byte
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO events (label, party_id, start_date, end_date, type, description)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, label, party_id, start_date, end_date, completed_at, type, description, metadata`,
		label,
		partyID,
		startDate,
		endDate,
		eventType,
		description,
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
	return EventDetail{Event: event, Users: users, Teams: teams}, nil
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
