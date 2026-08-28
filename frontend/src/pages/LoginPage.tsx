import { FormEvent, useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import BirthdaySelect from "../components/BirthdaySelect";
import BouncingImages from "../components/BouncingImages";
import { useAuth } from "../context/AuthContext";
import { ApiError, ImageRecord, getHomepageImages } from "../lib/api";
import { confirmPasswordResetWithCode } from "../lib/firebaseApp";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, signup, confirmSignup, resendConfirmation, appUser, loading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [confirmingSignup, setConfirmingSignup] = useState(false);
  const [confirmationTokenAttempted, setConfirmationTokenAttempted] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendingConfirmation, setResendingConfirmation] = useState(false);
  const [introImages, setIntroImages] = useState<ImageRecord[]>([]);
  const [introDismissed, setIntroDismissed] = useState(() =>
    Boolean(
      searchParams.get("confirm_signup_token") ||
      searchParams.get("mode") === "signup" ||
      searchParams.get("mode") === "resetPassword" ||
      searchParams.get("oobCode"),
    ),
  );
  const confirmationToken = searchParams.get("confirm_signup_token");
  const inviteMode = searchParams.get("mode");
  const inviteEmail = searchParams.get("email");
  const resetOobCode = searchParams.get("oobCode");
  const isResetPassword = searchParams.get("mode") === "resetPassword" && Boolean(resetOobCode);

  useEffect(() => {
    if (inviteMode === "signup") {
      setMode("signup");
      setIntroDismissed(true);
    }
    if (inviteEmail) {
      setEmail(inviteEmail);
    }
    if (isResetPassword) {
      setIntroDismissed(true);
      setError("");
      setSuccess("");
    }
  }, [inviteEmail, inviteMode, isResetPassword]);

  useEffect(() => {
    let cancelled = false;

    getHomepageImages()
      .then((images) => {
        if (!cancelled) {
          setIntroImages(images);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIntroImages([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!confirmationToken || appUser || confirmingSignup || confirmationTokenAttempted === confirmationToken) {
      return;
    }

    setConfirmingSignup(true);
    setConfirmationTokenAttempted(confirmationToken);
    setError("");
    setSuccess("");
    confirmSignup(confirmationToken)
      .then(() => {
        navigate("/", { replace: true });
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "failed to confirm account";
        setError(message);
      })
      .finally(() => {
        setConfirmingSignup(false);
      });
  }, [appUser, confirmSignup, confirmationToken, confirmationTokenAttempted, confirmingSignup, navigate]);

  if (!loading && appUser) {
    return <Navigate to="/" replace />;
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError("");
    setSuccess("");
    setAwaitingConfirmation(false);
    setConfirmPassword("");
    setBirthday("");
    setShowPassword(false);
  };

  const handleResetPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!resetOobCode) {
      setError("This reset link is invalid or has expired.");
      return;
    }
    if (password !== confirmPassword) {
      setError("passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordResetWithCode(resetOobCode, password);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setMode("login");
      setSuccess("Your password has been reset. You can log in with your new password.");
      navigate("/", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to reset password";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (mode === "signup" && password !== confirmPassword) {
      setError("passwords do not match");
      return;
    }
    if (mode === "signup" && !birthday) {
      setError("birthday is required");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await signup(email, password, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          birthday,
        });
        setSuccess("Check your email to confirm your account.");
        setAwaitingConfirmation(true);
        setPassword("");
        setConfirmPassword("");
        return;
      }

      navigate("/");
    } catch (err) {
      if (err instanceof ApiError && err.code === "pending_confirmation") {
        setAwaitingConfirmation(true);
        setPassword("");
        setConfirmPassword("");
        return;
      }

      const message = err instanceof Error ? err.message : "something went wrong";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendConfirmation = async () => {
    setError("");
    setSuccess("");
    setResendingConfirmation(true);

    try {
      await resendConfirmation(email);
      setSuccess("A new confirmation email has been sent.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to resend confirmation email";
      setError(message);
    } finally {
      setResendingConfirmation(false);
    }
  };

  const passwordInputType = showPassword ? "text" : "password";

  const showingConfirmationLoading = Boolean(confirmationToken && confirmingSignup);
  const showIntroOverlay = !introDismissed && introImages.length > 0;

  if (showingConfirmationLoading) {
    return (
      <main className="page confirmation-loading-page">
        <div className="page-vignette" aria-hidden="true" />
        <div className="confirmation-spinner" aria-label="Confirming account" />
      </main>
    );
  }

  return (
    <>
    {showIntroOverlay ? (
      <section className="login-image-overlay" aria-label="The JK House photos">
        <BouncingImages images={introImages} alt="The JK House" className="login-bouncer" speed={96} mobileSpeed={64} />
        <button type="button" onClick={() => setIntroDismissed(true)}>
          Continue to login
        </button>
      </section>
    ) : null}
    <main className="page">
      <div className="page-vignette" aria-hidden="true" />
      <section className="gothic-card auth-card">
        <div className="card-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>

        <h1 className="title title-small">
          {isResetPassword
            ? "Reset Your Password"
            : awaitingConfirmation
              ? "Check your email"
              : mode === "login"
                ? "Welcome To The House Of JK"
                : "Enter The House"}
        </h1>

        {isResetPassword ? (
          <form className="auth-form" onSubmit={handleResetPassword}>
            <p className="auth-confirmation-message">
              Choose a new password for your account.
            </p>
            <label className="auth-field">
              <span>New password</span>
              <input
                type={passwordInputType}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
            <label className="auth-field">
              <span>Confirm new password</span>
              <input
                type={passwordInputType}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>
            <label className="auth-password-toggle">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
              />
              <span className="toggle-switch" aria-hidden="true" />
              <span>Show password</span>
            </label>
            {error ? <p className="auth-error">{error}</p> : null}
            {success ? <p className="host-success">{success}</p> : null}
            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save New Password"}
            </button>
          </form>
        ) : awaitingConfirmation ? (
          <div className="auth-confirmation-message">
            <p>
              Check your email for the confirmation link sent to <strong>{email}</strong>.
            </p>
            <p>
              Open that email and tap the confirmation button to finish creating your account.
            </p>
            {error ? <p className="auth-error">{error}</p> : null}
            {success ? <p className="host-success">{success}</p> : null}
            <button
              className="auth-submit"
              type="button"
              onClick={handleResendConfirmation}
              disabled={resendingConfirmation}
            >
              {resendingConfirmation ? "Sending..." : "Send New Confirmation Email"}
            </button>
            <button className="auth-secondary back-text-link" type="button" onClick={() => switchMode("login")}>
              Back to Log In
            </button>
          </div>
        ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" ? (
            <>
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

              <BirthdaySelect value={birthday} onChange={setBirthday} />
            </>
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
              type={mode === "signup" ? passwordInputType : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              required
            />
          </label>

          {mode === "signup" ? (
            <>
              <label className="auth-field">
                <span>Confirm password</span>
                <input
                  type={passwordInputType}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={6}
                  required
                />
              </label>

              <label className="auth-password-toggle">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(event) => setShowPassword(event.target.checked)}
                />
                <span className="toggle-switch" aria-hidden="true" />
                <span>Show password</span>
              </label>
            </>
          ) : null}

          {error ? <p className="auth-error">{error}</p> : null}
          {success ? <p className="host-success">{success}</p> : null}

          <button className="auth-submit" type="submit" disabled={submitting || confirmingSignup}>
            {confirmingSignup
              ? "Confirming..."
              : submitting
                ? "Please wait..."
                : mode === "login"
                  ? "Log In"
                  : "Create Account"}
          </button>

          {mode === "login" ? (
            <button
              className="auth-secondary"
              type="button"
              onClick={() => switchMode("signup")}
              disabled={submitting || confirmingSignup}
            >
              Create Account
            </button>
          ) : (
            <button
              className="auth-secondary"
              type="button"
              onClick={() => switchMode("login")}
              disabled={submitting || confirmingSignup}
            >
              Log In
            </button>
          )}
        </form>
        )}

      </section>
    </main>
    </>
  );
}
