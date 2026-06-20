package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
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
	partyAddress      = "1116 Rosepine Dr\nCary, NC 27519"
)

const partyHTMLTemplate = `<section class="party-template">
  <header class="party-template-hero">
    <p class="party-template-kicker">The JK House Presents</p>
    <h2>Party Name</h2>
    <p>Short intro for what guests should expect.</p>
  </header>
  <section class="party-template-details" aria-label="Party details">
    <article>
      <span>When</span>
      <strong>Date and time</strong>
    </article>
    <article>
      <span>Where</span>
      <strong>1116 Rosepine Dr<br />Cary, NC 27519</strong>
    </article>
    <article>
      <span>Theme</span>
      <strong>What to wear or bring</strong>
    </article>
  </section>
  <section class="party-template-actions" aria-label="Party actions">
    <span>RSVP coming soon</span>
    <span>Calendar sync coming soon</span>
    <span>Sign-up sheets coming soon</span>
  </section>
  <section class="party-template-copy">
    <h3>About the party</h3>
    <p>Add the announcement, food notes, house rules, schedule, and anything guests should know.</p>
  </section>
</section>`

type aiClient struct {
	apiKey     string
	httpClient *http.Client
}

type publicAIError struct {
	message string
	err     error
}

func (e publicAIError) Error() string {
	if e.err == nil {
		return e.message
	}
	return e.message + ": " + e.err.Error()
}

func (e publicAIError) Unwrap() error {
	return e.err
}

func newPublicAIError(message string, err error) error {
	return publicAIError{message: message, err: err}
}

func publicAIErrorMessage(err error) (string, bool) {
	var publicErr publicAIError
	if errors.As(err, &publicErr) {
		return publicErr.message, true
	}
	return "", false
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
		if errors.Is(err, errAIRunTimeout) {
			return "", newPublicAIError("The AI draft took too long. Try again with shorter instructions.", err)
		}
		return "", err
	}
	if strings.ToUpper(run.Status) != "FINISHED" {
		return "", newPublicAIError("The AI draft could not be completed. Try again with a simpler prompt.", fmt.Errorf("cursor run ended with status %s", run.Status))
	}

	html := cleanGeneratedHTML(run.Result)
	if html == "" {
		return "", newPublicAIError("The AI returned an empty draft. Try adding more detail to the prompt.", fmt.Errorf("cursor returned empty html"))
	}
	html = ensureUploadedImagesIncluded(html, imageURLs)
	if err := validateGeneratedHTML(blockType, html); err != nil {
		return "", newPublicAIError(err.Error(), err)
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
			return cursorRun{}, errAIRunTimeout
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
	var addressInstructions string
	var templateInstructions string
	var markupInstructions string
	if blockType == "party" {
		target = "a party announcement block"
		addressInstructions = partyAddress
		templateInstructions = partyHTMLTemplate
		markupInstructions = "Party drafts may include script tags, javascript: URLs, and inline event handlers when useful. Do not include iframes."
	} else {
		target = "a homepage announcement block"
		addressInstructions = "No party address applies."
		templateInstructions = "No fixed template applies."
		markupInstructions = "Do not include scripts, javascript: URLs, inline event handlers, or iframes."
	}

	imageInstructions := "No uploaded images were provided."
	if len(imageURLs) > 0 {
		imageInstructions = "The host uploaded these public CDN image URLs. You MUST include every uploaded image URL in the returned HTML using img tags with useful alt text. Place the images where they best support the announcement, and do not invent or use any image URLs beyond this list:\n- " + strings.Join(imageURLs, "\n- ")
	}

	return fmt.Sprintf(`You are helping The JK House website host draft %s.

Use the repository context to match the existing frontend aesthetic and CSS conventions. Relevant files include frontend/src/index.css, frontend/src/pages/HomePage.tsx, and frontend/src/pages/HostPage.tsx.

Rules:
- Do not edit files.
- Return only an HTML fragment, not a full document.
- Do not include markdown fences or explanations.
- %s
- Do not use external assets except the uploaded CDN image URLs listed below.
- If uploaded images are provided, include every uploaded image in the fragment.
- Any uploaded image URL omitted from your draft will be appended automatically at the end, so place them intentionally in the layout instead.
- For party blocks, preserve and fill the provided party template structure and class names unless the host explicitly asks for a different layout.
- Prefer semantic HTML elements and copy that fits The JK House tone.
- Keep the fragment concise enough to paste into the existing editor.

Host instructions:
%s

Party address:
%s

Party template:
%s

Uploaded images:
%s

Existing HTML, if any:
%s`, target, markupInstructions, instructions, addressInstructions, templateInstructions, imageInstructions, existingHTML)
}

func cleanGeneratedHTML(value string) string {
	html := strings.TrimSpace(value)
	html = strings.TrimPrefix(html, "```html")
	html = strings.TrimPrefix(html, "```")
	html = strings.TrimSuffix(html, "```")
	return strings.TrimSpace(html)
}

func ensureUploadedImagesIncluded(html string, imageURLs []string) string {
	missing := make([]string, 0)
	for _, imageURL := range imageURLs {
		imageURL = strings.TrimSpace(imageURL)
		if imageURL == "" || strings.Contains(html, imageURL) {
			continue
		}
		missing = append(missing, imageURL)
	}
	if len(missing) == 0 {
		return html
	}

	var builder strings.Builder
	builder.WriteString(strings.TrimSpace(html))
	builder.WriteString("\n\n<section class=\"party-template-images\" aria-label=\"Party images\">\n")
	for index, imageURL := range missing {
		builder.WriteString(fmt.Sprintf("  <figure>\n    <img src=%q alt=%q />\n  </figure>\n", imageURL, fmt.Sprintf("Party image %d", index+1)))
	}
	builder.WriteString("</section>")
	return builder.String()
}

func validateGeneratedHTML(blockType string, html string) error {
	lower := strings.ToLower(html)
	if strings.Contains(lower, "<iframe") {
		return fmt.Errorf("The AI returned an iframe, which is not allowed. Ask it to describe embeds as plain links instead.")
	}
	if blockType == "party" {
		return nil
	}
	if strings.Contains(lower, "<script") {
		return fmt.Errorf("The AI returned a script tag, which is not allowed. Ask it for static HTML only.")
	}
	if strings.Contains(lower, "javascript:") {
		return fmt.Errorf("The AI returned a javascript link, which is not allowed. Ask it for static links or plain text.")
	}
	eventHandler := regexp.MustCompile(`(?i)\son[a-z]+\s*=`)
	if eventHandler.MatchString(html) {
		return fmt.Errorf("The AI returned inline event handlers, which are not allowed. Ask it for static HTML without click handlers.")
	}
	return nil
}
