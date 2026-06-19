package main

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

type htmlDraftRequest struct {
	Type         string   `json:"type"`
	Instructions string   `json:"instructions"`
	ExistingHTML string   `json:"existingHtml"`
	ImageURLs    []string `json:"imageUrls"`
}

type htmlDraftResponse struct {
	HTML string `json:"html"`
}

type aiImageUploadResponse struct {
	ImageURL string `json:"imageUrl"`
}

func (s *apiServer) handleAIHTMLDraft(w http.ResponseWriter, r *http.Request) {
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
		log.Error("ai draft auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize ai draft")
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}
	if s.ai == nil {
		writeError(w, http.StatusServiceUnavailable, "ai drafting is not configured")
		return
	}

	var payload htmlDraftRequest
	if err := readJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	blockType := strings.TrimSpace(payload.Type)
	if blockType != "homepage" && blockType != "party" {
		writeError(w, http.StatusBadRequest, "type must be homepage or party")
		return
	}

	instructions := strings.TrimSpace(payload.Instructions)
	if instructions == "" {
		writeError(w, http.StatusBadRequest, "instructions are required")
		return
	}

	html, err := s.ai.generateHTML(r.Context(), blockType, instructions, payload.ExistingHTML, normalizeImageURLs(payload.ImageURLs))
	if err != nil {
		log.Error("ai draft generate", "error", err, "type", blockType)
		writeError(w, http.StatusInternalServerError, "failed to generate html draft")
		return
	}

	writeJSON(w, htmlDraftResponse{HTML: html})
}

func (s *apiServer) handleAIImageUpload(w http.ResponseWriter, r *http.Request) {
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
		log.Error("ai image auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize ai image upload")
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
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
		log.Error("ai image read sample", "error", readErr)
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
		log.Error("ai image upload", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to upload image")
		return
	}

	writeJSONStatus(w, http.StatusCreated, aiImageUploadResponse{ImageURL: imageURL})
}

func normalizeImageURLs(values []string) []string {
	urls := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		url := strings.TrimSpace(value)
		if url == "" {
			continue
		}
		if _, exists := seen[url]; exists {
			continue
		}
		seen[url] = struct{}{}
		urls = append(urls, url)
	}
	return urls
}
