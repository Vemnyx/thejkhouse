import { ChangeEvent, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";

type CropBox = { x: number; y: number; size: number };

const avatarCropOutputSize = 800;
const avatarPromptSkipCookie = "jkhouse_avatar_prompt_skip";

function readCookie(name: string) {
  const prefix = `${name}=`;
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
}

function setSessionCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("failed to load image"));
    image.src = src;
  });
}

export default function AvatarPromptModal() {
  const { appUser, updateAvatar } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);

  const [open, setOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const previewUrl = useMemo(() => {
    if (!cropFile) {
      return "";
    }
    return URL.createObjectURL(cropFile);
  }, [cropFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!appUser) {
      setOpen(false);
      return;
    }
    if (appUser.avatarUrl) {
      setOpen(false);
      return;
    }
    if (readCookie(avatarPromptSkipCookie) === "1") {
      setOpen(false);
      return;
    }
    setOpen(true);
  }, [appUser]);

  const dismissForSession = () => {
    if (uploading) {
      return;
    }
    setSessionCookie(avatarPromptSkipCookie, "1");
    setOpen(false);
    setCropFile(null);
    setCropBox(null);
    setError("");
  };

  const resetCropBox = () => {
    const bounds = cropStageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    const inset = 6;
    const size = Math.max(Math.min(bounds.width, bounds.height) - inset * 2, 48);
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
    const bounds = cropStageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragRef.current = {
      offsetX: event.clientX - bounds.left - cropBox.x,
      offsetY: event.clientY - bounds.top - cropBox.y,
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

  const createCircularAvatarFile = async () => {
    if (!cropFile || !previewUrl || !cropBox || !cropStageRef.current) {
      throw new Error("choose an image to crop");
    }

    const bounds = cropStageRef.current.getBoundingClientRect();
    const image = await loadImage(previewUrl);
    const scaleX = image.naturalWidth / bounds.width;
    const scaleY = image.naturalHeight / bounds.height;
    const canvas = document.createElement("canvas");
    canvas.width = avatarCropOutputSize;
    canvas.height = avatarCropOutputSize;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("failed to crop image");
    }

    ctx.clearRect(0, 0, avatarCropOutputSize, avatarCropOutputSize);
    ctx.drawImage(
      image,
      cropBox.x * scaleX,
      cropBox.y * scaleY,
      cropBox.size * scaleX,
      cropBox.size * scaleY,
      0,
      0,
      avatarCropOutputSize,
      avatarCropOutputSize,
    );
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(avatarCropOutputSize / 2, avatarCropOutputSize / 2, avatarCropOutputSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      throw new Error("failed to crop image");
    }
    return new File([blob], `avatar-${Date.now()}.png`, { type: "image/png" });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError("");
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setCropFile(file);
    setCropBox(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!cropFile || !cropBox) {
      setError("Choose and crop a photo before submitting.");
      return;
    }

    setUploading(true);
    try {
      const cropped = await createCircularAvatarFile();
      await updateAvatar(cropped);
      setOpen(false);
      setCropFile(null);
      setCropBox(null);
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "failed to upload profile picture";
      setError(nextError);
    } finally {
      setUploading(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="upload-modal gothic-card avatar-prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-prompt-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="host-section-title" id="avatar-prompt-title">
            Add a profile picture
          </h2>
        </div>
        <p className="dashboard-copy">
          Set a photo so other guests can recognize you at parties and events.
        </p>

        <form className="host-email-form avatar-crop-form" onSubmit={(event) => void handleSubmit(event)}>
          {previewUrl ? (
            <div className="crop-stage" ref={cropStageRef}>
              <img src={previewUrl} alt="" onLoad={resetCropBox} />
              {cropBox ? (
                <div
                  className="crop-box crop-circle"
                  style={{
                    width: cropBox.size,
                    height: cropBox.size,
                    transform: `translate(${cropBox.x}px, ${cropBox.y}px)`,
                  }}
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerUp}
                  onPointerCancel={handleCropPointerUp}
                />
              ) : null}
              {uploading ? (
                <div className="upload-loading" aria-label="Uploading profile picture">
                  <span className="confirmation-spinner" />
                </div>
              ) : null}
            </div>
          ) : (
            <button
              className="auth-secondary avatar-prompt-choose"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Choose Photo
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFileChange}
          />

          {error ? <p className="auth-error">{error}</p> : null}

          {previewUrl ? (
            <button
              className="auth-secondary"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Choose Different Image
            </button>
          ) : null}

          <button className="auth-submit" type="submit" disabled={uploading || !cropFile || !cropBox}>
            {uploading ? "Uploading..." : "Submit"}
          </button>
          <button
            className="avatar-prompt-skip"
            type="button"
            onClick={dismissForSession}
            disabled={uploading}
          >
            Not right now
          </button>
        </form>
      </section>
    </div>
  );
}
