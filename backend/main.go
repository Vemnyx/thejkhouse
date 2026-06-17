package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/Vemnyx/thejkhouse/backend/internal/db"
)

func main() {
	ctx := context.Background()

	cfg, err := db.LoadConfig(ctx)
	if err != nil {
		log.Fatalf("database config: %v", err)
	}

	if err := db.RunMigrations(ctx, cfg.ConnString); err != nil {
		log.Fatalf("database migrate: %v", err)
	}

	pool, err := db.NewPool(ctx, cfg)
	if err != nil {
		log.Fatalf("database pool: %v", err)
	}
	defer pool.Close()

	store := openUserStore(pool)
	defer store.close()

	authService, err := newAuthService(ctx)
	if err != nil {
		log.Fatalf("firebase auth: %v", err)
	}

	server := &apiServer{
		store: store,
		auth:  authService,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", server.handleHealth)
	mux.HandleFunc("/users/register", server.handleRegister)
	mux.HandleFunc("/users/me", server.handleMe)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
