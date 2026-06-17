package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/internal/secrets"
)

const (
	defaultEmailFrom  = "host@thejkhouse.com"
	resendAPIEndpoint = "https://api.resend.com/emails"
)

type emailClient struct {
	apiKey     string
	from       string
	httpClient *http.Client
}

type emailMessage struct {
	To      []string `json:"to"`
	From    string   `json:"from"`
	Subject string   `json:"subject"`
	HTML    string   `json:"html,omitempty"`
	Text    string   `json:"text,omitempty"`
}

type emailResponse struct {
	ID string `json:"id"`
}

func newEmailClient(ctx context.Context) (*emailClient, error) {
	apiKey, err := loadResendAPIKey(ctx)
	if err != nil {
		return nil, err
	}

	from := strings.TrimSpace(os.Getenv("EMAIL_FROM"))
	if from == "" {
		from = defaultEmailFrom
	}

	return &emailClient{
		apiKey: apiKey,
		from:   from,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}, nil
}

func loadResendAPIKey(ctx context.Context) (string, error) {
	if apiKey := strings.TrimSpace(os.Getenv("RESEND_API_KEY")); apiKey != "" {
		return apiKey, nil
	}

	secretName := strings.TrimSpace(os.Getenv("RESEND_API_KEY_SECRET"))
	if secretName == "" {
		return "", fmt.Errorf("email: set RESEND_API_KEY or RESEND_API_KEY_SECRET")
	}

	apiKey, err := secrets.AccessPayload(ctx, secretName)
	if err != nil {
		return "", fmt.Errorf("resend api key: %w", err)
	}
	return apiKey, nil
}

func (c *emailClient) send(ctx context.Context, to []string, subject string, html string, text string) (string, error) {
	if len(to) == 0 {
		return "", fmt.Errorf("email: at least one recipient is required")
	}
	if strings.TrimSpace(subject) == "" {
		return "", fmt.Errorf("email: subject is required")
	}
	if strings.TrimSpace(html) == "" && strings.TrimSpace(text) == "" {
		return "", fmt.Errorf("email: html or text body is required")
	}

	payload := emailMessage{
		To:      to,
		From:    c.from,
		Subject: subject,
		HTML:    html,
		Text:    text,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, resendAPIEndpoint, bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	res, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("resend request: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("resend response: %w", err)
	}

	if res.StatusCode < 200 || res.StatusCode > 299 {
		return "", fmt.Errorf("resend status %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}

	var response emailResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return "", fmt.Errorf("resend decode: %w", err)
	}
	if response.ID == "" {
		return "", fmt.Errorf("resend response missing id")
	}

	return response.ID, nil
}
