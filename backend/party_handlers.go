package main

import (
	"net/http"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

func (s *apiServer) handleParties(w http.ResponseWriter, r *http.Request) {
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
		log.Error("party list auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize parties")
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}

	parties, err := s.store.listParties(r.Context())
	if err != nil {
		log.Error("party list", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load parties")
		return
	}

	writeJSON(w, parties)
}
