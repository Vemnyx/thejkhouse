package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

type messageResponse struct {
	Message string `json:"message"`
}

type healthResponse struct {
	Status string `json:"status"`
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, healthResponse{Status: "ok"})
	})

	mux.HandleFunc("/message", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, messageResponse{Message: "Welcome to The JK House!"})
	})

	log.Printf("listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func writeJSON(w http.ResponseWriter, payload any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}
