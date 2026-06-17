import { Navigate } from "react-router-dom";
import { LOGO_URL } from "../config";
import { useAuth } from "../context/AuthContext";

export default function DashboardPage() {
  const { appUser, firebaseUser, loading, logout } = useAuth();

  if (loading) {
    return (
      <main className="page">
        <p className="loading-text">Loading...</p>
      </main>
    );
  }

  if (!firebaseUser || !appUser) {
    return <Navigate to="/login" replace />;
  }

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

        <img className="logo logo-small" src={LOGO_URL} alt="The JK House" width={512} height={512} />
        <p className="eyebrow">Signed in as {appUser.role}</p>
        <h1 className="title title-small">
          Welcome, {appUser.firstName}
        </h1>
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
