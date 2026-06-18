import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";

type MainTab = "home" | "parties" | "photos" | "events";
type MainView = MainTab | "settings";

const tabs: Array<{ id: MainTab; label: string }> = [
  { id: "home", label: "Home" },
  { id: "parties", label: "Parties" },
  { id: "photos", label: "Photos" },
  { id: "events", label: "Events" },
];

export default function HomePage() {
  const { appUser, logout, updateProfile } = useAuth();
  const [activeView, setActiveView] = useState<MainView>("home");
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [firstName, setFirstName] = useState(appUser?.firstName ?? "");
  const [lastName, setLastName] = useState(appUser?.lastName ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fullName = [appUser?.firstName, appUser?.lastName].filter(Boolean).join(" ") || appUser?.email || "Account";

  const selectView = (view: MainView) => {
    setActiveView(view);
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setMessage("");
    setError("");
  };

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");

    setSaving(true);
    try {
      await updateProfile({ firstName, lastName });
      setMessage("Settings saved.");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "failed to update settings";
      setError(nextError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page app-shell-page">
      <div className="page-vignette" aria-hidden="true" />
      <section className="gothic-card app-shell-card">
        <div className="card-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>

        <header className="app-topbar">
          <button
            className="menu-toggle"
            type="button"
            aria-label="Open navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>

          <nav className={mobileMenuOpen ? "main-tabs open" : "main-tabs"} aria-label="Main sections">
            {tabs.map((tab) => (
              <button
                className={activeView === tab.id ? "main-tab active" : "main-tab"}
                type="button"
                key={tab.id}
                onClick={() => selectView(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="profile-menu">
            <button
              className="profile-trigger"
              type="button"
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen((open) => !open)}
            >
              {fullName}
            </button>
            {profileOpen ? (
              <div className="profile-dropdown" role="menu">
                <button type="button" role="menuitem" onClick={() => selectView("settings")}>
                  Settings
                </button>
                <button type="button" role="menuitem" onClick={() => logout()}>
                  Log Out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <section className="main-content">
          {activeView === "settings" ? (
            <div className="settings-panel">
              <p className="eyebrow">Settings</p>
              <h1 className="title title-small">Your Profile</h1>
              <form className="auth-form" onSubmit={handleSaveProfile}>
                <div className="auth-row">
                  <label className="auth-field">
                    <span>First name</span>
                    <input
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      required
                    />
                  </label>
                  <label className="auth-field">
                    <span>Last name</span>
                    <input
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      required
                    />
                  </label>
                </div>
                {message ? <p className="host-success">{message}</p> : null}
                {error ? <p className="auth-error">{error}</p> : null}
                <button className="auth-submit" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </form>
            </div>
          ) : (
            <div className="under-construction">
              <p>Under Construction</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
