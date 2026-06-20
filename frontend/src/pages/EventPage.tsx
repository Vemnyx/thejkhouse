import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AppUser, BracketParticipant, EventDetail, EventRoundRecord, EventVoteRecord, ImageRecord, eventRouteIdentifier, getEventDetail, listEventVotes, listEvents, listImages, listUsers, reportBracketWinner, submitEventVote } from "../lib/api";

type EventCategory = {
  name: string;
  type: "individual" | "team";
};

export default function EventPage() {
  const { eventId } = useParams();
  const { appUser, firebaseUser } = useAuth();
  const [eventDetail, setEventDetail] = useState<EventDetail | null>(null);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [voteSelections, setVoteSelections] = useState<Record<string, string>>({});
  const [voting, setVoting] = useState(false);
  const [voteMessage, setVoteMessage] = useState("");
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [selectedResultCategory, setSelectedResultCategory] = useState<EventCategory | null>(null);
  const [votes, setVotes] = useState<EventVoteRecord[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [selectedContestantId, setSelectedContestantId] = useState<string | null>(null);
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [slideshowIndex, setSlideshowIndex] = useState(0);
  const [reportingRoundId, setReportingRoundId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadEvent() {
      if (!firebaseUser || !eventId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      try {
        const token = await firebaseUser.getIdToken();
        const numericEventId = Number(eventId);
        let resolvedEventId = Number.isInteger(numericEventId) && numericEventId > 0 ? numericEventId : null;
        if (!resolvedEventId) {
          const events = await listEvents(token);
          const matchedEvent = events.find((item) => eventRouteIdentifier(item) === eventId);
          if (!matchedEvent) {
            throw new Error("event not found");
          }
          resolvedEventId = matchedEvent.id;
        }
        const [detail, nextImages, nextUsers] = await Promise.all([
          getEventDetail(token, resolvedEventId),
          listImages(token),
          listUsers(token),
        ]);
        if (!cancelled) {
          setEventDetail(detail);
          setImages(nextImages);
          setUsers(nextUsers);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "failed to load event";
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadEvent();
    return () => {
      cancelled = true;
    };
  }, [firebaseUser, eventId]);

  const event = eventDetail?.event ?? null;
  const eventImages = useMemo(() => {
    if (!event) {
      return [];
    }
    return images.filter((image) => image.eventId === event.id);
  }, [event, images]);
  const costumeContestEntries = useMemo(() => {
    if (!eventDetail) {
      return [];
    }

    const teamEntries = eventDetail.teams.flatMap((team) => {
      const image = eventImages.find((item) => item.teamId === team.id);
      return image ? [{
        id: `team-${team.id}-${image.id}`,
        costumeName: team.name,
        userIds: team.userIds,
        type: "team" as const,
        image,
      }] : [];
    });
    const userEntries = eventDetail.users
      .filter((eventUser) => eventUser.contestant && eventUserHasCostume(eventUser.metadata))
      .flatMap((eventUser) => {
        const image = eventImages.find((item) => item.userIds.includes(eventUser.userId) && item.teamId === null);
        return image ? [{
          id: `user-${eventUser.userId}-${image.id}`,
          costumeName: eventUserCostume(eventUser.metadata),
          userIds: [eventUser.userId],
          type: "individual" as const,
          image,
        }] : [];
      });
    return [...teamEntries, ...userEntries];
  }, [eventDetail, eventImages]);

  useEffect(() => {
    if (!slideshowOpen || costumeContestEntries.length === 0) {
      return undefined;
    }
    const interval = window.setTimeout(() => {
      setSlideshowIndex((current) => (current + 1) % costumeContestEntries.length);
    }, 5000);
    return () => window.clearTimeout(interval);
  }, [slideshowOpen, slideshowIndex, costumeContestEntries.length]);

  const showCostumeContestGrid = event?.type === "0" && (isActiveEvent(event) || Boolean(event.completedAt));
  const showBracket = event?.type === "1";
  const categories = event ? eventMetadataCategories(event.metadata) : [];
  const selectedWinner = selectedResultCategory
    ? computeWinner(selectedResultCategory, votes, costumeContestEntries)
    : null;
  const selectedContestant = selectedContestantId
    ? costumeContestEntries.find((entry) => entry.id === selectedContestantId) ?? null
    : null;
  const slideshowEntry = slideshowOpen && costumeContestEntries.length > 0
    ? costumeContestEntries[slideshowIndex % costumeContestEntries.length]
    : null;

  const openResults = async () => {
    if (!firebaseUser || !event) {
      return;
    }
    setError("");
    setSelectedResultCategory(null);
    setResultsModalOpen(true);
    setLoadingResults(true);
    try {
      const token = await firebaseUser.getIdToken();
      const nextVotes = await listEventVotes(token, event.id);
      setVotes(nextVotes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to load results";
      setError(message);
    } finally {
      setLoadingResults(false);
    }
  };

  const openSlideshow = () => {
    setSlideshowIndex(0);
    setSlideshowOpen(true);
  };

  const advanceSlideshow = () => {
    if (costumeContestEntries.length === 0) {
      return;
    }
    setSlideshowIndex((current) => (current + 1) % costumeContestEntries.length);
  };

  const rewindSlideshow = () => {
    if (costumeContestEntries.length === 0) {
      return;
    }
    setSlideshowIndex((current) => (current - 1 + costumeContestEntries.length) % costumeContestEntries.length);
  };

  const submitVote = async (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    if (!firebaseUser || !event) {
      return;
    }
    setError("");
    setVoteMessage("");
    setVoting(true);
    try {
      const token = await firebaseUser.getIdToken();
      await submitEventVote(token, event.id, {
        votes: categories.map((category) => ({
          category: category.name,
          type: category.type,
          contestant: voteSelections[category.name] ?? "",
        })),
      });
      setVoteMessage("Vote saved.");
      setVoteModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to save vote";
      setError(message);
    } finally {
      setVoting(false);
    }
  };

  const submitBracketReport = async (round: EventRoundRecord, winnerKey: string) => {
    if (!firebaseUser || !event) {
      return;
    }
    setError("");
    setReportingRoundId(round.id);
    try {
      const token = await firebaseUser.getIdToken();
      const detail = await reportBracketWinner(token, event.id, round.id, winnerKey);
      setEventDetail(detail);
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed to report winner";
      setError(message);
    } finally {
      setReportingRoundId(null);
    }
  };

  return (
    <main className="page app-shell-page">
      <div className="page-vignette" aria-hidden="true" />
      <section className="gothic-card app-shell-card event-detail-card">
        <div className="card-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
        </div>
        {!showCostumeContestGrid && !showBracket ? (
          <Link className="auth-secondary back-text-link event-detail-back" to="/events">
            Back to Events
          </Link>
        ) : null}
        {loading ? (
          <p className="loading-text">Loading event...</p>
        ) : error ? (
          <p className="auth-error">{error}</p>
        ) : showCostumeContestGrid ? (
          <section className="event-contest-preview">
            <div className="event-title-row">
              <Link className="auth-secondary back-text-link event-detail-back" to="/events">
                Back to Events
              </Link>
              <div>
                <p className="eyebrow">Costume Contest</p>
                <h1>{event.label}</h1>
              </div>
            </div>
            <div className="event-action-row">
              <button className="auth-submit event-vote-button event-slideshow-button" type="button" onClick={openSlideshow} disabled={costumeContestEntries.length === 0}>
                Slide Show
              </button>
              <button className="auth-submit event-vote-button" type="button" onClick={() => setVoteModalOpen(true)} disabled={Boolean(event.completedAt) || costumeContestEntries.length === 0 || categories.length === 0}>
                Vote Now
              </button>
              <button className="auth-submit event-vote-button" type="button" onClick={() => void openResults()} disabled={!event.completedAt || costumeContestEntries.length === 0 || categories.length === 0}>
                Results
              </button>
            </div>
            {voteMessage ? <p className="host-success">{voteMessage}</p> : null}
            {costumeContestEntries.length > 0 ? (
              <div className="event-contest-grid" aria-label="Costume contest entries">
                {costumeContestEntries.map((entry) => (
                  <button className="event-contest-card" type="button" key={entry.id} onClick={() => setSelectedContestantId(entry.id)}>
                    <img src={entry.image.imageUrl} alt={entry.costumeName} />
                    <h2>{entry.costumeName}</h2>
                    <p>{entry.userIds.map((userId) => userDisplayName(users, userId)).join(" + ")}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="dashboard-copy">No contestant photos yet.</p>
            )}
          </section>
        ) : showBracket && eventDetail ? (
          <section className="event-contest-preview">
            <div className="event-title-row">
              <Link className="auth-secondary back-text-link event-detail-back" to="/events">
                Back to Events
              </Link>
              <div>
                <p className="eyebrow">Bracket</p>
                <h1>{event.label}</h1>
              </div>
            </div>
            <BracketEventView
              appUserId={appUser?.id ?? null}
              eventDetail={eventDetail}
              reportingRoundId={reportingRoundId}
              onReport={(round, winnerKey) => void submitBracketReport(round, winnerKey)}
            />
          </section>
        ) : (
          <div className="under-construction">
            <p>No Event Data Yet</p>
          </div>
        )}
      </section>
      {voteModalOpen && event ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setVoteModalOpen(false)}>
          <section className="upload-modal gothic-card" role="dialog" aria-modal="true" onMouseDown={(modalEvent) => modalEvent.stopPropagation()}>
            <div className="modal-header">
              <h2 className="host-section-title">Vote Now</h2>
              <button className="modal-close" type="button" onClick={() => setVoteModalOpen(false)} aria-label="Close voting modal">
                x
              </button>
            </div>
            <form className="host-email-form" onSubmit={submitVote}>
              {categories.map((category) => {
                const entries = costumeContestEntries.filter((entry) => entry.type === category.type);
                const selectedEntry = entries.find((entry) => entry.id === voteSelections[category.name]);
                return (
                  <div className="vote-choice-row" key={`${category.name}-${category.type}`}>
                    <label className="auth-field vote-choice-field">
                      <span>{category.name}</span>
                      <select
                        value={voteSelections[category.name] ?? ""}
                        onChange={(changeEvent) => setVoteSelections((current) => ({
                          ...current,
                          [category.name]: changeEvent.target.value,
                        }))}
                        required
                      >
                        <option value="">Select a contestant</option>
                        {entries.map((entry) => (
                          <option value={entry.id} key={entry.id}>
                            {contestantOptionLabel(entry, users)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="vote-choice-preview" aria-label={selectedEntry ? `${selectedEntry.costumeName} preview` : `${category.name} preview`}>
                      {selectedEntry ? <img src={selectedEntry.image.imageUrl} alt={selectedEntry.costumeName} /> : <span>No pick</span>}
                    </div>
                  </div>
              );})}
              {error ? <p className="auth-error">{error}</p> : null}
              <button className="auth-submit vote-submit-button" type="submit" disabled={voting || categories.some((category) => !voteSelections[category.name])}>
                {voting ? "Saving..." : "Submit Vote"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
      {resultsModalOpen && event ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setResultsModalOpen(false)}>
          <section className={selectedResultCategory ? "upload-modal gothic-card results-modal victory-reveal" : "upload-modal gothic-card results-modal"} role="dialog" aria-modal="true" onMouseDown={(modalEvent) => modalEvent.stopPropagation()}>
            {selectedResultCategory ? (
              <button className="auth-secondary back-text-link results-back-button" type="button" onClick={() => setSelectedResultCategory(null)}>
                Back to Categories
              </button>
            ) : null}
            {loadingResults ? (
              <p className="loading-text">Loading results...</p>
            ) : selectedResultCategory && selectedWinner ? (
              <div className="victory-card">
                <div className="victory-burst" aria-hidden="true" />
                <p className="eyebrow">{selectedResultCategory.name} Winner</p>
                <h3>{selectedWinner.entry.userIds.map((userId) => userDisplayName(users, userId)).join(" + ")}</h3>
                <p className="victory-costume">{selectedWinner.entry.costumeName}</p>
                <img src={selectedWinner.entry.image.imageUrl} alt={selectedWinner.entry.costumeName} />
                <p className="victory-votes">{selectedWinner.votes} vote{selectedWinner.votes === 1 ? "" : "s"}</p>
              </div>
            ) : selectedResultCategory ? (
              <div className="victory-card">
                <p className="dashboard-copy">No votes for this category yet.</p>
              </div>
            ) : (
              <div className="result-category-buttons">
                {categories.map((category) => (
                  <button className="auth-submit event-vote-button" type="button" key={`${category.name}-${category.type}`} onClick={() => setSelectedResultCategory(category)}>
                    {category.name}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
      {slideshowEntry ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSlideshowOpen(false)}>
          <section className="upload-modal gothic-card contestant-presentation-modal contestant-detail-modal slideshow-modal" role="dialog" aria-modal="true" onMouseDown={(modalEvent) => modalEvent.stopPropagation()}>
            <button className="presentation-close" type="button" onClick={() => setSlideshowOpen(false)} aria-label="Close slideshow modal">
              x
            </button>
            <article className="contestant-presentation-card slideshow-card" key={slideshowEntry.id}>
              <div className="slideshow-image-frame">
                <img src={slideshowEntry.image.imageUrl} alt={slideshowEntry.costumeName} />
                <button className="slideshow-tap-zone slideshow-tap-previous" type="button" onClick={rewindSlideshow} aria-label="Show previous contestant" />
                <button className="slideshow-tap-zone slideshow-tap-next" type="button" onClick={advanceSlideshow} aria-label="Show next contestant" />
              </div>
              <div>
                <h3>{slideshowEntry.costumeName}</h3>
                <p className="contestant-wearers">
                  By {slideshowEntry.userIds.map((userId) => userDisplayName(users, userId)).join(" + ")}
                </p>
              </div>
            </article>
          </section>
        </div>
      ) : null}
      {selectedContestant ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedContestantId(null)}>
          <section className="upload-modal gothic-card contestant-presentation-modal contestant-detail-modal" role="dialog" aria-modal="true" onMouseDown={(modalEvent) => modalEvent.stopPropagation()}>
            <button className="presentation-close" type="button" onClick={() => setSelectedContestantId(null)} aria-label="Close contestant modal">
              x
            </button>
            <article className="contestant-presentation-card">
              <img src={selectedContestant.image.imageUrl} alt={selectedContestant.costumeName} />
              <div>
                <h3>{selectedContestant.costumeName}</h3>
                <p className="contestant-wearers">
                  By {selectedContestant.userIds.map((userId) => userDisplayName(users, userId)).join(" + ")}
                </p>
              </div>
            </article>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function BracketEventView({
  appUserId,
  eventDetail,
  reportingRoundId,
  onReport,
}: {
  appUserId: number | null;
  eventDetail: EventDetail;
  reportingRoundId: number | null;
  onReport: (round: EventRoundRecord, winnerKey: string) => void;
}) {
  const rounds = eventDetail.rounds;
  if (rounds.length === 0) {
    return <p className="dashboard-copy">Bracket has not started yet.</p>;
  }
  const activeRounds = rounds.filter((round) => !round.completedAt);
  const userRound = appUserId ? activeRounds.find((round) => participantHasUser(round.participantOne, appUserId) || participantHasUser(round.participantTwo, appUserId)) : null;
  const roundNumbers = Array.from(new Set(rounds.map((round) => round.roundNumber)));
  const champion = rounds.find((round) => round.winner && round.roundNumber === Math.max(...roundNumbers) && round.completedAt)?.winner ?? null;

  return (
    <div className="bracket-event-view">
      {champion ? null : userRound ? (
        <section className="bracket-user-matchup">
          <p className="eyebrow">Your Matchup</p>
          <h2>{participantLabel(userRound.participantOne)} vs {participantLabel(userRound.participantTwo)}</h2>
          <div className="event-action-row">
            {[userRound.participantOne, userRound.participantTwo].filter((participant): participant is BracketParticipant => Boolean(participant)).map((participant) => (
              <button className="auth-submit event-vote-button" type="button" key={participant.key} onClick={() => onReport(userRound, participant.key)} disabled={reportingRoundId === userRound.id}>
                {reportingRoundId === userRound.id ? "Reporting..." : `${participant.label} Won`}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <p className="dashboard-copy">You are not playing in the current round.</p>
      )}
      <BracketVisual rounds={rounds} />
    </div>
  );
}

function BracketVisual({ rounds }: { rounds: EventRoundRecord[] }) {
  const totalRounds = bracketTotalRounds(rounds);
  const sideRoundNumbers = Array.from({ length: Math.max(totalRounds - 1, 0) }, (_, index) => index + 1);
  const finalRoundNumber = totalRounds;
  const finalRounds = rounds.filter((round) => round.roundNumber === finalRoundNumber);
  const champion = finalRounds.find((round) => round.winner && round.completedAt)?.winner ?? null;
  const firstRoundMatchCount = rounds.filter((round) => round.roundNumber === 1).length;
  return (
    <div className="bracket-visual-stack">
      {champion ? (
        <section className="bracket-winner-banner bracket-winner-banner-compact">
          <p className="eyebrow">Winner</p>
          <h2>{champion.label}</h2>
        </section>
      ) : null}
      <div className="bracket-visual-scroll">
        <div className="tournament-bracket" style={{ gridTemplateColumns: `${sideRoundNumbers.map(() => "minmax(12rem, 1fr)").join(" ")} minmax(13rem, 0.8fr) ${sideRoundNumbers.map(() => "minmax(12rem, 1fr)").join(" ")}` }}>
          <div className="bracket-side bracket-side-left">
            {sideRoundNumbers.map((roundNumber) => {
              const { left } = splitRoundMatches(rounds.filter((round) => round.roundNumber === roundNumber));
              return <BracketRoundColumn key={`left-${roundNumber}`} rounds={left} placeholderCount={bracketSidePlaceholderCount(firstRoundMatchCount, roundNumber)} title={roundTitle(roundNumber, totalRounds)} />;
            })}
          </div>
          <section className="bracket-final-column">
            <h3>Final</h3>
            {finalRounds.length > 0 ? finalRounds.map((round) => <BracketMatchCard round={round} key={round.id} />) : (
              <article className="bracket-match-card">
                <span className="bracket-participant-node">Left winner</span>
                <span className="bracket-participant-node">Right winner</span>
              </article>
            )}
          </section>
          <div className="bracket-side bracket-side-right">
            {[...sideRoundNumbers].reverse().map((roundNumber) => {
              const { right } = splitRoundMatches(rounds.filter((round) => round.roundNumber === roundNumber));
              return <BracketRoundColumn key={`right-${roundNumber}`} rounds={right} placeholderCount={bracketSidePlaceholderCount(firstRoundMatchCount, roundNumber)} title={roundTitle(roundNumber, totalRounds)} />;
            })}
          </div>
        </div>
      </div>  
    </div>
  );
}

function BracketRoundColumn({ rounds, title, placeholderCount }: { rounds: EventRoundRecord[]; title: string; placeholderCount: number }) {
  return (
    <section className="bracket-round-column">
      <h3>{title}</h3>
      {rounds.length > 0
        ? rounds.map((round) => <BracketMatchCard round={round} key={round.id} />)
        : Array.from({ length: placeholderCount }, (_, index) => (
          <article className="bracket-match-card" key={`placeholder-${index}`}>
            <span className="bracket-participant-node">Winner</span>
          </article>
        ))}
    </section>
  );
}

function BracketMatchCard({ round }: { round: EventRoundRecord }) {
  return (
    <article className="bracket-match-card">
      <span className={round.winner?.key === round.participantOne?.key ? "bracket-participant-node bracket-winner" : "bracket-participant-node"}>{participantLabel(round.participantOne)}</span>
      <span className={round.winner?.key === round.participantTwo?.key ? "bracket-participant-node bracket-winner" : "bracket-participant-node"}>{participantLabel(round.participantTwo)}</span>
      <small>{round.completedAt ? "Complete" : "In progress"}</small>
    </article>
  );
}

function bracketTotalRounds(rounds: EventRoundRecord[]) {
  const firstRoundMatchCount = rounds.filter((round) => round.roundNumber === 1).length;
  return Math.max(1, Math.ceil(Math.log2(Math.max(firstRoundMatchCount * 2, 2))));
}

function bracketSidePlaceholderCount(firstRoundMatchCount: number, roundNumber: number) {
  if (roundNumber <= 1) {
    return 0;
  }
  return Math.max(1, Math.floor(firstRoundMatchCount / 2 ** roundNumber));
}

function splitRoundMatches<T>(rounds: T[]) {
  const midpoint = Math.ceil(rounds.length / 2);
  return {
    left: rounds.slice(0, midpoint),
    right: rounds.slice(midpoint),
  };
}

function splitBracketItems<T>(items: T[]) {
  const midpoint = Math.ceil(items.length / 2);
  return {
    left: items.slice(0, midpoint),
    right: items.slice(midpoint),
  };
}

function BracketConnectorOverlay({ roundCounts }: { roundCounts: number[] }) {
  return (
    <svg className="bracket-connector-overlay" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
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

function roundTitle(roundNumber: number, totalRounds: number) {
  if (roundNumber === totalRounds) {
    return "Final";
  }
  if (roundNumber === totalRounds - 1) {
    return "Semifinal";
  }
  return `Round ${roundNumber}`;
}

function participantLabel(participant: BracketParticipant | null) {
  return participant?.label ?? "TBD";
}

function participantHasUser(participant: BracketParticipant | null, userId: number) {
  return participant?.userIds.includes(userId) ?? false;
}

function isActiveEvent(event: EventDetail["event"]) {
  if (!event.startDate || event.completedAt) {
    return false;
  }
  const now = Date.now();
  const start = new Date(event.startDate).getTime();
  const end = event.endDate ? new Date(event.endDate).getTime() : null;
  return start <= now && (end === null || end > now);
}

function eventUserCostume(metadata: Record<string, unknown>) {
  const costume = metadata.costume;
  return typeof costume === "string" && costume.trim() ? costume : "Contestant";
}

function eventUserHasCostume(metadata: Record<string, unknown>) {
  const costume = metadata.costume;
  return typeof costume === "string" && costume.trim().length > 0;
}

function userDisplayName(users: AppUser[], userId: number) {
  const user = users.find((item) => item.id === userId);
  return user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : `User #${userId}`;
}

function contestantOptionLabel(
  entry: {
    costumeName: string;
    userIds: number[];
  },
  users: AppUser[],
) {
  const wearerNames = entry.userIds.map((userId) => userDisplayName(users, userId)).join(" + ");
  return wearerNames ? `${entry.costumeName} - ${wearerNames}` : entry.costumeName;
}

function computeWinner(
  category: EventCategory,
  votes: EventVoteRecord[],
  entries: Array<{
    id: string;
    costumeName: string;
    userIds: number[];
    type: "individual" | "team";
    image: ImageRecord;
  }>,
) {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    const voteItems = voteMetadataItems(vote.metadata);
    for (const item of voteItems) {
      if (item.category === category.name && item.type === category.type && item.contestant) {
        counts.set(item.contestant, (counts.get(item.contestant) ?? 0) + 1);
      }
    }
  }
  let winner: { entry: (typeof entries)[number]; votes: number } | null = null;
  for (const entry of entries.filter((item) => item.type === category.type)) {
    const count = counts.get(entry.id) ?? 0;
    if (!winner || count > winner.votes) {
      winner = { entry, votes: count };
    }
  }
  return winner && winner.votes > 0 ? winner : null;
}

function voteMetadataItems(metadata: Record<string, unknown>) {
  const votes = metadata.votes;
  if (!Array.isArray(votes)) {
    return [];
  }
  return votes.flatMap((item): Array<{ category: string; type: "individual" | "team"; contestant: string }> => {
    if (!item || typeof item !== "object") {
      return [];
    }
    const vote = item as { category?: unknown; type?: unknown; contestant?: unknown };
    if (typeof vote.category !== "string" || typeof vote.contestant !== "string") {
      return [];
    }
    return [{
      category: vote.category,
      type: vote.type === "team" ? "team" : "individual",
      contestant: vote.contestant,
    }];
  });
}

function eventMetadataCategories(metadata: Record<string, unknown>): EventCategory[] {
  const categories = metadata.categories;
  if (!Array.isArray(categories)) {
    return [];
  }
  return categories.flatMap((item): EventCategory[] => {
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
