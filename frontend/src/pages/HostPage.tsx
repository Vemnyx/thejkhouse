import { type DragEvent, type FormEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ImageDateSelect } from "../components/BirthdaySelect";
import { useAuth } from "../context/AuthContext";
import { AppUser, ImageRecord, PartyRecord, createParty, deleteImage, deleteParty, deleteUser, generateHTMLDraft, getHomepage, listImages, listParties, listUsers, sendHostEmail, updateHomepage, updateImageHomepage, uploadAIImage, uploadImage } from "../lib/api";

type HostTab = "images" | "parties" | "homepage" | "users" | "email";
type PartyView = "list" | "create";
type ImageFilter = "all" | "homepage";
type AIDraftType = "homepage" | "party";
type DeleteTarget =
  | { type: "image"; image: ImageRecord }
  | { type: "party"; party: PartyRecord }
  | { type: "user"; user: AppUser };

type CropBox = {
  x: number;
  y: number;
  size: number;
};

const uploadCropSize = 1200;
const calendarMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const calendarWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const currentYear = new Date().getFullYear();
const partyCalendarYears = Array.from({ length: 10 }, (_, index) => currentYear - 2 + index);
const partyHours = Array.from({ length: 12 }, (_, index) => String(index + 1));
const partyMinutes = ["00", "15", "30", "45"];
const partyPeriods = ["AM", "PM"] as const;

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromInputValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  }

  return new Date(year, month - 1, day);
}

