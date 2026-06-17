import { useAuth } from "../context/AuthContext";

export default function HomePage() {
  const { appUser, firebaseUser, loading, logout } = useAuth();

  if (loading) {
    return (
      <main className="page">
        <p className="loading-text">Loading...</p>
      </main>
    );
  }

  const isLoggedIn = Boolean(firebaseUser && appUser);

  return (
    <main className="page">
      <div className="page-vignette" aria-hidden="true" />
      <section className={`gothic-card${isLoggedIn ? " dashboard-card" : ""}`}>
        <div className="card-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>

        {isLoggedIn ? (
          <>
            <p className="eyebrow">Signed in as {appUser!.role}</p>
            <h1 className="title title-small">Welcome, {appUser!.firstName}</h1>
            <div className="divider" aria-hidden="true">
              <span className="divider-gem">♦</span>
            </div>
            <p className="dashboard-copy">
              Your dashboard is ready. More features are coming soon.
            </p>
            <button className="auth-submit" type="button" onClick={() => logout()}>
              Log Out
            </button>
          </>
        ) : (
          <>
            <p className="eyebrow">Jacob &amp; Kirsten&apos;s House Party</p>
            <h1 className="title">The JK House</h1>
            <div className="divider" aria-hidden="true">
              <span className="divider-gem">♦</span>
            </div>
            <p className="tagline">Welcome to the House of JK</p>
            <p className="coming-soon">Coming Soon</p>
          </>
        )}
      </section>
    </main>
  );
}
