package main

import (
	"context"
	"errors"

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

func (s *userStore) createUser(ctx context.Context, firebaseUID, email, firstName, lastName string, role Role) (*User, error) {
	if !role.Valid() {
		role = RoleGuest
	}

	var user User
	err := s.pool.QueryRow(
		ctx,
		`INSERT INTO users (firebase_uid, email, first_name, last_name, role)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, firebase_uid, email, first_name, last_name, role, created_at`,
		firebaseUID,
		email,
		firstName,
		lastName,
		int(role),
	).Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
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
		`SELECT id, firebase_uid, email, first_name, last_name, role, created_at
		 FROM users WHERE firebase_uid = $1`,
		firebaseUID,
	).Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&user.Role,
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
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
