package main

import (
	"encoding/json"
	"time"
)

type User struct {
	ID          int64      `json:"id"`
	Email       string     `json:"email"`
	FirstName   string     `json:"firstName"`
	LastName    string     `json:"lastName"`
	Birthday    *time.Time `json:"birthday"`
	AvatarURL   *string    `json:"avatarUrl"`
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
	EventID    *int64    `json:"eventId"`
	TeamID     *int64    `json:"teamId"`
	UserIDs    []int32   `json:"userIds"`
	Homepage   bool      `json:"homepage"`
	Notes      string    `json:"notes"`
	UploadedAt time.Time `json:"uploadedAt"`
}

type Party struct {
	ID              int64     `json:"id"`
	Label           string    `json:"label"`
	Date            time.Time `json:"date"`
	Summary         string    `json:"summary"`
	PartifulURL     string    `json:"partifulUrl"`
	MediaURL        string    `json:"mediaUrl"`
	ThemePrimary    string    `json:"themePrimary"`
	ThemeAccent     string    `json:"themeAccent"`
	ThemeBackground string    `json:"themeBackground"`
	ThemeFont       string    `json:"themeFont"`
	Byom            bool      `json:"byom"`
}

type PartyRsvpStatus string

const (
	PartyRsvpStatusGoing    PartyRsvpStatus = "going"
	PartyRsvpStatusMaybe    PartyRsvpStatus = "maybe"
	PartyRsvpStatusNotGoing PartyRsvpStatus = "not_going"
)

func (s PartyRsvpStatus) Valid() bool {
	return s == PartyRsvpStatusGoing || s == PartyRsvpStatusMaybe || s == PartyRsvpStatusNotGoing
}

type PartySignupItem struct {
	ID          int64     `json:"id"`
	PartyID     int64     `json:"partyId"`
	UserID      *int64    `json:"userId"`
	Label       string    `json:"label"`
	Note        string    `json:"note"`
	HostCreated bool      `json:"hostCreated"`
	SortOrder   int       `json:"sortOrder"`
	CreatedAt   time.Time `json:"createdAt"`
}

type PartyAttendee struct {
	ID         int64           `json:"id"`
	PartyID    int64           `json:"partyId"`
	UserID     *int64          `json:"userId"`
	FirstName  string          `json:"firstName"`
	LastName   string          `json:"lastName"`
	Email      string          `json:"email"`
	PlusOneOf  *int64          `json:"plusOneOf"`
	Note       string          `json:"note"`
	RsvpStatus PartyRsvpStatus `json:"rsvpStatus"`
	Metadata   json.RawMessage `json:"metadata"`
	CreatedAt  time.Time       `json:"createdAt"`
}

type EventType string

const (
	EventTypeCostumeContest EventType = "0"
	EventTypeBracket        EventType = "1"
)

func (t EventType) Valid() bool {
	return t == EventTypeCostumeContest || t == EventTypeBracket
}

type Event struct {
	ID          int64           `json:"id"`
	Label       string          `json:"label"`
	PartyID     *int64          `json:"partyId"`
	StartDate   *time.Time      `json:"startDate"`
	EndDate     *time.Time      `json:"endDate"`
	CompletedAt *time.Time      `json:"completedAt"`
	Type        EventType       `json:"type"`
	Description string          `json:"description"`
	Metadata    json.RawMessage `json:"metadata"`
}

type EventUser struct {
	EventID    int64           `json:"eventId"`
	UserID     int64           `json:"userId"`
	Contestant bool            `json:"contestant"`
	Metadata   json.RawMessage `json:"metadata"`
}

type EventTeam struct {
	ID       int64           `json:"id"`
	EventID  int64           `json:"eventId"`
	Name     string          `json:"name"`
	UserIDs  []int32         `json:"userIds"`
	Metadata json.RawMessage `json:"metadata"`
}

type EventVote struct {
	EventID  int64           `json:"eventId"`
	UserID   int64           `json:"userId"`
	Metadata json.RawMessage `json:"metadata"`
}

type EventAttendee struct {
	EventID   int64           `json:"eventId"`
	UserID    int64           `json:"userId"`
	Metadata  json.RawMessage `json:"metadata"`
	CreatedAt time.Time       `json:"createdAt"`
}

type EventRound struct {
	ID             int64           `json:"id"`
	EventID        int64           `json:"eventId"`
	RoundNumber    int32           `json:"roundNumber"`
	Position       int32           `json:"position"`
	ParticipantOne json.RawMessage `json:"participantOne"`
	ParticipantTwo json.RawMessage `json:"participantTwo"`
	Winner         json.RawMessage `json:"winner"`
	CompletedAt    *time.Time      `json:"completedAt"`
	Metadata       json.RawMessage `json:"metadata"`
	CreatedAt      time.Time       `json:"createdAt"`
}

type EventDetail struct {
	Event     Event           `json:"event"`
	Users     []EventUser     `json:"users"`
	Teams     []EventTeam     `json:"teams"`
	Attendees []EventAttendee `json:"attendees"`
	Rounds    []EventRound    `json:"rounds"`
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
