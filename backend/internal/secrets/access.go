package secrets

import (
	"context"
	"fmt"
	"strings"

	secretmanager "cloud.google.com/go/secretmanager/apiv1"
	"cloud.google.com/go/secretmanager/apiv1/secretmanagerpb"
)

// AccessPayload reads the plaintext payload from a Secret Manager version using
// the process default credentials (e.g. GCE service account).
// name must be a full version resource name, for example:
// projects/PROJECT_ID/secrets/SECRET_ID/versions/latest
func AccessPayload(ctx context.Context, name string) (string, error) {
	client, err := secretmanager.NewClient(ctx)
	if err != nil {
		return "", fmt.Errorf("secretmanager client: %w", err)
	}
	defer func() { _ = client.Close() }()

	res, err := client.AccessSecretVersion(ctx, &secretmanagerpb.AccessSecretVersionRequest{
		Name: name,
	})
	if err != nil {
		return "", fmt.Errorf("access secret version %q: %w", name, err)
	}
	if res.Payload == nil || len(res.Payload.Data) == 0 {
		return "", fmt.Errorf("secret %q has empty payload", name)
	}
	out := strings.TrimSpace(string(res.Payload.Data))
	if out == "" {
		return "", fmt.Errorf("secret %q has empty payload after trim", name)
	}
	return out, nil
}

// IsGCPSecretVersionName reports whether value looks like a Secret Manager secret
// version resource name so callers can distinguish it from plaintext config.
func IsGCPSecretVersionName(value string) bool {
	s := strings.TrimSpace(value)
	return strings.HasPrefix(s, "projects/") &&
		strings.Contains(s, "/secrets/") &&
		strings.Contains(s, "/versions/")
}
