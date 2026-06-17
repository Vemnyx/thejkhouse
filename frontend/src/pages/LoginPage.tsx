import { FormEvent, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { LOGO_URL } from "../config";
import { useAuth } from "../context/AuthContext";
import { registerUser } from "../lib/api";
import { auth } from "../lib/firebaseApp";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, signup, appUser, loading, refreshAppUser } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && appUser) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(email, password);
        const token = await auth.currentUser?.getIdToken();
        if (!token) {
          throw new Error("failed to create account");
        }
        await registerUser(token, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
      }

      await refreshAppUser();
      navigate("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "something went wrong";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page">
      <div className="page-vignette" aria-hidden="true" />
      <section className="gothic-card auth-card">
        <div className="card-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>

        <img className="logo logo-small" src={LOGO_URL} alt="The JK House" width={512} height={512} />
        <h1 className="title title-small">Enter the House</h1>

        <div className="auth-toggle" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={mode === "login" ? "auth-toggle-btn active" : "auth-toggle-btn"}
            onClick={() => setMode("login")}
          >
            Log In
          </button>
          <button
            type="button"
            className={mode === "signup" ? "auth-toggle-btn active" : "auth-toggle-btn"}
            onClick={() => setMode("signup")}
          >
            Create Account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <div className="auth-row">
              <label className="auth-field">
                <span>First name</span>
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  autoComplete="given-name"
                  required
                />
              </label>
              <label className="auth-field">
                <span>Last name</span>
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  autoComplete="family-name"
                  required
                />
              </label>
            </div>
          ) : null}

          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
          </button>
        </form>

        <p className="auth-footer">
          <Link to="/">Back to home</Link>
        </p>
      </section>
    </main>
  );
}
