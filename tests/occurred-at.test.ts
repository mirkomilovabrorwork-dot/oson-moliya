import { describe, it, expect } from "vitest";
import { dateStringToUtc } from "../src/lib/capture/occurred-at";

describe("dateStringToUtc", () => {
  it('"today" -> a valid recent date', () => {
    const d = dateStringToUtc("today");
    expect(isNaN(d.getTime())).toBe(false);
    expect(Math.abs(Date.now() - d.getTime())).toBeLessThan(5000);
  });

  it('"" -> a valid recent date', () => {
    const d = dateStringToUtc("");
    expect(isNaN(d.getTime())).toBe(false);
    expect(Math.abs(Date.now() - d.getTime())).toBeLessThan(5000);
  });

  it('"yesterday" -> ~24h earlier', () => {
    const d = dateStringToUtc("yesterday");
    const diff = Date.now() - d.getTime();
    expect(diff).toBeGreaterThan(23.9 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(24.1 * 60 * 60 * 1000);
  });

  it('"2026-09-10" parses at the Tashkent offset', () => {
    const d = dateStringToUtc("2026-09-10");
    expect(d.toISOString()).toBe("2026-09-09T19:00:00.000Z");
  });

  it('garbage falls back to a valid date, not Invalid Date', () => {
    const d = dateStringToUtc("not-a-date");
    expect(isNaN(d.getTime())).toBe(false);
    expect(Math.abs(Date.now() - d.getTime())).toBeLessThan(5000);
  });
});
