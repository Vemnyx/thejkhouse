import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ImageRecord, deleteImage, listImages, sendHostEmail, uploadImage } from "../lib/api";

export default function HostPage() {
  const { appUser, firebaseUser } = useAuth();
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [error, setError] = useState("");
  const [loadingImages, setLoadingImages] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadImages() {
      if (!firebaseUser) {
        setLoadingImages(false);
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        const nextImages = await listImages(token);
        if (!cancelled) {
          setImages(nextImages);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "failed to load images";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingImages(false);
        }
      }
    }

    loadImages();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  if (appUser?.role !== "host") {
    return <Navigate to="/" replace />;
  }

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!firebaseUser || !file) {
      setError("choose an image to upload");
      return;
    }

    setSubmitting(true);
    try {
      const token = await firebaseUser.getIdToken();
      const uploaded = await uploadImage(token, file, date);
      setImages((current) => [uploaded, ...current]);
      setFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to upload image";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (image: ImageRecord) => {
    if (!firebaseUser) {
      return;
    }

    setError("");
    setDeletingId(image.id);
    try {
      const token = await firebaseUser.getIdToken();
      await deleteImage(token, image.id);
      setImages((current) => current.filter((item) => item.id !== image.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to delete image";
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendEmail = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setEmailSuccess("");

    if (!firebaseUser) {
      return;
    }

    setSendingEmail(true);
    try {
      const token = await firebaseUser.getIdToken();
      await sendHostEmail(token, {
        to: emailTo.trim(),
        subject: emailSubject.trim(),
        message: emailMessage.trim(),
      });
      setEmailSuccess("Email sent.");
      setEmailTo("");
      setEmailSubject("");
      setEmailMessage("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to send email";
      setError(message);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <main className="page host-page">
      <div className="page-vignette" aria-hidden="true" />
      <section className="gothic-card host-card">
        <div className="card-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>

        <p className="eyebrow">Host Dashboard</p>
        <h1 className="title title-small">Image Library</h1>

        <div className="host-actions">
          <Link to="/">Back to dashboard</Link>
        </div>

        <section className="host-section">
          <h2 className="host-section-title">Send Email</h2>
          <form className="host-email-form" onSubmit={handleSendEmail}>
            <label className="auth-field">
              <span>To</span>
              <input
                type="email"
                value={emailTo}
                onChange={(event) => setEmailTo(event.target.value)}
                placeholder="guest@example.com"
                required
              />
            </label>

            <label className="auth-field">
              <span>Subject</span>
              <input
                value={emailSubject}
                onChange={(event) => setEmailSubject(event.target.value)}
                required
              />
            </label>

            <label className="auth-field host-message-field">
              <span>Message</span>
              <textarea
                value={emailMessage}
                onChange={(event) => setEmailMessage(event.target.value)}
                rows={6}
                required
              />
            </label>

            <button className="auth-submit" type="submit" disabled={sendingEmail}>
              {sendingEmail ? "Sending..." : "Send Email"}
            </button>
          </form>
          {emailSuccess ? <p className="host-success">{emailSuccess}</p> : null}
        </section>

        <section className="host-section">
          <h2 className="host-section-title">Upload Images</h2>
          <form className="host-upload-form" onSubmit={handleUpload}>
            <label className="auth-field">
              <span>Image</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>

            <label className="auth-field">
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "Uploading..." : "Upload Image"}
            </button>
          </form>

          {error ? <p className="auth-error">{error}</p> : null}
        </section>

        {loadingImages ? (
          <p className="loading-text">Loading images...</p>
        ) : images.length === 0 ? (
          <p className="dashboard-copy">No images uploaded yet.</p>
        ) : (
          <div className="image-grid" role="table" aria-label="Uploaded images">
            {images.map((image) => (
              <article className="image-grid-card" key={image.id}>
                <a href={image.imageUrl} target="_blank" rel="noreferrer">
                  <img src={image.imageUrl} alt={`Uploaded on ${formatDate(image.date)}`} />
                </a>
                <div className="image-grid-meta">
                  <span>{formatDate(image.date)}</span>
                  <span>{formatDateTime(image.uploadedAt)}</span>
                </div>
                <button
                  className="auth-secondary"
                  type="button"
                  onClick={() => handleDelete(image)}
                  disabled={deletingId === image.id}
                >
                  {deletingId === image.id ? "Deleting..." : "Delete"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
