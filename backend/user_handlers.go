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

	user, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("users list auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize users")
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
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
	if r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}

	idText := strings.TrimPrefix(r.URL.Path, "/users/")
	id, err := strconv.ParseInt(idText, 10, 64)
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid user id")
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
