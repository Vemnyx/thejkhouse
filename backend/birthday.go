package main

import (
	"fmt"
	"strings"
	"time"
)

func parseBirthday(value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, fmt.Errorf("birthday is required")
	}

	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return nil, fmt.Errorf("birthday must be a valid date")
	}

	birthday := time.Date(parsed.Year(), parsed.Month(), parsed.Day(), 0, 0, 0, 0, time.UTC)
	return &birthday, nil
}
