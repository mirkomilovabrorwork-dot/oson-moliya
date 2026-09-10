// Shared "when did this happen" resolver for capture paths (bot + API routes).
// The brain returns date WORDS ("today", "yesterday") or an ISO date string,
// never a value `new Date()` can parse directly.

// NOTE: the Tashkent offset (+05:00) below is deliberate — an ISO date like
// "2026-09-10" means that calendar day in Asia/Tashkent, so it must be parsed
// at that offset rather than as UTC midnight, or "today" can resolve to the
// wrong day near midnight.
export function dateStringToUtc(dateStr: string): Date {
  if (dateStr === "today" || !dateStr) return new Date();
  if (dateStr === "yesterday") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d;
  }
  const parsed = new Date(dateStr + "T00:00:00+05:00");
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** Asia/Tashkent (UTC+5, no DST) calendar date + time for an ISO timestamp. */
export function tashkentParts(iso: string) {
  const tt = new Date(new Date(iso).getTime() + 5 * 60 * 60 * 1000);
  return {
    y: tt.getUTCFullYear(),
    m: tt.getUTCMonth(),
    d: tt.getUTCDate(),
    hh: tt.getUTCHours(),
    mm: tt.getUTCMinutes(),
  };
}
