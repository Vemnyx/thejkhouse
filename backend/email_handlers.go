package main

import (
	"html"
	"net/http"
	"net/mail"
	"strings"

	"github.com/Vemnyx/thejkhouse/backend/log"
)

type sendEmailRequest struct {
	To      string `json:"to"`
	Subject string `json:"subject"`
	Message string `json:"message"`
}

func (s *apiServer) handleEmails(w http.ResponseWriter, r *http.Request) {
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
		log.Error("email auth", "error", err)
		writeError(w, http.StatusInternalServerError, "failed to authorize email")
		return
	}
	if user.Role != RoleHost {
		writeError(w, http.StatusForbidden, "host access is required")
		return
	}

	var payload sendEmailRequest
	if err := readJSON(r, &payload); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	to := strings.TrimSpace(payload.To)
	subject := strings.TrimSpace(payload.Subject)
	message := strings.TrimSpace(payload.Message)
	if to == "" || subject == "" || message == "" {
		writeError(w, http.StatusBadRequest, "to, subject, and message are required")
		return
	}
	if _, err := mail.ParseAddress(to); err != nil {
		writeError(w, http.StatusBadRequest, "to must be a valid email address")
		return
	}

	emailID, err := s.email.send(r.Context(), []string{to}, subject, textToHTML(message), message)
	if err != nil {
		log.Error("email send", "error", err, "to", to)
		writeError(w, http.StatusInternalServerError, "failed to send email")
		return
	}

	log.Info("email sent", "email_id", emailID, "to", to)
	writeJSONStatus(w, http.StatusAccepted, map[string]string{"id": emailID})
}

func textToHTML(message string) string {
	lines := strings.Split(html.EscapeString(message), "\n")
	return "<p>" + strings.Join(lines, "<br>") + "</p>"
}
