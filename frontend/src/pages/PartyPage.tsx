import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import PartyCalendarButton from "../components/PartyCalendarButton";
import PartyRsvpModal from "../components/PartyRsvpModal";
import PartySignupModal from "../components/PartySignupModal";
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

const venmoUrl = "https://venmo.com/u/Jacob-Lantz-5";
const paypalUrl = "https://www.paypal.me/JacobLantz271";
const spotifyPlaylistUrl =
  "https://open.spotify.com/playlist/45BvibK2MJxZbC4OK0d4nH?si=SoQszkZETP6AtgP8y28gZg&utm_source=copy-link&pi=YxIHCyYFRvq9Y";

const venmoLogoUrl = "https://storage.googleapis.com/thejkhouse-assets/logo/venmo.png?v=3";
const paypalLogoUrl = "https://storage.googleapis.com/thejkhouse-assets/logo/paypal.png?v=2";
const spotifyLogoUrl = "https://storage.googleapis.com/thejkhouse-assets/logo/spotify.png?v=2";
const byomYesLogoUrl = "https://storage.googleapis.com/thejkhouse-assets/logo/byom-yes.png";
const byomNoLogoUrl = "https://storage.googleapis.com/thejkhouse-assets/logo/byom-no.png";

export default function PartyPage() {
  const { partyId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { appUser, firebaseUser } = useAuth();
  const [party, setParty] = useState<PartyRecord | null>(null);
  const [attendees, setAttendees] = useState<PartyAttendeeRecord[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rsvpModalOpen, setRsvpModalOpen] = useState(false);
  const [signupModalOpen, setSignupModalOpen] = useState(false);

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

  useEffect(() => {
    if (searchParams.get("rsvp") !== "1" || loading || !party || !firebaseUser) {
      return;
    }

    setRsvpModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("rsvp");
    setSearchParams(nextParams, { replace: true });
  }, [firebaseUser, loading, party, searchParams, setSearchParams]);

  const usersById = useMemo(() => {
    const map = new Map<number, AppUser>();
    for (const user of users) {
      map.set(user.id, user);
    }
    return map;
  }, [users]);

  const attendeeRows = useMemo(() => {
    const visibleHostIds = new Set(
      attendees
        .filter(
          (attendee) =>
            attendee.plusOneOf == null && (attendee.rsvpStatus === "going" || attendee.rsvpStatus === "maybe"),
        )
        .map((attendee) => attendee.id),
    );
    const hostStatusById = new Map(
      attendees
        .filter((attendee) => attendee.plusOneOf == null)
        .map((attendee) => [attendee.id, attendee.rsvpStatus] as const),
    );

    return attendees
      .filter((attendee) => {
        if (attendee.plusOneOf != null) {
          return visibleHostIds.has(attendee.plusOneOf);
        }
        return attendee.rsvpStatus === "going" || attendee.rsvpStatus === "maybe";
      })
      .map((attendee) => {
        const linkedUser = attendee.userId != null ? usersById.get(attendee.userId) ?? null : null;
        const firstName = (linkedUser?.firstName || attendee.firstName || "").trim();
        const lastName = (linkedUser?.lastName || attendee.lastName || "").trim();
        const displayName = [firstName, lastName].filter(Boolean).join(" ") || attendee.email || "Guest";
        const colorId = attendee.userId ?? attendee.id;
        const hostStatus =
          attendee.plusOneOf != null ? hostStatusById.get(attendee.plusOneOf) ?? "going" : attendee.rsvpStatus;
        const isMaybe = hostStatus === "maybe";
        return {
          attendee,
          displayName,
          firstName,
          avatarUrl: linkedUser?.avatarUrl ?? null,
          colorId,
          isMaybe,
        };
      })
      .sort((a, b) => Number(a.isMaybe) - Number(b.isMaybe));
  }, [attendees, usersById]);

  const myAttendee = useMemo(() => {
    if (!appUser) {
      return null;
    }
    return attendees.find((attendee) => attendee.userId === appUser.id) ?? null;
  }, [appUser, attendees]);

  const canShowRsvpButton = Boolean(party && !party.partifulUrl && new Date(party.date).getTime() > Date.now());
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
          <div className="party-detail-topbar-actions">
            {party ? <PartyCalendarButton party={party} /> : null}
            {canShowRsvpButton ? (
              <button className="party-rsvp-button" type="button" onClick={() => setRsvpModalOpen(true)}>
                {myAttendee ? "Update RSVP" : "RSVP"}
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <p className="loading-text">Loading party...</p>
        ) : error ? (
          <p className="auth-error">{error}</p>
        ) : party ? (
          <section className="party-detail-view" aria-label={`${party.label} party details`}>
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

                <section className="party-detail-extras" aria-label="Party extras">
                  <div className="party-detail-extra">
                    <button
                      className="party-signup-sheet-button"
                      type="button"
                      onClick={() => setSignupModalOpen(true)}
                    >
                      Sign Up Sheet
                    </button>
                  </div>
                  <div className="party-detail-extra">
                    <div className="party-detail-link party-detail-link-featured party-detail-byom" role="status">
                      <img src={party.byom ? byomYesLogoUrl : byomNoLogoUrl} alt="" />
                      <span>B.Y.O.M.O.M.S (Bring Your Own Meat Or Meat Substitute)</span>
                    </div>
                  </div>

                  <div className="party-detail-extra">
                    <a className="party-detail-link party-detail-link-featured" href={spotifyPlaylistUrl} target="_blank" rel="noreferrer">
                      <img src={spotifyLogoUrl} alt="" />
                      <span>Add to the party playlist!</span>
                    </a>
                  </div>

                  <div className="party-detail-extra">
                    <h2>Donate to the cause</h2>
                    <div className="party-detail-links">
                      <a className="party-detail-link" href={venmoUrl} target="_blank" rel="noreferrer">
                        <img src={venmoLogoUrl} alt="" />
                        <span>Venmo</span>
                      </a>
                      <a className="party-detail-link" href={paypalUrl} target="_blank" rel="noreferrer">
                        <img src={paypalLogoUrl} alt="" />
                        <span>Paypal</span>
                      </a>
                    </div>
                  </div>
                </section>
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
                            isMaybe={row.isMaybe}
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

      {signupModalOpen && party ? (
        <PartySignupModal party={party} users={users} onClose={() => setSignupModalOpen(false)} />
      ) : null}
    </main>
  );
}

function AttendeeAvatar({
  name,
  firstName,
  avatarUrl,
  colorId,
  isMaybe = false,
}: {
  name: string;
  firstName: string;
  avatarUrl: string | null;
  colorId: number;
  isMaybe?: boolean;
}) {
  const initial = (firstName || name).trim().charAt(0).toUpperCase() || "?";
  const label = isMaybe ? `${name} · Maybe` : name;

  return (
    <span
      className={isMaybe ? "party-attendee-avatar-wrap party-attendee-avatar-maybe" : "party-attendee-avatar-wrap"}
      tabIndex={0}
      aria-label={label}
    >
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
      {isMaybe ? (
        <span className="party-attendee-maybe-badge" aria-hidden="true">
          ?
        </span>
      ) : null}
      <span className="party-attendee-tooltip" role="tooltip">
        {label}
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
