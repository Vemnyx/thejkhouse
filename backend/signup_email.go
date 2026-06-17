package main

import (
	"fmt"
	"html"
	"net/url"
	"os"
	"strings"
)

const defaultAppBaseURL = "https://thejkhouse.com"

func appBaseURL() string {
	baseURL := strings.TrimSpace(os.Getenv("APP_BASE_URL"))
	if baseURL == "" {
		return defaultAppBaseURL
	}
	return strings.TrimRight(baseURL, "/")
}

func signupConfirmationURL(token string) string {
	return appBaseURL() + "/?confirm_signup_token=" + url.QueryEscape(token)
}

func signupConfirmationEmail(firstName string, confirmURL string) (string, string) {
	name := html.EscapeString(firstName)
	link := html.EscapeString(confirmURL)
	htmlBody := fmt.Sprintf(`<!doctype html>
<html>
  <body style="margin:0;background:#030303;color:#f8ecee;font-family:Georgia,'Times New Roman',serif;">
    <div style="max-width:640px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid rgba(232,120,143,.35);background:linear-gradient(180deg,rgba(42,8,16,.98),rgba(10,10,10,.98));padding:36px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.45);">
        <p style="margin:0 0 16px;color:#b8926a;font-size:12px;letter-spacing:.28em;text-transform:uppercase;">The JK House</p>
        <h1 style="margin:0;color:#f2b8c4;font-size:34px;line-height:1.15;letter-spacing:.06em;">Welcome To The House Of JK</h1>
        <div style="height:1px;background:linear-gradient(90deg,transparent,#c94b66,transparent);margin:28px 0;"></div>
        <p style="margin:0 0 18px;color:#d4a8b2;font-size:16px;line-height:1.7;">Hi %s, confirm your email to finish creating your account.</p>
        <a href="%s" style="display:inline-block;margin-top:8px;padding:14px 22px;border:1px solid rgba(232,120,143,.45);background:linear-gradient(180deg,rgba(156,45,69,.95),rgba(92,21,40,.95));color:#f8ecee;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;">Enter The House</a>
        <p style="margin:28px 0 0;color:#d4a8b2;font-size:13px;line-height:1.6;">This link expires in 24 hours. If the button does not work, paste this URL into your browser:<br><span style="color:#f2b8c4;word-break:break-all;">%s</span></p>
      </div>
    </div>
  </body>
</html>`, name, link, link)

	textBody := fmt.Sprintf("Hi %s,\n\nConfirm your email to finish creating your The JK House account:\n\n%s\n\nThis link expires in 24 hours.", firstName, confirmURL)
	return htmlBody, textBody
}
