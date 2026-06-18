package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"

	fbidentity "github.com/Vemnyx/thejkhouse/backend/internal/firebase"
)

type authService struct {
	client   *auth.Client
	identity *fbidentity.IdentityClient
}

func newAuthService(ctx context.Context) (*authService, error) {
	projectID := os.Getenv("FIREBASE_PROJECT_ID")
	if projectID == "" {
		projectID = "the-jk-house"
	}

	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID})
	if err != nil {
		return nil, fmt.Errorf("initialize firebase app: %w", err)
	}

	client, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("initialize firebase auth: %w", err)
	}

	identity, err := fbidentity.NewIdentityClient(ctx)
	if err != nil {
		return nil, err
	}

	return &authService{client: client, identity: identity}, nil
}

func (a *authService) createCustomToken(ctx context.Context, uid string) (string, error) {
	token, err := a.client.CustomToken(ctx, uid)
	if err != nil {
		return "", fmt.Errorf("create custom token: %w", err)
	}
	return token, nil
}

func (a *authService) deleteUser(ctx context.Context, uid string) error {
	err := a.client.DeleteUser(ctx, uid)
	if err != nil && !auth.IsUserNotFound(err) {
		return fmt.Errorf("delete firebase user: %w", err)
	}
	return nil
}

func (a *authService) verifyRequestToken(r *http.Request) (*auth.Token, error) {
	header := r.Header.Get("Authorization")
	if header == "" {
		return nil, errors.New("missing authorization header")
	}

	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return nil, errors.New("invalid authorization header")
	}

	return a.client.VerifyIDToken(r.Context(), parts[1])
}

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	return decoder.Decode(dst)
}
