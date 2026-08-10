package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/internal/secrets"
)

const googleCustomSearchEndpoint = "https://www.googleapis.com/customsearch/v1"

type mediaSearchClient struct {
	apiKey     string
	cx         string
	httpClient *http.Client
}

type mediaSearchItem struct {
	Title     string `json:"title"`
	Link      string `json:"link"`
	Thumbnail string `json:"thumbnail"`
	Context   string `json:"context"`
	Mime      string `json:"mime"`
}

type googleCustomSearchResponse struct {
	Items []struct {
		Title string `json:"title"`
		Link  string `json:"link"`
		Mime  string `json:"mime"`
		Image struct {
			ContextLink     string `json:"contextLink"`
			ThumbnailLink   string `json:"thumbnailLink"`
			ThumbnailHeight int    `json:"thumbnailHeight"`
			ThumbnailWidth  int    `json:"thumbnailWidth"`
		} `json:"image"`
	} `json:"items"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func newMediaSearchClient(ctx context.Context) (*mediaSearchClient, error) {
	apiKey, err := loadGoogleCSEAPIKey(ctx)
	if err != nil {
		return nil, err
	}
	if apiKey == "" {
		return nil, nil
	}

	cx, err := loadGoogleCSECX(ctx)
	if err != nil {
		return nil, err
	}
	if cx == "" {
		return nil, fmt.Errorf("media search: GOOGLE_CSE_CX is required when an API key is configured")
	}

	return &mediaSearchClient{
		apiKey: apiKey,
		cx:     cx,
		httpClient: &http.Client{
			Timeout: 20 * time.Second,
		},
	}, nil
}

func loadGoogleCSEAPIKey(ctx context.Context) (string, error) {
	if apiKey := strings.TrimSpace(os.Getenv("GOOGLE_CSE_API_KEY")); apiKey != "" {
		return apiKey, nil
	}

	secretName := strings.TrimSpace(os.Getenv("GOOGLE_CSE_API_KEY_SECRET"))
	if secretName == "" {
		return "", nil
	}

	apiKey, err := secrets.AccessPayload(ctx, secretName)
	if err != nil {
		return "", fmt.Errorf("google cse api key: %w", err)
	}
	return strings.TrimSpace(apiKey), nil
}

func loadGoogleCSECX(ctx context.Context) (string, error) {
	if cx := strings.TrimSpace(os.Getenv("GOOGLE_CSE_CX")); cx != "" {
		return cx, nil
	}

	secretName := strings.TrimSpace(os.Getenv("GOOGLE_CSE_CX_SECRET"))
	if secretName == "" {
		return "", nil
	}

	cx, err := secrets.AccessPayload(ctx, secretName)
	if err != nil {
		return "", fmt.Errorf("google cse cx: %w", err)
	}
	return strings.TrimSpace(cx), nil
}

func (c *mediaSearchClient) search(ctx context.Context, query, mediaType string) ([]mediaSearchItem, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, fmt.Errorf("query is required")
	}

	params := url.Values{}
	params.Set("key", c.apiKey)
	params.Set("cx", c.cx)
	params.Set("q", query)
	params.Set("searchType", "image")
	params.Set("num", "10")
	params.Set("safe", "active")

	switch strings.ToLower(strings.TrimSpace(mediaType)) {
	case "gif":
		params.Set("fileType", "gif")
		params.Set("imgType", "animated")
	case "image", "":
		// default image search
	default:
		return nil, fmt.Errorf("type must be image or gif")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, googleCustomSearchEndpoint+"?"+params.Encode(), nil)
	if err != nil {
		return nil, err
	}

	res, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if err != nil {
		return nil, err
	}

	var payload googleCustomSearchResponse
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("decode google search response: %w", err)
	}
	if payload.Error != nil && strings.TrimSpace(payload.Error.Message) != "" {
		return nil, fmt.Errorf("%s", payload.Error.Message)
	}
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return nil, fmt.Errorf("google search status %d", res.StatusCode)
	}

	items := make([]mediaSearchItem, 0, len(payload.Items))
	for _, item := range payload.Items {
		link := strings.TrimSpace(item.Link)
		if link == "" {
			continue
		}
		items = append(items, mediaSearchItem{
			Title:     strings.TrimSpace(item.Title),
			Link:      link,
			Thumbnail: strings.TrimSpace(item.Image.ThumbnailLink),
			Context:   strings.TrimSpace(item.Image.ContextLink),
			Mime:      strings.TrimSpace(item.Mime),
		})
	}
	return items, nil
}
