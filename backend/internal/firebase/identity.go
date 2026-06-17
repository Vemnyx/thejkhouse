package firebase

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const identityToolkitBase = "https://identitytoolkit.googleapis.com/v1"

// AuthSession is returned after a successful email/password sign-in or sign-up.
type AuthSession struct {
	LocalID      string `json:"localId"`
	Email        string `json:"email"`
	IDToken      string `json:"idToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    string `json:"expiresIn"`
}

// IdentityClient calls the Firebase Identity Toolkit REST API.
type IdentityClient struct {
	apiKey     string
	httpClient *http.Client
}

func newIdentityClient(apiKey string) *IdentityClient {
	return &IdentityClient{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// SignInWithPassword authenticates an existing user by email and password.
func (c *IdentityClient) SignInWithPassword(ctx context.Context, email, password string) (AuthSession, error) {
	return c.postAccounts(ctx, "signInWithPassword", map[string]any{
		"email":             email,
		"password":          password,
		"returnSecureToken": true,
	})
}

// SignUp creates a new Firebase user with email and password.
func (c *IdentityClient) SignUp(ctx context.Context, email, password string) (AuthSession, error) {
	return c.postAccounts(ctx, "signUp", map[string]any{
		"email":             email,
		"password":          password,
		"returnSecureToken": true,
	})
}

func (c *IdentityClient) postAccounts(ctx context.Context, action string, body map[string]any) (AuthSession, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return AuthSession{}, err
	}

	url := fmt.Sprintf("%s/accounts:%s?key=%s", identityToolkitBase, action, c.apiKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return AuthSession{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := c.httpClient.Do(req)
	if err != nil {
		return AuthSession{}, fmt.Errorf("identity toolkit request: %w", err)
	}
	defer func() { _ = res.Body.Close() }()

	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return AuthSession{}, fmt.Errorf("identity toolkit response: %w", err)
	}

	if res.StatusCode != http.StatusOK {
		return AuthSession{}, mapIdentityError(raw)
	}

	var session AuthSession
	if err := json.Unmarshal(raw, &session); err != nil {
		return AuthSession{}, fmt.Errorf("identity toolkit decode: %w", err)
	}
	if session.LocalID == "" {
		return AuthSession{}, fmt.Errorf("identity toolkit: missing local id")
	}

	return session, nil
}

type identityErrorResponse struct {
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

func mapIdentityError(raw []byte) error {
	var payload identityErrorResponse
	_ = json.Unmarshal(raw, &payload)

	msg := strings.TrimSpace(payload.Error.Message)
	switch {
	case msg == "":
		return fmt.Errorf("authentication failed")
	case strings.Contains(msg, "EMAIL_NOT_FOUND"),
		strings.Contains(msg, "INVALID_PASSWORD"),
		strings.Contains(msg, "INVALID_LOGIN_CREDENTIALS"):
		return fmt.Errorf("invalid email or password")
	case strings.Contains(msg, "EMAIL_EXISTS"):
		return fmt.Errorf("an account with this email already exists")
	case strings.Contains(msg, "WEAK_PASSWORD"):
		return fmt.Errorf("password must be at least 6 characters")
	case strings.Contains(msg, "INVALID_EMAIL"):
		return fmt.Errorf("invalid email address")
	case strings.Contains(msg, "OPERATION_NOT_ALLOWED"):
		return fmt.Errorf("email/password sign-in is not enabled")
	default:
		return fmt.Errorf("%s", msg)
	}
}

// NewIdentityClient builds a client using the API key from the environment.
func NewIdentityClient(ctx context.Context) (*IdentityClient, error) {
	key, err := loadAPIKey(ctx)
	if err != nil {
		return nil, err
	}
	return newIdentityClient(key), nil
}
