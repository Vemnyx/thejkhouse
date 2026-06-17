package db

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"

	"github.com/golang-migrate/migrate/v4"
	pgxmigrate "github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"

	_ "github.com/jackc/pgx/v5/stdlib"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// RunMigrations applies embedded SQL migrations using the same connection string as the pool.
func RunMigrations(ctx context.Context, connString string) error {
	sqldb, err := sql.Open("pgx", connString)
	if err != nil {
		return fmt.Errorf("db migrate: sql open: %w", err)
	}

	if err := sqldb.PingContext(ctx); err != nil {
		_ = sqldb.Close()
		return fmt.Errorf("db migrate: ping: %w", err)
	}

	sourceDrv, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		_ = sqldb.Close()
		return fmt.Errorf("db migrate: iofs: %w", err)
	}

	dbDrv, err := pgxmigrate.WithInstance(sqldb, &pgxmigrate.Config{})
	if err != nil {
		_ = sqldb.Close()
		return fmt.Errorf("db migrate: pgx driver: %w", err)
	}

	m, err := migrate.NewWithInstance("iofs", sourceDrv, "pgx5", dbDrv)
	if err != nil {
		_ = sqldb.Close()
		return fmt.Errorf("db migrate: new: %w", err)
	}
	defer func() { _, _ = m.Close() }()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("db migrate: up: %w", err)
	}
	return nil
}
