import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  GROQ_API_KEY: z.string().optional(),
  ELEVENLABS_API_KEY: z.string().optional(),
  STT_PROVIDER: z.string().default("groq"),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  APP_URL: z.string().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16).optional(),
  /** Local dev only — bypasses Telegram magic-link auth for headless QA.
   *  BLOCKED at startup when NODE_ENV=production. */
  ALLOW_INSECURE_DEV: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * HARD PRODUCTION BLOCK — called once at startup (and lazily on first getEnv()).
 * Throws if ALLOW_INSECURE_DEV=1 is set while NODE_ENV=production, making the
 * dev bypass impossible to activate in production even by accident.
 */
export function assertInsecureDevBlocked(): void {
  if (
    process.env.ALLOW_INSECURE_DEV === "1" &&
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "FATAL: ALLOW_INSECURE_DEV=1 is not allowed in production. " +
        "Remove the variable from your production environment and redeploy."
    );
  }
}

/**
 * Lazy env getter — parses process.env only on first call (never at import time).
 * This allows next build to succeed without real env vars.
 */
export function getEnv(): Env {
  if (_env) return _env;
  assertInsecureDevBlocked();
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.format());
    throw new Error("Invalid environment variables — check your .env.local");
  }
  _env = result.data;
  return _env;
}
