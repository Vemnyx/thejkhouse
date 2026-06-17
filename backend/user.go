package main

import "time"

type User struct {
	ID          int64     `json:"id"`
	Email       string    `json:"email"`
	FirstName   string    `json:"firstName"`
	LastName    string    `json:"lastName"`
	Role        Role      `json:"role"`
	FirebaseUID string    `json:"-"`
	CreatedAt   time.Time `json:"createdAt"`
}

type registerRequest struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
}

type Image struct {
	ID         int64     `json:"id"`
	ImageURL   string    `json:"imageUrl"`
	Date       time.Time `json:"date"`
	UploadedAt time.Time `json:"uploadedAt"`
}

type PendingSignup struct {
	ID                int64
	Email             string
	FirstName         string
	LastName          string
	Role              Role
	EncryptedPassword []byte
	TokenHash         []byte
	ExpiresAt         time.Time
	CreatedAt         time.Time
}
