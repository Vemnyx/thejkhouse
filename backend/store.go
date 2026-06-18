package main

import (
	"context"
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

func (s *userStore) createImage(ctx context.Context, imageURL string, date time.Time, partyID *int64, homepage bool) (*Image, error) {
	var image Image
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO images (image_url, date, party_id, homepage)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, image_url, date, party_id, homepage, uploaded_at`,
		imageURL,
		date,
		partyID,
		homepage,
	).Scan(
		&image.ID,
		&image.ImageURL,
		&image.Date,
		&image.PartyID,
		&image.Homepage,
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
		`SELECT id, image_url, date, party_id, homepage, uploaded_at
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
		if err := rows.Scan(&image.ID, &image.ImageURL, &image.Date, &image.PartyID, &image.Homepage, &image.UploadedAt); err != nil {
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
		`SELECT id, image_url, date, party_id, homepage, uploaded_at
		 FROM images WHERE id = $1`,
		id,
	).Scan(&image.ID, &image.ImageURL, &image.Date, &image.PartyID, &image.Homepage, &image.UploadedAt)
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
		`SELECT id, label, date, image_url, partiful_url
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
		if err := rows.Scan(&party.ID, &party.Label, &party.Date, &party.ImageURL, &party.PartifulURL); err != nil {
			return nil, err
		}
		parties = append(parties, party)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return parties, nil
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
		`SELECT id, image_url, date, party_id, homepage, uploaded_at
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
		if err := rows.Scan(&image.ID, &image.ImageURL, &image.Date, &image.PartyID, &image.Homepage, &image.UploadedAt); err != nil {
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
