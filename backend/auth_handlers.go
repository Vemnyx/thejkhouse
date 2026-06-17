package main

import (
	"net/http"
	"strings"

	fbidentity "github.com/Vemnyx/thejkhouse/backend/internal/firebase"
	"github.com/Vemnyx/thejkhouse/backend/log"
)

type authCredentialRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authTokenResponse struct {
	CustomToken string `json:"customToken"`
	Email       string `json:"email"`
}

func (s *apiServer) handleAuthConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}

	cfg, err := fbidentity.LoadWebConfig(r.Context())
	if err != nil {
		log.Error("auth config", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load firebase config")
		return
	}

	writeJSON(w, cfg)
}

func (s *apiServer) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	email, password, err := readAuthCredentials(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, err := s.auth.identity.SignInWithPassword(r.Context(), email, password)
	if err != nil {
		log.Error("auth login", "error", err, "email", email)
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	token, err := s.auth.createCustomToken(r.Context(), session.LocalID)
	if err != nil {
		log.Error("auth login token", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	writeJSON(w, authTokenResponse{CustomToken: token, Email: session.Email})
}

func (s *apiServer) handleAuthSignup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	email, password, err := readAuthCredentials(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, err := s.auth.identity.SignUp(r.Context(), email, password)
	if err != nil {
		log.Error("auth signup", "error", err, "email", email)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	token, err := s.auth.createCustomToken(r.Context(), session.LocalID)
	if err != nil {
		log.Error("auth signup token", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	writeJSONStatus(w, http.StatusCreated, authTokenResponse{CustomToken: token, Email: session.Email})
}

func readAuthCredentials(r *http.Request) (string, string, error) {
	var payload authCredentialRequest
	if err := readJSON(r, &payload); err != nil {
		return "", "", errInvalidBody
	}

	email := strings.TrimSpace(payload.Email)
	password := payload.Password
	if email == "" || password == "" {
		return "", "", errMissingCredentials
	}

	return email, password, nil
}
