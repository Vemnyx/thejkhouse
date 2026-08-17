import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PartyRecord } from "../lib/api";
import { downloadPartyCalendar, googleCalendarUrl } from "../lib/partyCalendar";

type PartyCalendarButtonProps = {
  party: PartyRecord;
  className?: string;
  variant?: "page" | "modal";
};

export default function PartyCalendarButton({ party, className = "", variant = "page" }: PartyCalendarButtonProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      return undefined;
    }

    const placeMenu = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const gap = 8;
      if (variant === "modal") {
        setMenuStyle({
          top: rect.bottom + gap,
          left: rect.left,
          width: rect.width,
        });
        return;
      }

      setMenuStyle({
        top: rect.bottom + gap,
        right: window.innerWidth - rect.right,
        minWidth: Math.max(rect.width, 232),
      });
    };

    placeMenu();
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open, variant]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
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

  const addIcsCalendar = () => {
    downloadPartyCalendar(party);
    setOpen(false);
  };

  const menu = open
    ? createPortal(
        <div
          className="party-calendar-add-menu"
          role="menu"
          aria-label="Calendar options"
          ref={menuRef}
          style={menuStyle}
        >
          {["Apple Calendar", "Outlook", "Other"].map((label) => (
            <button
              className="party-calendar-add-option"
              key={label}
              type="button"
              role="menuitem"
              onClick={addIcsCalendar}
            >
              {label}
            </button>
          ))}
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
        </div>,
        document.body,
      )
    : null;

  return (
    <div
      className={`party-calendar-add party-calendar-add-${variant}${open ? " is-open" : ""} ${className}`.trim()}
      ref={rootRef}
    >
      <button
        className={variant === "modal" ? "auth-secondary party-calendar-add-trigger" : "party-calendar-button"}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        ref={triggerRef}
        onClick={() => setOpen((current) => !current)}
      >
        Add to Calendar
      </button>
      {menu}
    </div>
  );
}
