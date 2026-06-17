package main

import (
	"context"
	"log"
	"net/http"
	"os"
)

func main() {
	ctx := context.Background()

	store, err := openUserStore()
	if err != nil {
		log.Fatalf("database: %v", err)
	}
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
