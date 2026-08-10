package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/log"
	"github.com/jackc/pgx/v5/pgconn"
)

type createPartyRequest struct {
	Label       string `json:"label"`
	Date        string `json:"date"`
	Summary     string `json:"summary"`
	PartifulURL string `json:"partifulUrl"`
	MediaURL    string `json:"mediaUrl"`
}

type partyAttendeeRequest struct {
	UserID    *int64          `json:"userId"`
	FirstName string          `json:"firstName"`
	LastName  string          `json:"lastName"`
	Email     string          `json:"email"`
	PlusOneOf *int64          `json:"plusOneOf"`
	Metadata  json.RawMessage `json:"metadata"`
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

	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
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

	party, err := s.store.createParty(
		r.Context(),
		label,
		date,
		strings.TrimSpace(req.Summary),
		strings.TrimSpace(req.PartifulURL),
		strings.TrimSpace(req.MediaURL),
	)
	if err != nil {
		log.Error("party create", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create party")
		return
	}

	go s.sendPartyCreatedInvites(party)

	writeJSON(w, party)
}

func (s *apiServer) handlePartyByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/parties/")
	path = strings.Trim(path, "/")
	if path == "" {
		writeError(w, http.StatusBadRequest, "party id is required")
		return
	}

	parts := strings.Split(path, "/")
	id, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid party id")
		return
	}

	user, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("party by id auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize party")
		return
	}

	if len(parts) >= 2 && parts[1] == "attendees" {
		s.handlePartyAttendees(w, r, id, user, parts[2:])
		return
	}
	if len(parts) > 1 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	if r.Method == http.MethodGet {
		party, err := s.store.getPartyByID(r.Context(), id)
		if err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusNotFound, "party not found")
				return
			}
			log.Error("party get", "error", err, "party_id", id)
			writeError(w, http.StatusInternalServerError, "failed to load party")
			return
		}
		writeJSON(w, party)
		return
	}

	if r.Method != http.MethodDelete && r.Method != http.MethodPatch {
		methodNotAllowed(w)
		return
	}

	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}

	if r.Method == http.MethodPatch {
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

		party, err := s.store.updateParty(
			r.Context(),
			id,
			label,
			date,
			strings.TrimSpace(req.Summary),
			strings.TrimSpace(req.PartifulURL),
			strings.TrimSpace(req.MediaURL),
		)
		if err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusNotFound, "party not found")
				return
			}
			log.Error("party update", "error", err, "party_id", id)
			writeError(w, http.StatusInternalServerError, "failed to update party")
			return
		}

		writeJSON(w, party)
		return
	}

	if err := s.store.deleteParty(r.Context(), id); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "party not found")
			return
		}
		log.Error("party delete", "error", err, "party_id", id)
		writeError(w, http.StatusInternalServerError, "failed to delete party")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *apiServer) handlePartyAttendees(w http.ResponseWriter, r *http.Request, partyID int64, user *User, rest []string) {
	if _, err := s.store.getPartyByID(r.Context(), partyID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "party not found")
			return
		}
		log.Error("party attendees party load", "error", err, "party_id", partyID)
		writeError(w, http.StatusInternalServerError, "failed to load party")
		return
	}

	if len(rest) == 0 {
		switch r.Method {
		case http.MethodGet:
			attendees, err := s.store.listPartyAttendees(r.Context(), partyID)
			if err != nil {
				log.Error("party attendees list", "error", err, "party_id", partyID)
				writeError(w, http.StatusInternalServerError, "failed to load party attendees")
				return
			}
			writeJSON(w, attendees)
		case http.MethodPost:
			s.handleCreatePartyAttendee(w, r, partyID, user)
		default:
			methodNotAllowed(w)
		}
		return
	}

	if len(rest) == 1 {
		attendeeID, err := strconv.ParseInt(rest[0], 10, 64)
		if err != nil || attendeeID < 1 {
			writeError(w, http.StatusBadRequest, "invalid attendee id")
			return
		}
		if r.Method != http.MethodDelete {
			methodNotAllowed(w)
			return
		}
		s.handleDeletePartyAttendee(w, r, partyID, attendeeID, user)
		return
	}

	writeError(w, http.StatusNotFound, "not found")
}

