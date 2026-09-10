/**
 * Guards a client-supplied `next=` redirect target against open-redirect
 * payloads (e.g. "/\evil.com", which the WHATWG URL parser resolves to
 * "https://evil.com/" even though it "starts with /").
 *
 * A safe value must:
 *   - be a plain internal path starting with a single "/" (not "//")
 *   - contain no backslash or control character (raw or percent-encoded)
 *   - resolve, against an arbitrary app origin, back to that SAME origin
 *
 * Returns the original string when safe, otherwise undefined.
 */
export function safeNextPath(next: unknown): string | undefined {
  if (typeof next !== "string" || next.length === 0) return undefined;
  if (!next.startsWith("/") || next.startsWith("//")) return undefined;
  // Backslashes and control characters are the classic bypass for the
  // startsWith("/") check -- the URL parser treats "\" like "/", and a
  // raw or percent-encoded CR/LF can smuggle a header/response split.
  // eslint-disable-next-line no-control-regex
  if (/[\\]/.test(next) || /[\x00-\x1f]/.test(next)) return undefined;
  if (/%0d|%0a|%5c/i.test(next)) return undefined;

  const base = "https://pultrack.internal.invalid";
  let resolved: URL;
  try {
    resolved = new URL(next, base);
  } catch {
    return undefined;
  }
  if (resolved.origin !== base) return undefined;

  return next;
}
