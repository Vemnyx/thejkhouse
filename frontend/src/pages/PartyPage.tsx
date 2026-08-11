import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PartyRsvpModal from "../components/PartyRsvpModal";
import { useAuth } from "../context/AuthContext";
import {
  AppUser,
  PartyAttendeeRecord,
  PartyRecord,
  getParty,
  listParties,
  listPartyAttendees,
  listUsers,
  partyRouteIdentifier,
  partyThemeStyle,
} from "../lib/api";

const partyVenueAddress = "1116 Rosepine Dr, Cary, NC 27519";

export default function PartyPage() {
  const { partyId } = useParams();
  const { appUser, firebaseUser } = useAuth();
  const [party, setParty] = useState<PartyRecord | null>(null);
  const [attendees, setAttendees] = useState<PartyAttendeeRecord[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rsvpModalOpen, setRsvpModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadParty() {
      if (!firebaseUser || !partyId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const token = await firebaseUser.getIdToken();
        const numericPartyId = Number(partyId);
        let resolvedPartyId = Number.isInteger(numericPartyId) && numericPartyId > 0 ? numericPartyId : null;

        if (!resolvedPartyId) {
          const parties = await listParties(token);
          const matched = parties.find((item) => partyRouteIdentifier(item) === partyId);
          if (!matched) {
            throw new Error("party not found");
          }
          resolvedPartyId = matched.id;
        }

        const [nextParty, nextAttendees, nextUsers] = await Promise.all([
          getParty(token, resolvedPartyId),
          listPartyAttendees(token, resolvedPartyId),
          listUsers(token),
        ]);

        if (!cancelled) {
          setParty(nextParty);
          setAttendees(nextAttendees);
          setUsers(nextUsers);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "failed to load party";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadParty();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, partyId]);

  const usersById = useMemo(() => {
    const map = new Map<number, AppUser>();
    for (const user of users) {
      map.set(user.id, user);
    }
    return map;
  }, [users]);

  const attendeeRows = useMemo(() => {
    return attendees.map((attendee) => {
      const linkedUser = attendee.userId != null ? usersById.get(attendee.userId) ?? null : null;
      const firstName = (linkedUser?.firstName || attendee.firstName || "").trim();
      const lastName = (linkedUser?.lastName || attendee.lastName || "").trim();
      const displayName = [firstName, lastName].filter(Boolean).join(" ") || attendee.email || "Guest";
      const colorId = attendee.userId ?? attendee.id;
      return {
        attendee,
        displayName,
        firstName,
        avatarUrl: linkedUser?.avatarUrl ?? null,
        colorId,
      };
    });
  }, [attendees, usersById]);

  const isAttending = useMemo(() => {
    if (!appUser) {
      return false;
    }
    return attendees.some((attendee) => attendee.userId === appUser.id);
  }, [appUser, attendees]);

  const canRsvp = Boolean(party && !party.partifulUrl && !isAttending && new Date(party.date).getTime() > Date.now());
  const themeStyle = party ? partyThemeStyle(party) : undefined;

  return (
    <main
      className={party ? "page app-shell-page party-detail-page party-themed" : "page app-shell-page party-detail-page"}
      style={themeStyle}
    >
      <div className="page-vignette" aria-hidden="true" />
      <section
        className={
          party
            ? "gothic-card app-shell-card party-detail-card party-themed"
            : "gothic-card app-shell-card party-detail-card"
        }
        style={themeStyle}
      >
        <div className="card-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>

        <div className="party-detail-topbar">
          <Link className="auth-secondary back-text-link event-detail-back party-detail-back" to="/parties">
            Back to Parties
          </Link>
          {canRsvp ? (
            <button className="party-rsvp-button" type="button" onClick={() => setRsvpModalOpen(true)}>
              RSVP
            </button>
          ) : null}
        </div>

        {loading ? (
          <p className="loading-text">Loading party...</p>
        ) : error ? (
          <p className="auth-error">{error}</p>
        ) : party ? (
          <section className="party-detail-view party-themed" aria-label={`${party.label} party details`}>
            <header className="party-detail-header">
              <h1>{party.label}</h1>
              <section className="party-detail-meta" aria-label="When and where">
                <article>
                  <span>When</span>
                  <strong>{formatPartyDateTime(party.date)}</strong>
                </article>
                <article>
                  <span>Where</span>
                  <strong>{partyVenueAddress}</strong>
                </article>
                {party.partifulUrl ? (
                  <article>
                    <span>Partiful</span>
                    <strong>
                      <a href={party.partifulUrl} target="_blank" rel="noreferrer">
                        Open invite
                      </a>
                    </strong>
                  </article>
                ) : null}
              </section>
            </header>

            <div className="party-detail-body">
              <div className="party-detail-main">
                {party.summary ? <p className="party-detail-summary">{party.summary}</p> : null}
              </div>

              <aside className="party-detail-side">
                {party.mediaUrl ? (
                  <div className="party-detail-media" aria-label="Party media">
                    <img src={party.mediaUrl} alt="" />
                  </div>
                ) : null}

                <section className="party-attendee-section" aria-label="Attending">
                  <div className="party-attendee-header">
                    <h2>Attending</h2>
                  </div>
                  {attendeeRows.length === 0 ? (
                    <p className="dashboard-copy party-detail-empty">No one has RSVP&apos;d yet.</p>
                  ) : (
                    <ul className="party-attendee-list">
                      {attendeeRows.map((row) => (
                        <li className="party-attendee-row" key={row.attendee.id}>
                          <AttendeeAvatar
                            name={row.displayName}
                            firstName={row.firstName}
                            avatarUrl={row.avatarUrl}
                            colorId={row.colorId}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </aside>
            </div>
          </section>
        ) : (
          <p className="dashboard-copy">Party not found.</p>
        )}
      </section>

      {rsvpModalOpen && party ? (
        <PartyRsvpModal
          party={party}
          users={users}
          onClose={() => setRsvpModalOpen(false)}
          onAttendeesUpdated={setAttendees}
        />
      ) : null}
    </main>
  );
}

function AttendeeAvatar({
  name,
  firstName,
  avatarUrl,
  colorId,
}: {
  name: string;
  firstName: string;
  avatarUrl: string | null;
  colorId: number;
}) {
  const initial = (firstName || name).trim().charAt(0).toUpperCase() || "?";

  return (
    <span className="party-attendee-avatar-wrap" tabIndex={0} aria-label={name}>
      {avatarUrl ? (
        <img className="party-attendee-avatar" src={avatarUrl} alt="" />
      ) : (
        <span
          className="party-attendee-avatar party-attendee-avatar-fallback"
          style={{ backgroundColor: avatarColorFromUserId(colorId) }}
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
      <span className="party-attendee-tooltip" role="tooltip">
        {name}
      </span>
    </span>
  );
}

/** Deterministic hex background from a numeric id (prefer user id). */
function avatarColorFromUserId(userId: number): string {
  let n = userId | 0;
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n = (n ^ (n >>> 16)) >>> 0;

  const r = 72 + (n & 0x7f);
  const g = 72 + ((n >>> 8) & 0x7f);
  const b = 72 + ((n >>> 16) & 0x7f);

  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function formatPartyDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(value));
}
