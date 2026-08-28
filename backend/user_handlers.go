package main

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

func (s *apiServer) handleUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}

	_, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("users list auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize users")
		return
	}
	users, err := s.store.listUsers(r.Context())
	if err != nil {
		log.Error("users list", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load users")
		return
	}

	writeJSON(w, users)
}

func (s *apiServer) handleUserByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/users/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	if len(parts) == 2 && parts[1] == "password-reset" {
		s.handleUserPasswordReset(w, r, id)
		return
	}

	if len(parts) != 1 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	if r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}

	currentUser, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("user delete auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize user delete")
		return
	}
	if currentUser.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}
	if currentUser.ID == id {
		writeError(w, http.StatusBadRequest, "you cannot delete your own account")
		return
	}

	targetUser, err := s.store.getUserByID(r.Context(), id)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		log.Error("user delete load", "error", err, "user_id", id)
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	if err := s.auth.deleteUser(r.Context(), targetUser.FirebaseUID); err != nil {
		log.Error("firebase user delete", "error", err, "user_id", id)
		writeError(w, http.StatusInternalServerError, "failed to delete auth user")
		return
	}

	if err := s.store.deleteUser(r.Context(), id); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		log.Error("user delete row", "error", err, "user_id", id)
		writeError(w, http.StatusInternalServerError, "failed to delete user")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *apiServer) handleUserPasswordReset(w http.ResponseWriter, r *http.Request, id int64) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	currentUser, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("user password reset auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize password reset")
		return
	}
	if currentUser.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}

	targetUser, err := s.store.getUserByID(r.Context(), id)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		log.Error("user password reset load", "error", err, "user_id", id)
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	resetURL, err := s.auth.passwordResetLink(r.Context(), targetUser.Email)
	if err != nil {
		log.Error("user password reset link", "error", err, "user_id", id, "email", targetUser.Email)
		writeError(w, http.StatusInternalServerError, "failed to create password reset link")
		return
	}

	htmlBody, textBody := passwordResetEmail(targetUser.FirstName, resetURL)
	if _, err := s.email.send(r.Context(), []string{targetUser.Email}, "Reset your The JK House password", htmlBody, textBody); err != nil {
		log.Error("user password reset email", "error", err, "user_id", id, "email", targetUser.Email)
		writeError(w, http.StatusInternalServerError, "failed to send password reset email")
		return
	}

	log.Info("password reset email sent", "user_id", id, "email", targetUser.Email, "host_id", currentUser.ID)
	writeJSON(w, map[string]string{"message": "password reset email sent"})
}
