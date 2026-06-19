package main

import "time"

type User struct {
	ID          int64      `json:"id"`
	Email       string     `json:"email"`
	FirstName   string     `json:"firstName"`
	LastName    string     `json:"lastName"`
	Birthday    *time.Time `json:"birthday"`
	Role        Role       `json:"role"`
	FirebaseUID string     `json:"-"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type registerRequest struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	Birthday  string `json:"birthday"`
}

type Image struct {
	ID         int64     `json:"id"`
	ImageURL   string    `json:"imageUrl"`
	Date       time.Time `json:"date"`
	PartyID    *int64    `json:"partyId"`
	Homepage   bool      `json:"homepage"`
	Notes      string    `json:"notes"`
	UploadedAt time.Time `json:"uploadedAt"`
}

type Party struct {
	ID    int64     `json:"id"`
	Label string    `json:"label"`
	Date  time.Time `json:"date"`
	HTML  string    `json:"html"`
}

type Homepage struct {
	HTML   string  `json:"html"`
	Images []Image `json:"images"`
}

type PendingSignup struct {
	ID          int64
	FirebaseUID string
	Email       string
	FirstName   string
	LastName    string
	Birthday    *time.Time
	Role        Role
	TokenHash   []byte
	ExpiresAt   time.Time
	CreatedAt   time.Time
}
