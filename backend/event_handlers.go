package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

type createEventRequest struct {
	Label       string `json:"label"`
	PartyID     *int64 `json:"partyId"`
	StartDate   string `json:"startDate"`
	EndDate     string `json:"endDate"`
	Type        string `json:"type"`
	Description string `json:"description"`
}

func (s *apiServer) handleEvents(w http.ResponseWriter, r *http.Request) {
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
		log.Error("event auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize events")
		return
	}
	if r.Method == http.MethodGet {
		events, err := s.store.listEvents(r.Context())
		if err != nil {
			log.Error("event list", "error", err)
			writeError(w, http.StatusInternalServerError, "failed to load events")
			return
		}

		writeJSON(w, events)
		return
	}

	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}

	var req createEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid event request")
		return
	}

	label := strings.TrimSpace(req.Label)
	eventType := EventType(strings.TrimSpace(req.Type))
	description := strings.TrimSpace(req.Description)
	if label == "" {
		writeError(w, http.StatusBadRequest, "label is required")
		return
	}
	if !eventType.Valid() {
		writeError(w, http.StatusBadRequest, "type must be 0 or 1")
		return
	}

	startDate, err := parseOptionalEventDate(req.StartDate, "start date")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	endDate, err := parseOptionalEventDate(req.EndDate, "end date")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if (eventType == EventTypeCostumeContest || eventType == EventTypeBracket) && (startDate != nil || endDate != nil) {
		writeError(w, http.StatusBadRequest, "costume contest and bracket events cannot have start or end dates")
		return
	}

	event, err := s.store.createEvent(r.Context(), label, req.PartyID, startDate, endDate, eventType, description)
	if err != nil {
		log.Error("event create", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create event")
		return
	}

	writeJSONStatus(w, http.StatusCreated, event)
}

func parseOptionalEventDate(value string, field string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}

	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return nil, fmt.Errorf("%s must be an ISO timestamp", field)
	}
	return &parsed, nil
}
