package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

type createPartyRequest struct {
	Label string `json:"label"`
	Date  string `json:"date"`
	HTML  string `json:"html"`
}

func (s *apiServer) handleParties(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
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

	if r.Method == http.MethodGet {
		parties, err := s.store.listParties(r.Context())
		if err != nil {
			log.Error("party list", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load parties")
			return
		}

		writeJSON(w, parties)
		return
	}

	var req createPartyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid party request")
		return
	}

	label := strings.TrimSpace(req.Label)
	dateValue := strings.TrimSpace(req.Date)
	if label == "" || dateValue == "" {
		writeError(w, http.StatusBadRequest, "label and date are required")
		return
	}

	date, err := time.Parse(time.RFC3339, dateValue)
	if err != nil {
		writeError(w, http.StatusBadRequest, "date must be an ISO timestamp")
		return
	}

	party, err := s.store.createParty(r.Context(), label, date, req.HTML)
	if err != nil {
		log.Error("party create", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create party")
		return
	}

	writeJSON(w, party)
}
