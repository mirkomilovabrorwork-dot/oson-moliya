import type { NextConfig } from "next";

/**
 * Baseline security headers.
 *
 * Applied to every route. `source: "/:path*"` is the documented catch-all form,
 * and Next applies headers BEFORE the filesystem, so this also covers /public
 * and static assets. Harmless on API routes: Telegram's webhook and Vercel's
 * cron only read the status code.
 *
 * Two headers are deliberately ABSENT — both omissions are load-bearing:
 *
 * 1. Strict-Transport-Security. Vercel already injects a stronger one than we
 *    would write (max-age=63072000; includeSubDomains; preload), and vercel.app
 *    is on the browser preload list regardless. Setting our own could only
 *    weaken it.
 *
 * 2. X-Frame-Options. This app is a Telegram Mini App (scripts/set-menu.ts
 *    registers it as the bot's web_app menu button), and the Telegram *web*
 *    client renders it inside an iframe. DENY would block that everywhere and
 *    SAMEORIGIN would block it too, since the ancestor is telegram.org and not
 *    us. XFO has no working cross-origin allowlist — ALLOW-FROM is obsolete and
 *    unsupported. CSP frame-ancestors below is the directive that CAN express
 *    one, so it carries the clickjacking protection alone. Do not "helpfully"
 *    add XFO back: some Safari builds enforce BOTH headers rather than letting
 *    frame-ancestors win, which would blank the Mini App in exactly the client
 *    this policy exists to keep working.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    // Denies only features this app never uses. Verified: the dashboard calls no
    // getUserMedia/MediaRecorder/geolocation — voice is captured inside Telegram
    // and transcribed server-side — so camera/microphone are safe to deny here.
    // Non-Chromium browsers log console *warnings* for tokens they don't know
    // (browsing-topics, idle-detection). Those warnings are expected, not a bug.
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), " +
      "serial=(), bluetooth=(), midi=(), idle-detection=(), browsing-topics=()",
  },
  {
    // Clickjacking protection. frame-ancestors only — a full content policy
    // (script-src/style-src) is a separate change: it needs nonces threaded
    // through proxy.ts to avoid 'unsafe-inline', which would buy little.
    // The wildcard already covers web.telegram.org and the legacy webk/webz
    // clients; the explicit entry is kept to document the origin that matters.
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
  },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
