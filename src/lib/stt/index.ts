import type { SttProvider } from "./types";
import { GroqWhisperProvider } from "./groq";
import { OpenAiTranscribe } from "./openai";
import { ElevenLabsScribeProvider } from "./elevenlabs";
import { GeminiFlashProvider } from "./gemini";
import { getEnv } from "../env";

export type { SttProvider } from "./types";

/**
 * Returns the configured STT provider.
 * Default: Groq Whisper (STT_PROVIDER=groq).
 * - elevenlabs → ElevenLabs Scribe v2
 * - gemini     → Google Gemini 2.5 Flash (multimodal, OGG-native)
 * - openai     → OpenAI gpt-4o-transcribe
 *
 * Function (not constant) so env is read lazily — safe for `next build` where
 * env may not be available at module init.
 */
export function getSttProvider(): SttProvider {
  const env = getEnv();
  if (env.STT_PROVIDER === "elevenlabs") {
    return new ElevenLabsScribeProvider();
  }
  if (env.STT_PROVIDER === "gemini") {
    return new GeminiFlashProvider();
  }
  if (env.STT_PROVIDER === "openai") {
    return new OpenAiTranscribe();
  }
  return new GroqWhisperProvider();
}
