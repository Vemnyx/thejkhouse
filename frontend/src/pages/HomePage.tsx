import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BirthdaySelect from "../components/BirthdaySelect";
import BouncingImages from "../components/BouncingImages";
import { useAuth } from "../context/AuthContext";
import { HomepageContent, getHomepage } from "../lib/api";

type MainTab = "home" | "parties" | "photos" | "events";
type MainView = MainTab | "settings";

const tabs: Array<{ id: MainTab; label: string }> = [
  { id: "home", label: "Home" },
  { id: "parties", label: "Parties" },
  { id: "photos", label: "Photos" },
  { id: "events", label: "Events" },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { appUser, firebaseUser, logout, updateProfile } = useAuth();
  const [activeView, setActiveView] = useState<MainView>("home");
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [firstName, setFirstName] = useState(appUser?.firstName ?? "");
  const [lastName, setLastName] = useState(appUser?.lastName ?? "");
  const [birthday, setBirthday] = useState(appUser?.birthday?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [homepage, setHomepage] = useState<HomepageContent>({ html: "", images: [] });
  const [homepageLoading, setHomepageLoading] = useState(true);

  const fullName = [appUser?.firstName, appUser?.lastName].filter(Boolean).join(" ") || appUser?.email || "Account";

  useEffect(() => {
    let cancelled = false;

    async function loadHomepage() {
      if (!firebaseUser) {
        setHomepageLoading(false);
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        const content = await getHomepage(token);
        if (!cancelled) {
          setHomepage({
            html: content.html,
            images: content.images ?? [],
          });
        }
      } catch {
        if (!cancelled) {
          setHomepage({ html: "", images: [] });
        }
      } finally {
        if (!cancelled) {
          setHomepageLoading(false);
        }
      }
    }

    loadHomepage();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  const selectView = (view: MainView) => {
    setActiveView(view);
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setMessage("");
    setError("");
  };

  const goToHostDashboard = () => {
    setMobileMenuOpen(false);
    setProfileOpen(false);
    navigate("/host");
  };

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!birthday) {
      setError("birthday is required");
      return;
    }

    setSaving(true);
    try {
      await updateProfile({ firstName, lastName, birthday });
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
            {appUser?.role === "host" ? (
              <button className="main-tab" type="button" onClick={goToHostDashboard}>
                Host
              </button>
            ) : null}
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
                <BirthdaySelect value={birthday} onChange={setBirthday} />
                {message ? <p className="host-success">{message}</p> : null}
                {error ? <p className="auth-error">{error}</p> : null}
                <button className="auth-submit" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </form>
            </div>
          ) : activeView === "home" ? (
            <div className="homepage-layout">
              <article
                className="homepage-html"
                dangerouslySetInnerHTML={{
                  __html: homepage.html || "<p>Under Construction</p>",
                }}
              />
              {homepage.images.length > 0 ? (
                <aside className="homepage-rotator" aria-label="Homepage images">
                  <BouncingImages images={homepage.images} alt="The JK House" className="homepage-bouncer" speed={12} mobileSpeed={9} />
                </aside>
              ) : (
                <aside className="homepage-empty">
                  {homepageLoading ? "Loading..." : "No homepage images yet."}
                </aside>
              )}
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
