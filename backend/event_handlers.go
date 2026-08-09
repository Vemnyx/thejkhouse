package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

type createEventRequest struct {
	Label       string          `json:"label"`
	PartyID     *int64          `json:"partyId"`
	StartDate   string          `json:"startDate"`
	EndDate     string          `json:"endDate"`
	Type        string          `json:"type"`
	Description string          `json:"description"`
	Metadata    json.RawMessage `json:"metadata"`
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

type eventAttendeeRequest struct {
	UserID   *int64          `json:"userId"`
	Metadata json.RawMessage `json:"metadata"`
}

type deleteContestantRequest struct {
	UserIDs []int32 `json:"userIds"`
	TeamID  *int64  `json:"teamId"`
}

type eventVoteRequest struct {
	Metadata json.RawMessage `json:"metadata"`
}

type bracketParticipant struct {
	Key     string  `json:"key"`
	Type    string  `json:"type"`
	UserIDs []int32 `json:"userIds"`
	TeamID  *int64  `json:"teamId,omitempty"`
	Label   string  `json:"label"`
}

type bracketRoundSeed struct {
	RoundNumber    int32
	Position       int32
	ParticipantOne json.RawMessage
	ParticipantTwo json.RawMessage
}

type startBracketRequest struct {
	Participants []bracketParticipant `json:"participants"`
}

type reportBracketRequest struct {
	RoundID   int64  `json:"roundId"`
	WinnerKey string `json:"winnerKey"`
}

type bracketRoundMetadata struct {
	Reports map[string]string `json:"reports"`
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
	metadata := req.Metadata
	if len(metadata) == 0 {
		metadata = json.RawMessage([]byte("{}"))
	}
	if !json.Valid(metadata) {
		writeError(w, http.StatusBadRequest, "metadata must be valid json")
		return
	}

	event, err := s.store.createEvent(r.Context(), label, req.PartyID, startDate, endDate, eventType, description, metadata)
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
	if suffix == "/attendees" {
		s.handleEventAttendees(w, r, id, user)
		return
	}
	if suffix == "/bracket/start" {
		s.handleBracketStart(w, r, id, user)
		return
	}
	if suffix == "/bracket/report" {
		s.handleBracketReport(w, r, id, user)
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
	case http.MethodDelete:
		if user.Role != RoleHost {
			writeError(w, http.StatusForbidden, "host access is required")
			return
		}
		if err := s.store.deleteEvent(r.Context(), id); err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusNotFound, "event not found")
				return
			}
			log.Error("event delete", "error", err, "event_id", id)
			writeError(w, http.StatusInternalServerError, "failed to delete event")
			return
		}
		w.WriteHeader(http.StatusNoContent)
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

func (s *apiServer) handleEventAttendees(w http.ResponseWriter, r *http.Request, eventID int64, user *User) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost && r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}

	if _, err := s.store.getEventByID(r.Context(), eventID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "event not found")
			return
		}
		log.Error("event attendees event load", "error", err, "event_id", eventID)
		writeError(w, http.StatusInternalServerError, "failed to load event")
		return
	}

	switch r.Method {
	case http.MethodGet:
		attendees, err := s.store.listEventAttendees(r.Context(), eventID)
		if err != nil {
			log.Error("event attendees list", "error", err, "event_id", eventID)
			writeError(w, http.StatusInternalServerError, "failed to load attendees")
			return
		}
		writeJSON(w, attendees)
	case http.MethodPost:
		var req eventAttendeeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid attendee request")
			return
		}
		targetUserID := user.ID
		if req.UserID != nil {
			if *req.UserID < 1 {
				writeError(w, http.StatusBadRequest, "userId is invalid")
				return
			}
			if user.Role != RoleHost && *req.UserID != user.ID {
				writeError(w, http.StatusForbidden, "you can only add yourself as an attendee")
				return
			}
			targetUserID = *req.UserID
		}
		if _, err := s.store.getUserByID(r.Context(), targetUserID); err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusBadRequest, "user not found")
				return
			}
			log.Error("event attendee user load", "error", err, "user_id", targetUserID)
			writeError(w, http.StatusInternalServerError, "failed to load user")
			return
		}
		metadata := req.Metadata
		if len(metadata) == 0 {
			metadata = json.RawMessage([]byte("{}"))
		}
		if !json.Valid(metadata) {
			writeError(w, http.StatusBadRequest, "metadata must be valid json")
			return
		}
		attendee, err := s.store.upsertEventAttendee(r.Context(), eventID, targetUserID, metadata)
		if err != nil {
			log.Error("event attendee upsert", "error", err, "event_id", eventID, "user_id", targetUserID)
			writeError(w, http.StatusInternalServerError, "failed to save attendee")
			return
		}
		writeJSONStatus(w, http.StatusCreated, attendee)
	case http.MethodDelete:
		var req eventAttendeeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid attendee delete")
			return
		}
		targetUserID := user.ID
		if req.UserID != nil {
			if *req.UserID < 1 {
				writeError(w, http.StatusBadRequest, "userId is invalid")
				return
			}
			if user.Role != RoleHost && *req.UserID != user.ID {
				writeError(w, http.StatusForbidden, "you can only remove yourself as an attendee")
				return
			}
			targetUserID = *req.UserID
		}
		if err := s.store.deleteEventAttendee(r.Context(), eventID, targetUserID); err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusNotFound, "attendee not found")
				return
			}
			log.Error("event attendee delete", "error", err, "event_id", eventID, "user_id", targetUserID)
			writeError(w, http.StatusInternalServerError, "failed to remove attendee")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func (s *apiServer) handleBracketStart(w http.ResponseWriter, r *http.Request, eventID int64, user *User) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}

	var req startBracketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid bracket start request")
		return
	}
	if len(req.Participants) < 2 || len(req.Participants)%2 != 0 {
		writeError(w, http.StatusBadRequest, "bracket requires an even number of participants")
		return
	}
	rounds, err := firstBracketRoundSeeds(req.Participants)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := s.store.replaceEventRounds(r.Context(), eventID, rounds, time.Now().UTC()); err != nil {
		log.Error("bracket start", "error", err, "event_id", eventID)
		writeError(w, http.StatusInternalServerError, "failed to start bracket")
		return
	}
	detail, err := s.store.getEventDetail(r.Context(), eventID)
	if err != nil {
		log.Error("bracket detail reload", "error", err, "event_id", eventID)
		writeError(w, http.StatusInternalServerError, "failed to load bracket")
		return
	}
	writeJSON(w, detail)
}

