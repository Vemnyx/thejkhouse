package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/log"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	defaultPartyThemePrimary    = "#f2b8c4"
	defaultPartyThemeAccent     = "#b8926a"
	defaultPartyThemeBackground = "#030303"
	defaultPartyThemeFont       = "cinzel-decorative"
)

var partyThemeHexRE = regexp.MustCompile(`(?i)^#[0-9a-f]{6}$`)

var partyThemeFonts = map[string]string{
	"cinzel-decorative":  `"Cinzel Decorative", Cinzel, Georgia, serif`,
	"playfair-display":   `"Playfair Display", Georgia, serif`,
	"great-vibes":        `"Great Vibes", "Brush Script MT", cursive`,
	"bebas-neue":         `"Bebas Neue", Impact, "Arial Narrow", sans-serif`,
	"pacifico":           `Pacifico, "Comic Sans MS", cursive`,
	"abril-fatface":      `"Abril Fatface", Georgia, serif`,
	"lobster":            `Lobster, "Brush Script MT", cursive`,
	"righteous":          `Righteous, Impact, sans-serif`,
	"orbitron":           `Orbitron, "Segoe UI", sans-serif`,
	"press-start-2p":     `"Press Start 2P", "Courier New", monospace`,
	"bangers":            `Bangers, Impact, sans-serif`,
	"dancing-script":     `"Dancing Script", "Brush Script MT", cursive`,
	"unifrakturmaguntia": `UnifrakturMaguntia, "Times New Roman", serif`,
	"fredoka":            `Fredoka, "Trebuchet MS", sans-serif`,
	"archivo-black":      `"Archivo Black", Impact, sans-serif`,
}

func normalizePartyThemeColor(value, fallback string) string {
	value = strings.TrimSpace(value)
	if partyThemeHexRE.MatchString(value) {
		return strings.ToLower(value)
	}
	return fallback
}

func normalizePartyThemeFont(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if _, ok := partyThemeFonts[value]; ok {
		return value
	}
	return defaultPartyThemeFont
}

func partyThemeFontFamily(value string) string {
	id := normalizePartyThemeFont(value)
	return partyThemeFonts[id]
}

func partyThemeRGBA(hex string, alpha float64) string {
	hex = strings.TrimPrefix(strings.ToLower(strings.TrimSpace(hex)), "#")
	if len(hex) != 6 {
		return fmt.Sprintf("rgba(232,120,143,%.2f)", alpha)
	}
	r, errR := strconv.ParseUint(hex[0:2], 16, 8)
	g, errG := strconv.ParseUint(hex[2:4], 16, 8)
	b, errB := strconv.ParseUint(hex[4:6], 16, 8)
	if errR != nil || errG != nil || errB != nil {
		return fmt.Sprintf("rgba(232,120,143,%.2f)", alpha)
	}
	return fmt.Sprintf("rgba(%d,%d,%d,%.2f)", r, g, b, alpha)
}

func (s *apiServer) resolvePartyMediaURL(ctx context.Context, mediaURL, previousURL string) (string, error) {
	mediaURL = strings.TrimSpace(mediaURL)
	if mediaURL == "" {
		return "", nil
	}
	if s.images == nil {
		return "", errors.New("image storage is not configured")
	}

	previousURL = strings.TrimSpace(previousURL)
	if mediaURL == previousURL && s.images.isHostedURL(previousURL) {
		return previousURL, nil
	}

	return s.images.ensureHostedURL(ctx, mediaURL)
}

type createPartyRequest struct {
	Label           string `json:"label"`
	Date            string `json:"date"`
	Summary         string `json:"summary"`
	PartifulURL     string `json:"partifulUrl"`
	MediaURL        string `json:"mediaUrl"`
	ThemePrimary    string `json:"themePrimary"`
	ThemeAccent     string `json:"themeAccent"`
	ThemeBackground string `json:"themeBackground"`
	ThemeFont       string `json:"themeFont"`
	Byom            bool   `json:"byom"`
}

type partyAttendeeRequest struct {
	UserID     *int64          `json:"userId"`
	FirstName  string          `json:"firstName"`
	LastName   string          `json:"lastName"`
	Email      string          `json:"email"`
	PlusOneOf  *int64          `json:"plusOneOf"`
	Note       string          `json:"note"`
	RsvpStatus PartyRsvpStatus `json:"rsvpStatus"`
	Metadata   json.RawMessage `json:"metadata"`
}

