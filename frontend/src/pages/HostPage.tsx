import { type DragEvent, type FormEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ImageDateSelect } from "../components/BirthdaySelect";
import { useAuth } from "../context/AuthContext";
import { AppUser, ImageRecord, PartyRecord, deleteImage, deleteUser, getHomepage, listImages, listParties, listUsers, sendHostEmail, updateHomepage, uploadImage } from "../lib/api";

type HostTab = "images" | "homepage" | "users" | "email";
type DeleteTarget =
  | { type: "image"; image: ImageRecord }
  | { type: "user"; user: AppUser };

type CropBox = {
  x: number;
  y: number;
  size: number;
};

const homepageCropSize = 1200;

export default function HostPage() {
  const { appUser, firebaseUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const homepageFileInputRef = useRef<HTMLInputElement | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const [activeTab, setActiveTab] = useState<HostTab>("images");
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [parties, setParties] = useState<PartyRecord[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState("");
  const [homepageFile, setHomepageFile] = useState<File | null>(null);
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [homepageHtml, setHomepageHtml] = useState("");
  const [homepageSuccess, setHomepageSuccess] = useState("");
  const [error, setError] = useState("");
  const [loadingImages, setLoadingImages] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submittingHomepageImage, setSubmittingHomepageImage] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [savingHomepage, setSavingHomepage] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [homepageImageModalOpen, setHomepageImageModalOpen] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [draggingHomepageImage, setDraggingHomepageImage] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const filePreviewUrl = useMemo(() => {
    if (!file) {
      return "";
    }

    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  const homepageFilePreviewUrl = useMemo(() => {
    if (!homepageFile) {
      return "";
    }

    return URL.createObjectURL(homepageFile);
  }, [homepageFile]);

  useEffect(() => {
    return () => {
      if (homepageFilePreviewUrl) {
        URL.revokeObjectURL(homepageFilePreviewUrl);
      }
    };
  }, [homepageFilePreviewUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadImages() {
      if (!firebaseUser) {
        setLoadingImages(false);
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        const [nextImages, nextParties, nextHomepage, nextUsers] = await Promise.all([
          listImages(token),
          listParties(token),
          getHomepage(token),
          listUsers(token),
        ]);
        if (!cancelled) {
          setImages(nextImages);
          setParties(nextParties);
          setHomepageHtml(nextHomepage.html);
          setUsers(nextUsers);
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
      });
      setImages((current) => [uploaded, ...current]);
      setFile(null);
      setPartyId("");
      setUploadModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to upload image";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteImage = async (image: ImageRecord) => {
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
      setDeleteTarget(null);
    }
  };

  const handleDeleteUser = async (user: AppUser) => {
    if (!firebaseUser) {
      return;
    }

    setError("");
    setDeletingUserId(user.id);
    try {
      const token = await firebaseUser.getIdToken();
      await deleteUser(token, user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to delete user";
      setError(message);
    } finally {
      setDeletingUserId(null);
      setDeleteTarget(null);
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) {
      return;
    }

    if (deleteTarget.type === "image") {
      void handleDeleteImage(deleteTarget.image);
      return;
    }

    void handleDeleteUser(deleteTarget.user);
  };

  const deletingTarget =
    deleteTarget?.type === "image"
      ? deletingId === deleteTarget.image.id
      : deleteTarget?.type === "user"
        ? deletingUserId === deleteTarget.user.id
        : false;

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
    setDraggingImage(false);
    setUploadModalOpen(true);
  };

  const openHomepageImageModal = () => {
    setError("");
    setHomepageFile(null);
    setCropBox(null);
    setDraggingHomepageImage(false);
    setHomepageImageModalOpen(true);
  };

  const closeUploadModal = () => {
    if (submitting) {
      return;
    }
    setUploadModalOpen(false);
    setFile(null);
    setPartyId("");
    setDraggingImage(false);
  };

  const closeHomepageImageModal = () => {
    if (submittingHomepageImage) {
      return;
    }

    setHomepageImageModalOpen(false);
    setHomepageFile(null);
    setCropBox(null);
    setDraggingHomepageImage(false);
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

  const handleHomepageImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingHomepageImage(false);

    const droppedFile = event.dataTransfer.files[0];
    if (!droppedFile) {
      return;
    }
    if (!droppedFile.type.startsWith("image/")) {
      setError("choose an image file");
      return;
    }

    setHomepageFile(droppedFile);
    setCropBox(null);
    setError("");
  };

  const resetCropBox = () => {
    const bounds = cropStageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const size = Math.min(bounds.width, bounds.height) * 0.62;
    setCropBox({
      size,
      x: (bounds.width - size) / 2,
      y: (bounds.height - size) / 2,
    });
  };

  const constrainCropBox = (nextX: number, nextY: number, size: number) => {
    const bounds = cropStageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return { x: nextX, y: nextY, size };
    }

    return {
      size,
      x: Math.min(Math.max(nextX, 0), Math.max(bounds.width - size, 0)),
      y: Math.min(Math.max(nextY, 0), Math.max(bounds.height - size, 0)),
    };
  };

  const handleCropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!cropBox) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = {
      offsetX: event.clientX - cropBox.x,
      offsetY: event.clientY - cropBox.y,
    };
  };

  const handleCropPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!cropBox || !cropDragRef.current) {
      return;
    }

    const bounds = cropStageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    setCropBox(constrainCropBox(
      event.clientX - bounds.left - cropDragRef.current.offsetX,
      event.clientY - bounds.top - cropDragRef.current.offsetY,
      cropBox.size,
    ));
  };

  const handleCropPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    cropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const createCroppedHomepageFile = async () => {
    if (!homepageFile || !homepageFilePreviewUrl || !cropBox || !cropStageRef.current) {
      throw new Error("choose an image to crop");
    }

    const bounds = cropStageRef.current.getBoundingClientRect();
    const image = await loadImage(homepageFilePreviewUrl);
    const scaleX = image.naturalWidth / bounds.width;
    const scaleY = image.naturalHeight / bounds.height;
    const canvas = document.createElement("canvas");
    canvas.width = homepageCropSize;
    canvas.height = homepageCropSize;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("failed to crop image");
    }

    ctx.drawImage(
      image,
      cropBox.x * scaleX,
      cropBox.y * scaleY,
      cropBox.size * scaleX,
      cropBox.size * scaleY,
      0,
      0,
      homepageCropSize,
      homepageCropSize,
    );

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      throw new Error("failed to crop image");
    }

    return new File([blob], `homepage-${Date.now()}.jpg`, { type: "image/jpeg" });
  };

  const handleHomepageImageUpload = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!firebaseUser || !homepageFile) {
      setError("choose an image to upload");
      return;
    }

    setSubmittingHomepageImage(true);
    try {
      const croppedFile = await createCroppedHomepageFile();
      const token = await firebaseUser.getIdToken();
      const uploaded = await uploadImage(token, croppedFile, new Date().toISOString().slice(0, 10), {
        homepage: true,
      });
      setImages((current) => [uploaded, ...current]);
      setHomepageFile(null);
      setCropBox(null);
      setHomepageImageModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to upload homepage image";
      setError(message);
    } finally {
      setSubmittingHomepageImage(false);
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

        <div className="host-return-row">
          <Link to="/">Return to dashboard</Link>
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
          <button
            className={activeTab === "users" ? "host-tab active" : "host-tab"}
            type="button"
            role="tab"
            aria-selected={activeTab === "users"}
            onClick={() => setActiveTab("users")}
          >
            Users
          </button>
        </div>

        {activeTab === "images" ? (
          <section className="host-panel" role="tabpanel">
            <div className="host-panel-header">
              <button className="auth-submit" type="button" onClick={openUploadModal}>
                Add New Image
              </button>
              <button className="auth-secondary" type="button" onClick={openHomepageImageModal}>
                Add Homepage Image
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
                      onClick={() => setDeleteTarget({ type: "image", image })}
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
        ) : activeTab === "users" ? (
          <section className="host-panel" role="tabpanel">
            {error ? <p className="auth-error">{error}</p> : null}
            <div className="host-table-wrap">
              <table className="host-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Birthday</th>
                    <th>Role</th>
                    <th>Added</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.firstName} {user.lastName}</td>
                      <td>{user.email}</td>
                      <td>{user.birthday ? formatDate(user.birthday) : "Not set"}</td>
                      <td>{user.role}</td>
                      <td>{formatDateTime(user.createdAt)}</td>
                      <td>
                        <button
                          className="auth-secondary"
                          type="button"
                          onClick={() => setDeleteTarget({ type: "user", user })}
                          disabled={deletingUserId === user.id || user.id === appUser?.id}
                        >
                          {deletingUserId === user.id ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6}>No users yet.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
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
                  {filePreviewUrl ? (
                    <div className="upload-preview">
                      <img src={filePreviewUrl} alt="Selected upload preview" />
                      {submitting ? (
                        <div className="upload-loading" aria-label="Uploading image">
                          <span className="confirmation-spinner" />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <p>{file ? file.name : "Drag and drop an image here"}</p>
                  <span>or</span>
                  <button
                    className="auth-secondary"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                  >
                    Choose from folder
                  </button>
                  <input
                    ref={fileInputRef}
                    className="visually-hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    disabled={submitting}
                    onChange={(event) => {
                      setFile(event.target.files?.[0] ?? null);
                      setError("");
                    }}
                  />
                </div>

                {file ? (
                  <p className="selected-file">Selected: {file.name}</p>
                ) : null}

                <ImageDateSelect value={date} onChange={setDate} />

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

                {error ? <p className="auth-error">{error}</p> : null}

                <button className="auth-submit" type="submit" disabled={submitting || !file}>
                  {submitting ? "Uploading..." : "Upload Image"}
                </button>
              </form>
            </section>
          </div>
        ) : null}
        {homepageImageModalOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={closeHomepageImageModal}>
            <section
              className="upload-modal gothic-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="homepage-upload-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="card-frame" aria-hidden="true">
                <span className="corner corner-tl" />
                <span className="corner corner-tr" />
                <span className="corner corner-bl" />
                <span className="corner corner-br" />
              </div>

              <div className="modal-header">
                <h2 className="host-section-title" id="homepage-upload-modal-title">Homepage image</h2>
                <button className="modal-close" type="button" onClick={closeHomepageImageModal} aria-label="Close homepage upload dialog">
                  x
                </button>
              </div>

              <form className="host-email-form" onSubmit={handleHomepageImageUpload}>
                {!homepageFile ? (
                  <div
                    className={draggingHomepageImage ? "drop-zone dragging" : "drop-zone"}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDraggingHomepageImage(true);
                    }}
                    onDragLeave={() => setDraggingHomepageImage(false)}
                    onDrop={handleHomepageImageDrop}
                  >
                    <p>Drag and drop a homepage image here</p>
                    <span>or</span>
                    <button
                      className="auth-secondary"
                      type="button"
                      onClick={() => homepageFileInputRef.current?.click()}
                      disabled={submittingHomepageImage}
                    >
                      Choose from folder
                    </button>
                    <input
                      ref={homepageFileInputRef}
                      className="visually-hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      disabled={submittingHomepageImage}
                      onChange={(event) => {
                        setHomepageFile(event.target.files?.[0] ?? null);
                        setCropBox(null);
                        setError("");
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <p className="selected-file">Drag the square to choose the dashboard crop.</p>
                    <div className="crop-stage" ref={cropStageRef}>
                      <img src={homepageFilePreviewUrl} alt="Homepage crop preview" onLoad={resetCropBox} />
                      {cropBox ? (
                        <div
                          className="crop-box"
                          style={{
                            width: cropBox.size,
                            height: cropBox.size,
                            transform: `translate(${cropBox.x}px, ${cropBox.y}px)`,
                          }}
                          onPointerDown={handleCropPointerDown}
                          onPointerMove={handleCropPointerMove}
                          onPointerUp={handleCropPointerUp}
                        />
                      ) : null}
                      {submittingHomepageImage ? (
                        <div className="upload-loading" aria-label="Uploading homepage image">
                          <span className="confirmation-spinner" />
                        </div>
                      ) : null}
                    </div>
                    <button
                      className="auth-secondary"
                      type="button"
                      onClick={() => {
                        setHomepageFile(null);
                        setCropBox(null);
                      }}
                      disabled={submittingHomepageImage}
                    >
                      Choose Different Image
                    </button>
                  </>
                )}

                {error ? <p className="auth-error">{error}</p> : null}

                <button className="auth-submit" type="submit" disabled={submittingHomepageImage || !homepageFile || !cropBox}>
                  {submittingHomepageImage ? "Uploading..." : "Upload Homepage Image"}
                </button>
              </form>
            </section>
          </div>
        ) : null}
        {deleteTarget ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => !deletingTarget && setDeleteTarget(null)}>
            <section
              className="confirmation-modal gothic-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-confirm-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="card-frame" aria-hidden="true">
                <span className="corner corner-tl" />
                <span className="corner corner-tr" />
                <span className="corner corner-bl" />
                <span className="corner corner-br" />
              </div>

              <h2 className="host-section-title" id="delete-confirm-title">Confirm Delete</h2>
              <p>
                {deleteTarget.type === "image"
                  ? "Delete this image from the library and storage?"
                  : `Delete ${deleteTarget.user.firstName} ${deleteTarget.user.lastName}? This will remove their account access.`}
              </p>
              <div className="confirmation-actions">
                <button className="auth-secondary" type="button" onClick={() => setDeleteTarget(null)} disabled={deletingTarget}>
                  Cancel
                </button>
                <button className="auth-submit" type="button" onClick={handleConfirmDelete} disabled={deletingTarget}>
                  {deletingTarget ? "Deleting..." : "Delete"}
                </button>
              </div>
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

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("failed to load image"));
    image.src = src;
  });
}
