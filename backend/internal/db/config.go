package db

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
)

// Config holds PostgreSQL connection settings from the environment.
//
// Resolution order:
//  1. DATABASE_URL
//  2. DATABASE_URL_SECRET — full Secret Manager version resource name; payload
//     must be the connection string (e.g. postgres://...). Uses ADC on GCE.
//  3. PGHOST, PGUSER, PGPASSWORD, PGDATABASE (optional: PGPORT, PGSSLMODE).
type Config struct {
	ConnString string
}

// LoadConfig reads connection settings from the environment (and optionally
// Secret Manager when DATABASE_URL_SECRET is set).
func LoadConfig(ctx context.Context) (Config, error) {
	if u := strings.TrimSpace(os.Getenv("DATABASE_URL")); u != "" {
		return Config{ConnString: u}, nil
	}

	if name := strings.TrimSpace(os.Getenv("DATABASE_URL_SECRET")); name != "" {
		u, err := databaseURLFromSecretManager(ctx, name)
		if err != nil {
			return Config{}, err
		}
		if u == "" {
			return Config{}, fmt.Errorf("db: secret %q resolved to empty connection string", name)
		}
		return Config{ConnString: u}, nil
	}

	host := strings.TrimSpace(os.Getenv("PGHOST"))
	user := strings.TrimSpace(os.Getenv("PGUSER"))
	password := os.Getenv("PGPASSWORD")
	dbname := strings.TrimSpace(os.Getenv("PGDATABASE"))
	if host == "" || user == "" || dbname == "" {
		return Config{}, fmt.Errorf("db: set DATABASE_URL or PGHOST, PGUSER, PGPASSWORD, and PGDATABASE")
	}

	port := strings.TrimSpace(os.Getenv("PGPORT"))
	if port == "" {
		port = "5432"
	}

	sslmode := strings.TrimSpace(os.Getenv("PGSSLMODE"))
	if sslmode == "" {
		sslmode = "require"
	}

	u := url.URL{
		Scheme: "postgres",
		Host:   fmt.Sprintf("%s:%s", host, port),
		Path:   "/" + dbname,
	}
	if password != "" {
		u.User = url.UserPassword(user, password)
	} else {
		u.User = url.User(user)
	}

	q := url.Values{}
	q.Set("sslmode", sslmode)
	u.RawQuery = q.Encode()

	return Config{ConnString: u.String()}, nil
}
