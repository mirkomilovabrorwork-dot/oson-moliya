/**
 * The ONE place that turns a money field the user typed into the digits-only
 * string the API accepts.
 *
 * Why this exists: every form normalized its own amount, and they did it
 * DIFFERENTLY. The debts payment modal validated with `.replace(/\D/g,"")` (all
 * non-digits removed) but SENT `.replace(/\s/g,"")` (only whitespace removed),
 * so "5,000,000" passed the client check and was then rejected by the server's
 * `^[1-9]\d*$` guard — the save silently failed.
 *
 * DESIGN RULE — normalize, never reinterpret. Stripping every non-digit is the
 * obvious implementation and it is WRONG for money: it turns "-500000" into
 * 500000 (sign flipped) and "12.50" into 1250 (100x). Both used to be loud
 * server errors; silently writing a different number is far worse than
 * refusing. So anything this function cannot read as an unambiguous whole
 * amount returns "" — the caller sends "", the server rejects it, and the user
 * sees the existing error instead of a wrong balance.
 *
 * Accepted:
 *   "5000000"       plain digits
 *   "5 000 000"     space / NBSP / narrow-NBSP grouping (what this app renders)
 *   "5'000'000"     apostrophe grouping
 *   "5,000,000"     comma grouping — every group exactly 3 digits
 *   "5.000.000"     dot grouping    — every group exactly 3 digits
 * Rejected (returns ""):
 *   "-500000"       negative — amounts here are always positive magnitudes
 *   "12.50"         decimal — this app stores whole so'm, and a 2-digit tail
 *                   is a decimal, not a grouping
 *   "abc", ""       nothing readable at all
 *
 * NOTE ON ZERO: "0" normalizes to "0", NOT to "". Zero is a legal opening
 * balance for an account (`^\d+$`) even though it is not a legal debt or
 * payment amount (`^[1-9]\d*$`). Deciding that here would be reinterpreting;
 * each call site's server rule already rejects zero where zero is wrong, and
 * that rejection is visible. (Collapsing "0" to "" made renaming any
 * zero-balance account impossible — caught in blind review.)
 */

/** Separators this app itself renders inside a number. */
const LAYOUT_SEPARATORS = /[\s   ']/g;

/** A number written with , or . as thousands grouping: 5,000,000 / 5.000.000 */
const GROUPED = /^\d{1,3}([.,]\d{3})+$/;

export function toAmountDigits(raw: string | null | undefined): string {
  if (raw == null) return "";

  const trimmed = raw.trim();
  if (trimmed === "") return "";

  // A minus anywhere means the user meant a negative amount. Never silently
  // drop it — these fields are positive magnitudes and the caller must fail.
  if (trimmed.includes("-") || trimmed.includes("−")) return "";

  // Drop only the separators this app displays; never digits, never signs.
  const compact = trimmed.replace(LAYOUT_SEPARATORS, "");

  let digits: string;
  if (/^\d+$/.test(compact)) {
    digits = compact;
  } else if (GROUPED.test(compact)) {
    // Unambiguous thousands grouping — safe to remove the separators.
    digits = compact.replace(/[.,]/g, "");
  } else {
    // Decimals, letters, stray punctuation: unreadable as a whole amount.
    return "";
  }

  // Strip leading zeros ("007" → "7") so the value matches ^[1-9]\d*$ where
  // that rule applies — but keep a single "0" for an all-zero input, because
  // zero is a legal opening balance (see NOTE ON ZERO above).
  const stripped = digits.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

/**
 * Same normalization, as a BigInt, for client-side comparisons.
 * Returns 0n when there is no usable amount — callers must reject 0n
 * themselves; this function never throws on bad input.
 */
export function toAmountBigInt(raw: string | null | undefined): bigint {
  const digits = toAmountDigits(raw);
  return digits === "" ? 0n : BigInt(digits);
}
