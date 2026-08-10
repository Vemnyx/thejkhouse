import { type Dispatch, type DragEvent, type FormEvent, type PointerEvent, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Navigate, useNavigate } from "react-router-dom";
import { ImageDateSelect } from "../components/BirthdaySelect";
import { useAuth } from "../context/AuthContext";
import { AppUser, BracketParticipant, EventDetail, EventRecord, EventTeamRecord, EventType, EventUserRecord, ImageRecord, MediaSearchItem, MediaSearchType, PartyRecord, completeEvent, createEvent, createEventContestant, createParty, deleteEvent, deleteEventContestant, deleteImage, deleteParty, deleteUser, eventRouteIdentifier, eventTypeLabels, generateHTMLDraft, getEventDetail, getHomepage, listEvents, listImages, listParties, listUsers, saveMediaFromURL, searchMedia, sendHostEmail, startBracketEvent, startEvent, updateEventMetadata, updateHomepage, updateImageEventAssignment, updateImageHomepage, updateImageTags, updateParty, uploadAIImage, uploadImage } from "../lib/api";

type HostTab = "images" | "parties" | "events" | "homepage" | "users" | "email";
type PartyView = "list" | "create" | "edit";
type EventView = "list" | "setup";
type ImageFilter = "all" | "homepage";
type AIDraftType = "homepage";
type EventCategory = {
  name: string;
  type: "individual" | "team";
};
type BracketMode = "individual" | "team";
type BracketMetadata = {
  size: number;
  mode: BracketMode;
  teamSize: number;
};
type DeleteTarget =
  | { type: "image"; image: ImageRecord }
  | { type: "party"; party: PartyRecord }
  | { type: "event"; event: EventRecord }
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
const partyMinutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const partyPeriods = ["AM", "PM"] as const;
const bracketSizes = [4, 8, 16];
const bracketTeamSizes = [2, 3, 4];

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