function formatPartyDate(value: string) {
  if (!value) {
    return "No date selected";
  }

  return dateFromInputValue(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatPartyDateTime(value: string, hour: string, minute: string, period: string) {
  if (!value) {
    return "Select a date";
  }

  return `${formatPartyDate(value)} at ${hour}:${minute} ${period}`;
}

function partyDateTimeToISO(value: string, hour: string, minute: string, period: string) {
  const [year, month, day] = value.split("-").map(Number);
  const baseHour = Number(hour) % 12;
  const hour24 = period === "PM" ? baseHour + 12 : baseHour;
  return new Date(year, month - 1, day, hour24, Number(minute), 0, 0).toISOString();
}

export default function HostPage() {
  const navigate = useNavigate();
  const { appUser, firebaseUser, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const homepageAIFileInputRef = useRef<HTMLInputElement | null>(null);
  const partyAIFileInputRef = useRef<HTMLInputElement | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const [activeTab, setActiveTab] = useState<HostTab>("images");
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [parties, setParties] = useState<PartyRecord[]>([]);
  const [partyView, setPartyView] = useState<PartyView>("list");
  const [users, setUsers] = useState<AppUser[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState("");
  const [homepage, setHomepage] = useState(false);
  const [notes, setNotes] = useState("");
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [homepageHtml, setHomepageHtml] = useState("");
  const [homepageDraftPrompt, setHomepageDraftPrompt] = useState("");
  const [homepageDraftImageUrls, setHomepageDraftImageUrls] = useState<string[]>([]);
  const [homepageSuccess, setHomepageSuccess] = useState("");
  const [partySuccess, setPartySuccess] = useState("");
  const [partyLabelValue, setPartyLabelValue] = useState("");
  const [partyDate, setPartyDate] = useState("");
  const [partyHour, setPartyHour] = useState("7");
  const [partyMinute, setPartyMinute] = useState("00");
  const [partyPeriod, setPartyPeriod] = useState<(typeof partyPeriods)[number]>("PM");
  const [partyDateModalOpen, setPartyDateModalOpen] = useState(false);
  const [partyCalendarDate, setPartyCalendarDate] = useState(() => dateFromInputValue(""));
  const [partyHtml, setPartyHtml] = useState("");
  const [partyDraftPrompt, setPartyDraftPrompt] = useState("");
  const [partyDraftImageUrls, setPartyDraftImageUrls] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loadingImages, setLoadingImages] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [savingHomepage, setSavingHomepage] = useState(false);
  const [savingParty, setSavingParty] = useState(false);
  const [generatingHomepageDraft, setGeneratingHomepageDraft] = useState(false);
  const [generatingPartyDraft, setGeneratingPartyDraft] = useState(false);
  const [uploadingAIImages, setUploadingAIImages] = useState<AIDraftType | null>(null);
  const [draggingAIImages, setDraggingAIImages] = useState<AIDraftType | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingHomepageId, setUpdatingHomepageId] = useState<number | null>(null);
  const [deletingPartyId, setDeletingPartyId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [previewImage, setPreviewImage] = useState<ImageRecord | null>(null);
  const [previewParty, setPreviewParty] = useState<PartyRecord | null>(null);

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

  const partyCalendarDays = useMemo(() => {
    const year = partyCalendarDate.getFullYear();
    const month = partyCalendarDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<number | null> = Array.from({ length: firstDay.getDay() }, () => null);

    for (let day = 1; day <= daysInMonth; day += 1) {
      cells.push(day);
    }

    return cells;
  }, [partyCalendarDate]);

  if (appUser?.role !== "host") {
    return <Navigate to="/" replace />;
  }

  const fullName = [appUser?.firstName, appUser?.lastName].filter(Boolean).join(" ") || appUser?.email || "Account";

  const selectHostTab = (tab: HostTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setError("");
    setPartySuccess("");
    if (tab !== "parties") {
      setPartyView("list");
    }
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (!firebaseUser || !file) {
      setError("choose an image to upload");
      return;
    }

    setSubmitting(true);
    try {
      const croppedFile = await createCroppedUploadFile();
      const token = await firebaseUser.getIdToken();
      const uploaded = await uploadImage(token, croppedFile, date, {
        partyId: partyId ? Number(partyId) : null,
        homepage,
        notes: notes.trim(),
      });
      setImages((current) => [uploaded, ...current]);
      setFile(null);
      setPartyId("");
      setHomepage(false);
      setNotes("");
      setCropBox(null);
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

  const handleToggleHomepageImage = async (image: ImageRecord) => {
    if (!firebaseUser) {
      return;
    }

    setError("");
    setUpdatingHomepageId(image.id);
    try {
      const token = await firebaseUser.getIdToken();
      const updated = await updateImageHomepage(token, image.id, !image.homepage);
      setImages((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setPreviewImage((current) => (current?.id === updated.id ? updated : current));
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to update homepage image";
      setError(message);
    } finally {
      setUpdatingHomepageId(null);
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

  const handleDeleteParty = async (party: PartyRecord) => {
    if (!firebaseUser) {
      return;
    }

    setError("");
    setDeletingPartyId(party.id);
    try {
      const token = await firebaseUser.getIdToken();
      await deleteParty(token, party.id);
      setParties((current) => current.filter((item) => item.id !== party.id));
      setPreviewParty((current) => (current?.id === party.id ? null : current));
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to delete party";
      setError(message);
    } finally {
      setDeletingPartyId(null);
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

    if (deleteTarget.type === "party") {
      void handleDeleteParty(deleteTarget.party);
      return;
    }

    void handleDeleteUser(deleteTarget.user);
  };

  const deletingTarget =
    deleteTarget?.type === "image"
      ? deletingId === deleteTarget.image.id
      : deleteTarget?.type === "party"
        ? deletingPartyId === deleteTarget.party.id
      : deleteTarget?.type === "user"
        ? deletingUserId === deleteTarget.user.id
        : false;
  const generatingHTMLDraft = generatingHomepageDraft || generatingPartyDraft;

  const filteredImages = imageFilter === "homepage"
    ? images.filter((image) => image.homepage)
    : images;

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

  const handleCreateParty = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setPartySuccess("");

    if (!firebaseUser) {
      return;
    }
    if (!partyDate) {
      setError("party date is required");
      return;
    }

    setSavingParty(true);
    try {
      const token = await firebaseUser.getIdToken();
      const date = partyDateTimeToISO(partyDate, partyHour, partyMinute, partyPeriod);
      const party = await createParty(token, {
        label: partyLabelValue.trim(),
        date,
        html: partyHtml,
      });
      setParties((current) => [party, ...current]);
      setPartyLabelValue("");
      setPartyDate("");
      setPartyHour("7");
      setPartyMinute("00");
      setPartyPeriod("PM");
      setPartyHtml("");
      setPartySuccess("Party created.");
      setPartyView("list");
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to create party";
      setError(message);
    } finally {
      setSavingParty(false);
    }
  };

  const handleGenerateHTMLDraft = async (type: "homepage" | "party") => {
    setError("");
    setHomepageSuccess("");
    setPartySuccess("");

    if (!firebaseUser) {
      return;
    }

    const instructions = type === "homepage" ? homepageDraftPrompt.trim() : partyDraftPrompt.trim();
    const imageUrls = type === "homepage" ? homepageDraftImageUrls : partyDraftImageUrls;
    if (!instructions) {
      setError("tell the AI what to write first");
      return;
    }

    if (type === "homepage") {
      setGeneratingHomepageDraft(true);
    } else {
      setGeneratingPartyDraft(true);
    }

    try {
      const token = await firebaseUser.getIdToken();
      const draft = await generateHTMLDraft(token, {
        type,
        instructions,
        existingHtml: type === "homepage" ? homepageHtml : partyHtml,
        imageUrls,
      });
      if (type === "homepage") {
        setHomepageHtml(draft.html);
        setHomepageSuccess("AI draft added.");
        setHomepageDraftImageUrls([]);
      } else {
        setPartyHtml(draft.html);
        setPartySuccess("AI draft added.");
        setPartyDraftImageUrls([]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to generate html draft";
      setError(message);
    } finally {
      setGeneratingHomepageDraft(false);
      setGeneratingPartyDraft(false);
    }
  };

  const handleAIDraftImageFiles = async (type: AIDraftType, files: FileList | File[]) => {
    if (!firebaseUser) {
      return;
    }

    const imageFiles = Array.from(files).filter((item) => item.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setError("choose image files to upload");
      return;
    }

    setError("");
    setUploadingAIImages(type);
    try {
      const token = await firebaseUser.getIdToken();
      const uploaded = await Promise.all(imageFiles.map((file) => uploadAIImage(token, file)));
      const urls = uploaded.map((item) => item.imageUrl);
      if (type === "homepage") {
        setHomepageDraftImageUrls((current) => [...current, ...urls]);
      } else {
        setPartyDraftImageUrls((current) => [...current, ...urls]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to upload AI helper image";
      setError(message);
    } finally {
      setUploadingAIImages(null);
      setDraggingAIImages(null);
    }
  };

  const handleAIDraftImageDrop = (type: AIDraftType, event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingAIImages(null);
    void handleAIDraftImageFiles(type, event.dataTransfer.files);
  };

  const removeAIDraftImage = (type: AIDraftType, imageUrl: string) => {
    if (type === "homepage") {
      setHomepageDraftImageUrls((current) => current.filter((item) => item !== imageUrl));
    } else {
      setPartyDraftImageUrls((current) => current.filter((item) => item !== imageUrl));
    }
  };

  const renderAIDraftImageAssist = (type: AIDraftType) => {
    const imageUrls = type === "homepage" ? homepageDraftImageUrls : partyDraftImageUrls;
    const inputRef = type === "homepage" ? homepageAIFileInputRef : partyAIFileInputRef;
    const uploading = uploadingAIImages === type;
    const dragging = draggingAIImages === type;

    return (
      <div
        className={dragging ? "ai-image-dropzone dragging" : "ai-image-dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDraggingAIImages(type);
        }}
        onDragLeave={() => setDraggingAIImages(null)}
        onDrop={(event) => handleAIDraftImageDrop(type, event)}
      >
        <div>
          <p>Drop images here for the AI to use.</p>
          {imageUrls.length > 0 ? (
            <div className="ai-image-preview-grid" aria-label="Uploaded AI helper images">
              {imageUrls.map((imageUrl) => (
                <figure className="ai-image-preview" key={imageUrl}>
                  <img src={imageUrl} alt="Uploaded AI helper" />
                  <button type="button" onClick={() => removeAIDraftImage(type, imageUrl)} aria-label="Remove AI helper image">
                    x
                  </button>
                </figure>
              ))}
            </div>
          ) : null}
        </div>
        <button
          className="ai-image-upload-button"
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Add image"}
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          disabled={uploading}
          onChange={(event) => {
            if (event.target.files) {
              void handleAIDraftImageFiles(type, event.target.files);
            }
            event.target.value = "";
          }}
        />
      </div>
    );
  };

  const openUploadModal = () => {
    setError("");
    setFile(null);
    setPartyId("");
    setHomepage(false);
    setNotes("");
    setCropBox(null);
    setDraggingImage(false);
    setUploadModalOpen(true);
  };

  const openPartyDateModal = () => {
    setPartyCalendarDate(dateFromInputValue(partyDate));
    setPartyDateModalOpen(true);
  };

  const updatePartyCalendarMonth = (month: number) => {
    setPartyCalendarDate((current) => new Date(current.getFullYear(), month, 1));
  };

  const updatePartyCalendarYear = (year: number) => {
    setPartyCalendarDate((current) => new Date(year, current.getMonth(), 1));
  };

  const selectPartyDate = (day: number) => {
    const nextDate = new Date(partyCalendarDate.getFullYear(), partyCalendarDate.getMonth(), day);
    setPartyDate(toDateInputValue(nextDate));
  };

  const closeUploadModal = () => {
    if (submitting) {
      return;
    }
    setUploadModalOpen(false);
    setFile(null);
    setPartyId("");
    setHomepage(false);
    setNotes("");
    setCropBox(null);
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
    setCropBox(null);
    setError("");
  };

  const resetCropBox = () => {
    const bounds = cropStageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }

    const size = Math.min(bounds.width, bounds.height);
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

  const createCroppedUploadFile = async () => {
    if (!file || !filePreviewUrl || !cropBox || !cropStageRef.current) {
      throw new Error("choose an image to crop");
    }

    const bounds = cropStageRef.current.getBoundingClientRect();
    const image = await loadImage(filePreviewUrl);
    const scaleX = image.naturalWidth / bounds.width;
    const scaleY = image.naturalHeight / bounds.height;
    const canvas = document.createElement("canvas");
    canvas.width = uploadCropSize;
    canvas.height = uploadCropSize;

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
      uploadCropSize,
      uploadCropSize,
    );

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      throw new Error("failed to crop image");
    }

    return new File([blob], `image-${Date.now()}.jpg`, { type: "image/jpeg" });
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

          <nav className={mobileMenuOpen ? "main-tabs open" : "main-tabs"} aria-label="Host sections">
            <button
              className={activeTab === "images" ? "main-tab active" : "main-tab"}
              type="button"
              role="tab"
              aria-selected={activeTab === "images"}
              onClick={() => selectHostTab("images")}
            >
              Images
            </button>
            <button
              className={activeTab === "parties" ? "main-tab active" : "main-tab"}
              type="button"
              role="tab"
              aria-selected={activeTab === "parties"}
              onClick={() => selectHostTab("parties")}
            >
              Parties
            </button>
            <button
              className={activeTab === "email" ? "main-tab active" : "main-tab"}
              type="button"
              role="tab"
              aria-selected={activeTab === "email"}
              onClick={() => selectHostTab("email")}
            >
              Email
            </button>
            <button
              className={activeTab === "homepage" ? "main-tab active" : "main-tab"}
              type="button"
              role="tab"
              aria-selected={activeTab === "homepage"}
              onClick={() => selectHostTab("homepage")}
            >
              Homepage
            </button>
            <button
              className={activeTab === "users" ? "main-tab active" : "main-tab"}
              type="button"
              role="tab"
              aria-selected={activeTab === "users"}
              onClick={() => selectHostTab("users")}
            >
              Users
            </button>
            <button
              className="main-tab"
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setProfileOpen(false);
                navigate("/");
              }}
            >
              Dashboard
            </button>
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
                <button type="button" role="menuitem" onClick={() => logout()}>
                  Log Out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <section className="main-content">
          {activeTab === "images" ? (
            <section className="host-panel" role="tabpanel">
            <div className="host-panel-header">
              <label className="image-filter">
                <span>Show</span>
                <select value={imageFilter} onChange={(event) => setImageFilter(event.target.value as ImageFilter)}>
                  <option value="all">All Images</option>
                  <option value="homepage">Homepage Images</option>
                </select>
              </label>
              <div className="host-panel-actions">
                <button className="auth-submit" type="button" onClick={openUploadModal}>
                  Add New Image
                </button>
              </div>
            </div>

            {error ? <p className="auth-error">{error}</p> : null}

            {loadingImages ? (
              <p className="loading-text">Loading images...</p>
            ) : images.length === 0 ? (
              <p className="dashboard-copy">No images uploaded yet.</p>
            ) : filteredImages.length === 0 ? (
              <p className="dashboard-copy">No homepage images yet.</p>
            ) : (
              <div className="image-grid" role="table" aria-label="Uploaded images">
                {filteredImages.map((image) => (
                  <article className="image-grid-card" key={image.id}>
                    <div className="image-grid-image-wrap">
                      <button
                        className="image-preview-trigger"
                        type="button"
                        onClick={() => setPreviewImage(image)}
                        aria-label={`Open image uploaded on ${formatDate(image.date)}`}
                      >
                        <img src={image.imageUrl} alt={`Uploaded on ${formatDate(image.date)}`} />
                      </button>
                      <button
                        className="image-delete-button"
                        type="button"
                        aria-label="Delete image"
                        onClick={() => setDeleteTarget({ type: "image", image })}
                        disabled={deletingId === image.id}
                      >
                        {deletingId === image.id ? "..." : "🗑"}
                      </button>
                      <button
                        className={image.homepage ? "image-homepage-button active" : "image-homepage-button"}
                        type="button"
                        aria-label={image.homepage ? "Remove from homepage images" : "Use as homepage image"}
                        aria-pressed={image.homepage}
                        title={image.homepage ? "Homepage image" : "Not on homepage"}
                        onClick={() => void handleToggleHomepageImage(image)}
                        disabled={updatingHomepageId === image.id}
                      >
                        {updatingHomepageId === image.id ? "..." : image.homepage ? "★" : "☆"}
                      </button>
                    </div>
                    <div className="image-grid-meta">
                      <span>{formatDate(image.date)}</span>
                      <span>{image.partyId ? partyLabel(parties, image.partyId) : image.homepage ? "Homepage" : "No party"}</span>
                      {image.notes ? <span>{image.notes}</span> : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
            </section>
          ) : activeTab === "parties" ? (
            <section className="host-panel" role="tabpanel">
              {partyView === "list" ? (
                <>
                  <div className="host-panel-header">
                    <button className="auth-submit" type="button" onClick={() => {
                      setPartyView("create");
                      setError("");
                      setPartySuccess("");
                    }}>
                      Add New Party
                    </button>
                  </div>

                  {partySuccess ? <p className="host-success">{partySuccess}</p> : null}
                  {error ? <p className="auth-error">{error}</p> : null}

                  <div className="host-table-wrap">
                    <table className="host-table">
                      <thead>
                        <tr>
                          <th>Party</th>
                          <th>Date</th>
                          <th>HTML</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {parties.map((party) => (
                          <tr className="clickable-row" key={party.id} onClick={() => setPreviewParty(party)}>
                            <td>{party.label}</td>
                            <td>{formatDateTime(party.date)}</td>
                            <td>{party.html.trim() ? "Added" : "Empty"}</td>
                            <td>
                              <button
                                className="auth-secondary table-action-button"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteTarget({ type: "party", party });
                                }}
                                disabled={deletingPartyId === party.id}
                              >
                                {deletingPartyId === party.id ? "Deleting..." : "Delete"}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {parties.length === 0 ? (
                          <tr>
                            <td colSpan={4}>No parties yet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <form className="party-form" onSubmit={handleCreateParty}>
                  <div className="host-panel-header">
                    <button className="auth-secondary" type="button" onClick={() => {
                      setPartyView("list");
                      setError("");
                    }}>
                      Back to Parties
                    </button>
                  </div>

                  <label className="auth-field">
                    <span>Party label</span>
                    <input value={partyLabelValue} onChange={(event) => setPartyLabelValue(event.target.value)} required />
                  </label>
                  <div className="auth-field party-date-field">
                    <span>Date</span>
                    <button className="auth-secondary party-date-trigger" type="button" onClick={openPartyDateModal}>
                      {formatPartyDateTime(partyDate, partyHour, partyMinute, partyPeriod)}
                    </button>
                  </div>
                  <div className="ai-draft-box">
                    <label className="auth-field host-message-field">
                      <span>AI Help</span>
                      <textarea
                        value={partyDraftPrompt}
                        onChange={(event) => setPartyDraftPrompt(event.target.value)}
                        rows={3}
                        placeholder="Describe the party announcement you want..."
                      />
                    </label>
                    {renderAIDraftImageAssist("party")}
                    <button
                      className="auth-secondary"
                      type="button"
                      onClick={() => void handleGenerateHTMLDraft("party")}
                      disabled={generatingPartyDraft}
                    >
                      {generatingPartyDraft ? "Writing..." : "Draft Party HTML"}
                    </button>
                    {partySuccess ? <p className="host-success">{partySuccess}</p> : null}
                  </div>
                  <label className="auth-field host-message-field">
                    <span>Announcement HTML</span>
                    <textarea
                      value={partyHtml}
                      onChange={(event) => setPartyHtml(event.target.value)}
                      rows={10}
                      placeholder="<h2>Party announcement</h2><p>Details...</p>"
                    />
                  </label>

                  <div className="homepage-preview-shell party-preview-shell">
                    <p className="host-section-title">Preview</p>
                    <article
                      className="homepage-html homepage-preview"
                      dangerouslySetInnerHTML={{
                        __html: partyHtml || "<p>Party preview will appear here.</p>",
                      }}
                    />
                  </div>

                  {error ? <p className="auth-error">{error}</p> : null}

                  <button className="auth-submit" type="submit" disabled={savingParty}>
                    {savingParty ? "Creating..." : "Create Party"}
                  </button>
                </form>
              )}
            </section>
          ) : activeTab === "homepage" ? (
            <section className="host-panel" role="tabpanel">
            <form className="homepage-editor" onSubmit={handleSaveHomepage}>
              <div className="ai-draft-box">
                <label className="auth-field host-message-field">
                  <span>AI Help</span>
                  <textarea
                    value={homepageDraftPrompt}
                    onChange={(event) => setHomepageDraftPrompt(event.target.value)}
                    rows={3}
                    placeholder="Describe the homepage announcement you want..."
                  />
                </label>
                {renderAIDraftImageAssist("homepage")}
                <button
                  className="auth-secondary"
                  type="button"
                  onClick={() => void handleGenerateHTMLDraft("homepage")}
                  disabled={generatingHomepageDraft}
                >
                  {generatingHomepageDraft ? "Writing..." : "Draft Homepage HTML"}
                </button>
              </div>
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
        </section>

        {partyDateModalOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setPartyDateModalOpen(false)}>
            <section
              className="party-date-modal gothic-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="party-date-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="card-frame" aria-hidden="true">
                <span className="corner corner-tl" />
                <span className="corner corner-tr" />
                <span className="corner corner-bl" />
                <span className="corner corner-br" />
              </div>

              <div className="modal-header">
                <h2 className="host-section-title" id="party-date-modal-title">Select date and time</h2>
                <button className="modal-close" type="button" onClick={() => setPartyDateModalOpen(false)} aria-label="Close date picker">
                  x
                </button>
              </div>

              <div className="party-calendar-controls">
                <label>
                  <span>Month</span>
                  <select value={partyCalendarDate.getMonth()} onChange={(event) => updatePartyCalendarMonth(Number(event.target.value))}>
                    {calendarMonths.map((month, index) => (
                      <option key={month} value={index}>
                        {month}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Year</span>
                  <select value={partyCalendarDate.getFullYear()} onChange={(event) => updatePartyCalendarYear(Number(event.target.value))}>
                    {partyCalendarYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="party-time-controls">
                <label>
                  <span>Hour</span>
                  <select value={partyHour} onChange={(event) => setPartyHour(event.target.value)}>
                    {partyHours.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Minute</span>
                  <select value={partyMinute} onChange={(event) => setPartyMinute(event.target.value)}>
                    {partyMinutes.map((minute) => (
                      <option key={minute} value={minute}>
                        {minute}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>AM/PM</span>
                  <select value={partyPeriod} onChange={(event) => setPartyPeriod(event.target.value as (typeof partyPeriods)[number])}>
                    {partyPeriods.map((period) => (
                      <option key={period} value={period}>
                        {period}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="party-calendar-grid" role="grid" aria-label="Party date calendar">
                {calendarWeekdays.map((weekday) => (
                  <span className="party-calendar-weekday" key={weekday}>
                    {weekday}
                  </span>
                ))}
                {partyCalendarDays.map((day, index) => (
                  day ? (
                    <button
                      className={partyDate === toDateInputValue(new Date(partyCalendarDate.getFullYear(), partyCalendarDate.getMonth(), day)) ? "party-calendar-day selected" : "party-calendar-day"}
                      type="button"
                      key={`${partyCalendarDate.getFullYear()}-${partyCalendarDate.getMonth()}-${day}`}
                      onClick={() => selectPartyDate(day)}
                    >
                      {day}
                    </button>
                  ) : (
                    <span className="party-calendar-empty" key={`empty-${index}`} />
                  )
                ))}
              </div>
              <button className="auth-submit party-calendar-done" type="button" onClick={() => setPartyDateModalOpen(false)} disabled={!partyDate}>
                Done
              </button>
            </section>
          </div>
        ) : null}

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
                {!file ? (
                  <div
                    className={draggingImage ? "drop-zone dragging" : "drop-zone"}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDraggingImage(true);
                    }}
                    onDragLeave={() => setDraggingImage(false)}
                    onDrop={handleImageDrop}
                  >
                    <p>Drag and drop an image here</p>
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
                        setCropBox(null);
                        setError("");
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <p className="selected-file">Drag the square to choose the saved crop.</p>
                    <div className="crop-stage" ref={cropStageRef}>
                      <img src={filePreviewUrl} alt="Upload crop preview" onLoad={resetCropBox} />
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
                          onPointerCancel={handleCropPointerUp}
                        />
                      ) : null}
                      {submitting ? (
                        <div className="upload-loading" aria-label="Uploading image">
                          <span className="confirmation-spinner" />
                        </div>
                      ) : null}
                    </div>
                    <button
                      className="auth-secondary"
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setCropBox(null);
                      }}
                      disabled={submitting}
                    >
                      Choose Different Image
                    </button>
                  </>
                )}

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

                <label className="auth-password-toggle">
                  <input
                    type="checkbox"
                    checked={homepage}
                    onChange={(event) => setHomepage(event.target.checked)}
                  />
                  <span>Use on homepage</span>
                </label>

                <label className="auth-field host-message-field">
                  <span>Notes</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    placeholder="Optional notes about this image"
                  />
                </label>

                {error ? <p className="auth-error">{error}</p> : null}

                <button className="auth-submit" type="submit" disabled={submitting || !file || !cropBox}>
                  {submitting ? "Uploading..." : "Upload Image"}
                </button>
              </form>
            </section>
          </div>
        ) : null}
        {previewImage ? (
          <div className="image-lightbox-backdrop" role="presentation" onMouseDown={() => setPreviewImage(null)}>
            <figure
              className="image-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={`Image uploaded on ${formatDate(previewImage.date)}`}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <img src={previewImage.imageUrl} alt={`Uploaded on ${formatDate(previewImage.date)}`} />
              <figcaption>
                <span>{formatDate(previewImage.date)}</span>
                <span>{previewImage.partyId ? partyLabel(parties, previewImage.partyId) : previewImage.homepage ? "Homepage" : "No party"}</span>
                {previewImage.notes ? <span>{previewImage.notes}</span> : null}
              </figcaption>
            </figure>
          </div>
        ) : null}
        {previewParty ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setPreviewParty(null)}>
            <section
              className="party-preview-modal gothic-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="party-preview-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="card-frame" aria-hidden="true">
                <span className="corner corner-tl" />
                <span className="corner corner-tr" />
                <span className="corner corner-bl" />
                <span className="corner corner-br" />
              </div>

              <div className="modal-header">
                <div>
                  <h2 className="host-section-title" id="party-preview-title">{previewParty.label}</h2>
                  <p className="host-section-copy">{formatDateTime(previewParty.date)}</p>
                </div>
                <button className="modal-close" type="button" onClick={() => setPreviewParty(null)} aria-label="Close party preview">
                  x
                </button>
              </div>

              <article
                className="homepage-html homepage-preview"
                dangerouslySetInnerHTML={{
                  __html: previewParty.html || "<p>No announcement HTML set.</p>",
                }}
              />
            </section>
          </div>
        ) : null}
        {generatingHTMLDraft ? (
          <div className="modal-backdrop ai-loading-backdrop" role="presentation">
            <section
              className="ai-loading-modal gothic-card"
              role="dialog"
              aria-modal="true"
              aria-live="polite"
              aria-label="Generating HTML draft"
            >
              <div className="card-frame" aria-hidden="true">
                <span className="corner corner-tl" />
                <span className="corner corner-tr" />
                <span className="corner corner-bl" />
                <span className="corner corner-br" />
              </div>

              <span className="confirmation-spinner" aria-hidden="true" />
              <div>
                <h2 className="host-section-title">Writing HTML</h2>
                <p>The Cursor agent is reading the site style and drafting your block.</p>
              </div>
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
                  : deleteTarget.type === "party"
                    ? `Delete ${deleteTarget.party.label}?`
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