func (s *apiServer) handleCreatePartyAttendee(w http.ResponseWriter, r *http.Request, partyID int64, user *User) {
	var req partyAttendeeRequest
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid attendee request")
		return
	}

	firstName := strings.TrimSpace(req.FirstName)
	lastName := strings.TrimSpace(req.LastName)
	email := strings.TrimSpace(req.Email)

	isSelfRSVP := req.UserID == nil && req.PlusOneOf == nil && firstName == "" && lastName == "" && email == ""
	if isSelfRSVP {
		attendee, err := s.store.upsertPartyAttendeeForUser(
			r.Context(),
			partyID,
			user.ID,
			strings.TrimSpace(user.FirstName),
			strings.TrimSpace(user.LastName),
			strings.TrimSpace(user.Email),
			req.Metadata,
		)
		if err != nil {
			log.Error("party self rsvp", "error", err, "party_id", partyID, "user_id", user.ID)
			writeError(w, http.StatusInternalServerError, "failed to RSVP")
			return
		}
		writeJSONStatus(w, http.StatusCreated, attendee)
		return
	}

	if req.PlusOneOf == nil {
		writeError(w, http.StatusBadRequest, "plusOneOf is required when inviting a guest")
		return
	}

	hostAttendee, err := s.store.getPartyAttendeeByID(r.Context(), *req.PlusOneOf)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusBadRequest, "host attendee not found")
			return
		}
		log.Error("party guest host load", "error", err, "attendee_id", *req.PlusOneOf)
		writeError(w, http.StatusInternalServerError, "failed to load host attendee")
		return
	}
	if hostAttendee.PartyID != partyID {
		writeError(w, http.StatusBadRequest, "host attendee is not for this party")
		return
	}
	if user.Role != RoleHost {
		if hostAttendee.UserID == nil || *hostAttendee.UserID != user.ID {
			writeError(w, http.StatusForbidden, "you can only invite guests for your own RSVP")
			return
		}
	}

	var guestUserID *int64
	if req.UserID != nil {
		if *req.UserID < 1 {
			writeError(w, http.StatusBadRequest, "invalid userId")
			return
		}
		guestUser, err := s.store.getUserByID(r.Context(), *req.UserID)
		if err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusBadRequest, "guest user not found")
				return
			}
			log.Error("party guest user load", "error", err, "user_id", *req.UserID)
			writeError(w, http.StatusInternalServerError, "failed to load guest user")
			return
		}
		guestUserID = &guestUser.ID
		if firstName == "" {
			firstName = strings.TrimSpace(guestUser.FirstName)
		}
		if lastName == "" {
			lastName = strings.TrimSpace(guestUser.LastName)
		}
		if email == "" {
			email = strings.TrimSpace(guestUser.Email)
		}
	}

	if firstName == "" || lastName == "" {
		writeError(w, http.StatusBadRequest, "firstName and lastName are required for guest invites")
		return
	}

	attendee, err := s.store.createPartyAttendee(
		r.Context(),
		partyID,
		guestUserID,
		firstName,
		lastName,
		email,
		req.PlusOneOf,
		req.Metadata,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "that user is already an attendee")
			return
		}
		log.Error("party guest invite", "error", err, "party_id", partyID)
		writeError(w, http.StatusInternalServerError, "failed to invite guest")
		return
	}

	if guestUserID == nil && email != "" {
		if _, err := mail.ParseAddress(email); err == nil {
			party, partyErr := s.store.getPartyByID(r.Context(), partyID)
			if partyErr != nil {
				log.Error("party plus-one invite party load", "error", partyErr, "party_id", partyID)
			} else {
				go s.sendPartyPlusOneInvite(party, firstName, email)
			}
		} else {
			log.Error("party plus-one invite skipped invalid email", "email", email, "party_id", partyID)
		}
	}

	writeJSONStatus(w, http.StatusCreated, attendee)
}

func (s *apiServer) handleDeletePartyAttendee(w http.ResponseWriter, r *http.Request, partyID, attendeeID int64, user *User) {
	attendee, err := s.store.getPartyAttendeeByID(r.Context(), attendeeID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "attendee not found")
			return
		}
		log.Error("party attendee load", "error", err, "attendee_id", attendeeID)
		writeError(w, http.StatusInternalServerError, "failed to load attendee")
		return
	}
	if attendee.PartyID != partyID {
		writeError(w, http.StatusNotFound, "attendee not found")
		return
	}

	canDelete := user.Role == RoleHost
	if !canDelete && attendee.UserID != nil && *attendee.UserID == user.ID {
		canDelete = true
	}
	if !canDelete && attendee.PlusOneOf != nil {
		host, hostErr := s.store.getPartyAttendeeByID(r.Context(), *attendee.PlusOneOf)
		if hostErr == nil && host.UserID != nil && *host.UserID == user.ID {
			canDelete = true
		}
	}
	if !canDelete {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	if err := s.store.deletePartyAttendee(r.Context(), attendeeID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "attendee not found")
			return
		}
		log.Error("party attendee delete", "error", err, "attendee_id", attendeeID)
		writeError(w, http.StatusInternalServerError, "failed to delete attendee")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *apiServer) sendPartyCreatedInvites(party Party) {
	if s.email == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	users, err := s.store.listUsers(ctx)
	if err != nil {
		log.Error("party create invites list users", "error", err, "party_id", party.ID)
		return
	}

	subject := partyCreatedInviteSubject(party)
	cta := partyInviteCTA{
		Label: "RSVP",
		URL:   partyDetailURL(party),
	}

	for _, user := range users {
		to := strings.TrimSpace(user.Email)
		if to == "" {
			continue
		}
		if _, err := mail.ParseAddress(to); err != nil {
			continue
		}

		htmlBody, textBody := partyInviteEmail(party, user.FirstName, cta)
		emailID, err := s.email.send(ctx, []string{to}, subject, htmlBody, textBody)
		if err != nil {
			log.Error("party create invite send", "error", err, "party_id", party.ID, "to", to)
			continue
		}
		log.Info("party create invite sent", "email_id", emailID, "party_id", party.ID, "to", to)
	}
}

func (s *apiServer) sendPartyPlusOneInvite(party Party, firstName, email string) {
	if s.email == nil {
		return
	}

	to := strings.TrimSpace(email)
	if to == "" {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	htmlBody, textBody := partyInviteEmail(party, firstName, partyInviteCTA{
		Label: "Create Account",
		URL:   partySignupURL(to),
	})
	emailID, err := s.email.send(ctx, []string{to}, partyPlusOneInviteSubject(party), htmlBody, textBody)
	if err != nil {
		log.Error("party plus-one invite send", "error", err, "party_id", party.ID, "to", to)
		return
	}
	log.Info("party plus-one invite sent", "email_id", emailID, "party_id", party.ID, "to", to)
}
