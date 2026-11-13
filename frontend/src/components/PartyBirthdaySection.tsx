import type { PartyBirthdayPerson } from "../lib/partyTime";

export default function PartyBirthdaySection({
  monthLabel,
  people,
}: {
  monthLabel: string;
  people: PartyBirthdayPerson[];
}) {
  if (people.length === 0) {
    return null;
  }

  return (
    <section className="party-birthday-section" aria-label={`Birthdays in ${monthLabel}`}>
      <div className="party-attendee-header">
        <h2>Birthdays in {monthLabel}</h2>
      </div>
      <ul className="party-birthday-list">
        {people.map((person) => (
          <li className="party-birthday-row" key={person.id}>
            <BirthdayPerson
              name={person.name}
              firstName={person.firstName}
              avatarUrl={person.avatarUrl}
              colorId={person.id}
              dateLabel={person.dateLabel}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BirthdayPerson({
  name,
  firstName,
  avatarUrl,
  colorId,
  dateLabel,
}: {
  name: string;
  firstName: string;
  avatarUrl: string | null;
  colorId: number;
  dateLabel: string;
}) {
  const initial = (firstName || name).trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="party-birthday-person">
      {avatarUrl ? (
        <img className="party-birthday-avatar" src={avatarUrl} alt="" />
      ) : (
        <span
          className="party-birthday-avatar party-birthday-avatar-fallback"
          style={{ backgroundColor: avatarColorFromUserId(colorId) }}
          aria-hidden="true"
        >
          {initial}
        </span>
      )}
      <div className="party-birthday-copy">
        <span className="party-birthday-name">{name}</span>
        <span className="party-birthday-date">{dateLabel}</span>
      </div>
    </div>
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