func (s *apiServer) handleBracketReport(w http.ResponseWriter, r *http.Request, eventID int64, user *User) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var req reportBracketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid bracket report request")
		return
	}
	winnerKey := strings.TrimSpace(req.WinnerKey)
	if req.RoundID < 1 || winnerKey == "" {
		writeError(w, http.StatusBadRequest, "round and winner are required")
		return
	}
	rounds, err := s.store.listEventRounds(r.Context(), eventID)
	if err != nil {
		log.Error("bracket rounds list", "error", err, "event_id", eventID)
		writeError(w, http.StatusInternalServerError, "failed to load bracket")
		return
	}
	var target *EventRound
	for index := range rounds {
		if rounds[index].ID == req.RoundID {
			target = &rounds[index]
			break
		}
	}
	if target == nil {
		writeError(w, http.StatusNotFound, "round not found")
		return
	}
	if target.CompletedAt != nil {
		detail, err := s.store.getEventDetail(r.Context(), eventID)
		if err != nil {
			log.Error("bracket detail reload", "error", err, "event_id", eventID)
			writeError(w, http.StatusInternalServerError, "failed to load bracket")
			return
		}
		writeJSON(w, detail)
		return
	}
	participantOne, err := bracketParticipantFromRaw(target.ParticipantOne)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invalid bracket participant")
		return
	}
	participantTwo, err := bracketParticipantFromRaw(target.ParticipantTwo)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "invalid bracket participant")
		return
	}
	reportSide := participantReportSide(user.ID, participantOne, participantTwo)
	if reportSide == "" {
		writeError(w, http.StatusForbidden, "only players in this round can report a winner")
		return
	}
	if winnerKey != participantOne.Key && winnerKey != participantTwo.Key {
		writeError(w, http.StatusBadRequest, "winner must be in this round")
		return
	}
	metadata := bracketRoundMetadata{Reports: map[string]string{}}
	if len(target.Metadata) > 0 {
		_ = json.Unmarshal(target.Metadata, &metadata)
	}
	if metadata.Reports == nil {
		metadata.Reports = map[string]string{}
	}
	metadata.Reports[reportSide] = winnerKey
	rawMetadata, _ := json.Marshal(metadata)
	updated, err := s.store.updateEventRoundReport(r.Context(), eventID, req.RoundID, rawMetadata)
	if err != nil {
		log.Error("bracket report", "error", err, "event_id", eventID, "round_id", req.RoundID)
		writeError(w, http.StatusInternalServerError, "failed to save report")
		return
	}
	if reportedWinner, ok := agreedBracketWinner(updated); ok {
		winner := participantOne
		if reportedWinner == participantTwo.Key {
			winner = participantTwo
		}
		rawWinner, _ := json.Marshal(winner)
		if err := s.store.completeEventRound(r.Context(), eventID, req.RoundID, rawWinner, time.Now().UTC()); err != nil {
			log.Error("bracket round complete", "error", err, "event_id", eventID, "round_id", req.RoundID)
			writeError(w, http.StatusInternalServerError, "failed to complete round")
			return
		}
		if err := s.advanceBracketIfReady(r.Context(), eventID, target.RoundNumber); err != nil {
			log.Error("bracket advance", "error", err, "event_id", eventID, "round", target.RoundNumber)
			writeError(w, http.StatusInternalServerError, "failed to advance bracket")
			return
		}
	}
	detail, err := s.store.getEventDetail(r.Context(), eventID)
	if err != nil {
		log.Error("bracket detail reload", "error", err, "event_id", eventID)
		writeError(w, http.StatusInternalServerError, "failed to load bracket")
		return
	}
	writeJSON(w, detail)
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
		if !req.Team {
			costume := strings.TrimSpace(req.Costume)
			for _, userID := range userIDs {
				metadata := json.RawMessage([]byte("{}"))
				if costume != "" {
					raw, _ := json.Marshal(map[string]string{"costume": costume})
					metadata = raw
				}
				if _, err := s.store.upsertEventUser(r.Context(), eventID, int64(userID), true, metadata); err != nil {
					log.Error("event user upsert", "error", err, "event_id", eventID, "user_id", userID)
					writeError(w, http.StatusInternalServerError, "failed to save contestant")
					return
				}
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

func firstBracketRoundSeeds(participants []bracketParticipant) ([]bracketRoundSeed, error) {
	rounds := make([]bracketRoundSeed, 0, len(participants)/2)
	for index, participant := range participants {
		if strings.TrimSpace(participant.Key) == "" || strings.TrimSpace(participant.Label) == "" || len(participant.UserIDs) == 0 {
			return nil, fmt.Errorf("bracket participants must include key, label, and users")
		}
		participants[index].Key = strings.TrimSpace(participant.Key)
		participants[index].Label = strings.TrimSpace(participant.Label)
	}
	for index := 0; index < len(participants); index += 2 {
		first, _ := json.Marshal(participants[index])
		second, _ := json.Marshal(participants[index+1])
		rounds = append(rounds, bracketRoundSeed{
			RoundNumber:    1,
			Position:       int32(index/2 + 1),
			ParticipantOne: first,
			ParticipantTwo: second,
		})
	}
	return rounds, nil
}

func bracketParticipantFromRaw(raw json.RawMessage) (bracketParticipant, error) {
	var participant bracketParticipant
	if len(raw) == 0 {
		return participant, fmt.Errorf("missing participant")
	}
	if err := json.Unmarshal(raw, &participant); err != nil {
		return participant, err
	}
	return participant, nil
}

func participantReportSide(userID int64, first bracketParticipant, second bracketParticipant) string {
	if participantHasUser(first, userID) {
		return "one"
	}
	if participantHasUser(second, userID) {
		return "two"
	}
	return ""
}

func participantHasUser(participant bracketParticipant, userID int64) bool {
	for _, participantUserID := range participant.UserIDs {
		if int64(participantUserID) == userID {
			return true
		}
	}
	return false
}

func agreedBracketWinner(round EventRound) (string, bool) {
	var metadata bracketRoundMetadata
	if len(round.Metadata) == 0 {
		return "", false
	}
	if err := json.Unmarshal(round.Metadata, &metadata); err != nil {
		return "", false
	}
	first := metadata.Reports["one"]
	second := metadata.Reports["two"]
	return first, first != "" && first == second
}

func (s *apiServer) advanceBracketIfReady(ctx context.Context, eventID int64, roundNumber int32) error {
	rounds, err := s.store.listEventRounds(ctx, eventID)
	if err != nil {
		return err
	}
	currentRound := make([]EventRound, 0)
	for _, round := range rounds {
		if round.RoundNumber == roundNumber {
			currentRound = append(currentRound, round)
		}
	}
	if len(currentRound) == 0 {
		return nil
	}
	winners := make([]bracketParticipant, 0, len(currentRound))
	for _, round := range currentRound {
		if round.CompletedAt == nil || len(round.Winner) == 0 {
			return nil
		}
		winner, err := bracketParticipantFromRaw(round.Winner)
		if err != nil {
			return err
		}
		winners = append(winners, winner)
	}
	if len(winners) == 1 {
		_, err := s.store.completeEvent(ctx, eventID, time.Now().UTC())
		return err
	}

	nextRoundNumber := roundNumber + 1
	for _, round := range rounds {
		if round.RoundNumber == nextRoundNumber {
			return nil
		}
	}
	nextRounds, err := firstBracketRoundSeeds(winners)
	if err != nil {
		return err
	}
	for index := range nextRounds {
		nextRounds[index].RoundNumber = nextRoundNumber
	}
	return s.store.insertEventRounds(ctx, eventID, nextRounds)
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
