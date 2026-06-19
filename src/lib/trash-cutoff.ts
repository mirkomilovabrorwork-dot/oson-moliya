/** Returns a Date 30 days before now. */
export function thirtyDaysCutoff(): Date {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}