func normalizePartyRsvpStatus(status PartyRsvpStatus) PartyRsvpStatus {
	status = PartyRsvpStatus(strings.TrimSpace(string(status)))
	if status == "" {
		return PartyRsvpStatusGoing
	}
	if !status.Valid() {
		return ""
	}
	return status
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

	mediaURL, err := s.resolvePartyMediaURL(r.Context(), req.MediaURL, "")
	if err != nil {
		log.Error("party create media", "error", err)
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	party, err := s.store.createParty(
		r.Context(),
		label,
		date,
		strings.TrimSpace(req.Summary),
		strings.TrimSpace(req.PartifulURL),
		mediaURL,
		normalizePartyThemeColor(req.ThemePrimary, defaultPartyThemePrimary),
		normalizePartyThemeColor(req.ThemeAccent, defaultPartyThemeAccent),
		normalizePartyThemeColor(req.ThemeBackground, defaultPartyThemeBackground),
		normalizePartyThemeFont(req.ThemeFont),
		req.Byom,
	)
	if err != nil {
		log.Error("party create", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to create party")
		return
	}

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
	if len(parts) >= 2 && parts[1] == "signup-items" {
		s.handlePartySignupItems(w, r, id, user, parts[2:])
		return
	}
	if len(parts) >= 2 && parts[1] == "invite" {
		s.handleSendPartyInvite(w, r, id, user)
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

		existingParty, err := s.store.getPartyByID(r.Context(), id)
		if err != nil {
			if isNotFound(err) {
				writeError(w, http.StatusNotFound, "party not found")
				return
			}
			log.Error("party update load", "error", err, "party_id", id)
			writeError(w, http.StatusInternalServerError, "failed to load party")
			return
		}

		mediaURL, err := s.resolvePartyMediaURL(r.Context(), req.MediaURL, existingParty.MediaURL)
		if err != nil {
			log.Error("party update media", "error", err, "party_id", id)
			writeError(w, http.StatusBadGateway, err.Error())
			return
		}

		party, err := s.store.updateParty(
			r.Context(),
			id,
			label,
			date,
			strings.TrimSpace(req.Summary),
			strings.TrimSpace(req.PartifulURL),
			mediaURL,
			normalizePartyThemeColor(req.ThemePrimary, defaultPartyThemePrimary),
			normalizePartyThemeColor(req.ThemeAccent, defaultPartyThemeAccent),
			normalizePartyThemeColor(req.ThemeBackground, defaultPartyThemeBackground),
			normalizePartyThemeFont(req.ThemeFont),
			req.Byom,
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
	note := strings.TrimSpace(req.Note)
	if len(note) > 2000 {
		writeError(w, http.StatusBadRequest, "note must be 2000 characters or fewer")
		return
	}

	isSelfRSVP := req.UserID == nil && req.PlusOneOf == nil && firstName == "" && lastName == "" && email == ""
	if isSelfRSVP {
		rsvpStatus := normalizePartyRsvpStatus(req.RsvpStatus)
		if rsvpStatus == "" {
			writeError(w, http.StatusBadRequest, "invalid rsvpStatus")
			return
		}
		attendee, err := s.store.upsertPartyAttendeeForUser(
			r.Context(),
			partyID,
			user.ID,
			strings.TrimSpace(user.FirstName),
			strings.TrimSpace(user.LastName),
			strings.TrimSpace(user.Email),
			note,
			rsvpStatus,
			req.Metadata,
		)
		if err != nil {
			log.Error("party self rsvp", "error", err, "party_id", partyID, "user_id", user.ID)
			writeError(w, http.StatusInternalServerError, "failed to RSVP")
			return
		}
		if rsvpStatus == PartyRsvpStatusNotGoing {
			if err := s.store.deletePartyAttendeePlusOnes(r.Context(), attendee.ID); err != nil {
				log.Error("party self rsvp plus-one cleanup", "error", err, "attendee_id", attendee.ID)
			}
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
	if hostAttendee.RsvpStatus != PartyRsvpStatusGoing && hostAttendee.RsvpStatus != PartyRsvpStatusMaybe {
		writeError(w, http.StatusBadRequest, "guest invites are only available when you are going or maybe")
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

	if guestUserID != nil && hostAttendee.UserID != nil && *guestUserID == *hostAttendee.UserID {
		writeError(w, http.StatusBadRequest, "you cannot invite yourself as a guest")
		return
	}
	if email != "" && strings.EqualFold(email, strings.TrimSpace(hostAttendee.Email)) {
		writeError(w, http.StatusBadRequest, "you cannot invite yourself as a guest")
		return
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
		"",
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

	if err := s.store.deletePartyAttendeeAndSignup(r.Context(), partyID, attendeeID); err != nil {
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

type partySignupItemRequest struct {
	Label       *string `json:"label"`
	Note        *string `json:"note"`
	HostCreated bool    `json:"hostCreated"`
	Claim       *bool   `json:"claim"`
}

func (s *apiServer) handlePartySignupItems(w http.ResponseWriter, r *http.Request, partyID int64, user *User, rest []string) {
	if _, err := s.store.getPartyByID(r.Context(), partyID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "party not found")
			return
		}
		log.Error("party signup items party load", "error", err, "party_id", partyID)
		writeError(w, http.StatusInternalServerError, "failed to load party")
		return
	}

	if len(rest) == 0 {
		switch r.Method {
		case http.MethodGet:
			items, err := s.store.listPartySignupItems(r.Context(), partyID)
			if err != nil {
				log.Error("party signup items list", "error", err, "party_id", partyID)
				writeError(w, http.StatusInternalServerError, "failed to load signup items")
				return
			}
			writeJSON(w, items)
		case http.MethodPost:
			s.handleCreatePartySignupItem(w, r, partyID, user)
		default:
			methodNotAllowed(w)
		}
		return
	}

	if len(rest) != 1 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	itemID, err := strconv.ParseInt(rest[0], 10, 64)
	if err != nil || itemID < 1 {
		writeError(w, http.StatusBadRequest, "invalid signup item id")
		return
	}

	switch r.Method {
	case http.MethodPatch:
		s.handleUpdatePartySignupItem(w, r, partyID, itemID, user)
	case http.MethodDelete:
		s.handleDeletePartySignupItem(w, r, partyID, itemID, user)
	default:
		methodNotAllowed(w)
	}
}

func (s *apiServer) handleCreatePartySignupItem(w http.ResponseWriter, r *http.Request, partyID int64, user *User) {
	var req partySignupItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid signup item request")
		return
	}

	label := ""
	if req.Label != nil {
		label = strings.TrimSpace(*req.Label)
	}
	note := ""
	if req.Note != nil {
		note = strings.TrimSpace(*req.Note)
	}
	if len(label) > 120 {
		writeError(w, http.StatusBadRequest, "item must be 120 characters or fewer")
		return
	}
	if len(note) > 2000 {
		writeError(w, http.StatusBadRequest, "note must be 2000 characters or fewer")
		return
	}

	var userID *int64
	hostCreated := req.HostCreated
	if hostCreated {
		if user.Role != RoleHost {
			writeError(w, http.StatusForbidden, "host access is required")
			return
		}
	} else {
		userID = &user.ID
	}

	item, err := s.store.createPartySignupItem(r.Context(), partyID, userID, label, note, hostCreated)
	if err != nil {
		log.Error("party signup item create", "error", err, "party_id", partyID)
		writeError(w, http.StatusInternalServerError, "failed to add signup item")
		return
	}

	writeJSONStatus(w, http.StatusCreated, item)
}

func (s *apiServer) handleUpdatePartySignupItem(w http.ResponseWriter, r *http.Request, partyID, itemID int64, user *User) {
	var req partySignupItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid signup item request")
		return
	}

	item, err := s.store.getPartySignupItemByID(r.Context(), itemID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "signup item not found")
			return
		}
		log.Error("party signup item load", "error", err, "item_id", itemID)
		writeError(w, http.StatusInternalServerError, "failed to load signup item")
		return
	}
	if item.PartyID != partyID {
		writeError(w, http.StatusNotFound, "signup item not found")
		return
	}

	ownsItem := item.UserID != nil && *item.UserID == user.ID
	isHost := user.Role == RoleHost
	nextUserID := item.UserID
	nextLabel := item.Label
	nextNote := item.Note

	if req.Claim != nil && *req.Claim {
		if item.UserID != nil && *item.UserID != user.ID {
			writeError(w, http.StatusConflict, "that item is already claimed")
			return
		}
		nextUserID = &user.ID
		ownsItem = true
	}

	if req.Label != nil {
		label := strings.TrimSpace(*req.Label)
		if len(label) > 120 {
			writeError(w, http.StatusBadRequest, "item must be 120 characters or fewer")
			return
		}
		if item.HostCreated {
			if !isHost || item.UserID != nil {
				writeError(w, http.StatusForbidden, "host items cannot be changed")
				return
			}
		}
		if !ownsItem && !isHost {
			writeError(w, http.StatusForbidden, "you can only edit your own items")
			return
		}
		nextLabel = label
	}

	if req.Note != nil {
		note := strings.TrimSpace(*req.Note)
		if len(note) > 2000 {
			writeError(w, http.StatusBadRequest, "note must be 2000 characters or fewer")
			return
		}
		if item.UserID == nil && !isHost && (req.Claim == nil || !*req.Claim) {
			writeError(w, http.StatusForbidden, "claim this item before adding a note")
			return
		}
		if !ownsItem && !isHost {
			writeError(w, http.StatusForbidden, "you can only edit your own notes")
			return
		}
		nextNote = note
	}

	updated, err := s.store.updatePartySignupItem(r.Context(), item.ID, nextUserID, nextLabel, nextNote)
	if err != nil {
		log.Error("party signup item update", "error", err, "item_id", itemID)
		writeError(w, http.StatusInternalServerError, "failed to update signup item")
		return
	}

	writeJSON(w, updated)
}

func (s *apiServer) handleDeletePartySignupItem(w http.ResponseWriter, r *http.Request, partyID, itemID int64, user *User) {
	item, err := s.store.getPartySignupItemByID(r.Context(), itemID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "signup item not found")
			return
		}
		log.Error("party signup item load", "error", err, "item_id", itemID)
		writeError(w, http.StatusInternalServerError, "failed to load signup item")
		return
	}
	if item.PartyID != partyID {
		writeError(w, http.StatusNotFound, "signup item not found")
		return
	}

	canDelete := user.Role == RoleHost
	if !canDelete && !item.HostCreated && item.UserID != nil && *item.UserID == user.ID {
		canDelete = true
	}
	if !canDelete {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	if err := s.store.deletePartySignupItem(r.Context(), itemID); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "signup item not found")
			return
		}
		log.Error("party signup item delete", "error", err, "item_id", itemID)
		writeError(w, http.StatusInternalServerError, "failed to delete signup item")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *apiServer) handleSendPartyInvite(w http.ResponseWriter, r *http.Request, partyID int64, user *User) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}
	if s.email == nil {
		writeError(w, http.StatusServiceUnavailable, "email is not configured")
		return
	}

	var req struct {
		Test bool `json:"test"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeError(w, http.StatusBadRequest, "invalid invite request")
		return
	}

	party, err := s.store.getPartyByID(r.Context(), partyID)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "party not found")
			return
		}
		log.Error("party invite load", "error", err, "party_id", partyID)
		writeError(w, http.StatusInternalServerError, "failed to load party")
		return
	}

	var sent int
	if req.Test {
		sent, err = s.sendPartyInviteTest(party)
	} else {
		sent, err = s.sendPartyInvites(party)
	}
	if err != nil {
		log.Error("party invite send", "error", err, "party_id", partyID, "test", req.Test)
		writeError(w, http.StatusInternalServerError, "failed to send party invites")
		return
	}

	writeJSON(w, map[string]any{
		"sent": sent,
		"test": req.Test,
	})
}

func (s *apiServer) sendPartyInviteTest(party Party) (int, error) {
	if s.email == nil {
		return 0, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	greetingName := "Jake"
	users, err := s.store.listUsers(ctx)
	if err == nil {
		for _, user := range users {
			if strings.EqualFold(strings.TrimSpace(user.Email), partyInviteTestEmail) {
				if name := strings.TrimSpace(user.FirstName); name != "" {
					greetingName = name
				}
				break
			}
		}
	}

	subject := partyCreatedInviteSubject(party)
	htmlBody, textBody := partyInviteEmail(party, greetingName, partyInviteCTA{
		Label: "RSVP",
		URL:   partyRsvpURL(party),
	})
	emailID, err := s.email.send(ctx, []string{partyInviteTestEmail}, subject, htmlBody, textBody)
	if err != nil {
		return 0, err
	}
	log.Info("party invite test sent", "email_id", emailID, "party_id", party.ID, "to", partyInviteTestEmail)
	return 1, nil
}

func (s *apiServer) sendPartyInvites(party Party) (int, error) {
	if s.email == nil {
		return 0, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	users, err := s.store.listUsers(ctx)
	if err != nil {
		return 0, err
	}

	subject := partyCreatedInviteSubject(party)
	cta := partyInviteCTA{
		Label: "RSVP",
		URL:   partyRsvpURL(party),
	}

	sent := 0
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
			log.Error("party invite send", "error", err, "party_id", party.ID, "to", to)
			continue
		}
		sent++
		log.Info("party invite sent", "email_id", emailID, "party_id", party.ID, "to", to)
	}
	return sent, nil
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
