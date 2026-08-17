import { PartyRecord, partyRouteIdentifier } from "./api";

export const PARTY_VENUE_ADDRESS = "1116 Rosepine Dr, Cary, NC 27519";

const partyDurationMs = 4 * 60 * 60 * 1000;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toIcsUtc(date: Date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function escapeIcsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function foldIcsLine(line: string) {
  if (line.length <= 75) {
    return line;
  }
  const parts = [line.slice(0, 75)];
  for (let index = 75; index < line.length; index += 74) {
    parts.push(` ${line.slice(index, index + 74)}`);
  }
  return parts.join("\r\n");
}

function partyWindow(party: PartyRecord) {
  const start = new Date(party.date);
  const end = new Date(start.getTime() + partyDurationMs);
  return { start, end };
}

function partyPageUrl(party: PartyRecord) {
  return `${window.location.origin}/parties/${partyRouteIdentifier(party)}`;
}

export function googleCalendarUrl(party: PartyRecord) {
  const { start, end } = partyWindow(party);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: party.label,
    dates: `${toIcsUtc(start)}/${toIcsUtc(end)}`,
    details: [party.summary.trim(), partyPageUrl(party)].filter(Boolean).join("\n\n"),
    location: PARTY_VENUE_ADDRESS,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildPartyIcs(party: PartyRecord) {
  const { start, end } = partyWindow(party);
  const url = partyPageUrl(party);
  const description = escapeIcsText([party.summary.trim(), url].filter(Boolean).join("\n\n"));
  const stamp = toIcsUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The JK House//Party Invite//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:party-${party.id}@thejkhouse.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${toIcsUtc(start)}`,
    `DTEND:${toIcsUtc(end)}`,
    foldIcsLine(`SUMMARY:${escapeIcsText(party.label)}`),
    foldIcsLine(`DESCRIPTION:${description}`),
    foldIcsLine(`LOCATION:${escapeIcsText(PARTY_VENUE_ADDRESS)}`),
    foldIcsLine(`URL:${escapeIcsText(url)}`),
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

function isAppleMobile() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isSafari() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(navigator.userAgent);
}

function clickCalendarLink(href: string, options: { download?: string; target?: string }) {
  const link = document.createElement("a");
  link.href = href;
  link.rel = "noopener";
  if (options.target) {
    link.target = options.target;
  }
  if (options.download) {
    link.download = options.download;
  }
  document.body.append(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  link.remove();
}

export function openAppleCalendar(party: PartyRecord) {
  const ics = buildPartyIcs(party);
  // Safari (iPhone, iPad, and Mac) opens Calendar when it navigates to the ICS.
  // Setting download would save a file instead of adding the event.
  if (isAppleMobile() || isSafari()) {
    window.location.assign(`data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`);
    return;
  }

  const objectUrl = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  clickCalendarLink(objectUrl, { target: "_blank" });
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);
}

export function downloadPartyCalendar(party: PartyRecord) {
  const blob = new Blob([buildPartyIcs(party)], { type: "text/calendar" });
  const objectUrl = URL.createObjectURL(blob);
  clickCalendarLink(objectUrl, { download: `${partyRouteIdentifier(party)}.ics` });
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}
