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
const partyInviteTimeLocation = "America/New_York"

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

func partyRsvpURL(party Party) string {
	values := url.Values{}
	values.Set("rsvp", "1")
	return partyDetailURL(party) + "?" + values.Encode()
}

func partySignupURL(email string) string {
	values := url.Values{}
	values.Set("mode", "signup")
	if strings.TrimSpace(email) != "" {
		values.Set("email", strings.TrimSpace(email))
	}
	return appBaseURL() + "/?" + values.Encode()
}

func partyInviteLocation() *time.Location {
	location, err := time.LoadLocation(partyInviteTimeLocation)
	if err != nil {
		return time.FixedZone("EST", -5*60*60)
	}
	return location
}

func formatPartyInviteWhen(date time.Time) string {
	return date.In(partyInviteLocation()).Format("Monday, January 2, 2006 at 3:04 PM")
}

func partyInviteEmail(party Party, greetingName string, cta partyInviteCTA) (string, string) {
	name := strings.TrimSpace(greetingName)
	if name == "" {
		name = "there"
	}

	primary := normalizePartyThemeColor(party.ThemePrimary, defaultPartyThemePrimary)
	accent := normalizePartyThemeColor(party.ThemeAccent, defaultPartyThemeAccent)
	background := normalizePartyThemeColor(party.ThemeBackground, defaultPartyThemeBackground)
	fontFamily := partyThemeFontFamily(party.ThemeFont)
	primaryBorder := partyThemeRGBA(primary, 0.35)
	primaryBorderSoft := partyThemeRGBA(primary, 0.16)
	primaryBorderMedia := partyThemeRGBA(primary, 0.22)
	primaryBorderCTA := partyThemeRGBA(primary, 0.45)
	primaryWash := partyThemeRGBA(primary, 0.16)
	primaryCTATop := partyThemeRGBA(primary, 0.28)
	primaryCTABottom := partyThemeRGBA(primary, 0.12)

	escapedName := html.EscapeString(name)
	escapedLabel := html.EscapeString(party.Label)
	escapedWhen := html.EscapeString(formatPartyInviteWhen(party.Date))
	escapedWhere := html.EscapeString(partyVenueAddress)
	escapedSummary := html.EscapeString(strings.TrimSpace(party.Summary))
	escapedCTALabel := html.EscapeString(cta.Label)
	escapedCTAURL := html.EscapeString(cta.URL)
	escapedPrimary := html.EscapeString(primary)
	escapedAccent := html.EscapeString(accent)
	escapedBackground := html.EscapeString(background)
	escapedFontFamily := html.EscapeString(fontFamily)

	mediaBlock := ""
	if strings.TrimSpace(party.MediaURL) != "" {
		mediaBlock = fmt.Sprintf(`
        <div style="margin:24px 0 0;overflow:hidden;border:1px solid %s;border-radius:16px;background:rgba(3,3,3,.35);">
          <img src="%s" alt="" style="display:block;width:100%%;max-height:320px;object-fit:cover;" />
        </div>`, primaryBorderMedia, html.EscapeString(party.MediaURL))
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
          <a href="%s" style="color:%s;text-decoration:underline;">Open invite</a>
        </p>`, html.EscapeString(party.PartifulURL), escapedAccent)
	}

	htmlBody := fmt.Sprintf(`<!doctype html>
<html>
  <head>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Abril+Fatface&family=Archivo+Black&family=Bangers&family=Bebas+Neue&family=Cinzel+Decorative:wght@400;700&family=Cinzel:wght@400;600&family=Dancing+Script:wght@400;700&family=Fredoka:wght@400;600&family=Great+Vibes&family=Lobster&family=Orbitron:wght@400;700&family=Pacifico&family=Playfair+Display:wght@400;700&family=Press+Start+2P&family=Righteous&family=UnifrakturMaguntia&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;background:%s;color:#f8ecee;font-family:Georgia,'Times New Roman',serif;">
    <div style="max-width:640px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid %s;background:linear-gradient(180deg,%s,%s);padding:36px;box-shadow:0 24px 80px rgba(0,0,0,.45);">
        <p style="margin:0 0 12px;color:%s;font-size:12px;letter-spacing:.28em;text-transform:uppercase;text-align:center;">The JK House</p>
        <h1 style="margin:0;color:%s;font-family:%s;font-size:32px;line-height:1.15;letter-spacing:.06em;text-align:center;">%s</h1>
        %s
        <div style="height:1px;background:linear-gradient(90deg,transparent,%s,transparent);margin:24px 0;"></div>
        <p style="margin:0;color:#d4a8b2;font-size:18px;line-height:1.7;">Hi %s, you're invited!</p>
        <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:separate;border-spacing:0;">
          <tr>
            <td width="50%%" valign="top" style="padding-right:6px;">
              <div style="border:1px solid %s;border-radius:14px;background:rgba(3,3,3,.22);padding:14px 16px;">
                <p style="margin:0 0 6px;color:%s;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">When</p>
                <p style="margin:0;color:#f8ecee;font-size:15px;line-height:1.5;">%s</p>
              </div>
            </td>
            <td width="50%%" valign="top" style="padding-left:6px;">
              <div style="border:1px solid %s;border-radius:14px;background:rgba(3,3,3,.22);padding:14px 16px;">
                <p style="margin:0 0 6px;color:%s;font-size:11px;letter-spacing:.14em;text-transform:uppercase;">Where</p>
                <p style="margin:0;color:#f8ecee;font-size:15px;line-height:1.5;">%s</p>
              </div>
            </td>
          </tr>
        </table>
        %s
        %s
        <div style="margin-top:28px;">
          <a href="%s" style="display:block;box-sizing:border-box;width:100%%;padding:16px 22px;border:1px solid %s;border-radius:14px;background:linear-gradient(180deg,%s,%s);color:#f8ecee;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;text-align:center;">%s</a>
        </div>
      </div>
    </div>
  </body>
</html>`,
		escapedBackground,
		primaryBorder,
		primaryWash,
		escapedBackground,
		escapedAccent,
		escapedPrimary,
		escapedFontFamily,
		escapedLabel,
		mediaBlock,
		escapedPrimary,
		escapedName,
		primaryBorderSoft,
		escapedAccent,
		escapedWhen,
		primaryBorderSoft,
		escapedAccent,
		escapedWhere,
		summaryBlock,
		partifulBlock,
		escapedCTAURL,
		primaryBorderCTA,
		primaryCTATop,
		primaryCTABottom,
		escapedCTALabel,
	)

	textBody := fmt.Sprintf(
		"Hi %s, you're invited!\n\nWhen: %s\nWhere: %s\n\n%s\n\n%s\n\n%s: %s\n",
		name,
		formatPartyInviteWhen(party.Date),
		partyVenueAddress,
		party.Label,
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
