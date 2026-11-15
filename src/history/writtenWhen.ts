/**
 * When a set of tips was written, said the way a person would: "today,
 * 1:40 PM", "yesterday, 9:05 AM", then "Nov 12" (and "Nov 12, 2025" once it's
 * from another year). Days are calendar dates in the drummer's own time zone,
 * like streaks, not 24-hour blocks.
 */
export function writtenWhen(createdAt: string, now: Temporal.ZonedDateTime, locale?: string): string | null {
  let at: Temporal.ZonedDateTime;
  try {
    at = Temporal.Instant.from(createdAt).toZonedDateTimeISO(now.timeZoneId);
  } catch {
    return null;
  }
  const days = now.toPlainDate().since(at.toPlainDate(), { largestUnit: "days" }).days;
  const time = at.toPlainTime().toLocaleString(locale, { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `today, ${time}`;
  if (days === 1) return `yesterday, ${time}`;
  const sameYear = at.year === now.year;
  return at
    .toPlainDate()
    .toLocaleString(locale, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
