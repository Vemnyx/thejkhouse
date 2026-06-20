import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BirthdaySelect, { ImageDateSelect } from "../components/BirthdaySelect";
import BouncingImages from "../components/BouncingImages";
import { useAuth } from "../context/AuthContext";
import { AppUser, EventRecord, HomepageContent, ImageRecord, PartyRecord, eventRouteIdentifier, eventTypeLabels, getHomepage, listEvents, listImages, listParties, listUsers, uploadImage } from "../lib/api";

type MainTab = "home" | "parties" | "photos" | "events";
type MainView = MainTab | "settings";
type EventDashboardTab = "active" | "upcoming" | "past";

const tabs: Array<{ id: MainTab; label: string }> = [
  { id: "home", label: "Home" },
  { id: "parties", label: "Parties" },
  { id: "photos", label: "Photos" },
  { id: "events", label: "Events" },
];

const tabPaths: Record<MainTab, string> = {
  home: "/",
  parties: "/parties",
  photos: "/photos",
  events: "/events",
};

const eventDashboardTabs: Array<{ id: EventDashboardTab; label: string }> = [
  { id: "active", label: "active" },
  { id: "upcoming", label: "upcoming" },
  { id: "past", label: "past" },
];

function tabFromPath(pathname: string): MainTab {
  switch (pathname) {
    case "/parties":
      return "parties";
    case "/photos":
      return "photos";
    case "/events":
      return "events";
    case "/":
    case "/home":
    default:
      return "home";
  }
}

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { appUser, firebaseUser, logout, updateProfile } = useAuth();
  const photoFileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeView, setActiveView] = useState<MainView>(() => tabFromPath(location.pathname));
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [firstName, setFirstName] = useState(appUser?.firstName ?? "");
  const [lastName, setLastName] = useState(appUser?.lastName ?? "");
  const [birthday, setBirthday] = useState(appUser?.birthday?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [homepage, setHomepage] = useState<HomepageContent>({ html: "", images: [] });
  const [homepageLoading, setHomepageLoading] = useState(true);
  const [parties, setParties] = useState<PartyRecord[]>([]);
  const [partiesLoading, setPartiesLoading] = useState(true);
  const [expandedPartyId, setExpandedPartyId] = useState<number | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [photos, setPhotos] = useState<ImageRecord[]>([]);
  const [photosLoading, setPhotosLoading] = useState(true);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [activeEventTab, setActiveEventTab] = useState<EventDashboardTab>("active");
  const [photoPartyFilter, setPhotoPartyFilter] = useState("all");
  const [photoUserFilter, setPhotoUserFilter] = useState("all");
  const [selectedPhotoId, setSelectedPhotoId] = useState<number | null>(null);
  const [photoUploadOpen, setPhotoUploadOpen] = useState(false);
  const [photoUploadPartyId, setPhotoUploadPartyId] = useState("");
  const [photoUploadDate, setPhotoUploadDate] = useState(() => toDateInputValue(new Date()));
  const [photoUploadFile, setPhotoUploadFile] = useState<File | null>(null);
  const [photoUploadNotes, setPhotoUploadNotes] = useState("");
  const [photoUploadUserId, setPhotoUploadUserId] = useState("");
  const [photoUploadUserIds, setPhotoUploadUserIds] = useState<number[]>([]);
  const [photoUploadDragging, setPhotoUploadDragging] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadPreviewURL, setPhotoUploadPreviewURL] = useState("");

  const fullName = [appUser?.firstName, appUser?.lastName].filter(Boolean).join(" ") || appUser?.email || "Account";
  const partyOptions = useMemo(() => parties.map((party) => ({
    ...party,
    value: String(party.id),
  })), [parties]);
  const userOptions = useMemo(() => users.map((user) => ({
    ...user,
    label: userDisplayName(user),
    value: String(user.id),
  })), [users]);
  const filteredPhotos = useMemo(() => {
    const sortedPhotos = [...photos].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return sortedPhotos.filter((photo) => {
      const matchesParty = photoPartyFilter === "all" || String(photo.partyId) === photoPartyFilter;
      const matchesUser = photoUserFilter === "all" || photo.userIds.includes(Number(photoUserFilter));
      return matchesParty && matchesUser;
    });
  }, [photoPartyFilter, photoUserFilter, photos]);
  const selectedPhoto = selectedPhotoId ? photos.find((photo) => photo.id === selectedPhotoId) ?? null : null;
  const selectedUploadParty = photoUploadPartyId
    ? parties.find((party) => party.id === Number(photoUploadPartyId)) ?? null
    : null;
  const taggedUploadUsers = photoUploadUserIds
    .map((userId) => users.find((user) => user.id === userId))
    .filter((user): user is AppUser => Boolean(user));
  const eventGroups = useMemo(() => {
    const nowDate = new Date();
    const now = nowDate.getTime();
    const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
    const groups: Record<EventDashboardTab, EventRecord[]> = {
      active: [],
      upcoming: [],
      past: [],
    };

    for (const event of events) {
      if (event.completedAt) {
        const completedTime = new Date(event.completedAt).getTime();
        if (completedTime >= todayStart) {
          groups.active.push(event);
        } else {
          groups.past.push(event);
        }
        continue;
      }

      const startTime = event.startDate ? new Date(event.startDate).getTime() : null;
      const endTime = event.endDate ? new Date(event.endDate).getTime() : null;
      if (startTime !== null && startTime <= now && (endTime === null || endTime > now)) {
        groups.active.push(event);
        continue;
      }
      if (startTime === null || startTime > now) {
        groups.upcoming.push(event);
      }
    }

    return groups;
  }, [events]);

  useEffect(() => {
    setActiveView(tabFromPath(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardContent() {
      if (!firebaseUser) {
        setHomepageLoading(false);
        setPartiesLoading(false);
        setPhotosLoading(false);
        setEventsLoading(false);
        return;
      }

      try {
        const token = await firebaseUser.getIdToken();
        const [content, nextParties, nextPhotos, nextEvents, nextUsers] = await Promise.all([
          getHomepage(token),
          listParties(token),
          listImages(token),
          listEvents(token),
          listUsers(token),
        ]);
        if (!cancelled) {
          setHomepage({
            html: content.html,
            images: content.images ?? [],
          });
          setParties(nextParties);
          setPhotos(nextPhotos);
          setEvents(nextEvents);
          setUsers(nextUsers);
          setExpandedPartyId((current) => current ?? nextParties[0]?.id ?? null);
        }
      } catch {
        if (!cancelled) {
          setHomepage({ html: "", images: [] });
          setParties([]);
          setPhotos([]);
          setEvents([]);
          setUsers([]);
        }
      } finally {
        if (!cancelled) {
          setHomepageLoading(false);
          setPartiesLoading(false);
          setPhotosLoading(false);
          setEventsLoading(false);
        }
      }
    }

    loadDashboardContent();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!photoUploadFile) {
      setPhotoUploadPreviewURL("");
      return undefined;
    }

    const objectURL = URL.createObjectURL(photoUploadFile);
    setPhotoUploadPreviewURL(objectURL);
    return () => URL.revokeObjectURL(objectURL);
  }, [photoUploadFile]);

  const selectView = (view: MainView) => {
    setActiveView(view);
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setMessage("");
    setError("");
    if (view !== "settings") {
      navigate(tabPaths[view]);
    }
  };

  const openPhotoUpload = () => {
    setError("");
    setMessage("");
    setPhotoUploadPartyId("");
    setPhotoUploadDate(toDateInputValue(new Date()));
    setPhotoUploadFile(null);
    setPhotoUploadNotes("");
    setPhotoUploadUserId("");
    setPhotoUploadUserIds([]);
    setPhotoUploadDragging(false);
    setPhotoUploadOpen(true);
  };

  const closePhotoUpload = () => {
    if (photoUploading) {
      return;
    }
    setPhotoUploadOpen(false);
    setPhotoUploadDragging(false);
  };

  const handlePhotoFile = (file: File | null) => {
    setError("");
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setPhotoUploadFile(file);
  };

  const handlePhotoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handlePhotoFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  };

  const handlePhotoDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setPhotoUploadDragging(false);
    handlePhotoFile(event.dataTransfer.files?.[0] ?? null);
  };

  const addPhotoUploadUser = (value: string) => {
    setPhotoUploadUserId("");
    const userId = Number(value);
    if (!userId || photoUploadUserIds.includes(userId)) {
      return;
    }
    setPhotoUploadUserIds((current) => [...current, userId]);
  };

  const removePhotoUploadUser = (userId: number) => {
    setPhotoUploadUserIds((current) => current.filter((id) => id !== userId));
  };

  const handlePhotoUpload = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!firebaseUser) {
      setError("You need to be signed in to upload photos.");
      return;
    }
    if (!photoUploadFile) {
      setError("Choose an image to upload.");
      return;
    }
    if (!selectedUploadParty && !photoUploadDate) {
      setError("Choose a date for this photo.");
      return;
    }

    setPhotoUploading(true);
    try {
      const token = await firebaseUser.getIdToken();
      const uploaded = await uploadImage(token, photoUploadFile, selectedUploadParty ? selectedUploadParty.date.slice(0, 10) : photoUploadDate, {
        partyId: selectedUploadParty?.id ?? null,
        notes: photoUploadNotes.trim(),
        userIds: photoUploadUserIds,
      });
      setPhotos((current) => [uploaded, ...current.filter((photo) => photo.id !== uploaded.id)]);
      setPhotoPartyFilter(selectedUploadParty ? String(selectedUploadParty.id) : "all");
      setPhotoUploadOpen(false);
      setPhotoUploadDate(toDateInputValue(new Date()));
      setPhotoUploadFile(null);
      setPhotoUploadNotes("");
      setPhotoUploadUserId("");
      setPhotoUploadUserIds([]);
      setMessage("Photo uploaded.");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "failed to upload photo";
      setError(nextError);
    } finally {
      setPhotoUploading(false);
    }
  };

  const goToHostDashboard = () => {
    setMobileMenuOpen(false);
    setProfileOpen(false);
    navigate("/host");
  };

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!birthday) {
      setError("birthday is required");
      return;
    }

    setSaving(true);
    try {
      await updateProfile({ firstName, lastName, birthday });
      setMessage("Settings saved.");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "failed to update settings";
      setError(nextError);
    } finally {
      setSaving(false);
    }
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

          <nav className={mobileMenuOpen ? "main-tabs open" : "main-tabs"} aria-label="Main sections">
            {tabs.map((tab) => (
              <button
                className={activeView === tab.id ? "main-tab active" : "main-tab"}
                type="button"
                key={tab.id}
                onClick={() => selectView(tab.id)}
              >
                {tab.label}
              </button>
            ))}
            {appUser?.role === "host" ? (
              <button className="main-tab" type="button" onClick={goToHostDashboard}>
                Host
              </button>
            ) : null}
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
                <button type="button" role="menuitem" onClick={() => selectView("settings")}>
                  Settings
                </button>
                <button type="button" role="menuitem" onClick={() => logout()}>
                  Log Out
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <section className="main-content">
          {activeView === "settings" ? (
            <div className="settings-panel">
              <form className="auth-form" onSubmit={handleSaveProfile}>
                <div className="auth-row">
                  <label className="auth-field">
                    <span>First name</span>
                    <input
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      required
                    />
                  </label>
                  <label className="auth-field">
                    <span>Last name</span>
                    <input
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <BirthdaySelect value={birthday} onChange={setBirthday} />
                {message ? <p className="host-success">{message}</p> : null}
                {error ? <p className="auth-error">{error}</p> : null}
                <button className="auth-submit" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Settings"}
                </button>
              </form>
            </div>
          ) : activeView === "home" ? (
            <div className="homepage-layout">
              <article
                className="homepage-html"
                dangerouslySetInnerHTML={{
                  __html: homepage.html || "<p>Under Construction</p>",
                }}
              />
              {homepage.images.length > 0 ? (
                <aside className="homepage-rotator" aria-label="Homepage images">
                  <BouncingImages images={homepage.images} alt="The JK House" className="homepage-bouncer" speed={12} mobileSpeed={9} />
                </aside>
              ) : (
                <aside className="homepage-empty">
                  {homepageLoading ? "Loading..." : "No homepage images yet."}
                </aside>
              )}
            </div>
          ) : activeView === "parties" ? (
            <div className="dashboard-parties">
              {partiesLoading ? (
                <p className="dashboard-copy">Loading parties...</p>
              ) : parties.length === 0 ? (
                <p className="dashboard-copy">No parties yet.</p>
              ) : (
                <div className="party-accordion" aria-label="Party announcements">
                  {parties.map((party, index) => {
                    const partyYear = new Date(party.date).getFullYear();
                    const nextParty = parties[index + 1];
                    const yearChanges = !nextParty || new Date(nextParty.date).getFullYear() !== partyYear;
                    const expanded = expandedPartyId === party.id;

                    return (
                      <div className="party-accordion-group" key={party.id}>
                        <article className={expanded ? "party-accordion-row expanded" : "party-accordion-row"}>
                          <button
                            className="party-accordion-summary"
                            type="button"
                            aria-expanded={expanded}
                            onClick={() => setExpandedPartyId(party.id)}
                          >
                            <span>{party.label}</span>
                            <span>{formatDateTime(party.date)}</span>
                          </button>
                          {expanded ? (
                            <div className="party-accordion-details">
                              <article
                                className="homepage-html"
                                dangerouslySetInnerHTML={{
                                  __html: party.html || "<p>No party details yet.</p>",
                                }}
                              />
                            </div>
                          ) : null}
                        </article>
                        {yearChanges ? (
                          <div className="party-year-divider" aria-label={`${partyYear} parties`}>
                            <span>{partyYear}</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeView === "photos" ? (
            <div className="dashboard-photos">
              <div className="host-panel-header dashboard-photo-controls">
                <label className="image-filter dashboard-photo-filter">
                  <select
                    value={photoPartyFilter}
                    onChange={(event) => setPhotoPartyFilter(event.target.value)}
                    aria-label="Filter photos by party"
                  >
                    <option value="all">All Images</option>
                    {partyOptions.map((party) => (
                      <option value={party.value} key={party.id}>
                        {party.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="image-filter dashboard-photo-filter">
                  <select
                    value={photoUserFilter}
                    onChange={(event) => setPhotoUserFilter(event.target.value)}
                    aria-label="Filter photos by tagged user"
                  >
                    <option value="all">All Tagged Users</option>
                    {userOptions.map((user) => (
                      <option value={user.value} key={user.id}>
                        {user.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="auth-submit dashboard-photo-upload" type="button" onClick={openPhotoUpload}>
                  Add Photo
                </button>
              </div>
              {message ? <p className="host-success">{message}</p> : null}
              {error ? <p className="auth-error">{error}</p> : null}
              {photosLoading ? (
                <p className="dashboard-copy">Loading photos...</p>
              ) : filteredPhotos.length === 0 ? (
                <p className="dashboard-copy">
                  {photoPartyFilter === "all" ? "No photos yet." : "No photos for this party yet."}
                </p>
              ) : (
                <div className="image-grid" aria-label="Party photos">
                  {filteredPhotos.map((photo) => {
                    const photoParty = parties.find((party) => party.id === photo.partyId);
                    const taggedUsers = taggedUserLabels(users, photo.userIds);

                    return (
                      <article className="image-grid-card" key={photo.id}>
                        <div className="image-grid-image-wrap">
                          <button
                            className="image-preview-trigger"
                            type="button"
                            onClick={() => setSelectedPhotoId(photo.id)}
                          >
                            <img src={photo.imageUrl} alt={photo.notes || photoParty?.label || "Party photo"} />
                          </button>
                        </div>
                        <div className="image-grid-meta">
                          <span>{photoParty?.label ?? "No party"}</span>
                          <span>{formatImageDate(photo.date)}</span>
                          {taggedUsers.length > 0 ? <span>Tagged: {taggedUsers.join(", ")}</span> : null}
                          {photo.notes ? <span>{photo.notes}</span> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : activeView === "events" ? (
            <div className="dashboard-events">
              <div className="event-dashboard-tabs" role="tablist" aria-label="Event timing">
                {eventDashboardTabs.map((tab) => (
                  <button
                    className={activeEventTab === tab.id ? "event-dashboard-tab active" : "event-dashboard-tab"}
                    type="button"
                    role="tab"
                    aria-selected={activeEventTab === tab.id}
                    key={tab.id}
                    onClick={() => setActiveEventTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {eventsLoading ? (
                <p className="dashboard-copy">Loading events...</p>
              ) : (
                <DashboardEventTable
                  events={eventGroups[activeEventTab]}
                  parties={parties}
                  clickable={activeEventTab !== "upcoming"}
                  emptyText={`No ${activeEventTab} events.`}
                  onOpen={(event) => navigate(`/events/${eventRouteIdentifier(event)}`)}
                />
              )}
            </div>
          ) : (
            <div className="under-construction">
              <p>Under Construction</p>
            </div>
          )}
        </section>
      </section>
      {selectedPhoto ? (
        <div className="image-lightbox-backdrop" role="presentation" onMouseDown={() => setSelectedPhotoId(null)}>
          <figure className="image-lightbox" onMouseDown={(event) => event.stopPropagation()}>
            <img src={selectedPhoto.imageUrl} alt={selectedPhoto.notes || "Party photo preview"} />
            <figcaption>
              <span>{formatImageDate(selectedPhoto.date)}</span>
              {taggedUserLabels(users, selectedPhoto.userIds).map((label) => (
                <span key={label}>{label}</span>
              ))}
              {selectedPhoto.notes ? <span>{selectedPhoto.notes}</span> : null}
            </figcaption>
          </figure>
        </div>
      ) : null}
      {photoUploadOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closePhotoUpload}>
          <section className="upload-modal gothic-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 className="host-section-title">Add a Photo!</h2>
              <button className="modal-close" type="button" onClick={closePhotoUpload} aria-label="Close upload modal">
                x
              </button>
            </div>
            <form className="host-email-form" onSubmit={handlePhotoUpload}>
              <label className="auth-field">
                <span>Party</span>
                <select value={photoUploadPartyId} onChange={(event) => setPhotoUploadPartyId(event.target.value)}>
                  <option value="">Select a party</option>
                  {partyOptions.map((party) => (
                    <option value={party.value} key={party.id}>
                      {party.label}
                    </option>
                  ))}
                </select>
              </label>
              {selectedUploadParty ? (
                <p className="selected-file">Using party date: {formatDate(selectedUploadParty.date)}</p>
              ) : (
                <ImageDateSelect value={photoUploadDate} onChange={setPhotoUploadDate} />
              )}
              {!photoUploadFile ? (
                <div
                  className={photoUploadDragging ? "drop-zone dragging" : "drop-zone"}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setPhotoUploadDragging(true);
                  }}
                  onDragLeave={() => setPhotoUploadDragging(false)}
                  onDrop={handlePhotoDrop}
                >
                  <p>Drop an image here or choose one from your device.</p>
                  <button className="auth-submit" type="button" onClick={() => photoFileInputRef.current?.click()}>
                    Choose Image
                  </button>
                </div>
              ) : (
                <div className="upload-preview">
                  <img src={photoUploadPreviewURL} alt="Selected upload preview" />
                </div>
              )}
              <input
                ref={photoFileInputRef}
                className="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handlePhotoFileChange}
              />
              {photoUploadFile ? (
                <button className="auth-submit" type="button" onClick={() => photoFileInputRef.current?.click()}>
                  Choose Different Image
                </button>
              ) : null}
              <label className="auth-field">
                <span>Notes</span>
                <textarea
                  value={photoUploadNotes}
                  onChange={(event) => setPhotoUploadNotes(event.target.value)}
                  placeholder="Optional note for this image"
                  rows={3}
                />
              </label>
              <label className="auth-field">
                <span>Tag users</span>
                <select value={photoUploadUserId} onChange={(event) => addPhotoUploadUser(event.target.value)}>
                  <option value="">Select a user</option>
                  {userOptions
                    .filter((user) => !photoUploadUserIds.includes(user.id))
                    .map((user) => (
                      <option value={user.value} key={user.id}>
                        {user.label}
                      </option>
                    ))}
                </select>
              </label>
              {taggedUploadUsers.length > 0 ? (
                <div className="tagged-user-bubbles" aria-label="Tagged users">
                  {taggedUploadUsers.map((user) => (
                    <span className="tagged-user-bubble" key={user.id}>
                      {userDisplayName(user)}
                      <button type="button" onClick={() => removePhotoUploadUser(user.id)} aria-label={`Remove ${userDisplayName(user)}`}>
                        x
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              {error ? <p className="auth-error">{error}</p> : null}
              <button className="auth-submit" type="submit" disabled={photoUploading || !photoUploadFile || (!selectedUploadParty && !photoUploadDate)}>
                {photoUploading ? "Uploading..." : "Upload Image"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(new Date(value));
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

function DashboardEventTable({
  events,
  parties,
  clickable,
  emptyText,
  onOpen,
}: {
  events: EventRecord[];
  parties: PartyRecord[];
  clickable: boolean;
  emptyText: string;
  onOpen: (event: EventRecord) => void;
}) {
  return (
    <div className="host-table-wrap dashboard-event-table-wrap">
      <table className="host-table dashboard-event-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Label</th>
            <th>Party</th>
            <th>Start</th>
            <th>End</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr
              className={clickable ? "clickable-row" : undefined}
              key={event.id}
              onClick={clickable ? () => onOpen(event) : undefined}
            >
              <td>{eventTypeLabels[event.type]}</td>
              <td>{event.label}</td>
              <td>{event.partyId ? dashboardPartyLabel(parties, event.partyId) : "No party"}</td>
              <td>{event.startDate ? formatDateTime(event.startDate) : "Not set"}</td>
              <td>{event.endDate ? formatDateTime(event.endDate) : "Not set"}</td>
              <td>{event.description || "No summary"}</td>
            </tr>
          ))}
          {events.length === 0 ? (
            <tr>
              <td colSpan={6}>{emptyText}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function dashboardPartyLabel(parties: PartyRecord[], partyId: number) {
  return parties.find((party) => party.id === partyId)?.label ?? "Unknown party";
}

function userDisplayName(user: AppUser) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;
}

function taggedUserLabels(users: AppUser[], userIds: number[]) {
  return userIds
    .map((userId) => users.find((user) => user.id === userId))
    .filter((user): user is AppUser => Boolean(user))
    .map(userDisplayName);
}
