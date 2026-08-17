import { useEffect, useRef, useState } from "react";
import { PartyRecord } from "../lib/api";
import { downloadPartyCalendar, googleCalendarUrl } from "../lib/partyCalendar";

type PartyCalendarButtonProps = {
  party: PartyRecord;
  className?: string;
  variant?: "page" | "modal";
};

export default function PartyCalendarButton({ party, className = "", variant = "page" }: PartyCalendarButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={`party-calendar-add party-calendar-add-${variant} ${className}`.trim()}
      ref={rootRef}
    >
      <button
        className={variant === "modal" ? "auth-secondary party-calendar-add-trigger" : "party-calendar-button"}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        Add to Calendar
      </button>
      {open ? (
        <div className="party-calendar-add-menu" role="menu" aria-label="Calendar options">
          <button
            className="party-calendar-add-option"
            type="button"
            role="menuitem"
            onClick={() => {
              downloadPartyCalendar(party);
              setOpen(false);
            }}
          >
            Apple, Outlook, or other
          </button>
          <a
            className="party-calendar-add-option"
            href={googleCalendarUrl(party)}
            target="_blank"
            rel="noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Google Calendar
          </a>
        </div>
      ) : null}
    </div>
  );
}
