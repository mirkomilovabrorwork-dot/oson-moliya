/**
 * Shared Tashkent date helpers — single source of truth.
 *
 * Asia/Tashkent = UTC+5.  All helpers return UTC Date objects that represent
 * the correct moment (Tashkent midnight ≡ UTC 19:00 the previous calendar day).
 */

/** Returns the current moment shifted to Asia/Tashkent (UTC+5). */
export function getTashkentNow(): Date {
  return new Date(Date.now() + 5 * 60 * 60 * 1000);
}

/**
 * Returns the UTC [start, end) boundaries of a calendar month in Tashkent.
 *
 * start = Tashkent midnight of the 1st of `month`
 * end   = Tashkent midnight of the 1st of the next month (exclusive upper bound)
 *
 * @param year  Full year (e.g. 2026)
 * @param month 1-based month (1 = January … 12 = December)
 */
export function tashkentMonthRange(
  year: number,
  month: number
): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1) - 5 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month, 1) - 5 * 60 * 60 * 1000);
  return { start, end };
}
