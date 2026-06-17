package main

type Role string

const (
	RoleHost  Role = "host"
	RoleGuest Role = "guest"
)

func (r Role) Valid() bool {
	return r == RoleHost || r == RoleGuest
}
