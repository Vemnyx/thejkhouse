package main

import (
	"net/http"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

type homepageUpdateRequest struct {
	HTML string `json:"html"`
}

func (s *apiServer) handleHomepage(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleGetHomepage(w, r)
	case http.MethodPatch:
		s.handleUpdateHomepage(w, r)
	default:
		methodNotAllowed(w)
	}
}

func (s *apiServer) handleHomepageImages(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}

	images, err := s.store.listHomepageImages(r.Context())
	if err != nil {
		log.Error("homepage public images", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load homepage images")
		return
	}

	writeJSON(w, images)
}

func (s *apiServer) handleGetHomepage(w http.ResponseWriter, r *http.Request) {
	if _, err := s.loadUserFromRequest(r); err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("homepage auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize homepage")
		return
	}

	homepage, err := s.loadHomepage(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load homepage")
		return
	}

	writeJSON(w, homepage)
}

func (s *apiServer) handleUpdateHomepage(w http.ResponseWriter, r *http.Request) {
	user, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("homepage update auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize homepage update")
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}

	var payload homepageUpdateRequest
	if err := readJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, errInvalidBody.Error())
		return
	}

	if _, err := s.store.updateHomepageHTML(r.Context(), payload.HTML); err != nil {
		log.Error("homepage update", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to update homepage")
		return
	}

	homepage, err := s.loadHomepage(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load homepage")
		return
	}

	writeJSON(w, homepage)
}

func (s *apiServer) loadHomepage(r *http.Request) (Homepage, error) {
	html, err := s.store.getHomepageHTML(r.Context())
	if err != nil {
		log.Error("homepage html", "error", err)
		return Homepage{}, err
	}

	images, err := s.store.listHomepageImages(r.Context())
	if err != nil {
		log.Error("homepage images", "error", err)
		return Homepage{}, err
	}

	return Homepage{
		HTML:   html,
		Images: images,
	}, nil
}
