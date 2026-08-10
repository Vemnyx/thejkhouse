package main

import (
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const partyVenueAddress = "1116 Rosepine Dr, Cary, NC 27519"

type partyInviteCTA struct {
	Label string
	URL   string
}

func partyRouteSlug(party Party) string {
	slug := strings.ToLower(strings.TrimSpace(party.Label))
	slug = strings.ReplaceAll(slug, "'", "")
	slug = strings.ReplaceAll(slug, "\"", "")
	slug = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return fmt.Sprintf("party-%d", party.ID)
	}
	return slug
}

func partyDetailURL(party Party) string {
	return appBaseURL() + "/parties/" + url.PathEscape(partyRouteSlug(party))
}

func partySignupURL(email string) string {
	values := url.Values{}
	values.Set("mode", "signup")
	if strings.TrimSpace(email) != "" {
		values.Set("email", strings.TrimSpace(email))
	}
	return appBaseURL() + "/?" + values.Encode()
}

func formatPartyInviteWhen(date time.Time) string {
	return date.In(time.Local).Format("Monday, January 2, 2006 at 3:04 PM")
}

func partyInviteEmail(party Party, greetingName string, cta partyInviteCTA) (string, string) {
	name := strings.TrimSpace(greetingName)
	if name == "" {
		name = "there"
	}

	escapedName := html.EscapeString(name)
	escapedLabel := html.EscapeString(party.Label)
	escapedWhen := html.EscapeString(formatPartyInviteWhen(party.Date))
	escapedWhere := html.EscapeString(partyVenueAddress)
	escapedSummary := html.EscapeString(strings.TrimSpace(party.Summary))
	escapedCTALabel := html.EscapeString(cta.Label)
	escapedCTAURL := html.EscapeString(cta.URL)

	mediaBlock := ""
	if strings.TrimSpace(party.MediaURL) != "" {
		mediaBlock = fmt.Sprintf(`
        <div style="margin:24px 0 0;overflow:hidden;border:1px solid rgba(232,120,143,.22);border-radius:16px;background:rgba(3,3,3,.35);">
          <img src="%s" alt="" style="display:block;width:100%%;max-height:320px;object-fit:cover;" />
        </div>`, html.EscapeString(party.MediaURL))
	}

	summaryBlock := ""
	if escapedSummary != "" {
		summaryBlock = fmt.Sprintf(`
        <p style="margin:18px 0 0;color:#f8ecee;font-size:15px;line-height:1.7;white-space:pre-wrap;text-align:left;">%s</p>`, escapedSummary)
	}

	partifulBlock := ""
	if strings.TrimSpace(party.PartifulURL) != "" {
		partifulBlock = fmt.Sprintf(`
        <p style="margin:16px 0 0;color:#d4a8b2;font-size:14px;line-height:1.6;text-align:left;">
          Partiful:
          <a href="%s" style="color:#f9d68f;text-decoration:underline;">Open invite</a>
        </p>`, html.EscapeString(party.PartifulURL))
	}

	htmlBody := fmt.Sprintf(`<!doctype html>
<html>
  <body style="margin:0;background:#030303;color:#f8ecee;font-family:Georgia,'Times New Roman',serif;">
    <div style="max-width:640px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid rgba(232,120,143,.35);background:linear-gradient(180deg,rgba(42,8,16,.98),rgba(10,10,10,.98));padding:36px;box-shadow:0 24px 80px rgba(0,0,0,.45);">
        <p style="margin:0 0 12px;color:#b8926a;font-size:12px;letter-spacing:.28em;text-transform:uppercase;text-align:center;">The JK House</p>
        <h1 style="margin:0;color:#f2b8c4;font-size:32px;line-height:1.15;letter-spacing:.06em;text-align:center;">%s</h1>
        <div style="height:1px;background:linear-gradient(90deg,transparent,#c94b66,transparent);margin:24px 0;"></div>
        <p style="margin:0;color:#d4a8b2;font-size:15px;line-height:1.7;">Hi %s, you're invited.</p>
        %s
        <div style="display:grid;gap:12px;margin-top:22px;text-align:left;">
          <div style="border:1px solid rgba(232,120,143,.16);border-radius:14px;background:rgba(3,3,3,.22);padding:14px 16px;">
            <p style="margin:0 0 6px;color:#b8926a;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">When</p>
            <p style="margin:0;color:#f8ecee;font-size:15px;line-height:1.5;">%s</p>
          </div>
          <div style="border:1px solid rgba(232,120,143,.16);border-radius:14px;background:rgba(3,3,3,.22);padding:14px 16px;">
            <p style="margin:0 0 6px;color:#b8926a;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">Where</p>
            <p style="margin:0;color:#f8ecee;font-size:15px;line-height:1.5;">%s</p>
          </div>
        </div>
        %s
        %s
        <div style="text-align:center;margin-top:28px;">
          <a href="%s" style="display:inline-block;padding:14px 22px;border:1px solid rgba(232,120,143,.45);background:linear-gradient(180deg,rgba(156,45,69,.95),rgba(92,21,40,.95));color:#f8ecee;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;">%s</a>
        </div>
      </div>
    </div>
  </body>
</html>`, escapedLabel, escapedName, summaryBlock, escapedWhen, escapedWhere, mediaBlock, partifulBlock, escapedCTAURL, escapedCTALabel)

	textBody := fmt.Sprintf(
		"Hi %s,\n\nYou're invited to %s at The JK House.\n\nWhen: %s\nWhere: %s\n\n%s\n\n%s: %s\n",
		name,
		party.Label,
		formatPartyInviteWhen(party.Date),
		partyVenueAddress,
		strings.TrimSpace(party.Summary),
		cta.Label,
		cta.URL,
	)

	return htmlBody, textBody
}

func partyCreatedInviteSubject(party Party) string {
	return fmt.Sprintf("You're invited to %s", party.Label)
}

func partyPlusOneInviteSubject(party Party) string {
	return fmt.Sprintf("You're invited to %s at The JK House", party.Label)
}
