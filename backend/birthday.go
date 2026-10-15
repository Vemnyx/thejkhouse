package main

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

type partyBirthdayPerson struct {
	Name string
	Day  int
}

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

func partyMonthName(partyDate time.Time) string {
	return partyDate.In(partyInviteLocation()).Format("January")
}

func birthdayPeopleForPartyMonth(users []User, partyDate time.Time) []partyBirthdayPerson {
	month := partyDate.In(partyInviteLocation()).Month()
	people := make([]partyBirthdayPerson, 0)
	for _, user := range users {
		if user.Birthday == nil {
			continue
		}
		if user.Birthday.Month() != month {
			continue
		}
		name := strings.TrimSpace(strings.Join([]string{
			strings.TrimSpace(user.FirstName),
			strings.TrimSpace(user.LastName),
		}, " "))
		if name == "" {
			name = strings.TrimSpace(user.Email)
		}
		if name == "" {
			continue
		}
		people = append(people, partyBirthdayPerson{
			Name: name,
			Day:  user.Birthday.Day(),
		})
	}
	sort.Slice(people, func(i, j int) bool {
		if people[i].Day != people[j].Day {
			return people[i].Day < people[j].Day
		}
		return strings.ToLower(people[i].Name) < strings.ToLower(people[j].Name)
	})
	return people
}
