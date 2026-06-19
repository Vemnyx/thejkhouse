package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/internal/secrets"
)

const (
	cursorAPIEndpoint = "https://api.cursor.com/v1"
	cursorRepoURL     = "https://github.com/Vemnyx/thejkhouse.git"
)

type aiClient struct {
	apiKey     string
	httpClient *http.Client
}

type cursorCreateAgentRequest struct {
	Prompt       cursorPrompt `json:"prompt"`
	Name         string       `json:"name,omitempty"`
	Repos        []cursorRepo `json:"repos,omitempty"`
	AutoCreatePR bool         `json:"autoCreatePR"`
}

type cursorPrompt struct {
	Text string `json:"text"`
}

type cursorRepo struct {
	URL         string `json:"url"`
	StartingRef string `json:"startingRef,omitempty"`
}

type cursorCreateAgentResponse struct {
	Agent cursorAgent `json:"agent"`
	Run   cursorRun   `json:"run"`
}

type cursorAgent struct {
	ID string `json:"id"`
}

type cursorRun struct {
	ID      string `json:"id"`
	AgentID string `json:"agentId"`
	Status  string `json:"status"`
	Result  string `json:"result"`
}

func newAIClient(ctx context.Context) (*aiClient, error) {
	apiKey, err := loadCursorAPIKey(ctx)
	if err != nil {
		return nil, err
	}

	return &aiClient{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}, nil
}

func loadCursorAPIKey(ctx context.Context) (string, error) {
	if apiKey := strings.TrimSpace(os.Getenv("CURSOR_API_KEY")); apiKey != "" {
		return apiKey, nil
	}

	secretName := strings.TrimSpace(os.Getenv("CURSOR_API_KEY_SECRET"))
	if secretName == "" {
		return "", fmt.Errorf("ai: set CURSOR_API_KEY or CURSOR_API_KEY_SECRET")
	}

	apiKey, err := secrets.AccessPayload(ctx, secretName)
	if err != nil {
		return "", fmt.Errorf("cursor api key: %w", err)
	}
	return strings.TrimSpace(apiKey), nil
}

func (c *aiClient) generateHTML(ctx context.Context, blockType string, instructions string, existingHTML string, imageURLs []string) (string, error) {
	prompt := buildHTMLPrompt(blockType, instructions, existingHTML, imageURLs)
	createPayload := cursorCreateAgentRequest{
		Prompt: cursorPrompt{Text: prompt},
		Name:   "Draft JK House HTML block",
		Repos: []cursorRepo{
			{URL: cursorRepoURL, StartingRef: "main"},
		},
		AutoCreatePR: false,
	}

	var created cursorCreateAgentResponse
	if err := c.doJSON(ctx, http.MethodPost, "/agents", createPayload, &created); err != nil {
		return "", err
	}
	if created.Agent.ID == "" || created.Run.ID == "" {
		return "", fmt.Errorf("cursor response missing agent or run id")
	}

	run, err := c.waitForRun(ctx, created.Agent.ID, created.Run.ID)
	if err != nil {
		return "", err
	}
	if strings.ToUpper(run.Status) != "FINISHED" {
		return "", fmt.Errorf("cursor run ended with status %s", run.Status)
	}

	html := cleanGeneratedHTML(run.Result)
	if html == "" {
		return "", fmt.Errorf("cursor returned empty html")
	}
	if err := validateGeneratedHTML(html); err != nil {
		return "", err
	}

	return html, nil
}

func (c *aiClient) waitForRun(ctx context.Context, agentID string, runID string) (cursorRun, error) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	deadline := time.NewTimer(70 * time.Second)
	defer deadline.Stop()

	for {
		var run cursorRun
		if err := c.doJSON(ctx, http.MethodGet, fmt.Sprintf("/agents/%s/runs/%s", agentID, runID), nil, &run); err != nil {
			return cursorRun{}, err
		}

		switch strings.ToUpper(run.Status) {
		case "FINISHED", "ERROR", "CANCELLED", "EXPIRED":
			return run, nil
		}

		select {
		case <-ctx.Done():
			return cursorRun{}, ctx.Err()
		case <-deadline.C:
			return cursorRun{}, fmt.Errorf("cursor run timed out")
		case <-ticker.C:
		}
	}
}

func (c *aiClient) doJSON(ctx context.Context, method string, path string, payload any, target any) error {
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, cursorAPIEndpoint+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(c.apiKey+":")))
	req.Header.Set("Content-Type", "application/json")

	res, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("cursor request: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	raw, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return fmt.Errorf("cursor response: %w", err)
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return fmt.Errorf("cursor status %d: %s", res.StatusCode, strings.TrimSpace(string(raw)))
	}
	if target == nil {
		return nil
	}
	if err := json.Unmarshal(raw, target); err != nil {
		return fmt.Errorf("cursor decode: %w", err)
	}
	return nil
}

func buildHTMLPrompt(blockType string, instructions string, existingHTML string, imageURLs []string) string {
	var target string
	if blockType == "party" {
		target = "a party announcement block"
	} else {
		target = "a homepage announcement block"
	}

	imageInstructions := "No uploaded images were provided."
	if len(imageURLs) > 0 {
		imageInstructions = "The host uploaded these public CDN image URLs. Work them into the HTML only where they naturally support the announcement. Use img tags with useful alt text, and do not invent or use any image URLs beyond this list:\n- " + strings.Join(imageURLs, "\n- ")
	}

	return fmt.Sprintf(`You are helping The JK House website host draft %s.

Use the repository context to match the existing frontend aesthetic and CSS conventions. Relevant files include frontend/src/index.css, frontend/src/pages/HomePage.tsx, and frontend/src/pages/HostPage.tsx.

Rules:
- Do not edit files.
- Return only a safe HTML fragment, not a full document.
- Do not include markdown fences, explanations, scripts, inline event handlers, forms, or iframes.
- Do not use external assets except the uploaded CDN image URLs listed below.
- Prefer semantic HTML elements and copy that fits The JK House tone.
- Keep the fragment concise enough to paste into the existing editor.

Host instructions:
%s

Uploaded images:
%s

Existing HTML, if any:
%s`, target, instructions, imageInstructions, existingHTML)
}

func cleanGeneratedHTML(value string) string {
	html := strings.TrimSpace(value)
	html = strings.TrimPrefix(html, "```html")
	html = strings.TrimPrefix(html, "```")
	html = strings.TrimSuffix(html, "```")
	return strings.TrimSpace(html)
}

func validateGeneratedHTML(html string) error {
	lower := strings.ToLower(html)
	if strings.Contains(lower, "<script") || strings.Contains(lower, "javascript:") || strings.Contains(lower, "<iframe") {
		return fmt.Errorf("generated html contained unsafe markup")
	}
	eventHandler := regexp.MustCompile(`(?i)\son[a-z]+\s*=`)
	if eventHandler.MatchString(html) {
		return fmt.Errorf("generated html contained unsafe event handlers")
	}
	return nil
}
