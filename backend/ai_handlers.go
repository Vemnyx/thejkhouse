package main

import (
	"net/http"
	"strings"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

type htmlDraftRequest struct {
	Type         string `json:"type"`
	Instructions string `json:"instructions"`
	ExistingHTML string `json:"existingHtml"`
}

type htmlDraftResponse struct {
	HTML string `json:"html"`
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

	html, err := s.ai.generateHTML(r.Context(), blockType, instructions, payload.ExistingHTML)
	if err != nil {
		log.Error("ai draft generate", "error", err, "type", blockType)
		writeError(w, http.StatusInternalServerError, "failed to generate html draft")
		return
	}

	writeJSON(w, htmlDraftResponse{HTML: html})
}
