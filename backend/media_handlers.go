package main

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

type mediaFromURLRequest struct {
	URL string `json:"url"`
}

type mediaFromURLResponse struct {
	ImageURL string `json:"imageUrl"`
}

func (s *apiServer) handleMediaSearch(w http.ResponseWriter, r *http.Request) {
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
		log.Error("media search auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize media search")
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}
	if s.mediaSearch == nil {
		writeError(w, http.StatusServiceUnavailable, "Google media search is not configured")
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	mediaType := strings.TrimSpace(r.URL.Query().Get("type"))
	if mediaType == "" {
		mediaType = "image"
	}

	items, err := s.mediaSearch.search(r.Context(), query, mediaType)
	if err != nil {
		log.Error("media search", "error", err, "query", query, "type", mediaType)
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSON(w, map[string]any{"items": items})
}

func (s *apiServer) handleMediaFromURL(w http.ResponseWriter, r *http.Request) {
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
		log.Error("media from url auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize media upload")
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}
	if s.images == nil {
		writeError(w, http.StatusServiceUnavailable, "image storage is not configured")
		return
	}

	var req mediaFromURLRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	sourceURL := strings.TrimSpace(req.URL)
	if sourceURL == "" {
		writeError(w, http.StatusBadRequest, "url is required")
		return
	}

	imageURL, err := s.images.uploadFromURL(r.Context(), sourceURL)
	if err != nil {
		log.Error("media from url upload", "error", err, "source_url", sourceURL)
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	writeJSONStatus(w, http.StatusCreated, mediaFromURLResponse{ImageURL: imageURL})
}
