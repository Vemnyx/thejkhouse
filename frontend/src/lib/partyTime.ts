export const PARTY_TIME_ZONE = "America/New_York";

type PartyTimeParts = {
  date: string;
  hour: string;
  minute: string;
  period: "AM" | "PM";
};

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function partsMap(date: Date, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-US", options).formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }
  return map;
}

/** Convert a wall-clock date/time in America/New_York to a UTC Date. */
export function easternWallTimeToDate(
  year: number,
  month: number,
  day: number,
  hour24: number,
  minute: number,
): Date {
  const desiredAsUTC = Date.UTC(year, month - 1, day, hour24, minute, 0, 0);
  let utcMs = desiredAsUTC;

  for (let pass = 0; pass < 2; pass += 1) {
    const actual = partsMap(new Date(utcMs), {
      timeZone: PARTY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    const actualAsUTC = Date.UTC(
      Number(actual.year),
      Number(actual.month) - 1,
      Number(actual.day),
      Number(actual.hour),
      Number(actual.minute),
      Number(actual.second ?? "0"),
    );
    utcMs += desiredAsUTC - actualAsUTC;
  }

  return new Date(utcMs);
}

export function partyDateTimeToISO(value: string, hour: string, minute: string, period: string) {
  const [year, month, day] = value.split("-").map(Number);
  const baseHour = Number(hour) % 12;
  const hour24 = period === "PM" ? baseHour + 12 : baseHour;
  return easternWallTimeToDate(year, month, day, hour24, Number(minute)).toISOString();
}

export function timePartsFromISO(value: string): PartyTimeParts {
  const date = new Date(value);
  const parts = partsMap(date, {
    timeZone: PARTY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const period = (parts.dayPeriod ?? "AM").toUpperCase() === "PM" ? "PM" : "AM";
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: String(Number(parts.hour)),
    minute: pad2(Number(parts.minute)),
    period,
  };
}

export function formatPartyDateTime(value: string, options?: { dateStyle?: "full" | "long" | "medium" | "short"; timeStyle?: "full" | "long" | "medium" | "short" }) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: options?.dateStyle ?? "medium",
    timeStyle: options?.timeStyle ?? "short",
    timeZone: PARTY_TIME_ZONE,
  }).format(new Date(value));
}

export function formatPartyDateTimeParts(value: string, hour: string, minute: string, period: string) {
  if (!value) {
    return "Select a date";
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dateLabel = date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${dateLabel} at ${hour}:${minute} ${period}`;
}
