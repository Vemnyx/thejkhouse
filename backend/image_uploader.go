package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"cloud.google.com/go/storage"
)

const defaultImageBucket = "thejkhouse-assets"

type imageUploader struct {
	bucket string
	client *storage.Client
}

func newImageUploader(ctx context.Context) (*imageUploader, error) {
	client, err := storage.NewClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("storage client: %w", err)
	}

	bucket := strings.TrimSpace(os.Getenv("IMAGE_BUCKET"))
	if bucket == "" {
		bucket = defaultImageBucket
	}

	return &imageUploader{bucket: bucket, client: client}, nil
}

func (u *imageUploader) upload(ctx context.Context, r io.Reader, originalFilename string, contentType string, now time.Time) (string, error) {
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	objectName, err := imageObjectName(originalFilename, contentType, now)
	if err != nil {
		return "", err
	}

	w := u.client.Bucket(u.bucket).Object(objectName).NewWriter(ctx)
	w.ContentType = contentType
	w.CacheControl = "public, max-age=31536000"

	if _, err := io.Copy(w, r); err != nil {
		_ = w.Close()
		return "", fmt.Errorf("upload image: %w", err)
	}
	if err := w.Close(); err != nil {
		return "", fmt.Errorf("finalize image upload: %w", err)
	}

	return fmt.Sprintf("https://storage.googleapis.com/%s/%s", u.bucket, objectName), nil
}

func (u *imageUploader) uploadFromURL(ctx context.Context, sourceURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(sourceURL))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("invalid image url")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fmt.Errorf("image url must be http or https")
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, parsed.String(), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "thejkhouse-media-fetcher/1.0")

	client := &http.Client{Timeout: 30 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("download image: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode < 200 || res.StatusCode > 299 {
		return "", fmt.Errorf("download image status %d", res.StatusCode)
	}

	limited := io.LimitReader(res.Body, 10<<20+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return "", fmt.Errorf("read image: %w", err)
	}
	if len(data) == 0 {
		return "", fmt.Errorf("downloaded image is empty")
	}
	if len(data) > 10<<20 {
		return "", fmt.Errorf("downloaded image exceeds 10MB")
	}

	contentType, ok := detectImageContentType(data)
	if !ok {
		headerType := strings.TrimSpace(strings.Split(res.Header.Get("Content-Type"), ";")[0])
		if headerType == "image/jpeg" || headerType == "image/png" || headerType == "image/gif" || headerType == "image/webp" {
			contentType = headerType
		} else {
			return "", fmt.Errorf("downloaded file is not a supported image")
		}
	}

	filename := filepath.Base(parsed.Path)
	if filename == "" || filename == "." || filename == "/" {
		filename = "media"
	}

	return u.upload(ctx, bytes.NewReader(data), filename, contentType, time.Now().UTC())
}

func (u *imageUploader) close() {
	_ = u.client.Close()
}

func (u *imageUploader) delete(ctx context.Context, imageURL string) error {
	objectName, err := u.objectNameFromURL(imageURL)
	if err != nil {
		return err
	}

	err = u.client.Bucket(u.bucket).Object(objectName).Delete(ctx)
	if err == storage.ErrObjectNotExist {
		return nil
	}
	if err != nil {
		return fmt.Errorf("delete image: %w", err)
	}

	return nil
}

func (u *imageUploader) objectNameFromURL(imageURL string) (string, error) {
	parsed, err := url.Parse(imageURL)
	if err != nil {
		return "", fmt.Errorf("parse image url: %w", err)
	}

	prefix := "/" + u.bucket + "/"
	if parsed.Host != "storage.googleapis.com" || !strings.HasPrefix(parsed.Path, prefix) {
		return "", fmt.Errorf("image url is not in bucket %q", u.bucket)
	}

	objectName, err := url.PathUnescape(strings.TrimPrefix(parsed.Path, prefix))
	if err != nil {
		return "", fmt.Errorf("decode object name: %w", err)
	}
	if objectName == "" {
		return "", fmt.Errorf("image url has empty object name")
	}

	return objectName, nil
}

func imageObjectName(originalFilename string, contentType string, now time.Time) (string, error) {
	token := make([]byte, 12)
	if _, err := rand.Read(token); err != nil {
		return "", fmt.Errorf("image name token: %w", err)
	}

	ext := strings.ToLower(filepath.Ext(originalFilename))
	if ext == "" {
		extensions, _ := mime.ExtensionsByType(contentType)
		if len(extensions) > 0 {
			ext = extensions[0]
		}
	}
	if ext == "" {
		ext = ".bin"
	}

	return fmt.Sprintf("images/%s/%d-%s%s", now.UTC().Format("2006/01/02"), now.UnixNano(), hex.EncodeToString(token), ext), nil
}

func detectImageContentType(sample []byte) (string, bool) {
	contentType := http.DetectContentType(sample)
	switch contentType {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
		return contentType, true
	default:
		return contentType, false
	}
}
