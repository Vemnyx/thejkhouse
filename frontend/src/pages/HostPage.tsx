import { DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ImageRecord, PartyRecord, deleteImage, getHomepage, listImages, listParties, sendHostEmail, updateHomepage, uploadImage } from "../lib/api";

type HostTab = "images" | "homepage" | "email";

export default function HostPage() {
  const { appUser, firebaseUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<HostTab>("images");
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [parties, setParties] = useState<PartyRecord[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState("");
  const [homepage, setHomepage] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [homepageHtml, setHomepageHtml] = useState("");
  const [homepageSuccess, setHomepageSuccess] = useState("");
  const [error, setError] = useState("");
  const [loadingImages, setLoadingImages] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [savingHomepage, setSavingHomepage] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
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
        const [nextImages, nextParties, nextHomepage] = await Promise.all([
          listImages(token),
          listParties(token),
          getHomepage(token),
        ]);
        if (!cancelled) {
          setImages(nextImages);
          setParties(nextParties);
          setHomepageHtml(nextHomepage.html);
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
      const uploaded = await uploadImage(token, file, date, {
        partyId: partyId ? Number(partyId) : null,
        homepage,
      });
      setImages((current) => [uploaded, ...current]);
      setFile(null);
      setPartyId("");
      setHomepage(false);
      setUploadModalOpen(false);
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

  const handleSaveHomepage = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setHomepageSuccess("");

    if (!firebaseUser) {
      return;
    }

    setSavingHomepage(true);
    try {
      const token = await firebaseUser.getIdToken();
      const updated = await updateHomepage(token, homepageHtml);
      setHomepageHtml(updated.html);
      setHomepageSuccess("Homepage saved.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to save homepage";
      setError(message);
    } finally {
      setSavingHomepage(false);
    }
  };

  const openUploadModal = () => {
    setError("");
    setFile(null);
    setPartyId("");
    setHomepage(false);
    setDraggingImage(false);
    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    if (submitting) {
      return;
    }
    setUploadModalOpen(false);
    setFile(null);
    setPartyId("");
    setHomepage(false);
    setDraggingImage(false);
  };

  const handleImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingImage(false);

    const droppedFile = event.dataTransfer.files[0];
    if (!droppedFile) {
      return;
    }
    if (!droppedFile.type.startsWith("image/")) {
      setError("choose an image file");
      return;
    }

    setFile(droppedFile);
    setError("");
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

        <div className="host-tabs" role="tablist" aria-label="Host dashboard sections">
          <button
            className={activeTab === "images" ? "host-tab active" : "host-tab"}
            type="button"
            role="tab"
            aria-selected={activeTab === "images"}
            onClick={() => setActiveTab("images")}
          >
            Images
          </button>
          <button
            className={activeTab === "email" ? "host-tab active" : "host-tab"}
            type="button"
            role="tab"
            aria-selected={activeTab === "email"}
            onClick={() => setActiveTab("email")}
          >
            Email
          </button>
          <button
            className={activeTab === "homepage" ? "host-tab active" : "host-tab"}
            type="button"
            role="tab"
            aria-selected={activeTab === "homepage"}
            onClick={() => setActiveTab("homepage")}
          >
            Homepage
          </button>
        </div>

        {activeTab === "images" ? (
          <section className="host-panel" role="tabpanel">
            <div className="host-panel-header">
              <button className="auth-submit" type="button" onClick={openUploadModal}>
                Add New Image
              </button>
            </div>

            {error ? <p className="auth-error">{error}</p> : null}

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
                      {image.partyId ? <span>{partyLabel(parties, image.partyId)}</span> : null}
                      {image.homepage ? <span>Homepage</span> : null}
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
        ) : activeTab === "homepage" ? (
          <section className="host-panel" role="tabpanel">
            <form className="homepage-editor" onSubmit={handleSaveHomepage}>
              <label className="auth-field host-message-field">
                <span>Homepage HTML</span>
                <textarea
                  value={homepageHtml}
                  onChange={(event) => setHomepageHtml(event.target.value)}
                  rows={14}
                  placeholder="<h1>Welcome to The JK House</h1><p>...</p>"
                />
              </label>

              <div className="homepage-editor-actions">
                <button className="auth-submit" type="submit" disabled={savingHomepage}>
                  {savingHomepage ? "Saving..." : "Save Homepage"}
                </button>
                {homepageSuccess ? <p className="host-success">{homepageSuccess}</p> : null}
              </div>

              {error ? <p className="auth-error">{error}</p> : null}

              <div className="homepage-preview-shell">
                <p className="host-section-title">Preview</p>
                <article
                  className="homepage-html homepage-preview"
                  dangerouslySetInnerHTML={{
                    __html: homepageHtml || "<p>Under Construction</p>",
                  }}
                />
              </div>
            </form>
          </section>
        ) : (
          <section className="host-panel" role="tabpanel">
            <div className="host-panel-header">
              <div>
                <h2 className="host-section-title">Send Email</h2>
                <p className="host-section-copy">Send a one-way message from host@thejkhouse.com.</p>
              </div>
            </div>

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
            {error ? <p className="auth-error">{error}</p> : null}
          </section>
        )}

        {uploadModalOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={closeUploadModal}>
            <section
              className="upload-modal gothic-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="upload-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="card-frame" aria-hidden="true">
                <span className="corner corner-tl" />
                <span className="corner corner-tr" />
                <span className="corner corner-bl" />
                <span className="corner corner-br" />
              </div>

              <div className="modal-header">
                <h2 className="host-section-title" id="upload-modal-title">Upload image</h2>
                <button className="modal-close" type="button" onClick={closeUploadModal} aria-label="Close upload dialog">
                  x
                </button>
              </div>

              <form className="host-email-form" onSubmit={handleUpload}>
                <div
                  className={draggingImage ? "drop-zone dragging" : "drop-zone"}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDraggingImage(true);
                  }}
                  onDragLeave={() => setDraggingImage(false)}
                  onDrop={handleImageDrop}
                >
                  <p>{file ? file.name : "Drag and drop an image here"}</p>
                  <span>or</span>
                  <button
                    className="auth-secondary"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose from folder
                  </button>
                  <input
                    ref={fileInputRef}
                    className="visually-hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setError("");
                    }}
                  />
                </div>

                {file ? (
                  <p className="selected-file">Selected: {file.name}</p>
                ) : null}

                <label className="auth-field">
                  <span>Date</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>

                {parties.length > 0 ? (
                  <label className="auth-field">
                    <span>Party</span>
                    <select value={partyId} onChange={(event) => setPartyId(event.target.value)}>
                      <option value="">No party</option>
                      {parties.map((party) => (
                        <option key={party.id} value={party.id}>
                          {party.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="auth-password-toggle">
                  <input
                    type="checkbox"
                    checked={homepage}
                    onChange={(event) => setHomepage(event.target.checked)}
                  />
                  <span>Use on homepage</span>
                </label>

                {error ? <p className="auth-error">{error}</p> : null}

                <button className="auth-submit" type="submit" disabled={submitting || !file}>
                  {submitting ? "Uploading..." : "Upload Image"}
                </button>
              </form>
            </section>
          </div>
        ) : null}
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

function partyLabel(parties: PartyRecord[], partyId: number) {
  return parties.find((party) => party.id === partyId)?.label ?? `Party #${partyId}`;
}
