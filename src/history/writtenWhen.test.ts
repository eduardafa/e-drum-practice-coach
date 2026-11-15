import { describe, expect, it } from "vitest";
import { writtenWhen } from "./writtenWhen";

const now = Temporal.ZonedDateTime.from("2026-11-15T14:00:00-05:00[America/Toronto]");

describe("writtenWhen", () => {
  it("says today with the local time", () => {
    expect(writtenWhen("2026-11-15T18:40:00Z", now, "en-US")).toBe("today, 1:40 PM");
  });

  it("says yesterday by calendar date, not 24 hours", () => {
    // 11:30 PM yesterday in Toronto is under 24 hours ago, but still yesterday.
    expect(writtenWhen("2026-11-15T04:30:00Z", now, "en-US")).toBe("yesterday, 11:30 PM");
  });

  it("uses the drummer's time zone for the day boundary", () => {
    // 2 AM UTC on the 15th is still the evening of the 14th in Toronto.
    expect(writtenWhen("2026-11-15T02:00:00Z", now, "en-US")).toBe("yesterday, 9:00 PM");
  });

  it("gives the date once it's older", () => {
    expect(writtenWhen("2026-11-12T15:00:00Z", now, "en-US")).toBe("Nov 12");
  });

  it("adds the year for another year", () => {
    expect(writtenWhen("2025-12-30T15:00:00Z", now, "en-US")).toBe("Dec 30, 2025");
  });

  it("returns null for something that isn't a time", () => {
    expect(writtenWhen("not a date", now, "en-US")).toBeNull();
  });
});
