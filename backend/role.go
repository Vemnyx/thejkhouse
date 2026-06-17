package main

import (
	"encoding/json"
	"fmt"
)

type Role int

const (
	RoleHost  Role = 0
	RoleGuest Role = 1
)

func (r Role) Valid() bool {
	return r == RoleHost || r == RoleGuest
}

func (r Role) String() string {
	switch r {
	case RoleHost:
		return "host"
	case RoleGuest:
		return "guest"
	default:
		return "guest"
	}
}

func (r Role) MarshalJSON() ([]byte, error) {
	return json.Marshal(r.String())
}

func (r *Role) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}

	switch s {
	case "host":
		*r = RoleHost
	case "guest":
		*r = RoleGuest
	default:
		return fmt.Errorf("invalid role %q", s)
	}

	return nil
}
