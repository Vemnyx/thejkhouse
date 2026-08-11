package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/internal/secrets"
)

const googleCustomSearchEndpoint = "https://www.googleapis.com/customsearch/v1"

// Google Custom Search JSON API allows at most 10 results per request.
const mediaSearchPageSize = 10

// Target number of items returned to the client (2 pages).
const mediaSearchTargetCount = 20

var gifURLPattern = regexp.MustCompile(`(?i)\.gif(\?|$)`)

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

	mediaType = strings.ToLower(strings.TrimSpace(mediaType))
	switch mediaType {
	case "gif", "image", "":
		if mediaType == "" {
			mediaType = "image"
		}
	default:
		return nil, fmt.Errorf("type must be image or gif")
	}

	primaryQuery := query
	if mediaType == "gif" && !strings.Contains(strings.ToLower(query), "gif") {
		primaryQuery = query + " gif"
	}

	items, err := c.searchPages(ctx, primaryQuery, mediaType, mediaSearchTargetCount)
	if err != nil {
		return nil, err
	}

	// If GIF results are thin (site list skewed toward still stock), try GIF hosts explicitly.
	if mediaType == "gif" && len(items) < mediaSearchPageSize {
		boosted := query + " (site:giphy.com OR site:tenor.com)"
		extra, extraErr := c.searchPages(ctx, boosted, mediaType, mediaSearchTargetCount)
		if extraErr == nil {
			items = mergeMediaSearchItems(items, extra, mediaSearchTargetCount)
		}
	}

	return items, nil
}

func (c *mediaSearchClient) searchPages(ctx context.Context, query, mediaType string, target int) ([]mediaSearchItem, error) {
	out := make([]mediaSearchItem, 0, target)
	seen := make(map[string]struct{}, target)

	for start := 1; len(out) < target && start <= 91; start += mediaSearchPageSize {
		page, err := c.searchPage(ctx, query, mediaType, mediaSearchPageSize, start)
		if err != nil {
			if len(out) > 0 {
				return out, nil
			}
			return nil, err
		}
		if len(page) == 0 {
			break
		}
		for _, item := range page {
			key := strings.ToLower(strings.TrimSpace(item.Link))
			if key == "" {
				continue
			}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, item)
			if len(out) >= target {
				break
			}
		}
		if len(page) < mediaSearchPageSize {
			break
		}
	}

	return out, nil
}

func (c *mediaSearchClient) searchPage(ctx context.Context, query, mediaType string, num, start int) ([]mediaSearchItem, error) {
	params := url.Values{}
	params.Set("key", c.apiKey)
	params.Set("cx", c.cx)
	params.Set("q", query)
	params.Set("searchType", "image")
	params.Set("num", fmt.Sprintf("%d", num))
	params.Set("start", fmt.Sprintf("%d", start))
	params.Set("safe", "active")

	if mediaType == "gif" {
		params.Set("fileType", "gif")
		params.Set("imgType", "animated")
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
		mime := strings.TrimSpace(item.Mime)
		if mediaType == "gif" {
			// CDN URLs from Giphy/Tenor often omit .gif; treat filetype=gif hits as GIFs.
			mime = "image/gif"
		} else if mime == "" && gifURLPattern.MatchString(link) {
			mime = "image/gif"
		}
		items = append(items, mediaSearchItem{
			Title:     strings.TrimSpace(item.Title),
			Link:      link,
			Thumbnail: strings.TrimSpace(item.Image.ThumbnailLink),
			Context:   strings.TrimSpace(item.Image.ContextLink),
			Mime:      mime,
		})
	}
	return items, nil
}

func mergeMediaSearchItems(primary, extra []mediaSearchItem, limit int) []mediaSearchItem {
	out := make([]mediaSearchItem, 0, limit)
	seen := make(map[string]struct{}, limit)
	appendUnique := func(items []mediaSearchItem) {
		for _, item := range items {
			key := strings.ToLower(strings.TrimSpace(item.Link))
			if key == "" {
				continue
			}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			out = append(out, item)
			if len(out) >= limit {
				return
			}
		}
	}
	appendUnique(primary)
	if len(out) < limit {
		appendUnique(extra)
	}
	return out
}
