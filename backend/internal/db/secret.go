package db

import (
	"context"
	"fmt"

	"github.com/Vemnyx/thejkhouse/backend/internal/secrets"
)

func databaseURLFromSecretManager(ctx context.Context, name string) (string, error) {
	u, err := secrets.AccessPayload(ctx, name)
	if err != nil {
		return "", err
	}
	if u == "" {
		return "", fmt.Errorf("db: secret %q resolved to empty connection string", name)
	}
	return u, nil
}
