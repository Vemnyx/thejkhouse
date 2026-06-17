package firebase

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/Vemnyx/thejkhouse/backend/internal/secrets"
)

// WebConfig is the Firebase client SDK configuration for the web app.
type WebConfig struct {
	APIKey            string `json:"apiKey"`
	AuthDomain        string `json:"authDomain"`
	ProjectID         string `json:"projectId"`
	StorageBucket     string `json:"storageBucket"`
	MessagingSenderID string `json:"messagingSenderId"`
	AppID             string `json:"appId"`
}

// LoadWebConfig returns public Firebase web config with the API key from
// Secret Manager (FIREBASE_API_KEY_SECRET) or FIREBASE_API_KEY when set locally.
func LoadWebConfig(ctx context.Context) (WebConfig, error) {
	apiKey, err := loadAPIKey(ctx)
	if err != nil {
		return WebConfig{}, err
	}

	projectID := strings.TrimSpace(os.Getenv("FIREBASE_PROJECT_ID"))
	if projectID == "" {
		projectID = "the-jk-house"
	}

	authDomain := strings.TrimSpace(os.Getenv("FIREBASE_AUTH_DOMAIN"))
	if authDomain == "" {
		authDomain = projectID + ".firebaseapp.com"
	}

	storageBucket := strings.TrimSpace(os.Getenv("FIREBASE_STORAGE_BUCKET"))
	if storageBucket == "" {
		storageBucket = projectID + ".firebasestorage.app"
	}

	messagingSenderID := strings.TrimSpace(os.Getenv("FIREBASE_MESSAGING_SENDER_ID"))
	if messagingSenderID == "" {
		messagingSenderID = "975143384474"
	}

	appID := strings.TrimSpace(os.Getenv("FIREBASE_APP_ID"))
	if appID == "" {
		appID = "1:975143384474:web:dae1b3d49b8491e6f97623"
	}

	return WebConfig{
		APIKey:            apiKey,
		AuthDomain:        authDomain,
		ProjectID:         projectID,
		StorageBucket:     storageBucket,
		MessagingSenderID: messagingSenderID,
		AppID:             appID,
	}, nil
}

func loadAPIKey(ctx context.Context) (string, error) {
	if key := strings.TrimSpace(os.Getenv("FIREBASE_API_KEY")); key != "" {
		return key, nil
	}

	name := strings.TrimSpace(os.Getenv("FIREBASE_API_KEY_SECRET"))
	if name == "" {
		return "", fmt.Errorf("firebase: set FIREBASE_API_KEY or FIREBASE_API_KEY_SECRET")
	}

	key, err := secrets.AccessPayload(ctx, name)
	if err != nil {
		return "", fmt.Errorf("firebase api key: %w", err)
	}
	return key, nil
}
