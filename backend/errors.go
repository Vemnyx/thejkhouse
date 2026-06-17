package main

import "errors"

var (
	errInvalidBody        = errors.New("invalid request body")
	errMissingCredentials = errors.New("email and password are required")
)
