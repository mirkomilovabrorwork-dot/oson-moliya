import type { SttProvider } from "./types";
import { GroqWhisperProvider } from "./groq";
import { OpenAiTranscribe } from "./openai";
import { ElevenLabsScribeProvider } from "./elevenlabs";
import { getEnv } from "../env";

export type { SttProvider } from "./types";

/**
 * Returns the configured STT provider.
 * Default: Groq Whisper (STT_PROVIDER=groq).
 * Set STT_PROVIDER=openai to use OpenAI gpt-4o-transcribe instead.
 * Set STT_PROVIDER=elevenlabs to use ElevenLabs Scribe v2 (better Uzbek accuracy).
 *
 * This is a function (not a singleton constant) so that the env is read lazily
 * — safe for `next build` where env vars may not be available at module init.
 */
export function getSttProvider(): SttProvider {
  const env = getEnv();
  if (env.STT_PROVIDER === "openai") {
    return new OpenAiTranscribe();
  }
  if (env.STT_PROVIDER === "elevenlabs") {
    return new ElevenLabsScribeProvider();
  }
  return new GroqWhisperProvider();
}
