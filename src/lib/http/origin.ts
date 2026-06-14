/**
 * Same-origin guard for mutating API routes (P0-E R6).
 *
 * Rejects requests whose Origin (or Referer host) does not match the
 * configured APP_URL host. Returns 403 when the check fails.
 *
 * Telegram WebView always sends the Mini App's own origin so it is
 * unaffected. When APP_URL is not configured (localhost dev) the guard
 * is skipped so local development is not broken.
 */
export function assertSameOrigin(request: Request): Response | null {
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    // No APP_URL configured — skip guard (local dev)
    return null;
  }

  let appHost: string;
  try {
    appHost = new URL(appUrl).host;
  } catch {
    // Malformed APP_URL — skip guard rather than block everything
    return null;
  }

  // Try Origin header first
  const originHeader = request.headers.get("origin");
  if (originHeader) {
    try {
      const originHost = new URL(originHeader).host;
      if (originHost === appHost) return null; // OK
    } catch {
      // Malformed origin — fall through to Referer
    }
  }

  // Fall back to Referer header
  const refererHeader = request.headers.get("referer");
  if (refererHeader) {
    try {
      const refererHost = new URL(refererHeader).host;
      if (refererHost === appHost) return null; // OK
    } catch {
      // Malformed referer — fall through to rejection
    }
  }

  // No valid same-origin header found
  return Response.json({ error: "Forbidden" }, { status: 403 });
}
