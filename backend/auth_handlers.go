package main

import (
	"context"
	"net/http"
	"strings"
	"time"

	fbidentity "github.com/Vemnyx/thejkhouse/backend/internal/firebase"
	"github.com/Vemnyx/thejkhouse/backend/log"
)

type authCredentialRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authSignupRequest struct {
	Email     string `json:"email"`
	Password  string `json:"password"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
}

type authSessionResponse struct {
	CustomToken string `json:"customToken"`
	User        User   `json:"user"`
}

type authSignupPendingResponse struct {
	Message string `json:"message"`
}

type confirmSignupRequest struct {
	Token string `json:"token"`
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

	user, err := s.store.getUserByFirebaseUID(r.Context(), session.LocalID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "account not found")
			return
		}
		log.Error("auth login load user", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	response, err := s.buildAuthSession(r.Context(), session.LocalID, user)
	if err != nil {
		log.Error("auth login token", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	writeJSON(w, response)
}

func (s *apiServer) handleAuthSignup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var payload authSignupRequest
	if err := readJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, errInvalidBody.Error())
		return
	}

	email := strings.TrimSpace(payload.Email)
	password := payload.Password
	firstName := strings.TrimSpace(payload.FirstName)
	lastName := strings.TrimSpace(payload.LastName)
	if email == "" || password == "" {
		writeError(w, http.StatusBadRequest, errMissingCredentials.Error())
		return
	}
	if firstName == "" || lastName == "" {
		writeError(w, http.StatusBadRequest, "first name and last name are required")
		return
	}

	token, tokenHash, err := newPendingSignupToken()
	if err != nil {
		log.Error("auth signup token", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to create confirmation")
		return
	}

	encryptedPassword, err := s.pendingSignups.encrypt(password)
	if err != nil {
		log.Error("auth signup encrypt", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to create confirmation")
		return
	}

	expiresAt := time.Now().UTC().Add(24 * time.Hour)
	_, err = s.store.upsertPendingSignup(r.Context(), email, firstName, lastName, RoleGuest, encryptedPassword, tokenHash, expiresAt)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "account is already pending confirmation")
			return
		}
		log.Error("auth signup pending", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to create confirmation")
		return
	}

	confirmURL := signupConfirmationURL(token)
	htmlBody, textBody := signupConfirmationEmail(firstName, confirmURL)
	_, err = s.email.send(r.Context(), []string{email}, "Confirm your The JK House account", htmlBody, textBody)
	if err != nil {
		log.Error("auth signup email", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to send confirmation email")
		return
	}

	log.Info("signup confirmation sent", "email", email)
	writeJSONStatus(w, http.StatusAccepted, authSignupPendingResponse{Message: "check your email to confirm your account"})
}

func (s *apiServer) handleAuthConfirmSignup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var payload confirmSignupRequest
	if err := readJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, errInvalidBody.Error())
		return
	}

	token := strings.TrimSpace(payload.Token)
	if token == "" {
		writeError(w, http.StatusBadRequest, "confirmation token is required")
		return
	}

	pending, err := s.store.getPendingSignupByTokenHash(r.Context(), pendingSignupTokenHash(token))
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusBadRequest, "confirmation link is invalid")
			return
		}
		log.Error("auth confirm load pending", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to confirm account")
		return
	}
	if time.Now().UTC().After(pending.ExpiresAt) {
		_ = s.store.deletePendingSignup(r.Context(), pending.ID)
		writeError(w, http.StatusBadRequest, "confirmation link has expired")
		return
	}

	password, err := s.pendingSignups.decrypt(pending.EncryptedPassword)
	if err != nil {
		log.Error("auth confirm decrypt", "error", err, "email", pending.Email)
		writeError(w, http.StatusInternalServerError, "failed to confirm account")
		return
	}

	session, err := s.auth.identity.SignUp(r.Context(), pending.Email, password)
	if err != nil {
		log.Error("auth confirm firebase signup", "error", err, "email", pending.Email)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	user, err := s.store.createUser(r.Context(), session.LocalID, session.Email, pending.FirstName, pending.LastName, pending.Role)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "user already exists")
			return
		}
		log.Error("auth confirm create user", "error", err, "email", pending.Email)
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	if err := s.store.deletePendingSignup(r.Context(), pending.ID); err != nil {
		log.Error("auth confirm delete pending", "error", err, "email", pending.Email)
	}

	response, err := s.buildAuthSession(r.Context(), session.LocalID, user)
	if err != nil {
		log.Error("auth confirm token", "error", err, "email", pending.Email)
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	log.Info("user registered", "user_id", user.ID, "email", user.Email)
	writeJSONStatus(w, http.StatusCreated, response)
}

func (s *apiServer) handleAuthSession(w http.ResponseWriter, r *http.Request) {
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
		log.Error("auth session", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load session")
		return
	}

	writeJSON(w, user)
}

func (s *apiServer) buildAuthSession(ctx context.Context, firebaseUID string, user *User) (authSessionResponse, error) {
	token, err := s.auth.createCustomToken(ctx, firebaseUID)
	if err != nil {
		return authSessionResponse{}, err
	}

	return authSessionResponse{
		CustomToken: token,
		User:        *user,
	}, nil
}

func (s *apiServer) loadUserFromRequest(r *http.Request) (*User, error) {
	token, err := s.auth.verifyRequestToken(r)
	if err != nil {
		return nil, &authRequestError{status: http.StatusUnauthorized, message: err.Error()}
	}

	user, err := s.store.getUserByFirebaseUID(r.Context(), token.UID)
	if err != nil {
		if isNotFound(err) {
			return nil, &authRequestError{status: http.StatusNotFound, message: "user not found"}
		}
		return nil, err
	}

	return user, nil
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

type authRequestError struct {
	status  int
	message string
}

func (e *authRequestError) Error() string {
	return e.message
}
