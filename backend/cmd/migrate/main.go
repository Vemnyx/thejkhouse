package main

import (
	"context"

	"github.com/Vemnyx/thejkhouse/backend/internal/app"
	"github.com/Vemnyx/thejkhouse/backend/internal/db"
	"github.com/Vemnyx/thejkhouse/backend/log"
)

func main() {
	closeLog := app.InitLogging()
	defer closeLog()

	ctx := context.Background()

	cfg, err := db.LoadConfig(ctx)
	if err != nil {
		log.Fatal("database config", "error", err)
	}

	if err := db.RunMigrations(ctx, cfg.ConnString); err != nil {
		log.Fatal("database migrate", "error", err)
	}

	log.Info("database migrations applied")
}
