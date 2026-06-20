package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
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

type updateEventRequest struct {
	Metadata    json.RawMessage `json:"metadata"`
	StartNow    bool            `json:"startNow"`
	CompleteNow bool            `json:"completeNow"`
}

type upsertContestantRequest struct {
	UserIDs  []int32 `json:"userIds"`
	TeamName string  `json:"teamName"`
	Costume  string  `json:"costume"`
	Team     bool    `json:"team"`
}

type upsertContestantResponse struct {
	Detail EventDetail `json:"detail"`
	Team   *EventTeam  `json:"team,omitempty"`
}

type deleteContestantRequest struct {
	UserIDs []int32 `json:"userIds"`
	TeamID  *int64  `json:"teamId"`
}

type eventVoteRequest struct {
	Metadata json.RawMessage `json:"metadata"`
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

func (s *apiServer) handleEventByID(w http.ResponseWriter, r *http.Request) {
	id, suffix, ok := parseEventPath(w, r)
	if !ok {
		return
	}

	user, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("event detail auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize event")
		return
	}

	if suffix == "/contestants" {
		s.handleEventContestants(w, r, id, user)
		return
	}
	if suffix == "/votes" {
		s.handleEventVotes(w, r, id, user)
		return
	}
	if suffix != "" {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}

	switch r.Method {
	case http.MethodGet:
		detail, err := s.store.getEventDetail(r.Context(), id)
		if err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusNotFound, "event not found")
				return
			}
			log.Error("event detail", "error", err, "event_id", id)
			writeError(w, http.StatusInternalServerError, "failed to load event")
			return
		}
		writeJSON(w, detail)
	case http.MethodPatch:
		if user.Role != RoleHost {
			writeError(w, http.StatusForbidden, "host access is required")
			return
		}
		var req updateEventRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid event update")
			return
		}
		var event Event
		if req.StartNow {
			event, err = s.store.startEvent(r.Context(), id, time.Now().UTC())
		} else if req.CompleteNow {
			event, err = s.store.completeEvent(r.Context(), id, time.Now().UTC())
		} else if len(req.Metadata) > 0 {
			if !json.Valid(req.Metadata) {
				writeError(w, http.StatusBadRequest, "metadata must be valid json")
				return
			}
			event, err = s.store.updateEventMetadata(r.Context(), id, req.Metadata)
		} else {
			writeError(w, http.StatusBadRequest, "event update is required")
			return
		}
		if err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusNotFound, "event not found")
				return
			}
			log.Error("event update", "error", err, "event_id", id)
			writeError(w, http.StatusInternalServerError, "failed to update event")
			return
		}
		writeJSON(w, event)
	default:
		methodNotAllowed(w)
	}
}

func (s *apiServer) handleEventVotes(w http.ResponseWriter, r *http.Request, eventID int64, user *User) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	if r.Method == http.MethodGet {
		event, err := s.store.getEventByID(r.Context(), eventID)
		if err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusNotFound, "event not found")
				return
			}
			log.Error("event vote event load", "error", err, "event_id", eventID)
			writeError(w, http.StatusInternalServerError, "failed to load event")
			return
		}
		if event.CompletedAt == nil {
			writeError(w, http.StatusForbidden, "event results are not available yet")
			return
		}
		votes, err := s.store.listEventVotes(r.Context(), eventID)
		if err != nil {
			log.Error("event votes list", "error", err, "event_id", eventID)
			writeError(w, http.StatusInternalServerError, "failed to load votes")
			return
		}
		writeJSON(w, votes)
		return
	}

	var req eventVoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid vote request")
		return
	}
	if len(req.Metadata) == 0 || !json.Valid(req.Metadata) {
		writeError(w, http.StatusBadRequest, "metadata must be valid json")
		return
	}

	vote, err := s.store.upsertEventVote(r.Context(), eventID, user.ID, req.Metadata)
	if err != nil {
		log.Error("event vote upsert", "error", err, "event_id", eventID, "user_id", user.ID)
		writeError(w, http.StatusInternalServerError, "failed to save vote")
		return
	}

	writeJSON(w, vote)
}

func (s *apiServer) handleEventContestants(w http.ResponseWriter, r *http.Request, eventID int64, user *User) {
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}

	switch r.Method {
	case http.MethodPost:
		var req upsertContestantRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid contestant request")
			return
		}
		if len(req.UserIDs) == 0 {
			writeError(w, http.StatusBadRequest, "at least one user is required")
			return
		}
		userIDs, err := normalizeImageUserIDs(req.UserIDs)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		var team *EventTeam
		if req.Team {
			name := strings.TrimSpace(req.TeamName)
			if name == "" {
				writeError(w, http.StatusBadRequest, "team name is required")
				return
			}
			created, err := s.store.createEventTeam(r.Context(), eventID, name, userIDs)
			if err != nil {
				log.Error("event team create", "error", err, "event_id", eventID)
				writeError(w, http.StatusInternalServerError, "failed to create event team")
				return
			}
			team = &created
		}
		costume := strings.TrimSpace(req.Costume)
		for _, userID := range userIDs {
			metadata := json.RawMessage([]byte("{}"))
			if !req.Team && costume != "" {
				raw, _ := json.Marshal(map[string]string{"costume": costume})
				metadata = raw
			}
			if _, err := s.store.upsertEventUser(r.Context(), eventID, int64(userID), true, metadata); err != nil {
				log.Error("event user upsert", "error", err, "event_id", eventID, "user_id", userID)
				writeError(w, http.StatusInternalServerError, "failed to save contestant")
				return
			}
		}
		detail, err := s.store.getEventDetail(r.Context(), eventID)
		if err != nil {
			log.Error("event detail reload", "error", err, "event_id", eventID)
			writeError(w, http.StatusInternalServerError, "failed to load event")
			return
		}
		writeJSONStatus(w, http.StatusCreated, upsertContestantResponse{Detail: detail, Team: team})
	case http.MethodDelete:
		var req deleteContestantRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid contestant delete")
			return
		}
		userIDs, err := normalizeImageUserIDs(req.UserIDs)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		if len(userIDs) == 0 && req.TeamID == nil {
			writeError(w, http.StatusBadRequest, "contestant is required")
			return
		}
		if err := s.store.deleteEventContestant(r.Context(), eventID, userIDs, req.TeamID); err != nil {
			log.Error("event contestant delete", "error", err, "event_id", eventID)
			writeError(w, http.StatusInternalServerError, "failed to remove contestant")
			return
		}
		detail, err := s.store.getEventDetail(r.Context(), eventID)
		if err != nil {
			log.Error("event detail reload", "error", err, "event_id", eventID)
			writeError(w, http.StatusInternalServerError, "failed to load event")
			return
		}
		writeJSON(w, detail)
	default:
		methodNotAllowed(w)
	}
}

func parseEventPath(w http.ResponseWriter, r *http.Request) (int64, string, bool) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/events/")
	idText, suffix, _ := strings.Cut(trimmed, "/")
	id, err := strconv.ParseInt(idText, 10, 64)
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid event id")
		return 0, "", false
	}
	if suffix != "" {
		suffix = "/" + suffix
	}
	return id, suffix, true
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
