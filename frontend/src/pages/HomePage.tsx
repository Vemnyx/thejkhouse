import { useAuth } from "../context/AuthContext";

export default function HomePage() {
  const { appUser, logout } = useAuth();

  return (
    <main className="page">
      <div className="page-vignette" aria-hidden="true" />
      <section className="gothic-card dashboard-card">
        <div className="card-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>

        <p className="eyebrow">Signed in as {appUser?.role}</p>
        <h1 className="title title-small">Welcome, {appUser?.firstName}</h1>
        <div className="divider" aria-hidden="true">
          <span className="divider-gem">♦</span>
        </div>
        <p className="dashboard-copy">
          Your dashboard is ready. More features are coming soon.
        </p>
        <button className="auth-submit" type="button" onClick={() => logout()}>
          Log Out
        </button>
      </section>
    </main>
  );
}
