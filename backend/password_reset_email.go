package main

import (
	"fmt"
	"html"
)

func passwordResetEmail(firstName, resetURL string) (string, string) {
	name := html.EscapeString(firstName)
	link := html.EscapeString(resetURL)
	htmlBody := fmt.Sprintf(`<!doctype html>
<html>
  <body style="margin:0;background:#030303;color:#f8ecee;font-family:Georgia,'Times New Roman',serif;">
    <div style="max-width:640px;margin:0 auto;padding:40px 20px;">
      <div style="border:1px solid rgba(232,120,143,.35);background:linear-gradient(180deg,rgba(42,8,16,.98),rgba(10,10,10,.98));padding:36px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.45);">
        <p style="margin:0 0 16px;color:#b8926a;font-size:12px;letter-spacing:.28em;text-transform:uppercase;">The JK House</p>
        <h1 style="margin:0;color:#f2b8c4;font-size:34px;line-height:1.15;letter-spacing:.06em;">Reset Your Password</h1>
        <div style="height:1px;background:linear-gradient(90deg,transparent,#c94b66,transparent);margin:28px 0;"></div>
        <p style="margin:0 0 18px;color:#d4a8b2;font-size:16px;line-height:1.7;">Hi %s, use the link below to choose a new password for your account.</p>
        <a href="%s" style="display:inline-block;margin-top:8px;padding:14px 22px;border:1px solid rgba(232,120,143,.45);background:linear-gradient(180deg,rgba(156,45,69,.95),rgba(92,21,40,.95));color:#f8ecee;text-decoration:none;font-size:13px;font-weight:bold;letter-spacing:.14em;text-transform:uppercase;">Reset Password</a>
        <p style="margin:24px 0 0;color:#9a7a84;font-size:13px;line-height:1.6;">If you did not request this, you can ignore this email.</p>
      </div>
    </div>
  </body>
</html>`, name, link)

	textBody := fmt.Sprintf("Hi %s,\n\nReset your The JK House password using this link:\n\n%s\n\nIf you did not request this, you can ignore this email.", firstName, resetURL)
	return htmlBody, textBody
}
