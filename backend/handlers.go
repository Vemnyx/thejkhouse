package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

type apiServer struct {
	store  *userStore
	auth   *authService
	images *imageUploader
}

func (s *apiServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *apiServer) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	token, err := s.auth.verifyRequestToken(r)
	if err != nil {
		log.Error("register auth", "error", err)
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	var payload registerRequest
	if err := readJSON(r, &payload); err != nil {
		log.Error("register decode", "error", err)
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	firstName := strings.TrimSpace(payload.FirstName)
	lastName := strings.TrimSpace(payload.LastName)
	if firstName == "" || lastName == "" {
		writeError(w, http.StatusBadRequest, "first name and last name are required")
		return
	}

	email, _ := token.Claims["email"].(string)
	if email == "" {
		writeError(w, http.StatusBadRequest, "firebase token is missing email")
		return
	}

	user, err := s.store.createUser(r.Context(), token.UID, email, firstName, lastName, RoleGuest)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "user already exists")
			return
		}
		log.Error("register create user", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	log.Info("user registered", "user_id", user.ID, "email", user.Email)
	writeJSONStatus(w, http.StatusCreated, user)
}

func (s *apiServer) handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}

	user, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("me load user", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	writeJSON(w, user)
}

func writeJSON(w http.ResponseWriter, payload any) {
	writeJSONStatus(w, http.StatusOK, payload)
}

func writeJSONStatus(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSONStatus(w, status, map[string]string{"error": message})
}

func methodNotAllowed(w http.ResponseWriter) {
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}
