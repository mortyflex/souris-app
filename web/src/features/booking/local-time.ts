/**
 * Times of a booking as the PROFESSIONAL's clock reads them.
 *
 * Every instant the server returns is UTC (`…Z`). It is shown in the time
 * zone the server returned with it — the Business time zone — and NEVER in
 * the browser's or the server's own zone: a customer abroad still reads the
 * salon's time. The server already labels each start (`local_time`); only an
 * end needs formatting here.
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** « 14:45 » — the wall-clock time of a UTC instant in the given time zone; undefined if unreadable. */
export function formatTimeInZone(instant: string, timeZone: string): string | undefined {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return undefined;
  try {
    return timeFormatter(timeZone).format(date);
  } catch {
    return undefined;
  }
}

/** « 14:00 – 14:45 », or the start alone when the end cannot be formatted. */
export function formatTimeRange(localStart: string, endsAt: string, timeZone: string): string {
  const end = formatTimeInZone(endsAt, timeZone);
  return end === undefined ? localStart : `${localStart} – ${end}`;
}