function dateOnlyToISO(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

function timePartsFromISO(value: string) {
  const date = new Date(value);
  const hours = date.getHours();
  const period = hours >= 12 ? "PM" : "AM";
  const hour = String(hours % 12 || 12);
  const minute = String(date.getMinutes()).padStart(2, "0");
  return {
    date: toDateInputValue(date),
    hour,
    minute: partyMinutes.includes(minute) ? minute : "00",
    period: period as (typeof partyPeriods)[number],
  };
}

export default function HostPage() {
  const navigate = useNavigate();
  const { appUser, firebaseUser, logout } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contestantPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const contestantPhotoTargetRef = useRef<number | "couple" | null>(null);
  const contestantCropStageRef = useRef<HTMLDivElement | null>(null);
  const contestantCropDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const homepageAIFileInputRef = useRef<HTMLInputElement | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const [activeTab, setActiveTab] = useState<HostTab>("images");
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [parties, setParties] = useState<PartyRecord[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [partyView, setPartyView] = useState<PartyView>("list");
  const [eventView, setEventView] = useState<EventView>("list");
  const [selectedEventDetail, setSelectedEventDetail] = useState<EventDetail | null>(null);
  const [loadingEventDetail, setLoadingEventDetail] = useState(false);
  const [editingParty, setEditingParty] = useState<PartyRecord | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState("");
  const [homepage, setHomepage] = useState(false);
  const [notes, setNotes] = useState("");
  const [uploadUserId, setUploadUserId] = useState("");
  const [uploadUserIds, setUploadUserIds] = useState<number[]>([]);
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
  const [partySummary, setPartySummary] = useState("");
  const [partyPartifulUrl, setPartyPartifulUrl] = useState("");
  const [partyMediaUrl, setPartyMediaUrl] = useState("");
  const [partyMediaModalOpen, setPartyMediaModalOpen] = useState(false);
  const [partyMediaType, setPartyMediaType] = useState<MediaSearchType | "">("");
  const [partyMediaQuery, setPartyMediaQuery] = useState("");
  const [partyMediaResults, setPartyMediaResults] = useState<MediaSearchItem[]>([]);
  const [partyMediaSearching, setPartyMediaSearching] = useState(false);
  const [partyMediaSaving, setPartyMediaSaving] = useState(false);
  const [partyMediaError, setPartyMediaError] = useState("");
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventType, setEventType] = useState<EventType>("0");
  const [eventLabel, setEventLabel] = useState("");
  const [eventPartyId, setEventPartyId] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventSummary, setEventSummary] = useState("");
  const [bracketSize, setBracketSize] = useState(4);
  const [bracketMode, setBracketMode] = useState<BracketMode>("individual");
  const [bracketTeamSize, setBracketTeamSize] = useState(2);
  const [bracketAssignments, setBracketAssignments] = useState<Record<number, string>>({});
  const [bracketTeamAssignments, setBracketTeamAssignments] = useState<Record<number, string[]>>({});
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryType, setCategoryType] = useState<EventCategory["type"]>("individual");
  const [eventCategories, setEventCategories] = useState<EventCategory[]>([]);
  const [contestantModalOpen, setContestantModalOpen] = useState(false);
  const [contestantCouple, setContestantCouple] = useState(false);
  const [contestantUserId, setContestantUserId] = useState("");
  const [contestantUserIds, setContestantUserIds] = useState<number[]>([]);
  const [contestantName, setContestantName] = useState("");
  const [contestantPhotos, setContestantPhotos] = useState<Record<number, ImageRecord>>({});
  const [couplePhoto, setCouplePhoto] = useState<ImageRecord | null>(null);
  const [contestantPhotoTarget, setContestantPhotoTarget] = useState<number | "couple" | null>(null);
  const [contestantPhotoModalOpen, setContestantPhotoModalOpen] = useState(false);
  const [contestantPhotoFile, setContestantPhotoFile] = useState<File | null>(null);
  const [contestantPhotoCropBox, setContestantPhotoCropBox] = useState<CropBox | null>(null);
  const [draggingContestantPhoto, setDraggingContestantPhoto] = useState(false);
  const [uploadingContestantPhoto, setUploadingContestantPhoto] = useState(false);
  const [savingContestant, setSavingContestant] = useState(false);
  const [startingEvent, setStartingEvent] = useState(false);
  const [completingEventId, setCompletingEventId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loadingImages, setLoadingImages] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [savingHomepage, setSavingHomepage] = useState(false);
  const [savingParty, setSavingParty] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [generatingHomepageDraft, setGeneratingHomepageDraft] = useState(false);
  const [uploadingAIImages, setUploadingAIImages] = useState<AIDraftType | null>(null);
  const [draggingAIImages, setDraggingAIImages] = useState<AIDraftType | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [draggingImage, setDraggingImage] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingHomepageId, setUpdatingHomepageId] = useState<number | null>(null);
  const [updatingImageTags, setUpdatingImageTags] = useState(false);
  const [deletingPartyId, setDeletingPartyId] = useState<number | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [qrEvent, setQrEvent] = useState<EventRecord | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [previewImage, setPreviewImage] = useState<ImageRecord | null>(null);
  const [previewParty, setPreviewParty] = useState<PartyRecord | null>(null);
  const [tagEditImage, setTagEditImage] = useState<ImageRecord | null>(null);
  const [tagEditUserId, setTagEditUserId] = useState("");
  const [tagEditUserIds, setTagEditUserIds] = useState<number[]>([]);

  const filePreviewUrl = useMemo(() => {
    if (!file) {
      return "";
    }

    return URL.createObjectURL(file);
  }, [file]);
  const contestantPhotoPreviewUrl = useMemo(() => {
    if (!contestantPhotoFile) {
      return "";
    }

    return URL.createObjectURL(contestantPhotoFile);
  }, [contestantPhotoFile]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  useEffect(() => {
    return () => {
      if (contestantPhotoPreviewUrl) {
        URL.revokeObjectURL(contestantPhotoPreviewUrl);
      }
    };
  }, [contestantPhotoPreviewUrl]);

  const qrEventUrl = useMemo(() => {
    if (!qrEvent) {
      return "";
    }
    return `${window.location.origin}/events/${eventRouteIdentifier(qrEvent)}`;
  }, [qrEvent]);

  useEffect(() => {
    let cancelled = false;
    if (!qrEventUrl) {
      setQrCodeUrl("");
      setQrError("");
      return undefined;
    }

    setQrCodeUrl("");
    setQrError("");
    QRCode.toDataURL(qrEventUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 360,
      color: {
        dark: "#030303",
        light: "#ffffff",
      },
    })
      .then((url) => {
        if (!cancelled) {
          setQrCodeUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError("failed to generate QR code");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [qrEventUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadImages() {
      if (!firebaseUser) {
        setLoadingImages(false);
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        const [nextImages, nextParties, nextHomepage, nextUsers, nextEvents] = await Promise.all([
          listImages(token),
          listParties(token),
          getHomepage(token),
          listUsers(token),
          listEvents(token),
        ]);
        if (!cancelled) {
          setImages(nextImages);
          setParties(nextParties);
          setHomepageHtml(nextHomepage.html);
          setUsers(nextUsers);
          setEvents(nextEvents);
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
    if (tab !== "events") {
      setEventView("list");
      setSelectedEventDetail(null);
    }
  };

  const resetPartyForm = () => {
    setEditingParty(null);
    setPartyLabelValue("");
    setPartyDate("");
    setPartyHour("7");
    setPartyMinute("00");
    setPartyPeriod("PM");
    setPartySummary("");
    setPartyPartifulUrl("");
    setPartyMediaUrl("");
    setPartyMediaModalOpen(false);
    setPartyMediaType("");
    setPartyMediaQuery("");
    setPartyMediaResults([]);
    setPartyMediaError("");
  };

  const openCreatePartyForm = () => {
    resetPartyForm();
    setPartyView("create");
    setError("");
    setPartySuccess("");
  };

  const openEditPartyForm = (party: PartyRecord) => {
    const parts = timePartsFromISO(party.date);
    setEditingParty(party);
    setPartyLabelValue(party.label);
    setPartyDate(parts.date);
    setPartyHour(parts.hour);
    setPartyMinute(parts.minute);
    setPartyPeriod(parts.period);
    setPartySummary(party.summary || "");
    setPartyPartifulUrl(party.partifulUrl || "");
    setPartyMediaUrl(party.mediaUrl || "");
    setPartyView("edit");
    setError("");
    setPartySuccess("");
  };

  const resetEventForm = () => {
    setEventType("0");
    setEventLabel("");
    setEventPartyId("");
    setEventStartDate("");
    setEventEndDate("");
    setEventSummary("");
    setBracketSize(4);
    setBracketMode("individual");
    setBracketTeamSize(2);
  };

  const openEventModal = () => {
    resetEventForm();
    setEventModalOpen(true);
    setError("");
  };

  const closeEventModal = () => {
    if (savingEvent) {
      return;
    }
    setEventModalOpen(false);
  };

  const handleCreateEvent = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!firebaseUser) {
      setError("host session is required");
      return;
    }
    const label = eventLabel.trim();
    if (!label) {
      setError("event label is required");
      return;
    }

    setSavingEvent(true);
    try {
      const token = await firebaseUser.getIdToken();
      const created = await createEvent(token, {
        label,
        type: eventType,
        partyId: eventPartyId ? Number(eventPartyId) : null,
        startDate: eventAllowsDates && eventStartDate ? dateOnlyToISO(eventStartDate) : "",
        endDate: eventAllowsDates && eventEndDate ? dateOnlyToISO(eventEndDate) : "",
        description: eventSummary.trim(),
        metadata: eventType === "1" ? {
          bracket: {
            size: bracketSize,
            mode: bracketMode,
            teamSize: bracketMode === "team" ? bracketTeamSize : 1,
          },
        } : undefined,
      });
      setEvents((current) => [created, ...current]);
      setEventModalOpen(false);
      resetEventForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to create event";
      setError(message);
    } finally {
      setSavingEvent(false);
    }
  };

  const openEventSetup = async (event: EventRecord) => {
    if (!firebaseUser) {
      return;
    }
    setError("");
    setLoadingEventDetail(true);
    try {
      const token = await firebaseUser.getIdToken();
      const detail = await getEventDetail(token, event.id);
      setSelectedEventDetail(detail);
      setEventCategories(eventMetadataCategories(detail.event.metadata));
      const bracket = eventMetadataBracket(detail.event.metadata);
      setBracketAssignments(bracketAssignmentsFromMetadata(detail.event.metadata, bracket.size));
      setBracketTeamAssignments(bracketTeamAssignmentsFromMetadata(detail.event.metadata, bracket.size));
      setEventView("setup");
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to load event";
      setError(message);
    } finally {
      setLoadingEventDetail(false);
    }
  };

  const addCategory = (event: FormEvent) => {
    event.preventDefault();
    const category = categoryDraft.trim();
    if (!category || eventCategories.some((item) => item.name === category)) {
      return;
    }
    setEventCategories((current) => [...current, { name: category, type: categoryType }]);
    setCategoryDraft("");
    setCategoryType("individual");
    setCategoryModalOpen(false);
  };

  const saveEventCategories = async () => {
    if (!firebaseUser || !selectedEvent) {
      return;
    }
    setError("");
    setSavingEvent(true);
    try {
      const token = await firebaseUser.getIdToken();
      const metadata = { ...selectedEvent.metadata, categories: eventCategories };
      const updated = await updateEventMetadata(token, selectedEvent.id, metadata);
      setEvents((current) => current.map((event) => (event.id === updated.id ? updated : event)));
      setSelectedEventDetail((current) => current ? { ...current, event: updated } : current);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to save event categories";
      setError(message);
    } finally {
      setSavingEvent(false);
    }
  };

  const resetContestantForm = () => {
    setContestantCouple(false);
    setContestantUserId("");
    setContestantUserIds([]);
    setContestantName("");
    setContestantPhotos({});
    setCouplePhoto(null);
    setContestantPhotoTarget(null);
    contestantPhotoTargetRef.current = null;
    setContestantPhotoFile(null);
    setContestantPhotoCropBox(null);
    setContestantPhotoModalOpen(false);
    setDraggingContestantPhoto(false);
  };

  const openContestantModal = () => {
    resetContestantForm();
    setContestantModalOpen(true);
    setError("");
  };

  const addContestantUser = (value: string) => {
    const userId = Number(value);
    setContestantUserId("");
    if (!userId) {
      return;
    }
    if (contestantCouple) {
      if (!contestantUserIds.includes(userId)) {
        setContestantUserIds((current) => [...current, userId]);
      }
      return;
    }
    setContestantUserIds([userId]);
  };

  const removeContestantUser = (userId: number) => {
    setContestantUserIds((current) => current.filter((id) => id !== userId));
    setContestantPhotos((current) => {
      const next = { ...current };
      delete next[userId];
      return next;
    });
  };

  const openContestantPhotoModal = (target: number | "couple") => {
    contestantPhotoTargetRef.current = target;
    setContestantPhotoTarget(target);
    setContestantPhotoFile(null);
    setContestantPhotoCropBox(null);
    setDraggingContestantPhoto(false);
    setContestantPhotoModalOpen(true);
    setError("");
  };

  const closeContestantPhotoModal = () => {
    if (uploadingContestantPhoto) {
      return;
    }
    contestantPhotoTargetRef.current = null;
    setContestantPhotoTarget(null);
    setContestantPhotoFile(null);
    setContestantPhotoCropBox(null);
    setDraggingContestantPhoto(false);
    setContestantPhotoModalOpen(false);
  };

  const handleContestantPhotoFile = (file: File | null) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("choose an image file");
      return;
    }
    setContestantPhotoFile(file);
    setContestantPhotoCropBox(null);
    setError("");
  };

  const handleContestantPhotoDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingContestantPhoto(false);
    handleContestantPhotoFile(event.dataTransfer.files[0] ?? null);
  };

  const resetContestantPhotoCropBox = () => {
    const bounds = contestantCropStageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    const size = Math.min(bounds.width, bounds.height);
    setContestantPhotoCropBox({
      x: (bounds.width - size) / 2,
      y: (bounds.height - size) / 2,
      size,
    });
  };

  const constrainContestantPhotoCropBox = (nextX: number, nextY: number, size: number) => {
    const bounds = contestantCropStageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return { x: nextX, y: nextY, size };
    }
    return {
      x: Math.min(Math.max(nextX, 0), bounds.width - size),
      y: Math.min(Math.max(nextY, 0), bounds.height - size),
      size,
    };
  };

  const handleContestantPhotoCropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!contestantPhotoCropBox) {
      return;
    }
    const bounds = contestantCropStageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    contestantCropDragRef.current = {
      offsetX: event.clientX - bounds.left - contestantPhotoCropBox.x,
      offsetY: event.clientY - bounds.top - contestantPhotoCropBox.y,
    };
  };

  const handleContestantPhotoCropPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!contestantPhotoCropBox || !contestantCropDragRef.current) {
      return;
    }
    const bounds = contestantCropStageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    setContestantPhotoCropBox(constrainContestantPhotoCropBox(
      event.clientX - bounds.left - contestantCropDragRef.current.offsetX,
      event.clientY - bounds.top - contestantCropDragRef.current.offsetY,
      contestantPhotoCropBox.size,
    ));
  };

  const handleContestantPhotoCropPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    contestantCropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const createContestantCroppedPhotoFile = async () => {
    if (!contestantPhotoFile || !contestantPhotoPreviewUrl || !contestantPhotoCropBox || !contestantCropStageRef.current) {
      throw new Error("choose an image to crop");
    }
    const bounds = contestantCropStageRef.current.getBoundingClientRect();
    const image = await loadImage(contestantPhotoPreviewUrl);
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
      contestantPhotoCropBox.x * scaleX,
      contestantPhotoCropBox.y * scaleY,
      contestantPhotoCropBox.size * scaleX,
      contestantPhotoCropBox.size * scaleY,
      0,
      0,
      uploadCropSize,
      uploadCropSize,
    );
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      throw new Error("failed to crop image");
    }
    return new File([blob], `contestant-image-${Date.now()}.jpg`, { type: "image/jpeg" });
  };

  const submitContestantPhoto = async (event: FormEvent) => {
    event.preventDefault();
    const target = contestantPhotoTarget ?? contestantPhotoTargetRef.current;
    if (!firebaseUser || !selectedEvent || !target) {
      return;
    }
    setError("");
    setUploadingContestantPhoto(true);
    try {
      const token = await firebaseUser.getIdToken();
      const croppedFile = await createContestantCroppedPhotoFile();
      const userIds = target === "couple" ? contestantUserIds : [target];
      const costumeName = contestantName.trim();
      const uploaded = await uploadImage(token, croppedFile, toDateInputValue(new Date()), {
        partyId: selectedEvent.partyId ?? null,
        eventId: selectedEvent.id,
        notes: costumeName,
        userIds,
      });
      setImages((current) => [uploaded, ...current.filter((image) => image.id !== uploaded.id)]);
      if (target === "couple") {
        setCouplePhoto(uploaded);
      } else {
        setContestantPhotos((current) => ({ ...current, [target]: uploaded }));
      }
      contestantPhotoTargetRef.current = null;
      setContestantPhotoTarget(null);
      setContestantPhotoFile(null);
      setContestantPhotoCropBox(null);
      setDraggingContestantPhoto(false);
      setContestantPhotoModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to upload contestant photo";
      setError(message);
    } finally {
      setUploadingContestantPhoto(false);
    }
  };

  const submitContestant = async (event: FormEvent) => {
    event.preventDefault();
    if (!firebaseUser || !selectedEvent) {
      return;
    }
    if (contestantUserIds.length === 0) {
      setError("select at least one user");
      return;
    }
    if (!contestantName.trim()) {
      setError(contestantCouple ? "couple costume is required" : "costume name is required");
      return;
    }
    if (contestantCouple && !couplePhoto) {
      setError("add a team photo before submitting");
      return;
    }
    if (!contestantCouple && contestantUserIds.some((userId) => !contestantPhotos[userId])) {
      setError("add a photo for the contestant before submitting");
      return;
    }

    setError("");
    setSavingContestant(true);
    try {
      const token = await firebaseUser.getIdToken();
      const response = await createEventContestant(token, selectedEvent.id, {
        userIds: contestantUserIds,
        teamName: contestantCouple ? contestantName.trim() : undefined,
        costume: contestantCouple ? undefined : contestantName.trim(),
        team: contestantCouple,
      });
      const assignedImages: ImageRecord[] = [];
      if (response.team) {
        const imageIds = [
          ...Object.values(contestantPhotos).map((image) => image.id),
          ...(couplePhoto ? [couplePhoto.id] : []),
        ];
        for (const imageId of imageIds) {
          const updated = await updateImageEventAssignment(token, imageId, {
            eventId: selectedEvent.id,
            teamId: response.team.id,
          });
          assignedImages.push(updated);
        }
      }
      if (assignedImages.length > 0) {
        setImages((current) => current.map((image) => assignedImages.find((updated) => updated.id === image.id) ?? image));
      }
      setSelectedEventDetail(response.detail);
      resetContestantForm();
      setContestantModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to save contestant";
      setError(message);
    } finally {
      setSavingContestant(false);
    }
  };

  const handleStartSelectedEvent = async () => {
    if (!firebaseUser || !selectedEvent) {
      return;
    }
    setError("");
    setStartingEvent(true);
    try {
      const token = await firebaseUser.getIdToken();
      const updated = await startEvent(token, selectedEvent.id);
      setEvents((current) => current.map((event) => (event.id === updated.id ? updated : event)));
      setSelectedEventDetail((current) => current ? { ...current, event: updated } : current);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to start event";
      setError(message);
    } finally {
      setStartingEvent(false);
    }
  };

  const saveBracketSetup = async () => {
    if (!firebaseUser || !selectedEvent) {
      return;
    }
    setError("");
    setSavingEvent(true);
    try {
      const token = await firebaseUser.getIdToken();
      const metadata = {
        ...selectedEvent.metadata,
        bracket: {
          ...selectedBracket,
          participants: selectedBracketParticipants,
        },
      };
      const updated = await updateEventMetadata(token, selectedEvent.id, metadata);
      setEvents((current) => current.map((event) => (event.id === updated.id ? updated : event)));
      setSelectedEventDetail((current) => current ? { ...current, event: updated } : current);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to save bracket setup";
      setError(message);
    } finally {
      setSavingEvent(false);
    }
  };

  const handleStartBracketEvent = async () => {
    if (!firebaseUser || !selectedEvent) {
      return;
    }
    if (selectedBracketParticipants.length !== selectedBracket.size) {
      setError("fill every bracket slot before starting");
      return;
    }
    setError("");
    setStartingEvent(true);
    try {
      const token = await firebaseUser.getIdToken();
      await saveBracketSetup();
      const detail = await startBracketEvent(token, selectedEvent.id, selectedBracketParticipants);
      setSelectedEventDetail(detail);
      setEvents((current) => current.map((event) => (event.id === detail.event.id ? detail.event : event)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to start bracket";
      setError(message);
    } finally {
      setStartingEvent(false);
    }
  };

  const randomizeBracketAssignments = () => {
    if (selectedBracket.mode === "team") {
      const slots = bracketSlots(selectedBracket.size);
      const filledTeams = slots
        .map((slot) => bracketTeamAssignments[slot] ?? [])
        .filter((team) => team.length > 0);
      const shuffled = shuffleItems(filledTeams);
      setBracketTeamAssignments(Object.fromEntries(slots.map((slot, index) => [slot, shuffled[index] ?? []])));
      return;
    }
    const slots = bracketSlots(selectedBracket.size);
    const filled = slots.map((slot) => bracketAssignments[slot]).filter(Boolean);
    const shuffled = shuffleItems(filled);
    setBracketAssignments(Object.fromEntries(slots.map((slot, index) => [slot, shuffled[index] ?? ""])));
  };

  const handleCompleteEvent = async (event: EventRecord) => {
    if (!firebaseUser) {
      return;
    }
    setError("");
    setCompletingEventId(event.id);
    try {
      const token = await firebaseUser.getIdToken();
      const updated = await completeEvent(token, event.id);
      setEvents((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setSelectedEventDetail((current) => current?.event.id === updated.id ? { ...current, event: updated } : current);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to complete event";
      setError(message);
    } finally {
      setCompletingEventId(null);
    }
  };

  const removeContestant = async (eventUser?: EventUserRecord, team?: EventTeamRecord) => {
    if (!firebaseUser || !selectedEvent) {
      return;
    }
    if (!eventUser && !team) {
      return;
    }
    setError("");
    try {
      const token = await firebaseUser.getIdToken();
      const detail = await deleteEventContestant(token, selectedEvent.id, {
        userIds: team ? [] : eventUser ? [eventUser.userId] : [],
        teamId: team?.id ?? null,
      });
      setSelectedEventDetail(detail);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to remove contestant";
      setError(message);
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
      const token = await firebaseUser.getIdToken();
      const uploadDate = selectedUploadParty ? toDateInputValue(new Date(selectedUploadParty.date)) : date;
      const uploaded = await uploadImage(token, file, uploadDate, {
        partyId: partyId ? Number(partyId) : null,
        homepage,
        notes: notes.trim(),
        userIds: uploadUserIds,
      });
      setImages((current) => [uploaded, ...current]);
      setFile(null);
      setPartyId("");
      setHomepage(false);
      setNotes("");
      setUploadUserId("");
      setUploadUserIds([]);
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

  const openImageTagModal = (image: ImageRecord) => {
    setTagEditImage(image);
    setTagEditUserIds(image.userIds ?? []);
    setTagEditUserId("");
    setError("");
  };

  const closeImageTagModal = () => {
    if (updatingImageTags) {
      return;
    }
    setTagEditImage(null);
    setTagEditUserId("");
    setTagEditUserIds([]);
  };

  const addImageTagUser = (value: string) => {
    setTagEditUserId("");
    const userId = Number(value);
    if (!userId || tagEditUserIds.includes(userId)) {
      return;
    }
    setTagEditUserIds((current) => [...current, userId]);
  };

  const removeImageTagUser = (userId: number) => {
    setTagEditUserIds((current) => current.filter((id) => id !== userId));
  };

  const saveImageTags = async () => {
    if (!firebaseUser || !tagEditImage) {
      return;
    }

    setError("");
    setUpdatingImageTags(true);
    try {
      const token = await firebaseUser.getIdToken();
      const updated = await updateImageTags(token, tagEditImage.id, tagEditUserIds);
      setImages((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setPreviewImage((current) => (current?.id === updated.id ? updated : current));
      setTagEditImage(null);
      setTagEditUserId("");
      setTagEditUserIds([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to update tagged users";
      setError(message);
    } finally {
      setUpdatingImageTags(false);
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

  const handleDeleteEvent = async (event: EventRecord) => {
    if (!firebaseUser) {
      return;
    }

    setError("");
    setDeletingEventId(event.id);
    try {
      const token = await firebaseUser.getIdToken();
      await deleteEvent(token, event.id);
      setEvents((current) => current.filter((item) => item.id !== event.id));
      setSelectedEventDetail((current) => (current?.event.id === event.id ? null : current));
      setEventView((current) => (selectedEventDetail?.event.id === event.id ? "list" : current));
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to delete event";
      setError(message);
    } finally {
      setDeletingEventId(null);
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

    if (deleteTarget.type === "event") {
      void handleDeleteEvent(deleteTarget.event);
      return;
    }

    void handleDeleteUser(deleteTarget.user);
  };

  const deletingTarget =
    deleteTarget?.type === "image"
      ? deletingId === deleteTarget.image.id
      : deleteTarget?.type === "party"
        ? deletingPartyId === deleteTarget.party.id
      : deleteTarget?.type === "event"
        ? deletingEventId === deleteTarget.event.id
      : deleteTarget?.type === "user"
        ? deletingUserId === deleteTarget.user.id
        : false;
  const generatingHTMLDraft = generatingHomepageDraft;
  const eventAllowsDates = eventType !== "0" && eventType !== "1";

  const filteredImages = imageFilter === "homepage"
    ? images.filter((image) => image.homepage)
    : images;
  const selectedUploadParty = partyId ? parties.find((party) => party.id === Number(partyId)) : null;
  const taggedUploadUsers = uploadUserIds
    .map((userId) => users.find((user) => user.id === userId))
    .filter((user): user is AppUser => Boolean(user));
  const selectedEvent = selectedEventDetail?.event ?? null;
  const selectedEventCategories = selectedEvent ? eventMetadataCategories(selectedEvent.metadata) : [];
  const selectedEventContestantUsers = selectedEventDetail?.users.filter((eventUser) => eventUser.contestant && eventUserHasCostume(eventUser)) ?? [];
  const selectedEventImages = selectedEvent ? images.filter((image) => image.eventId === selectedEvent.id) : [];
  const selectedBracket = selectedEvent ? eventMetadataBracket(selectedEvent.metadata) : { size: 4, mode: "individual" as BracketMode, teamSize: 1 };
  const selectedBracketParticipants = selectedEvent ? bracketParticipantsFromSetup(selectedBracket, bracketAssignments, bracketTeamAssignments, users) : [];

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
      const payload = {
        label: partyLabelValue.trim(),
        date,
        summary: partySummary.trim(),
        partifulUrl: partyPartifulUrl.trim(),
        mediaUrl: partyMediaUrl.trim(),
      };
      if (partyView === "edit" && editingParty) {
        const party = await updateParty(token, editingParty.id, payload);
        setParties((current) => sortPartiesByDate(current.map((item) => (item.id === party.id ? party : item))));
        setPreviewParty((current) => (current?.id === party.id ? party : current));
        setPartySuccess("Party updated.");
      } else {
        const party = await createParty(token, payload);
        setParties((current) => sortPartiesByDate([party, ...current]));
        setPartySuccess("Party created.");
      }
      resetPartyForm();
      setPartyView("list");
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to save party";
      setError(message);
    } finally {
      setSavingParty(false);
    }
  };

  const openPartyMediaModal = () => {
    setPartyMediaModalOpen(true);
    setPartyMediaType("");
    setPartyMediaQuery("");
    setPartyMediaResults([]);
    setPartyMediaError("");
  };

  const closePartyMediaModal = () => {
    if (partyMediaSearching || partyMediaSaving) {
      return;
    }
    setPartyMediaModalOpen(false);
    setPartyMediaError("");
  };

  const handlePartyMediaSearch = async (event: FormEvent) => {
    event.preventDefault();
    setPartyMediaError("");
    if (!firebaseUser) {
      return;
    }
    if (!partyMediaType) {
      setPartyMediaError("Choose image or gif first.");
      return;
    }
    const query = partyMediaQuery.trim();
    if (!query) {
      setPartyMediaError("Enter a search query.");
      return;
    }

    setPartyMediaSearching(true);
    try {
      const token = await firebaseUser.getIdToken();
      const items = await searchMedia(token, query, partyMediaType);
      setPartyMediaResults(items);
      if (items.length === 0) {
        setPartyMediaError("No results found. Try another query.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to search media";
      setPartyMediaError(message);
      setPartyMediaResults([]);
    } finally {
      setPartyMediaSearching(false);
    }
  };

  const handleSelectPartyMedia = async (item: MediaSearchItem) => {
    if (!firebaseUser || partyMediaSaving) {
      return;
    }
    setPartyMediaError("");
    setPartyMediaSaving(true);
    try {
      const token = await firebaseUser.getIdToken();
      const saved = await saveMediaFromURL(token, item.link);
      setPartyMediaUrl(saved.imageUrl);
      setPartyMediaModalOpen(false);
      setPartyMediaResults([]);
      setPartyMediaQuery("");
      setPartyMediaType("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to save media";
      setPartyMediaError(message);
    } finally {
      setPartyMediaSaving(false);
    }
  };

  const handleGenerateHTMLDraft = async () => {
    setError("");
    setHomepageSuccess("");

    if (!firebaseUser) {
      return;
    }

    const instructions = homepageDraftPrompt.trim();
    if (!instructions) {
      setError("tell the AI what to write first");
      return;
    }

    setGeneratingHomepageDraft(true);

    try {
      const token = await firebaseUser.getIdToken();
      const draft = await generateHTMLDraft(token, {
        type: "homepage",
        instructions,
        existingHtml: homepageHtml,
        imageUrls: homepageDraftImageUrls,
      });
      setHomepageHtml(draft.html);
      setHomepageSuccess("AI draft added.");
      setHomepageDraftImageUrls([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to generate html draft";
      setError(message);
    } finally {
      setGeneratingHomepageDraft(false);
    }
  };

  const handleAIDraftImageFiles = async (files: FileList | File[]) => {
    if (!firebaseUser) {
      return;
    }

    const imageFiles = Array.from(files).filter((item) => item.type.startsWith("image/"));
    if (imageFiles.length === 0) {
      setError("choose image files to upload");
      return;
    }

    setError("");
    setUploadingAIImages("homepage");
    try {
      const token = await firebaseUser.getIdToken();
      const uploaded = await Promise.all(imageFiles.map((file) => uploadAIImage(token, file)));
      const urls = uploaded.map((item) => item.imageUrl);
      setHomepageDraftImageUrls((current) => [...current, ...urls]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to upload AI helper image";
      setError(message);
    } finally {
      setUploadingAIImages(null);
      setDraggingAIImages(null);
    }
  };

  const handleAIDraftImageDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDraggingAIImages(null);
    void handleAIDraftImageFiles(event.dataTransfer.files);
  };

  const removeAIDraftImage = (imageUrl: string) => {
    setHomepageDraftImageUrls((current) => current.filter((item) => item !== imageUrl));
  };

  const renderAIDraftImageAssist = () => {
    const imageUrls = homepageDraftImageUrls;
    const uploading = uploadingAIImages === "homepage";
    const dragging = draggingAIImages === "homepage";

    return (
      <div
        className={dragging ? "ai-image-dropzone dragging" : "ai-image-dropzone"}
        onDragOver={(event) => {
          event.preventDefault();
          setDraggingAIImages("homepage");
        }}
        onDragLeave={() => setDraggingAIImages(null)}
        onDrop={(event) => handleAIDraftImageDrop(event)}
      >
        <div>
          <p>Drop images here for the AI to use.</p>
          {imageUrls.length > 0 ? (
            <div className="ai-image-preview-grid" aria-label="Uploaded AI helper images">
              {imageUrls.map((imageUrl) => (
                <figure className="ai-image-preview" key={imageUrl}>
                  <img src={imageUrl} alt="Uploaded AI helper" />
                  <button type="button" onClick={() => removeAIDraftImage(imageUrl)} aria-label="Remove AI helper image">
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
          onClick={() => homepageAIFileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? "Uploading..." : "Add image"}
        </button>
        <input
          ref={homepageAIFileInputRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          disabled={uploading}
          onChange={(event) => {
            if (event.target.files) {
              void handleAIDraftImageFiles(event.target.files);
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
    setUploadUserId("");
    setUploadUserIds([]);
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
    setUploadUserId("");
    setUploadUserIds([]);
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

  const handleUploadFileChange = (file: File | null) => {
    setError("");
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("choose an image file");
      return;
    }
    setFile(file);
    setCropBox(null);
  };

  const addUploadUser = (value: string) => {
    setUploadUserId("");
    const userId = Number(value);
    if (!userId || uploadUserIds.includes(userId)) {
      return;
    }
    setUploadUserIds((current) => [...current, userId]);
  };

  const removeUploadUser = (userId: number) => {
    setUploadUserIds((current) => current.filter((id) => id !== userId));
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
              Photos
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
              className={activeTab === "events" ? "main-tab active" : "main-tab"}
              type="button"
              role="tab"
              aria-selected={activeTab === "events"}
              onClick={() => selectHostTab("events")}
            >
              Events
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
                  Add Photo
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
                        aria-label={`Open image uploaded on ${formatImageDate(image.date)}`}
                      >
                        <img src={image.imageUrl} alt={`Uploaded on ${formatImageDate(image.date)}`} />
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
                      <button
                        className="image-tags-button"
                        type="button"
                        aria-label="Edit tagged users"
                        title="Edit tagged users"
                        onClick={() => openImageTagModal(image)}
                      >
                        @
                      </button>
                    </div>
                    <div className="image-grid-meta">
                      <span>{formatImageDate(image.date)}</span>
                      <span>{image.partyId ? partyLabel(parties, image.partyId) : image.homepage ? "Homepage" : "No party"}</span>
                      {taggedUserLabels(users, image.userIds).length > 0 ? <span>Tagged: {taggedUserLabels(users, image.userIds).join(", ")}</span> : null}
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
                    <button className="auth-submit" type="button" onClick={openCreatePartyForm}>
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
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {parties.map((party) => (
                          <tr className="clickable-row" key={party.id} onClick={() => setPreviewParty(party)}>
                            <td>{party.label}</td>
                            <td>{formatDateTime(party.date)}</td>
                            <td className="party-row-actions">
                              <button
                                className="auth-secondary table-action-button"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openEditPartyForm(party);
                                }}
                              >
                                Edit
                              </button>
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
                            <td colSpan={3}>No parties yet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <form className="party-form" onSubmit={handleCreateParty}>
                  <div className="host-panel-header">
                    <button className="auth-secondary back-text-link" type="button" onClick={() => {
                      setPartyView("list");
                      resetPartyForm();
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
                  <label className="auth-field host-message-field">
                    <span>Summary</span>
                    <textarea
                      value={partySummary}
                      onChange={(event) => setPartySummary(event.target.value)}
                      rows={3}
                      placeholder="Short overview shown when the party has no Partiful link"
                    />
                  </label>
                  <label className="auth-field">
                    <span>Partiful URL</span>
                    <input
                      value={partyPartifulUrl}
                      onChange={(event) => setPartyPartifulUrl(event.target.value)}
                      placeholder="https://partiful.com/e/..."
                    />
                  </label>
                  <div className="auth-field party-media-field">
                    <span>Party media</span>
                    {partyMediaUrl ? (
                      <div className="party-media-preview-block">
                        <img src={partyMediaUrl} alt="Selected party media" className="party-media-preview" />
                        <div className="party-media-preview-actions">
                          <button className="auth-secondary" type="button" onClick={openPartyMediaModal}>
                            Change Media
                          </button>
                          <button className="auth-secondary" type="button" onClick={() => setPartyMediaUrl("")}>
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button className="auth-secondary" type="button" onClick={openPartyMediaModal}>
                        Select Image or GIF
                      </button>
                    )}
                  </div>
                  {partySuccess ? <p className="host-success">{partySuccess}</p> : null}

                  {error ? <p className="auth-error">{error}</p> : null}

                  <button className="auth-submit" type="submit" disabled={savingParty}>
                    {savingParty ? "Saving..." : partyView === "edit" ? "Update Party" : "Create Party"}
                  </button>
                </form>
              )}
            </section>
          ) : activeTab === "events" ? (
            <section className="host-panel" role="tabpanel">
              {eventView === "list" ? (
                <>
                  <div className="host-panel-header">
                    <button className="auth-submit" type="button" onClick={openEventModal}>
                      Add New Event
                    </button>
                  </div>

                  {error ? <p className="auth-error">{error}</p> : null}

                  <div className="host-table-wrap">
                    <table className="host-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th>Label</th>
                          <th>Party</th>
                          <th>Start</th>
                          <th>End</th>
                          <th>Summary</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((event) => (
                          <tr className="clickable-row" key={event.id} onClick={() => void openEventSetup(event)}>
                            <td>{eventTypeLabels[event.type]}</td>
                            <td>{event.label}</td>
                            <td>{event.partyId ? partyLabel(parties, event.partyId) : "No party"}</td>
                            <td>{event.startDate ? formatDate(event.startDate) : "Not set"}</td>
                            <td>{event.endDate ? formatDate(event.endDate) : "Not set"}</td>
                            <td>{event.description || "No summary"}</td>
                            <td>
                              <button
                                className="auth-secondary table-action-button"
                                type="button"
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  void handleCompleteEvent(event);
                                }}
                                disabled={Boolean(event.completedAt) || completingEventId === event.id}
                              >
                                {event.completedAt ? "Completed" : completingEventId === event.id ? "Completing..." : "Mark Completed"}
                              </button>
                              <button
                                className="auth-secondary table-action-button"
                                type="button"
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  setDeleteTarget({ type: "event", event });
                                }}
                                disabled={deletingEventId === event.id}
                              >
                                {deletingEventId === event.id ? "Deleting..." : "Delete"}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {events.length === 0 ? (
                          <tr>
                            <td colSpan={7}>No events yet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  {loadingEventDetail ? <p className="loading-text">Loading event...</p> : null}
                </>
              ) : selectedEvent ? (
                <div className="event-setup-panel">
                  <div className="host-panel-header">
                    <div>
                      <h2 className="host-section-title">{selectedEvent.label}</h2>
                      <p className="host-section-copy">{eventTypeLabels[selectedEvent.type]}</p>
                    </div>
                    <div className="host-panel-actions">
                      <button className="auth-secondary" type="button" onClick={() => setQrEvent(selectedEvent)}>
                        Show QR Code
                      </button>
                      <button className="auth-secondary back-text-link" type="button" onClick={() => {
                        setEventView("list");
                        setSelectedEventDetail(null);
                        setEventCategories([]);
                        setError("");
                      }}>
                        Back to Events
                      </button>
                    </div>
                  </div>

                  {error ? <p className="auth-error">{error}</p> : null}

                  {selectedEvent.type === "1" ? (
                    <section className="event-setup-step">
                      <div className="host-panel-header">
                        <div>
                          <h3 className="host-section-title">Bracket Setup</h3>
                          <p className="host-section-copy">
                            {selectedBracket.size} {selectedBracket.mode === "team" ? `${selectedBracket.teamSize}-person team` : "individual"} bracket
                          </p>
                        </div>
                        <div className="host-panel-actions">
                          <button className="auth-secondary" type="button" onClick={randomizeBracketAssignments} disabled={Boolean(selectedEvent.startDate)}>
                            Randomize
                          </button>
                          <button className="auth-secondary" type="button" onClick={() => void saveBracketSetup()} disabled={savingEvent || Boolean(selectedEvent.startDate)}>
                            {savingEvent ? "Saving..." : "Save Setup"}
                          </button>
                          <button className="auth-submit" type="button" onClick={() => void handleStartBracketEvent()} disabled={startingEvent || Boolean(selectedEvent.startDate)}>
                            {selectedEvent.startDate ? "Bracket Started" : startingEvent ? "Starting..." : "Start Event"}
                          </button>
                        </div>
                      </div>
                      {!selectedEvent.startDate ? (
                        <BracketSetupVisual
                          bracket={selectedBracket}
                          assignments={bracketAssignments}
                          teamAssignments={bracketTeamAssignments}
                          users={users}
                          onAssignmentsChange={setBracketAssignments}
                          onTeamAssignmentsChange={setBracketTeamAssignments}
                        />
                      ) : (
                        <BracketRoundsView rounds={selectedEventDetail?.rounds ?? []} />
                      )}
                    </section>
                  ) : selectedEventCategories.length === 0 ? (
                    <section className="event-setup-step">
                      <h3 className="host-section-title">Categories</h3>
                      <button className="auth-submit event-setup-small-button" type="button" onClick={() => setCategoryModalOpen(true)}>
                        Add Category
                      </button>
                      <ul className="event-category-list event-category-bullets">
                        {eventCategories.map((category) => (
                          <li key={`${category.name}-${category.type}`}>
                            <span>{category.name} <small>({category.type})</small></span>
                            <button type="button" onClick={() => setEventCategories((current) => current.filter((item) => item.name !== category.name))} aria-label={`Remove ${category.name}`}>
                              x
                            </button>
                          </li>
                        ))}
                        {eventCategories.length === 0 ? <p className="selected-file">No categories added yet.</p> : null}
                      </ul>
                      <button className="auth-submit event-setup-next-button" type="button" onClick={() => void saveEventCategories()} disabled={savingEvent || eventCategories.length === 0}>
                        {savingEvent ? "Saving..." : "Next"}
                      </button>
                    </section>
                  ) : (
                    <section className="event-setup-step">
                      <div className="host-panel-header">
                        <button className="auth-submit" type="button" onClick={openContestantModal}>
                          Add Contestant
                        </button>
                        <button className="auth-submit" type="button" onClick={() => void handleStartSelectedEvent()} disabled={startingEvent || Boolean(selectedEvent.startDate)}>
                          {selectedEvent.startDate ? "Event Started" : startingEvent ? "Starting..." : "Start Event"}
                        </button>
                      </div>
                      <div className="event-category-list">
                        {selectedEventCategories.map((category) => (
                          <span className="tagged-user-bubble" key={`${category.name}-${category.type}`}>{category.name} ({category.type})</span>
                        ))}
                      </div>
                      <div className="host-table-wrap">
                        <table className="host-table">
                          <thead>
                            <tr>
                              <th>Photo</th>
                              <th>Contestant</th>
                              <th>Costume</th>
                              <th aria-label="Actions" />
                            </tr>
                          </thead>
                          <tbody>
                            {selectedEventDetail?.teams.map((team) => (
                              <tr key={`team-${team.id}`}>
                                <td>{renderContestantImagePreview(selectedEventImages.find((image) => image.teamId === team.id))}</td>
                                <td>{team.userIds.map((userId) => userLabel(users, userId)).join(" + ")}</td>
                                <td>{team.name}</td>
                                <td>
                                  <button className="auth-secondary" type="button" onClick={() => void removeContestant(undefined, team)}>
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {selectedEventContestantUsers
                              .map((eventUser) => (
                                <tr key={`user-${eventUser.userId}`}>
                                  <td>{renderContestantImagePreview(selectedEventImages.find((image) => image.userIds.includes(eventUser.userId)))}</td>
                                  <td>{userLabel(users, eventUser.userId)}</td>
                                  <td>{eventUserCostume(eventUser)}</td>
                                  <td>
                                    <button className="auth-secondary" type="button" onClick={() => void removeContestant(eventUser)}>
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            {selectedEventContestantUsers.length === 0 && selectedEventDetail?.teams.length === 0 ? (
                              <tr>
                                <td colSpan={4}>No contestants yet.</td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                </div>
              ) : null}
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
                {renderAIDraftImageAssist()}
                <button
                  className="auth-secondary"
                  type="button"
                  onClick={() => void handleGenerateHTMLDraft()}
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

        {partyMediaModalOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={closePartyMediaModal}>
            <section
              className="upload-modal gothic-card party-media-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="party-media-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <h2 className="host-section-title" id="party-media-modal-title">Select party media</h2>
                <button className="modal-close" type="button" onClick={closePartyMediaModal} aria-label="Close media picker">
                  x
                </button>
              </div>

              <form className="host-email-form" onSubmit={(event) => void handlePartyMediaSearch(event)}>
                <fieldset className="party-media-type-fieldset">
                  <legend>Media type</legend>
                  <label className="party-media-type-option">
                    <input
                      type="radio"
                      name="party-media-type"
                      value="image"
                      checked={partyMediaType === "image"}
                      onChange={() => {
                        setPartyMediaType("image");
                        setPartyMediaResults([]);
                        setPartyMediaError("");
                      }}
                    />
                    <span>Image</span>
                  </label>
                  <label className="party-media-type-option">
                    <input
                      type="radio"
                      name="party-media-type"
                      value="gif"
                      checked={partyMediaType === "gif"}
                      onChange={() => {
                        setPartyMediaType("gif");
                        setPartyMediaResults([]);
                        setPartyMediaError("");
                      }}
                    />
                    <span>GIF</span>
                  </label>
                </fieldset>

                <label className="auth-field">
                  <span>Search Google</span>
                  <input
                    value={partyMediaQuery}
                    onChange={(event) => setPartyMediaQuery(event.target.value)}
                    placeholder={partyMediaType === "gif" ? "costume party gif" : "neon house party"}
                    disabled={!partyMediaType || partyMediaSearching || partyMediaSaving}
                  />
                </label>

                {partyMediaError ? <p className="auth-error">{partyMediaError}</p> : null}

                <button
                  className="auth-submit"
                  type="submit"
                  disabled={!partyMediaType || partyMediaSearching || partyMediaSaving || !partyMediaQuery.trim()}
                >
                  {partyMediaSearching ? "Searching..." : "Search"}
                </button>
              </form>

              {partyMediaResults.length > 0 ? (
                <div className="party-media-results" aria-label="Search results">
                  {partyMediaResults.map((item) => (
                    <button
                      className="party-media-result"
                      type="button"
                      key={`${item.link}-${item.thumbnail}`}
                      onClick={() => void handleSelectPartyMedia(item)}
                      disabled={partyMediaSaving}
                    >
                      <img src={item.thumbnail || item.link} alt={item.title || "Search result"} />
                      <span>{item.title || "Select"}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {partyMediaSaving ? <p className="dashboard-copy">Saving selected media to storage...</p> : null}
            </section>
          </div>
        ) : null}

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

        {eventModalOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={closeEventModal}>
            <section
              className="upload-modal gothic-card event-create-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="event-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="card-frame" aria-hidden="true">
                <span className="corner corner-tl" />
                <span className="corner corner-tr" />
                <span className="corner corner-bl" />
                <span className="corner corner-br" />
              </div>

              <div className="modal-header">
                <h2 className="host-section-title" id="event-modal-title">Add New Event</h2>
                <button className="modal-close" type="button" onClick={closeEventModal} aria-label="Close event dialog">
                  x
                </button>
              </div>

              <form className="host-email-form" onSubmit={handleCreateEvent}>
                <label className="auth-field">
                  <span>Event type</span>
                  <select
                    value={eventType}
                    onChange={(event) => {
                      setEventType(event.target.value as EventType);
                      setEventStartDate("");
                      setEventEndDate("");
                    }}
                    required
                  >
                    {(Object.keys(eventTypeLabels) as EventType[]).map((type) => (
                      <option key={type} value={type}>
                        {eventTypeLabels[type]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="auth-field">
                  <span>Label</span>
                  <input value={eventLabel} onChange={(event) => setEventLabel(event.target.value)} required />
                </label>

                <label className="auth-field">
                  <span>Party</span>
                  <select value={eventPartyId} onChange={(event) => setEventPartyId(event.target.value)}>
                    <option value="">No party</option>
                    {parties.map((party) => (
                      <option key={party.id} value={party.id}>
                        {party.label}
                      </option>
                    ))}
                  </select>
                </label>

                {eventType === "1" ? (
                  <div className="event-bracket-options">
                    <label className="auth-field">
                      <span>Bracket size</span>
                      <select value={bracketSize} onChange={(event) => setBracketSize(Number(event.target.value))}>
                        {bracketSizes.map((size) => (
                          <option value={size} key={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                    <label className="auth-password-toggle">
                      <input
                        type="checkbox"
                        checked={bracketMode === "team"}
                        onChange={(event) => setBracketMode(event.target.checked ? "team" : "individual")}
                      />
                      <span className="toggle-switch" aria-hidden="true" />
                      <span>Team bracket</span>
                    </label>
                    {bracketMode === "team" ? (
                      <label className="auth-field">
                        <span>People per team</span>
                        <select value={bracketTeamSize} onChange={(event) => setBracketTeamSize(Number(event.target.value))}>
                          {bracketTeamSizes.map((size) => (
                            <option value={size} key={size}>{size}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                ) : null}

                {eventAllowsDates ? (
                  <>
                    {eventStartDate ? (
                      <div className="event-date-field">
                        <ImageDateSelect value={eventStartDate} onChange={setEventStartDate} />
                        <button className="auth-secondary" type="button" onClick={() => setEventStartDate("")}>
                          Remove Start Date
                        </button>
                      </div>
                    ) : (
                      <button className="auth-secondary" type="button" onClick={() => setEventStartDate(toDateInputValue(new Date()))}>
                        Add Start Date
                      </button>
                    )}

                    {eventEndDate ? (
                      <div className="event-date-field">
                        <ImageDateSelect value={eventEndDate} onChange={setEventEndDate} />
                        <button className="auth-secondary" type="button" onClick={() => setEventEndDate("")}>
                          Remove End Date
                        </button>
                      </div>
                    ) : (
                      <button className="auth-secondary" type="button" onClick={() => setEventEndDate(toDateInputValue(new Date()))}>
                        Add End Date
                      </button>
                    )}
                  </>
                ) : null}

                <label className="auth-field host-message-field">
                  <span>Summary</span>
                  <textarea
                    value={eventSummary}
                    onChange={(event) => setEventSummary(event.target.value)}
                    rows={4}
                    placeholder="Short summary for this event"
                  />
                </label>

                {error ? <p className="auth-error">{error}</p> : null}

                <button className="auth-submit" type="submit" disabled={savingEvent}>
                  {savingEvent ? "Saving..." : "Create Event"}
                </button>
              </form>
            </section>
          </div>
        ) : null}

        {categoryModalOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setCategoryModalOpen(false)}>
            <section className="confirmation-modal gothic-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h2 className="host-section-title">Add Category</h2>
                <button className="modal-close" type="button" onClick={() => setCategoryModalOpen(false)} aria-label="Close category modal">
                  x
                </button>
              </div>
              <form className="host-email-form" onSubmit={addCategory}>
                <label className="auth-field">
                  <span>Category</span>
                  <input value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} autoFocus required />
                </label>
                <label className="auth-field">
                  <span>Contestant type</span>
                  <select value={categoryType} onChange={(event) => setCategoryType(event.target.value as EventCategory["type"])}>
                    <option value="individual">Individual</option>
                    <option value="team">Team</option>
                  </select>
                </label>
                <button className="auth-submit" type="submit">Add Category</button>
              </form>
            </section>
          </div>
        ) : null}

        {contestantModalOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setContestantModalOpen(false)}>
            <section className="upload-modal gothic-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h2 className="host-section-title">Add Contestant</h2>
                <button className="modal-close" type="button" onClick={() => setContestantModalOpen(false)} aria-label="Close contestant modal">
                  x
                </button>
              </div>
              <form className="host-email-form" onSubmit={submitContestant}>
                <label className="auth-password-toggle">
                  <input
                    type="checkbox"
                    checked={contestantCouple}
                    onChange={(event) => {
                      setContestantCouple(event.target.checked);
                      setContestantUserId("");
                      setContestantUserIds([]);
                      setContestantPhotos({});
                      setCouplePhoto(null);
                    }}
                  />
                  <span className="toggle-switch" aria-hidden="true" />
                  <span>Couple costume</span>
                </label>

                <label className="auth-field">
                  <span>{contestantCouple ? "Tagged users" : "User"}</span>
                  <select value={contestantUserId} onChange={(event) => addContestantUser(event.target.value)}>
                    <option value="">Select a user</option>
                    {users
                      .filter((user) => !contestantUserIds.includes(user.id))
                      .map((user) => (
                        <option value={user.id} key={user.id}>
                          {userDisplayName(user)}
                        </option>
                      ))}
                  </select>
                </label>

                {contestantUserIds.length > 0 ? (
                  <div className="tagged-user-bubbles">
                    {contestantUserIds.map((userId) => (
                      <span className="tagged-user-bubble" key={userId}>
                        {userLabel(users, userId)}
                        <button type="button" onClick={() => removeContestantUser(userId)} aria-label={`Remove ${userLabel(users, userId)}`}>
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                <label className="auth-field">
                  <span>{contestantCouple ? "Couple Costume" : "Costume Name"}</span>
                  <input value={contestantName} onChange={(event) => setContestantName(event.target.value)} required />
                </label>

                <div className="contestant-photo-actions">
                  {!contestantCouple ? contestantUserIds.map((userId) => (
                    <div className="contestant-photo-row" key={userId}>
                      <span>{userLabel(users, userId)}</span>
                      <button className="auth-secondary contestant-add-photo-button" type="button" onClick={() => openContestantPhotoModal(userId)}>
                        Add Photo
                      </button>
                      {contestantPhotos[userId] ? (
                        <div className="contestant-photo-preview">
                          <img src={contestantPhotos[userId].imageUrl} alt={`${userLabel(users, userId)} contestant preview`} />
                        </div>
                      ) : null}
                    </div>
                  )) : null}
                  {contestantCouple ? (
                    <div className="contestant-photo-row">
                      <span>Team</span>
                      <button className="auth-secondary contestant-add-photo-button" type="button" onClick={() => openContestantPhotoModal("couple")}>
                        Add Team Photo
                      </button>
                      {couplePhoto ? (
                        <div className="contestant-photo-preview">
                          <img src={couplePhoto.imageUrl} alt="Team contestant preview" />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {error ? <p className="auth-error">{error}</p> : null}
                <button className="auth-submit" type="submit" disabled={savingContestant}>
                  {savingContestant ? "Saving..." : "Save Contestant"}
                </button>
              </form>
            </section>
          </div>
        ) : null}

        {contestantPhotoModalOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={closeContestantPhotoModal}>
            <section className="upload-modal gothic-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h2 className="host-section-title">Add Photo</h2>
                <button className="modal-close" type="button" onClick={closeContestantPhotoModal} aria-label="Close contestant photo modal">
                  x
                </button>
              </div>
              <form className="host-email-form" onSubmit={submitContestantPhoto}>
                {!contestantPhotoFile ? (
                  <div
                    className={draggingContestantPhoto ? "drop-zone dragging" : "drop-zone"}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDraggingContestantPhoto(true);
                    }}
                    onDragLeave={() => setDraggingContestantPhoto(false)}
                    onDrop={handleContestantPhotoDrop}
                  >
                    <p>Drop an image here or choose one from your device.</p>
                    <button className="auth-submit" type="button" onClick={() => contestantPhotoInputRef.current?.click()}>
                      Choose Image
                    </button>
                    <input
                      ref={contestantPhotoInputRef}
                      className="visually-hidden"
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      disabled={uploadingContestantPhoto}
                      onChange={(event) => {
                        handleContestantPhotoFile(event.target.files?.[0] ?? null);
                        event.target.value = "";
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <p className="selected-file">Drag the square to choose the saved crop.</p>
                    <div className="crop-stage" ref={contestantCropStageRef}>
                      <img src={contestantPhotoPreviewUrl} alt="Contestant upload crop preview" onLoad={resetContestantPhotoCropBox} />
                      {contestantPhotoCropBox ? (
                        <div
                          className="crop-box"
                          style={{
                            width: contestantPhotoCropBox.size,
                            height: contestantPhotoCropBox.size,
                            transform: `translate(${contestantPhotoCropBox.x}px, ${contestantPhotoCropBox.y}px)`,
                          }}
                          onPointerDown={handleContestantPhotoCropPointerDown}
                          onPointerMove={handleContestantPhotoCropPointerMove}
                          onPointerUp={handleContestantPhotoCropPointerUp}
                          onPointerCancel={handleContestantPhotoCropPointerUp}
                        />
                      ) : null}
                      {uploadingContestantPhoto ? (
                        <div className="upload-loading" aria-label="Uploading contestant photo">
                          <span className="confirmation-spinner" />
                        </div>
                      ) : null}
                    </div>
                    <button
                      className="auth-secondary"
                      type="button"
                      onClick={() => {
                        setContestantPhotoFile(null);
                        setContestantPhotoCropBox(null);
                      }}
                      disabled={uploadingContestantPhoto}
                    >
                      Choose Different Image
                    </button>
                  </>
                )}
                {error ? <p className="auth-error">{error}</p> : null}
                <button className="auth-submit" type="submit" disabled={uploadingContestantPhoto || !contestantPhotoFile || !contestantPhotoCropBox}>
                  {uploadingContestantPhoto ? "Uploading..." : "Upload Photo"}
                </button>
              </form>
            </section>
          </div>
        ) : null}

        {uploadModalOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={closeUploadModal}>
            <section className="upload-modal gothic-card" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h2 className="host-section-title">Add a Photo!</h2>
                <button className="modal-close" type="button" onClick={closeUploadModal} aria-label="Close upload modal">
                  x
                </button>
              </div>

              <form className="host-email-form" onSubmit={handleUpload}>
                <label className="auth-field">
                  <span>Party</span>
                  <select value={partyId} onChange={(event) => setPartyId(event.target.value)}>
                    <option value="">Select a party</option>
                    {parties.map((party) => (
                      <option key={party.id} value={party.id}>
                        {party.label}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedUploadParty ? (
                  <p className="selected-file">Using party date: {formatDate(selectedUploadParty.date)}</p>
                ) : (
                  <ImageDateSelect value={date} onChange={setDate} />
                )}

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
                    <p>Drop an image here or choose one from your device.</p>
                    <button
                      className="auth-submit"
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={submitting}
                    >
                      Choose Image
                    </button>
                  </div>
                ) : (
                  <div className="upload-preview">
                    <img src={filePreviewUrl} alt="Selected upload preview" />
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  className="visually-hidden"
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  disabled={submitting}
                  onChange={(event) => {
                    handleUploadFileChange(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
                {file ? (
                  <button className="auth-submit" type="button" onClick={() => fileInputRef.current?.click()} disabled={submitting}>
                    Choose Different Image
                  </button>
                ) : null}

                <label className="auth-password-toggle">
                  <input
                    type="checkbox"
                    checked={homepage}
                    onChange={(event) => setHomepage(event.target.checked)}
                  />
                  <span className="toggle-switch" aria-hidden="true" />
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

                <label className="auth-field">
                  <span>Tag users</span>
                  <select value={uploadUserId} onChange={(event) => addUploadUser(event.target.value)}>
                    <option value="">Select a user</option>
                    {users
                      .filter((user) => !uploadUserIds.includes(user.id))
                      .map((user) => (
                        <option value={user.id} key={user.id}>
                          {userDisplayName(user)}
                        </option>
                      ))}
                  </select>
                </label>
                {taggedUploadUsers.length > 0 ? (
                  <div className="tagged-user-bubbles" aria-label="Tagged users">
                    {taggedUploadUsers.map((user) => (
                      <span className="tagged-user-bubble" key={user.id}>
                        {userDisplayName(user)}
                        <button type="button" onClick={() => removeUploadUser(user.id)} aria-label={`Remove ${userDisplayName(user)}`}>
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}

                {error ? <p className="auth-error">{error}</p> : null}

                <button className="auth-submit" type="submit" disabled={submitting || !file}>
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
              aria-label={`Image uploaded on ${formatImageDate(previewImage.date)}`}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <img src={previewImage.imageUrl} alt={`Uploaded on ${formatImageDate(previewImage.date)}`} />
              <figcaption>
                <span>{formatImageDate(previewImage.date)}</span>
                <span>{previewImage.partyId ? partyLabel(parties, previewImage.partyId) : previewImage.homepage ? "Homepage" : "No party"}</span>
                {taggedUserLabels(users, previewImage.userIds).map((label) => (
                  <span key={label}>{label}</span>
                ))}
                {previewImage.notes ? <span>{previewImage.notes}</span> : null}
              </figcaption>
            </figure>
          </div>
        ) : null}
        {tagEditImage ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={closeImageTagModal}>
            <section
              className="upload-modal gothic-card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="image-tags-modal-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="card-frame" aria-hidden="true">
                <span className="corner corner-tl" />
                <span className="corner corner-tr" />
                <span className="corner corner-bl" />
                <span className="corner corner-br" />
              </div>
              <div className="modal-header">
                <h2 className="host-section-title" id="image-tags-modal-title">Tagged Users</h2>
                <button className="modal-close" type="button" onClick={closeImageTagModal} aria-label="Close tagged users dialog">
                  x
                </button>
              </div>
              <div className="host-email-form">
                <label className="auth-field">
                  <span>Add user</span>
                  <select value={tagEditUserId} onChange={(event) => addImageTagUser(event.target.value)}>
                    <option value="">Select a user</option>
                    {users
                      .filter((user) => !tagEditUserIds.includes(user.id))
                      .map((user) => (
                        <option value={user.id} key={user.id}>
                          {userDisplayName(user)}
                        </option>
                      ))}
                  </select>
                </label>
                {tagEditUserIds.length > 0 ? (
                  <div className="tagged-user-bubbles" aria-label="Tagged users">
                    {tagEditUserIds.map((userId) => (
                      <span className="tagged-user-bubble" key={userId}>
                        {userLabel(users, userId)}
                        <button type="button" onClick={() => removeImageTagUser(userId)} aria-label={`Remove ${userLabel(users, userId)}`}>
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="selected-file">No tagged users yet.</p>
                )}
                {error ? <p className="auth-error">{error}</p> : null}
                <button className="auth-submit" type="button" onClick={() => void saveImageTags()} disabled={updatingImageTags}>
                  {updatingImageTags ? "Saving..." : "Save Tags"}
                </button>
              </div>
            </section>
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

              <button className="modal-close party-preview-close" type="button" onClick={() => setPreviewParty(null)} aria-label="Close party preview">
                x
              </button>
              <article className="party-accordion-row expanded" aria-labelledby="party-preview-title">
                <div className="party-accordion-summary party-preview-summary">
                  <span id="party-preview-title">{previewParty.label}</span>
                  <span>{formatDateTime(previewParty.date)}</span>
                </div>
                <div className="party-accordion-details">
                  {previewParty.partifulUrl ? (
                    <p className="party-overview-copy">
                      <a href={previewParty.partifulUrl} target="_blank" rel="noreferrer">
                        {previewParty.partifulUrl}
                      </a>
                    </p>
                  ) : (
                    <p className="party-overview-copy">{previewParty.summary || "No summary yet."}</p>
                  )}
                </div>
              </article>
            </section>
          </div>
        ) : null}
        {qrEvent ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setQrEvent(null)}>
            <section className="upload-modal gothic-card qr-code-modal" role="dialog" aria-modal="true" aria-label={`${qrEvent.label} QR code`} onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <button className="modal-close" type="button" onClick={() => setQrEvent(null)} aria-label="Close QR code modal">
                  x
                </button>
              </div>
              <div className="qr-code-content">
                <p className="host-section-copy">{qrEvent.label}</p>
                {qrError ? <p className="auth-error">{qrError}</p> : null}
                {qrCodeUrl ? (
                  <img className="qr-code-image" src={qrCodeUrl} alt={`QR code for ${qrEvent.label}`} />
                ) : qrError ? null : (
                  <p className="loading-text">Generating QR code...</p>
                )}
                <a className="qr-code-url" href={qrEventUrl} target="_blank" rel="noreferrer">
                  {qrEventUrl}
                </a>
              </div>
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
                  : deleteTarget.type === "event"
                    ? `Delete ${deleteTarget.event.label}? This will remove the event setup, contestants, teams, and votes.`
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

function formatImageDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function sortPartiesByDate(parties: PartyRecord[]) {
  return [...parties].sort((first, second) => new Date(second.date).getTime() - new Date(first.date).getTime());
}

function partyLabel(parties: PartyRecord[], partyId: number) {
  return parties.find((party) => party.id === partyId)?.label ?? `Party #${partyId}`;
}

function userDisplayName(user: AppUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

function userLabel(users: AppUser[], userId: number) {
  const user = users.find((item) => item.id === userId);
  return user ? userDisplayName(user) : `User #${userId}`;
}

function taggedUserLabels(users: AppUser[], userIds: number[]) {
  return userIds.map((userId) => userLabel(users, userId));
}

function renderContestantImagePreview(image?: ImageRecord) {
  if (!image) {
    return <span className="selected-file">No photo</span>;
  }
  return (
    <span className="contestant-table-preview">
      <img src={image.imageUrl} alt={image.notes || "Contestant preview"} />
    </span>
  );
}

function eventMetadataCategories(metadata: Record<string, unknown>): EventCategory[] {
  const value = metadata.categories;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): EventCategory[] => {
    if (typeof item === "string" && item.trim().length > 0) {
      return [{ name: item, type: "individual" }];
    }
    if (item && typeof item === "object") {
      const category = item as { name?: unknown; type?: unknown };
      if (typeof category.name === "string" && category.name.trim().length > 0) {
        return [{
          name: category.name,
          type: category.type === "team" ? "team" : "individual",
        }];
      }
    }
    return [];
  });
}

function eventUserCostume(eventUser: EventUserRecord) {
  const costume = eventUser.metadata.costume;
  return typeof costume === "string" && costume.trim() ? costume : "No costume name";
}

function eventUserHasCostume(eventUser: EventUserRecord) {
  const costume = eventUser.metadata.costume;
  return typeof costume === "string" && costume.trim().length > 0;
}

function eventMetadataBracket(metadata: Record<string, unknown>): BracketMetadata {
  const bracket = metadata.bracket;
  if (!bracket || typeof bracket !== "object") {
    return { size: 4, mode: "individual", teamSize: 1 };
  }
  const value = bracket as { size?: unknown; mode?: unknown; teamSize?: unknown };
  const size = typeof value.size === "number" && bracketSizes.includes(value.size) ? value.size : 4;
  const mode = value.mode === "team" ? "team" : "individual";
  const teamSize = mode === "team" && typeof value.teamSize === "number" && bracketTeamSizes.includes(value.teamSize) ? value.teamSize : 1;
  return { size, mode, teamSize };
}

function bracketSlots(size: number) {
  return Array.from({ length: size }, (_, index) => index + 1);
}

function bracketSeedPairs(size: number) {
  const slots = bracketSlots(size);
  const pairs: Array<[number, number]> = [];
  for (let index = 0; index < slots.length; index += 2) {
    pairs.push([slots[index], slots[index + 1]]);
  }
  return pairs;
}

function splitBracketItems<T>(items: T[]) {
  const midpoint = Math.ceil(items.length / 2);
  return {
    left: items.slice(0, midpoint),
    right: items.slice(midpoint),
  };
}

function bracketAssignmentsFromMetadata(metadata: Record<string, unknown>, size: number) {
  const participants = bracketParticipantsFromMetadata(metadata);
  const assignments: Record<number, string> = {};
  for (const [index, participant] of participants.entries()) {
    if (index < size && participant.type === "individual") {
      assignments[index + 1] = String(participant.userIds[0] ?? "");
    }
  }
  return assignments;
}

function bracketTeamAssignmentsFromMetadata(metadata: Record<string, unknown>, size: number) {
  const participants = bracketParticipantsFromMetadata(metadata);
  const assignments: Record<number, string[]> = {};
  for (const [index, participant] of participants.entries()) {
    if (index < size && participant.type === "team") {
      assignments[index + 1] = participant.userIds.map(String);
    }
  }
  return assignments;
}

function bracketParticipantsFromMetadata(metadata: Record<string, unknown>): BracketParticipant[] {
  const bracket = metadata.bracket;
  if (!bracket || typeof bracket !== "object") {
    return [];
  }
  const participants = (bracket as { participants?: unknown }).participants;
  if (!Array.isArray(participants)) {
    return [];
  }
  return participants.flatMap((item): BracketParticipant[] => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const participant = item as BracketParticipant;
    return typeof participant.key === "string" && Array.isArray(participant.userIds) ? [participant] : [];
  });
}

function bracketParticipantsFromSetup(
  bracket: BracketMetadata,
  assignments: Record<number, string>,
  teamAssignments: Record<number, string[]>,
  users: AppUser[],
) {
  return bracketSlots(bracket.size).flatMap((slot): BracketParticipant[] => {
    if (bracket.mode === "team") {
      const userIds = (teamAssignments[slot] ?? []).map(Number).filter(Boolean);
      if (userIds.length !== bracket.teamSize) {
        return [];
      }
      return [{
        key: `team-${slot}`,
        type: "team",
        userIds,
        label: userIds.map((userId) => userLabel(users, userId)).join(" + "),
      }];
    }
    const userId = Number(assignments[slot]);
    if (!userId) {
      return [];
    }
    return [{
      key: `user-${userId}`,
      type: "individual",
      userIds: [userId],
      label: userLabel(users, userId),
    }];
  });
}

function shuffleItems<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function BracketSetupVisual({
  bracket,
  assignments,
  teamAssignments,
  users,
  onAssignmentsChange,
  onTeamAssignmentsChange,
}: {
  bracket: BracketMetadata;
  assignments: Record<number, string>;
  teamAssignments: Record<number, string[]>;
  users: AppUser[];
  onAssignmentsChange: Dispatch<SetStateAction<Record<number, string>>>;
  onTeamAssignmentsChange: Dispatch<SetStateAction<Record<number, string[]>>>;
}) {
  const pairs = bracketSeedPairs(bracket.size);
  const slots = Array.from({ length: bracket.size }, (_, index) => index + 1);
  const { left: leftSlots, right: rightSlots } = splitBracketItems(slots);
  const { left, right } = splitBracketItems(pairs);
  const totalRounds = Math.ceil(Math.log2(bracket.size));
  const innerRoundNumbers = Array.from({ length: Math.max(totalRounds - 2, 0) }, (_, index) => index + 2);
  const sideRoundCounts = bracketSideRoundCounts(pairs.length, totalRounds);
  return (
    <div className="bracket-visual-scroll">
      <div className="tournament-bracket tournament-bracket-setup">
        <div className="bracket-side bracket-side-left">
          <section className="bracket-round-column">
            <h3>Round 1</h3>
            {left.map((pair, index) => (
              <BracketSetupMatch
                bracket={bracket}
                pair={pair}
                matchNumber={index + 1}
                assignments={assignments}
                teamAssignments={teamAssignments}
                users={users}
                onAssignmentsChange={onAssignmentsChange}
                onTeamAssignmentsChange={onTeamAssignmentsChange}
                key={pair.join("-")}
              />
            ))}
          </section>
          {innerRoundNumbers.map((roundNumber) => (
            <BracketPlaceholderColumn
              count={bracketSetupPlaceholderCount(leftSlots.length, roundNumber)}
              title={bracketRoundTitle(roundNumber, totalRounds)}
              key={`left-placeholder-${roundNumber}`}
            />
          ))}
          <BracketConnectorOverlay roundCounts={sideRoundCounts} />
        </div>
        <section className="bracket-final-column">
          <h3>Final</h3>
          <BracketFinalPlaceholder />
        </section>
        <div className="bracket-side bracket-side-right">
          {[...innerRoundNumbers].reverse().map((roundNumber) => (
            <BracketPlaceholderColumn
              count={bracketSetupPlaceholderCount(rightSlots.length, roundNumber)}
              title={bracketRoundTitle(roundNumber, totalRounds)}
              key={`right-placeholder-${roundNumber}`}
            />
          ))}
          <section className="bracket-round-column">
            <h3>Round 1</h3>
            {right.map((pair, index) => (
              <BracketSetupMatch
                bracket={bracket}
                pair={pair}
                matchNumber={left.length + index + 1}
                assignments={assignments}
                teamAssignments={teamAssignments}
                users={users}
                onAssignmentsChange={onAssignmentsChange}
                onTeamAssignmentsChange={onTeamAssignmentsChange}
                key={pair.join("-")}
              />
            ))}
          </section>
          <BracketConnectorOverlay roundCounts={sideRoundCounts} flipped />
        </div>
      </div>
    </div>
  );
}

function BracketSetupMatch({
  bracket,
  pair,
  matchNumber,
  assignments,
  teamAssignments,
  users,
  onAssignmentsChange,
  onTeamAssignmentsChange,
}: {
  bracket: BracketMetadata;
  pair: [number, number];
  matchNumber: number;
  assignments: Record<number, string>;
  teamAssignments: Record<number, string[]>;
  users: AppUser[];
  onAssignmentsChange: Dispatch<SetStateAction<Record<number, string>>>;
  onTeamAssignmentsChange: Dispatch<SetStateAction<Record<number, string[]>>>;
}) {
  return (
    <article className="bracket-match-card bracket-setup-match">
      {pair.map((slot) => (
        <div className="bracket-seed-card" key={slot}>
          <span>Seed {slot}</span>
          {bracket.mode === "team" ? (
            Array.from({ length: bracket.teamSize }, (_, index) => (
              <select
                key={`${slot}-${index}`}
                value={teamAssignments[slot]?.[index] ?? ""}
                onChange={(changeEvent) => onTeamAssignmentsChange((current) => {
                  const team = [...(current[slot] ?? [])];
                  team[index] = changeEvent.target.value;
                  return { ...current, [slot]: team };
                })}
              >
                <option value="">Select teammate</option>
                {users.map((user) => (
                  <option value={user.id} key={user.id}>
                    {userDisplayName(user)}
                  </option>
                ))}
              </select>
            ))
          ) : (
            <select
              value={assignments[slot] ?? ""}
              onChange={(changeEvent) => onAssignmentsChange((current) => ({ ...current, [slot]: changeEvent.target.value }))}
            >
              <option value="">Select user</option>
              {users.map((user) => (
                <option value={user.id} key={user.id}>
                  {userDisplayName(user)}
                </option>
              ))}
            </select>
          )}
        </div>
      ))}
      <span className="bracket-match-label">Match {matchNumber}</span>
    </article>
  );
}

function BracketRoundsView({ rounds }: { rounds: EventDetail["rounds"] }) {
  if (rounds.length === 0) {
    return <p className="selected-file">No bracket rounds yet.</p>;
  }
  const totalRounds = bracketTotalRounds(rounds);
  const sideRoundNumbers = Array.from({ length: Math.max(totalRounds - 1, 0) }, (_, index) => index + 1);
  const finalRoundNumber = totalRounds;
  const finalRounds = rounds.filter((round) => round.roundNumber === finalRoundNumber);
  const champion = finalRounds.find((round) => round.winner && round.completedAt)?.winner ?? null;
  const firstRoundMatchCount = rounds.filter((round) => round.roundNumber === 1).length;
  const sideRoundCounts = bracketSideRoundCounts(firstRoundMatchCount, totalRounds);
  return (
    <div className="bracket-visual-stack">
      {champion ? (
        <section className="bracket-winner-banner bracket-winner-banner-compact">
          <p className="eyebrow">Winner</p>
          <h2>{champion.label}</h2>
        </section>
      ) : null}
      <div className="bracket-visual-scroll">
        <div className="tournament-bracket" style={{ gridTemplateColumns: `${sideRoundNumbers.map(() => "minmax(9.5rem, 1fr)").join(" ")} minmax(8.5rem, 0.8fr) ${sideRoundNumbers.map(() => "minmax(9.5rem, 1fr)").join(" ")}` }}>
          <div className="bracket-side bracket-side-left">
            {sideRoundNumbers.map((roundNumber) => {
              const { left } = splitBracketItems(rounds.filter((round) => round.roundNumber === roundNumber));
              return left.length > 0
                ? <BracketRoundColumn rounds={left} title={bracketRoundTitle(roundNumber, totalRounds)} key={`left-${roundNumber}`} />
                : <BracketPlaceholderColumn count={bracketSidePlaceholderCount(firstRoundMatchCount, roundNumber)} title={bracketRoundTitle(roundNumber, totalRounds)} key={`left-${roundNumber}`} />;
            })}
            <BracketConnectorOverlay roundCounts={sideRoundCounts} />
          </div>
          <section className="bracket-final-column">
            <h4>Final</h4>
            {finalRounds.length > 0 ? finalRounds.map((round) => <BracketRoundMatch round={round} key={round.id} />) : <BracketFinalPlaceholder />}
          </section>
          <div className="bracket-side bracket-side-right">
            {[...sideRoundNumbers].reverse().map((roundNumber) => {
              const { right } = splitBracketItems(rounds.filter((round) => round.roundNumber === roundNumber));
              return right.length > 0
                ? <BracketRoundColumn rounds={right} title={bracketRoundTitle(roundNumber, totalRounds)} key={`right-${roundNumber}`} />
                : <BracketPlaceholderColumn count={bracketSidePlaceholderCount(firstRoundMatchCount, roundNumber)} title={bracketRoundTitle(roundNumber, totalRounds)} key={`right-${roundNumber}`} />;
            })}
            <BracketConnectorOverlay roundCounts={sideRoundCounts} flipped />
          </div>
        </div>
      </div>
    </div>
  );
}

function BracketRoundColumn({ rounds, title }: { rounds: EventDetail["rounds"]; title: string }) {
  return (
    <section className="bracket-round-column">
      <h4>{title}</h4>
      {rounds.map((round) => <BracketRoundMatch round={round} key={round.id} />)}
    </section>
  );
}

function BracketPlaceholderColumn({ count, title }: { count: number; title: string }) {
  return (
    <section className="bracket-round-column">
      <h4>{title}</h4>
      {Array.from({ length: count }, (_, index) => (
        <article className="bracket-match-card" key={`placeholder-${index}`}>
          <span className="bracket-participant-node bracket-placeholder-node" aria-hidden="true">&nbsp;</span>
        </article>
      ))}
    </section>
  );
}

function BracketRoundMatch({ round }: { round: EventDetail["rounds"][number] }) {
  return (
    <article className="bracket-match-card">
      <span className={round.winner?.key === round.participantOne?.key ? "bracket-participant-node bracket-winner" : "bracket-participant-node"}>
        {round.participantOne?.label ?? "TBD"}
      </span>
      <span className={round.winner?.key === round.participantTwo?.key ? "bracket-participant-node bracket-winner" : "bracket-participant-node"}>
        {round.participantTwo?.label ?? "TBD"}
      </span>
      <small>{round.completedAt ? "Complete" : "Awaiting results"}</small>
    </article>
  );
}

function bracketTotalRounds(rounds: EventDetail["rounds"]) {
  const firstRoundMatchCount = rounds.filter((round) => round.roundNumber === 1).length;
  return Math.max(1, Math.ceil(Math.log2(Math.max(firstRoundMatchCount * 2, 2))));
}

function bracketSidePlaceholderCount(firstRoundMatchCount: number, roundNumber: number) {
  if (roundNumber <= 1) {
    return 0;
  }
  return Math.max(1, Math.floor(firstRoundMatchCount / 2 ** roundNumber));
}

function bracketSetupPlaceholderCount(sideSlotCount: number, roundNumber: number) {
  return Math.max(1, Math.floor(sideSlotCount / 2 ** roundNumber));
}

function bracketSideRoundCounts(firstRoundMatchCount: number, totalRounds: number) {
  const firstSideRoundCount = Math.max(1, Math.ceil(firstRoundMatchCount / 2));
  return Array.from({ length: Math.max(totalRounds - 1, 0) }, (_, index) => Math.max(1, Math.floor(firstSideRoundCount / 2 ** index)));
}

function BracketFinalPlaceholder() {
  return (
    <article className="bracket-match-card bracket-final-placeholder">
      <span className="bracket-participant-node bracket-placeholder-node" aria-hidden="true">&nbsp;</span>
      <small>vs</small>
      <span className="bracket-participant-node bracket-placeholder-node" aria-hidden="true">&nbsp;</span>
    </article>
  );
}

function bracketRoundTitle(roundNumber: number, totalRounds: number) {
  if (roundNumber === totalRounds) {
    return "Final";
  }
  if (roundNumber === totalRounds - 1) {
    return "Semifinal";
  }
  return `Round ${roundNumber}`;
}

function BracketConnectorOverlay({ roundCounts, flipped = false }: { roundCounts: number[]; flipped?: boolean }) {
  return (
    <svg className={flipped ? "bracket-connector-overlay bracket-connector-overlay-flipped" : "bracket-connector-overlay"} aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
      {bracketConnectorPaths(roundCounts).map((path, index) => (
        <path d={path} key={`${path}-${index}`} />
      ))}
    </svg>
  );
}

function bracketConnectorPaths(roundCounts: number[]) {
  const columnCount = roundCounts.length;
  if (columnCount < 2) {
    return [];
  }
  const columnWidth = 100 / columnCount;
  const paths: string[] = [];
  for (let roundIndex = 0; roundIndex < columnCount - 1; roundIndex += 1) {
    const currentCount = roundCounts[roundIndex];
    const nextCount = roundCounts[roundIndex + 1];
    const xStart = (roundIndex + 1) * columnWidth - columnWidth * 0.12;
    const xEnd = (roundIndex + 1) * columnWidth + columnWidth * 0.12;
    for (let matchIndex = 0; matchIndex < currentCount; matchIndex += 2) {
      const topY = ((matchIndex + 0.5) / currentCount) * 100;
      const bottomY = ((matchIndex + 1.5) / currentCount) * 100;
      const nextY = (((matchIndex / 2) + 0.5) / Math.max(nextCount, 1)) * 100;
      paths.push(`M ${xStart} ${topY} H ${(xStart + xEnd) / 2} V ${bottomY} H ${xStart}`);
      paths.push(`M ${(xStart + xEnd) / 2} ${nextY} H ${xEnd}`);
    }
  }
  return paths;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("failed to load image"));
    image.src = src;
  });
}
