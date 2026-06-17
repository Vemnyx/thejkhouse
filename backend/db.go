package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"time"

	_ "modernc.org/sqlite"
)

type userStore struct {
	db *sql.DB
}

func openUserStore() (*userStore, error) {
	path := os.Getenv("DATABASE_PATH")
	if path == "" {
		path = "thejkhouse.db"
	}

	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	store := &userStore{db: db}
	if err := store.migrate(); err != nil {
		return nil, err
	}

	return store, nil
}

func (s *userStore) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			firebase_uid TEXT NOT NULL UNIQUE,
			email TEXT NOT NULL UNIQUE,
			first_name TEXT NOT NULL,
			last_name TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'guest' CHECK (role IN ('host', 'guest')),
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
	`)
	return err
}

func (s *userStore) createUser(ctx context.Context, firebaseUID, email, firstName, lastName string, role Role) (*User, error) {
	if !role.Valid() {
		role = RoleGuest
	}

	result, err := s.db.ExecContext(
		ctx,
		`INSERT INTO users (firebase_uid, email, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)`,
		firebaseUID,
		email,
		firstName,
		lastName,
		string(role),
	)
	if err != nil {
		return nil, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return nil, err
	}

	return s.getUserByID(ctx, id)
}

func (s *userStore) getUserByFirebaseUID(ctx context.Context, firebaseUID string) (*User, error) {
	row := s.db.QueryRowContext(
		ctx,
		`SELECT id, firebase_uid, email, first_name, last_name, role, created_at FROM users WHERE firebase_uid = ?`,
		firebaseUID,
	)
	return scanUser(row)
}

func (s *userStore) getUserByID(ctx context.Context, id int64) (*User, error) {
	row := s.db.QueryRowContext(
		ctx,
		`SELECT id, firebase_uid, email, first_name, last_name, role, created_at FROM users WHERE id = ?`,
		id,
	)
	return scanUser(row)
}

func scanUser(row *sql.Row) (*User, error) {
	var user User
	var role string
	var createdAt string

	if err := row.Scan(
		&user.ID,
		&user.FirebaseUID,
		&user.Email,
		&user.FirstName,
		&user.LastName,
		&role,
		&createdAt,
	); err != nil {
		return nil, err
	}

	user.Role = Role(role)
	parsed, err := time.Parse("2006-01-02 15:04:05", createdAt)
	if err != nil {
		user.CreatedAt = time.Now().UTC()
	} else {
		user.CreatedAt = parsed.UTC()
	}

	return &user, nil
}

func (s *userStore) close() error {
	return s.db.Close()
}
