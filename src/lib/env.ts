import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  GROQ_API_KEY: z.string().optional(),
  STT_PROVIDER: z.string().default("groq"),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1),
  APP_URL: z.string().default("http://localhost:3000"),
  AUTH_SECRET: z.string().min(16),
});

type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Lazy env getter — parses process.env only on first call (never at import time).
 * This allows next build to succeed without real env vars.
 */
export function getEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:", result.error.format());
    throw new Error("Invalid environment variables — check your .env.local");
  }
  _env = result.data;
  return _env;
}
