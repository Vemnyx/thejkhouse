package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
)

const pendingSignupTokenBytes = 32

func newPendingSignupToken() (string, []byte, error) {
	raw := make([]byte, pendingSignupTokenBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", nil, fmt.Errorf("pending signup token: %w", err)
	}

	token := base64.RawURLEncoding.EncodeToString(raw)
	tokenHash := pendingSignupTokenHash(token)
	return token, tokenHash, nil
}

func pendingSignupTokenHash(token string) []byte {
	sum := sha256.Sum256([]byte(token))
	return sum[:]
}
