package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

type apiServer struct {
	store       *userStore
	auth        *authService
	images      *imageUploader
	email       *emailClient
	ai          *aiClient
	mediaSearch *mediaSearchClient
}

func (s *apiServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"status": "ok"})
}

func (s *apiServer) handleRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	token, err := s.auth.verifyRequestToken(r)
	if err != nil {
		log.Error("register auth", "error", err)
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	var payload registerRequest
	if err := readJSON(r, &payload); err != nil {
		log.Error("register decode", "error", err)
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	firstName := strings.TrimSpace(payload.FirstName)
	lastName := strings.TrimSpace(payload.LastName)
	if firstName == "" || lastName == "" {
		writeError(w, http.StatusBadRequest, "first name and last name are required")
		return
	}
	birthday, err := parseBirthday(payload.Birthday)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	email, _ := token.Claims["email"].(string)
	if email == "" {
		writeError(w, http.StatusBadRequest, "firebase token is missing email")
		return
	}

	user, err := s.store.createUser(r.Context(), token.UID, email, firstName, lastName, birthday, RoleGuest)
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "user already exists")
			return
		}
		log.Error("register create user", "error", err, "email", email)
		writeError(w, http.StatusInternalServerError, "failed to create user")
		return
	}

	log.Info("user registered", "user_id", user.ID, "email", user.Email)
	writeJSONStatus(w, http.StatusCreated, user)
}

func (s *apiServer) handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPatch {
		methodNotAllowed(w)
		return
	}

	if r.Method == http.MethodPatch {
		s.handleUpdateMe(w, r)
		return
	}

	user, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("me load user", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	writeJSON(w, user)
}

func (s *apiServer) handleUpdateMe(w http.ResponseWriter, r *http.Request) {
	token, err := s.auth.verifyRequestToken(r)
	if err != nil {
		log.Error("update me auth", "error", err)
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	var payload registerRequest
	if err := readJSON(r, &payload); err != nil {
		log.Error("update me decode", "error", err)
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	firstName := strings.TrimSpace(payload.FirstName)
	lastName := strings.TrimSpace(payload.LastName)
	if firstName == "" || lastName == "" {
		writeError(w, http.StatusBadRequest, "first name and last name are required")
		return
	}
	birthday, err := parseBirthday(payload.Birthday)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	user, err := s.store.updateUserProfile(r.Context(), token.UID, firstName, lastName, birthday)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		log.Error("update me", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update user")
		return
	}

	writeJSON(w, user)
}

func (s *apiServer) handleMeAvatar(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	user, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("avatar auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize avatar upload")
		return
	}
	if s.images == nil {
		writeError(w, http.StatusServiceUnavailable, "image uploads are not configured")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxImageUploadSize)
	if err := r.ParseMultipartForm(maxImageUploadSize); err != nil {
		writeError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		writeError(w, http.StatusBadRequest, "image file is required")
		return
	}
	defer func() { _ = file.Close() }()

	sample := make([]byte, 512)
	n, readErr := file.Read(sample)
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		log.Error("avatar read sample", "error", readErr)
		writeError(w, http.StatusBadRequest, "failed to read image")
		return
	}
	contentType, ok := detectImageContentType(sample[:n])
	if !ok {
		writeError(w, http.StatusBadRequest, "image must be jpeg, png, gif, or webp")
		return
	}

	imageURL, err := s.images.upload(r.Context(), io.MultiReader(bytes.NewReader(sample[:n]), file), header.Filename, contentType, time.Now().UTC())
	if err != nil {
		log.Error("avatar upload", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to upload avatar")
		return
	}

	previousAvatarURL := ""
	if user.AvatarURL != nil {
		previousAvatarURL = strings.TrimSpace(*user.AvatarURL)
	}

	updated, err := s.store.updateUserAvatar(r.Context(), user.FirebaseUID, imageURL)
	if err != nil {
		_ = s.images.delete(r.Context(), imageURL)
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		log.Error("avatar update", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update avatar")
		return
	}

	if previousAvatarURL != "" && previousAvatarURL != imageURL {
		if err := s.images.delete(r.Context(), previousAvatarURL); err != nil {
			log.Error("avatar cleanup", "error", err, "url", previousAvatarURL)
		}
	}

	writeJSON(w, updated)
}

func writeJSON(w http.ResponseWriter, payload any) {
	writeJSONStatus(w, http.StatusOK, payload)
}

func writeJSONStatus(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSONStatus(w, status, map[string]string{"error": message})
}

func writeErrorCode(w http.ResponseWriter, status int, code string, message string) {
	writeJSONStatus(w, status, map[string]string{"error": message, "code": code})
}

func methodNotAllowed(w http.ResponseWriter) {
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}
