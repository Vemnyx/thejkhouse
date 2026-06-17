package main

import "time"

type User struct {
	ID         int64     `json:"id"`
	Email      string    `json:"email"`
	FirstName  string    `json:"firstName"`
	LastName   string    `json:"lastName"`
	Role       Role      `json:"role"`
	FirebaseUID string   `json:"-"`
	CreatedAt  time.Time `json:"createdAt"`
}

type registerRequest struct {
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
}
