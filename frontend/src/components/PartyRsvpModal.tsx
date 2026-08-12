import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import {
  AppUser,
  PartyAttendeeRecord,
  PartyRecord,
  PartyRsvpStatus,
  addPartyAttendee,
  listPartyAttendees,
} from "../lib/api";

const partyVenueAddress = "1116 Rosepine Dr, Cary, NC 27519";

type RsvpModalView = "choice" | "going" | "guest";

type PartyRsvpModalProps = {
  party: PartyRecord;
  users: AppUser[];
  onClose: () => void;
  onAttendeesUpdated?: (attendees: PartyAttendeeRecord[]) => void;
};

export default function PartyRsvpModal({ party, users, onClose, onAttendeesUpdated }: PartyRsvpModalProps) {
  const { appUser, firebaseUser } = useAuth();
  const [rsvpView, setRsvpView] = useState<RsvpModalView>("choice");
  const [rsvpAttendees, setRsvpAttendees] = useState<PartyAttendeeRecord[]>([]);
  const [rsvpMyAttendee, setRsvpMyAttendee] = useState<PartyAttendeeRecord | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(true);
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false);
  const [rsvpError, setRsvpError] = useState("");
  const [rsvpSuccess, setRsvpSuccess] = useState("");
  const [guestUserId, setGuestUserId] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [rsvpNote, setRsvpNote] = useState("");

  const userOptions = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        label: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || `User ${user.id}`,
        value: String(user.id),
      })),
    [users],
  );

  const isGoing = rsvpMyAttendee?.rsvpStatus === "going";

  const myRsvpGuests = useMemo(() => {
    if (!rsvpMyAttendee || !isGoing) {
      return [];
    }
    return rsvpAttendees.filter((attendee) => attendee.plusOneOf === rsvpMyAttendee.id);
  }, [rsvpAttendees, rsvpMyAttendee, isGoing]);

  const refreshRsvpAttendees = async (token: string) => {
    const attendees = await listPartyAttendees(token, party.id);
    setRsvpAttendees(attendees);
    const mine = appUser ? attendees.find((attendee) => attendee.userId === appUser.id) ?? null : null;
    setRsvpMyAttendee(mine);
    onAttendeesUpdated?.(attendees);
    return { attendees, mine };
  };

  useEffect(() => {
    let cancelled = false;

    async function loadRsvp() {
      if (!firebaseUser || !appUser) {
        setRsvpError("You need to be signed in to RSVP.");
        setRsvpLoading(false);
        return;
      }

      setRsvpLoading(true);
      setRsvpError("");
      try {
        const token = await firebaseUser.getIdToken();
        const attendees = await listPartyAttendees(token, party.id);
        if (cancelled) {
          return;
        }
        setRsvpAttendees(attendees);
        const mine = attendees.find((attendee) => attendee.userId === appUser.id) ?? null;
        setRsvpMyAttendee(mine);
        if (mine?.note) {
          setRsvpNote(mine.note);
        }
      } catch (err) {
        if (!cancelled) {
          const nextError = err instanceof Error ? err.message : "failed to load RSVP details";
          setRsvpError(nextError);
        }
      } finally {
        if (!cancelled) {
          setRsvpLoading(false);
        }
      }
    }

    void loadRsvp();
    return () => {
      cancelled = true;
    };
  }, [appUser, firebaseUser, party.id]);

  const closeModal = () => {
    if (rsvpSubmitting || rsvpLoading) {
      return;
    }
    onClose();
  };

  const submitRsvpStatus = async (status: PartyRsvpStatus) => {
    if (!firebaseUser || rsvpLoading || rsvpSubmitting) {
      return;
    }

    if (status === "going") {
      setRsvpView("going");
      setRsvpError("");
      setRsvpSuccess("");
      return;
    }

    setRsvpError("");
    setRsvpSuccess("");
    setRsvpSubmitting(true);
    try {
      const token = await firebaseUser.getIdToken();
      await addPartyAttendee(token, party.id, { rsvpStatus: status });
      await refreshRsvpAttendees(token);
      onClose();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "failed to save RSVP";
      setRsvpError(nextError);
    } finally {
      setRsvpSubmitting(false);
    }
  };

  const confirmGoingRsvp = async () => {
    if (!firebaseUser || rsvpLoading || rsvpSubmitting) {
      return;
    }

    setRsvpError("");
    setRsvpSuccess("");
    setRsvpSubmitting(true);
    try {
      const token = await firebaseUser.getIdToken();
      await addPartyAttendee(token, party.id, {
        rsvpStatus: "going",
        note: rsvpNote.trim() || undefined,
      });
      const { mine } = await refreshRsvpAttendees(token);
      if (mine?.rsvpStatus === "going") {
        setRsvpSuccess("You're on the list.");
      }
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "failed to RSVP";
      setRsvpError(nextError);
    } finally {
      setRsvpSubmitting(false);
    }
  };

  const openInviteGuestView = () => {
    if (!rsvpMyAttendee || !isGoing) {
      setRsvpError("Confirm your RSVP before inviting a guest.");
      return;
    }
    setRsvpView("guest");
    setRsvpError("");
    setRsvpSuccess("");
    setGuestUserId("");
    setGuestFirstName("");
    setGuestLastName("");
    setGuestEmail("");
  };

  const handleInviteGuest = async (event: FormEvent) => {
    event.preventDefault();
    setRsvpError("");
    setRsvpSuccess("");
    if (!firebaseUser || !rsvpMyAttendee || !isGoing) {
      setRsvpError("RSVP first before inviting a guest.");
      return;
    }

    const selectedUserId = guestUserId ? Number(guestUserId) : 0;
    const firstName = guestFirstName.trim();
    const lastName = guestLastName.trim();
    const email = guestEmail.trim();

    if (!selectedUserId && (!firstName || !lastName)) {
      setRsvpError("Select a user or enter a first and last name.");
      return;
    }

    setRsvpSubmitting(true);
    try {
      const token = await firebaseUser.getIdToken();
      const payload = selectedUserId
        ? { userId: selectedUserId, plusOneOf: rsvpMyAttendee.id }
        : { firstName, lastName, email: email || undefined, plusOneOf: rsvpMyAttendee.id };
      await addPartyAttendee(token, party.id, payload);
      await refreshRsvpAttendees(token);
      setRsvpView("going");
      setRsvpSuccess("Guest invited.");
      setGuestUserId("");
      setGuestFirstName("");
      setGuestLastName("");
      setGuestEmail("");
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "failed to invite guest";
      setRsvpError(nextError);
    } finally {
      setRsvpSubmitting(false);
    }
  };

  const modalTitle =
    rsvpView === "guest" ? "Select Guest" : rsvpView === "going" ? `RSVP to attend ${party.label}` : `RSVP to ${party.label}`;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={closeModal}>
      <section
        className="upload-modal gothic-card party-rsvp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="party-rsvp-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="host-section-title" id="party-rsvp-title">
            {modalTitle}
          </h2>
          <button className="modal-close" type="button" onClick={closeModal} aria-label="Close RSVP modal">
            x
          </button>
        </div>

        {rsvpView === "choice" ? (
          <div className="party-rsvp-body">
            {rsvpLoading ? <p className="dashboard-copy">Loading RSVP details...</p> : null}
            <p className="party-overview-copy">
              <strong>When:</strong> {formatDateTime(party.date)}
            </p>
            <p className="party-overview-copy">
              <strong>Where:</strong> {partyVenueAddress}
            </p>
            {!rsvpLoading ? <p className="dashboard-copy">How are you feeling about this one?</p> : null}
            {rsvpError ? <p className="auth-error">{rsvpError}</p> : null}
            <div className="party-rsvp-choice-buttons">
              <button
                className="auth-submit"
                type="button"
                onClick={() => void submitRsvpStatus("going")}
                disabled={rsvpLoading || rsvpSubmitting}
              >
                Going
              </button>
              <button
                className="auth-secondary"
                type="button"
                onClick={() => void submitRsvpStatus("maybe")}
                disabled={rsvpLoading || rsvpSubmitting}
              >
                {rsvpSubmitting ? "Saving..." : "Maybe"}
              </button>
              <button
                className="auth-secondary"
                type="button"
                onClick={() => void submitRsvpStatus("not_going")}
                disabled={rsvpLoading || rsvpSubmitting}
              >
                {rsvpSubmitting ? "Saving..." : "Not This Time"}
              </button>
            </div>
          </div>
        ) : rsvpView === "going" ? (
          <div className="party-rsvp-body">
            {rsvpLoading ? <p className="dashboard-copy">Loading RSVP details...</p> : null}
            {rsvpSubmitting && !rsvpMyAttendee ? <p className="dashboard-copy">Saving your RSVP...</p> : null}
            <p className="party-overview-copy">
              <strong>When:</strong> {formatDateTime(party.date)}
            </p>
            <p className="party-overview-copy">
              <strong>Where:</strong> {partyVenueAddress}
            </p>
            {!rsvpLoading && !isGoing ? (
              <p className="dashboard-copy">Confirm below and invite guests if you&apos;d like.</p>
            ) : null}
            {isGoing && !rsvpLoading ? <p className="host-success">You&apos;re on the list.</p> : null}
            <label className="auth-field">
              <span>Note (optional)</span>
              <textarea
                value={rsvpNote}
                onChange={(event) => setRsvpNote(event.target.value)}
                placeholder="Anything the hosts should know?"
                rows={3}
                maxLength={2000}
                disabled={rsvpLoading || rsvpSubmitting}
              />
            </label>
            {myRsvpGuests.length > 0 ? (
              <div className="party-rsvp-guests">
                <p className="host-section-title">Your guests</p>
                <ul>
                  {myRsvpGuests.map((guest) => (
                    <li key={guest.id}>
                      {[guest.firstName, guest.lastName].filter(Boolean).join(" ") || guest.email || "Guest"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {rsvpError ? <p className="auth-error">{rsvpError}</p> : null}
            {rsvpSuccess ? <p className="host-success">{rsvpSuccess}</p> : null}
            <div className="party-rsvp-actions">
              <button
                className="auth-secondary"
                type="button"
                onClick={() => {
                  setRsvpView("choice");
                  setRsvpError("");
                  setRsvpSuccess("");
                }}
                disabled={rsvpSubmitting}
              >
                Back
              </button>
              <button
                className="auth-submit"
                type="button"
                onClick={() => void confirmGoingRsvp()}
                disabled={rsvpLoading || rsvpSubmitting}
              >
                {rsvpSubmitting ? "Confirming..." : isGoing ? "Update RSVP" : "Confirm RSVP"}
              </button>
              <button
                className="auth-secondary"
                type="button"
                onClick={openInviteGuestView}
                disabled={rsvpLoading || rsvpSubmitting || !isGoing}
              >
                Invite Guest
              </button>
            </div>
          </div>
        ) : (
          <form className="host-email-form" onSubmit={handleInviteGuest}>
            <label className="auth-field">
              <span>Select a user</span>
              <select
                value={guestUserId}
                onChange={(event) => {
                  setGuestUserId(event.target.value);
                  if (event.target.value) {
                    setGuestFirstName("");
                    setGuestLastName("");
                    setGuestEmail("");
                  }
                }}
              >
                <option value="">Choose a user</option>
                {userOptions
                  .filter((user) => user.id !== appUser?.id)
                  .map((user) => (
                    <option value={user.value} key={user.id}>
                      {user.label}
                    </option>
                  ))}
              </select>
            </label>

            <div className="party-or-divider" role="separator">
              <span>-- Or --</span>
            </div>

            <label className="auth-field">
              <span>First Name</span>
              <input
                value={guestFirstName}
                onChange={(event) => {
                  setGuestFirstName(event.target.value);
                  if (event.target.value) {
                    setGuestUserId("");
                  }
                }}
                disabled={Boolean(guestUserId)}
              />
            </label>
            <label className="auth-field">
              <span>Last Name</span>
              <input
                value={guestLastName}
                onChange={(event) => {
                  setGuestLastName(event.target.value);
                  if (event.target.value) {
                    setGuestUserId("");
                  }
                }}
                disabled={Boolean(guestUserId)}
              />
            </label>
            <label className="auth-field">
              <span>Email (optional)</span>
              <input
                type="email"
                value={guestEmail}
                onChange={(event) => {
                  setGuestEmail(event.target.value);
                  if (event.target.value) {
                    setGuestUserId("");
                  }
                }}
                disabled={Boolean(guestUserId)}
              />
            </label>

            {rsvpError ? <p className="auth-error">{rsvpError}</p> : null}

            <div className="party-rsvp-actions">
              <button
                className="auth-secondary"
                type="button"
                onClick={() => {
                  setRsvpView("going");
                  setRsvpError("");
                }}
                disabled={rsvpSubmitting}
              >
                Back
              </button>
              <button className="auth-submit" type="submit" disabled={rsvpSubmitting}>
                {rsvpSubmitting ? "Inviting..." : "Add Guest"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
