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
	UserID    *int64          `json:"userId"`
	FirstName string          `json:"firstName"`
	LastName  string          `json:"lastName"`
	Email     string          `json:"email"`
	PlusOneOf *int64          `json:"plusOneOf"`
	Note      string          `json:"note"`
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
		attendee, err := s.store.upsertPartyAttendeeForUser(
			r.Context(),
			partyID,
			user.ID,
			strings.TrimSpace(user.FirstName),
			strings.TrimSpace(user.LastName),
			strings.TrimSpace(user.Email),
			note,
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

	sent, err := s.sendPartyInvites(party)
	if err != nil {
		log.Error("party invite send", "error", err, "party_id", partyID)
		writeError(w, http.StatusInternalServerError, "failed to send party invites")
		return
	}

	writeJSON(w, map[string]any{
		"sent": sent,
	})
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
		URL:   partyDetailURL(party),
	}

	if testOnly := strings.TrimSpace(partyInviteTestOnlyEmail); testOnly != "" {
		greetingName := "Jake"
		for _, user := range users {
			if strings.EqualFold(strings.TrimSpace(user.Email), testOnly) {
				greetingName = user.FirstName
				break
			}
		}

		htmlBody, textBody := partyInviteEmail(party, greetingName, cta)
		emailID, err := s.email.send(ctx, []string{testOnly}, subject, htmlBody, textBody)
		if err != nil {
			return 0, err
		}
		log.Info("party invite sent (test mode)", "email_id", emailID, "party_id", party.ID, "to", testOnly)
		return 1, nil
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
	if testOnly := strings.TrimSpace(partyInviteTestOnlyEmail); testOnly != "" {
		to = testOnly
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
