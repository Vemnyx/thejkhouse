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
	Birthday  string `json:"birthday"`
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

type resendConfirmationRequest struct {
	Email string `json:"email"`
}

type resetPasswordRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
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
			_, pendingErr := s.store.getPendingSignupByFirebaseUID(r.Context(), session.LocalID)
			if pendingErr == nil {
				writeErrorCode(w, http.StatusForbidden, "pending_confirmation", "check your email for the confirmation link")
				return
			}
			if !isNotFound(pendingErr) {
				log.Error("auth login load pending", "error", pendingErr, "email", email)
				writeError(w, http.StatusInternalServerError, "failed to load user")
				return
			}

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
	birthday, err := parseBirthday(payload.Birthday)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	session, err := s.auth.identity.SignUp(r.Context(), email, password)
	if err != nil {
		log.Error("auth signup firebase", "error", err, "email", email)
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	token, tokenHash, err := newPendingSignupToken()
	if err != nil {
		log.Error("auth signup token", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to create confirmation")
		return
	}

	expiresAt := time.Now().UTC().Add(24 * time.Hour)
	pending, err := s.store.upsertPendingSignup(r.Context(), session.LocalID, session.Email, firstName, lastName, birthday, RoleGuest, tokenHash, expiresAt)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "account is already pending confirmation")
			return
		}
		log.Error("auth signup pending", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to create confirmation")
		return
	}

	if err := s.sendSignupConfirmation(r.Context(), pending, token); err != nil {
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
		writeError(w, http.StatusBadRequest, "confirmation link has expired")
		return
	}
	if pending.FirebaseUID == "" {
		writeError(w, http.StatusBadRequest, "confirmation link is no longer valid")
		return
	}

	user, err := s.store.confirmUserByEmail(r.Context(), pending.FirebaseUID, pending.Email, pending.FirstName, pending.LastName, pending.Birthday, pending.Role)
	if err != nil {
		log.Error("auth confirm create user", "error", err, "email", pending.Email)
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	if err := s.store.deletePendingSignup(r.Context(), pending.ID); err != nil {
		log.Error("auth confirm delete pending", "error", err, "email", pending.Email)
	}

	response, err := s.buildAuthSession(r.Context(), pending.FirebaseUID, user)
	if err != nil {
		log.Error("auth confirm token", "error", err, "email", pending.Email)
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	log.Info("user registered", "user_id", user.ID, "email", user.Email)
	writeJSONStatus(w, http.StatusCreated, response)
}

func (s *apiServer) handleAuthResendConfirmation(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var payload resendConfirmationRequest
	if err := readJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, errInvalidBody.Error())
		return
	}

	email := strings.TrimSpace(payload.Email)
	if email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}

	pending, err := s.store.getPendingSignupByEmail(r.Context(), email)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "confirmation is not pending")
			return
		}
		log.Error("auth resend load pending", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to resend confirmation")
		return
	}

	token, tokenHash, err := newPendingSignupToken()
	if err != nil {
		log.Error("auth resend token", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to resend confirmation")
		return
	}

	expiresAt := time.Now().UTC().Add(24 * time.Hour)
	pending, err = s.store.upsertPendingSignup(r.Context(), pending.FirebaseUID, pending.Email, pending.FirstName, pending.LastName, pending.Birthday, pending.Role, tokenHash, expiresAt)
	if err != nil {
		log.Error("auth resend update pending", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to resend confirmation")
		return
	}

	if err := s.sendSignupConfirmation(r.Context(), pending, token); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resend confirmation email")
		return
	}

	writeJSON(w, authSignupPendingResponse{Message: "check your email to confirm your account"})
}

func (s *apiServer) handleAuthResetPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var payload resetPasswordRequest
	if err := readJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, errInvalidBody.Error())
		return
	}

	token := strings.TrimSpace(payload.Token)
	password := payload.Password
	if token == "" || password == "" {
		writeError(w, http.StatusBadRequest, "token and password are required")
		return
	}
	if len(password) < 6 {
		writeError(w, http.StatusBadRequest, "password must be at least 6 characters")
		return
	}

	pending, err := s.store.getPendingPasswordResetByTokenHash(r.Context(), pendingSignupTokenHash(token))
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusBadRequest, "password reset link is invalid")
			return
		}
		log.Error("auth reset password load pending", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}
	if time.Now().UTC().After(pending.ExpiresAt) {
		writeError(w, http.StatusBadRequest, "password reset link has expired")
		return
	}

	user, err := s.store.getUserByID(r.Context(), pending.UserID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusBadRequest, "password reset link is no longer valid")
			return
		}
		log.Error("auth reset password load user", "error", err, "user_id", pending.UserID)
		writeError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}

	if err := s.auth.updateUserPassword(r.Context(), user.FirebaseUID, password); err != nil {
		log.Error("auth reset password update", "error", err, "user_id", user.ID, "email", user.Email)
		writeError(w, http.StatusInternalServerError, "failed to reset password")
		return
	}

	if err := s.store.deletePendingPasswordReset(r.Context(), pending.ID); err != nil {
		log.Error("auth reset password cleanup", "error", err, "pending_id", pending.ID)
	}

	log.Info("password reset completed", "user_id", user.ID, "email", user.Email)
	writeJSON(w, map[string]string{"message": "password updated"})
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

func (s *apiServer) sendSignupConfirmation(ctx context.Context, pending *PendingSignup, token string) error {
	confirmURL := signupConfirmationURL(token)
	htmlBody, textBody := signupConfirmationEmail(pending.FirstName, confirmURL)
	_, err := s.email.send(ctx, []string{pending.Email}, "Confirm your The JK House account", htmlBody, textBody)
	if err != nil {
		log.Error("auth confirmation email", "error", err, "email", pending.Email)
		return err
	}

	log.Info("signup confirmation sent", "email", pending.Email)
	return nil
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
