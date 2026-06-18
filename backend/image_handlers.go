package main

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

const maxImageUploadSize = 10 << 20 // 10 MiB

func (s *apiServer) handleImages(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleListImages(w, r)
	case http.MethodPost:
		s.handleCreateImage(w, r)
	default:
		methodNotAllowed(w)
	}
}

func (s *apiServer) handleImageByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		methodNotAllowed(w)
		return
	}

	idText := strings.TrimPrefix(r.URL.Path, "/images/")
	id, err := strconv.ParseInt(idText, 10, 64)
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid image id")
		return
	}

	user, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("image delete auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize image delete")
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}

	image, err := s.store.getImage(r.Context(), id)
	if err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "image not found")
			return
		}
		log.Error("image load", "error", err, "image_id", id)
		writeError(w, http.StatusInternalServerError, "failed to load image")
		return
	}

	if err := s.images.delete(r.Context(), image.ImageURL); err != nil {
		log.Error("image object delete", "error", err, "image_id", id)
		writeError(w, http.StatusInternalServerError, "failed to delete image")
		return
	}

	if err := s.store.deleteImage(r.Context(), id); err != nil {
		if isNotFound(err) {
			writeError(w, http.StatusNotFound, "image not found")
			return
		}
		log.Error("image row delete", "error", err, "image_id", id)
		writeError(w, http.StatusInternalServerError, "failed to delete image")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *apiServer) handleListImages(w http.ResponseWriter, r *http.Request) {
	user, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("image list auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize images")
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}

	images, err := s.store.listImages(r.Context())
	if err != nil {
		log.Error("image list", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to load images")
		return
	}

	writeJSON(w, images)
}

func (s *apiServer) handleCreateImage(w http.ResponseWriter, r *http.Request) {
	user, err := s.loadUserFromRequest(r)
	if err != nil {
		if authErr, ok := err.(*authRequestError); ok {
			writeError(w, authErr.status, authErr.message)
			return
		}
		log.Error("image auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize upload")
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

	imageDate, err := parseImageDate(r.FormValue("date"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	partyID, err := parseOptionalID(r.FormValue("partyId"), "party id")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	homepage := parseFormBool(r.FormValue("homepage"))

	sample := make([]byte, 512)
	n, readErr := file.Read(sample)
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		log.Error("image read sample", "error", readErr)
		writeError(w, http.StatusBadRequest, "failed to read image")
		return
	}
	contentType, ok := detectImageContentType(sample[:n])
	if !ok {
		writeError(w, http.StatusBadRequest, "image must be jpeg, png, gif, or webp")
		return
	}

	now := time.Now().UTC()
	imageURL, err := s.images.upload(r.Context(), io.MultiReader(bytes.NewReader(sample[:n]), file), header.Filename, contentType, now)
	if err != nil {
		log.Error("image upload", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to upload image")
		return
	}

	image, err := s.store.createImage(r.Context(), imageURL, imageDate, partyID, homepage)
	if err != nil {
		log.Error("image create row", "error", err, "image_url", imageURL)
		writeError(w, http.StatusInternalServerError, "failed to save image")
		return
	}

	writeJSONStatus(w, http.StatusCreated, image)
}

func parseImageDate(value string) (time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		now := time.Now().UTC()
		return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), nil
	}

	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, errors.New("date must be YYYY-MM-DD")
	}

	return parsed, nil
}

func parseOptionalID(value string, label string) (*int64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}

	id, err := strconv.ParseInt(value, 10, 64)
	if err != nil || id < 1 {
		return nil, errors.New(label + " must be a valid id")
	}

	return &id, nil
}

func parseFormBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "on", "yes":
		return true
	default:
		return false
	}
}
