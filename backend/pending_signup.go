package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"os"
	"strings"

	"github.com/Vemnyx/thejkhouse/backend/internal/secrets"
)

const pendingSignupTokenBytes = 32

type pendingSignupCodec struct {
	key []byte
}

func newPendingSignupCodec(ctx context.Context) (*pendingSignupCodec, error) {
	key, err := loadPendingSignupKey(ctx)
	if err != nil {
		return nil, err
	}
	return &pendingSignupCodec{key: key}, nil
}

func loadPendingSignupKey(ctx context.Context) ([]byte, error) {
	value := strings.TrimSpace(os.Getenv("PENDING_SIGNUP_ENCRYPTION_KEY"))
	if value == "" {
		secretName := strings.TrimSpace(os.Getenv("PENDING_SIGNUP_ENCRYPTION_KEY_SECRET"))
		if secretName == "" {
			return nil, fmt.Errorf("pending signup: set PENDING_SIGNUP_ENCRYPTION_KEY or PENDING_SIGNUP_ENCRYPTION_KEY_SECRET")
		}

		secretValue, err := secrets.AccessPayload(ctx, secretName)
		if err != nil {
			return nil, fmt.Errorf("pending signup key: %w", err)
		}
		value = secretValue
	}

	key, err := base64.StdEncoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("pending signup key must be base64: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("pending signup key must decode to 32 bytes")
	}

	return key, nil
}

func (c *pendingSignupCodec) encrypt(value string) ([]byte, error) {
	block, err := aes.NewCipher(c.key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("nonce: %w", err)
	}

	encrypted := gcm.Seal(nonce, nonce, []byte(value), nil)
	return encrypted, nil
}

func (c *pendingSignupCodec) decrypt(encrypted []byte) (string, error) {
	block, err := aes.NewCipher(c.key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(encrypted) < gcm.NonceSize() {
		return "", fmt.Errorf("encrypted value is too short")
	}

	nonce := encrypted[:gcm.NonceSize()]
	ciphertext := encrypted[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt pending signup: %w", err)
	}

	return string(plaintext), nil
}

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
