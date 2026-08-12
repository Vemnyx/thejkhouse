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

type RsvpModalView = "choice" | "going";

type PendingGuest = {
  key: string;
  userId?: number;
  firstName: string;
  lastName: string;
  email: string;
  label: string;
};

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
  const [guestUserId, setGuestUserId] = useState("");
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [pendingGuests, setPendingGuests] = useState<PendingGuest[]>([]);
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

  const myRsvpGuests = useMemo(() => {
    if (!rsvpMyAttendee) {
      return [];
    }
    return rsvpAttendees.filter((attendee) => attendee.plusOneOf === rsvpMyAttendee.id);
  }, [rsvpAttendees, rsvpMyAttendee]);

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

  const resetGuestForm = () => {
    setGuestUserId("");
    setGuestFirstName("");
    setGuestLastName("");
    setGuestEmail("");
  };

  const submitRsvpStatus = async (status: PartyRsvpStatus) => {
    if (!firebaseUser || rsvpLoading || rsvpSubmitting) {
      return;
    }

    if (status === "going") {
      setRsvpView("going");
      setRsvpError("");
      return;
    }

    setRsvpError("");
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

  const addGuestToList = (event: FormEvent) => {
    event.preventDefault();
    setRsvpError("");

    const selectedUserId = guestUserId ? Number(guestUserId) : 0;
    const firstName = guestFirstName.trim();
    const lastName = guestLastName.trim();
    const email = guestEmail.trim();

    if (!selectedUserId && (!firstName || !lastName)) {
      setRsvpError("Select a user or enter a first and last name.");
      return;
    }

    const selectedUser = selectedUserId ? userOptions.find((user) => user.id === selectedUserId) ?? null : null;
    const label = selectedUser?.label || [firstName, lastName].filter(Boolean).join(" ") || email || "Guest";
    const duplicate = pendingGuests.some((guest) => {
      if (selectedUserId) {
        return guest.userId === selectedUserId;
      }
      return guest.firstName === firstName && guest.lastName === lastName && guest.email === email;
    });

    if (duplicate) {
      setRsvpError("That guest is already on your list.");
      return;
    }

    setPendingGuests((current) => [
      ...current,
      {
        key: `${Date.now()}-${current.length}`,
        userId: selectedUserId || undefined,
        firstName: selectedUser ? selectedUser.firstName : firstName,
        lastName: selectedUser ? selectedUser.lastName : lastName,
        email: selectedUser ? selectedUser.email : email,
        label,
      },
    ]);
    resetGuestForm();
  };

  const removePendingGuest = (key: string) => {
    setPendingGuests((current) => current.filter((guest) => guest.key !== key));
  };

  const confirmGoingRsvp = async () => {
    if (!firebaseUser || rsvpLoading || rsvpSubmitting) {
      return;
    }

    setRsvpError("");
    setRsvpSubmitting(true);
    try {
      const token = await firebaseUser.getIdToken();
      await addPartyAttendee(token, party.id, {
        rsvpStatus: "going",
        note: rsvpNote.trim() || undefined,
      });
      const { mine } = await refreshRsvpAttendees(token);
      if (!mine) {
        throw new Error("failed to save RSVP");
      }

      for (const guest of pendingGuests) {
        const payload = guest.userId
          ? { userId: guest.userId, plusOneOf: mine.id }
          : {
              firstName: guest.firstName,
              lastName: guest.lastName,
              email: guest.email || undefined,
              plusOneOf: mine.id,
            };
        await addPartyAttendee(token, party.id, payload);
      }

      await refreshRsvpAttendees(token);
      onClose();
    } catch (err) {
      const nextError = err instanceof Error ? err.message : "failed to RSVP";
      setRsvpError(nextError);
    } finally {
      setRsvpSubmitting(false);
    }
  };

  const modalTitle = rsvpView === "going" ? `RSVP to attend ${party.label}` : `RSVP to ${party.label}`;

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
        ) : (
          <div className="party-rsvp-body">
            {rsvpLoading ? <p className="dashboard-copy">Loading RSVP details...</p> : null}
            <p className="party-overview-copy">
              <strong>When:</strong> {formatDateTime(party.date)}
            </p>
            <p className="party-overview-copy">
              <strong>Where:</strong> {partyVenueAddress}
            </p>
            {!rsvpLoading ? (
              <p className="dashboard-copy">Add guests if you&apos;d like, then confirm your RSVP below.</p>
            ) : null}

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

            <form className="party-rsvp-guest-form" onSubmit={addGuestToList}>
              <p className="host-section-title">Add a guest</p>
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
                  disabled={rsvpLoading || rsvpSubmitting}
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
                  disabled={Boolean(guestUserId) || rsvpLoading || rsvpSubmitting}
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
                  disabled={Boolean(guestUserId) || rsvpLoading || rsvpSubmitting}
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
                  disabled={Boolean(guestUserId) || rsvpLoading || rsvpSubmitting}
                />
              </label>

              <button className="auth-secondary party-rsvp-add-guest" type="submit" disabled={rsvpLoading || rsvpSubmitting}>
                Add Guest
              </button>
            </form>

            {myRsvpGuests.length > 0 || pendingGuests.length > 0 ? (
              <div className="party-rsvp-guests">
                <p className="host-section-title">Your guests</p>
                <ul>
                  {myRsvpGuests.map((guest) => (
                    <li key={guest.id}>
                      {[guest.firstName, guest.lastName].filter(Boolean).join(" ") || guest.email || "Guest"}
                    </li>
                  ))}
                  {pendingGuests.map((guest) => (
                    <li key={guest.key} className="party-rsvp-guest-pending">
                      <span>{guest.label}</span>
                      <button
                        className="auth-secondary party-rsvp-remove-guest"
                        type="button"
                        onClick={() => removePendingGuest(guest.key)}
                        disabled={rsvpSubmitting}
                        aria-label={`Remove ${guest.label}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {rsvpError ? <p className="auth-error">{rsvpError}</p> : null}

            <div className="party-rsvp-actions party-rsvp-actions-stacked">
              <button
                className="auth-submit"
                type="button"
                onClick={() => void confirmGoingRsvp()}
                disabled={rsvpLoading || rsvpSubmitting}
              >
                {rsvpSubmitting ? "Confirming..." : "Confirm RSVP"}
              </button>
              <button
                className="auth-secondary"
                type="button"
                onClick={() => {
                  setRsvpView("choice");
                  setRsvpError("");
                  setPendingGuests([]);
                  resetGuestForm();
                }}
                disabled={rsvpSubmitting}
              >
                Back
              </button>
            </div>
          </div>
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
