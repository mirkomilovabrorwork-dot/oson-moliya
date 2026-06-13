import type { SttProvider } from "./types";
import { getEnv } from "../env";
import { audioBufferToBlob } from "./blob";

/**
 * Groq Whisper STT provider.
 * Uses whisper-large-v3 via Groq's OpenAI-compatible audio transcriptions endpoint.
 * Language is intentionally omitted so Groq auto-detects uz/ru/en.
 */
export class GroqWhisperProvider implements SttProvider {
  async transcribe(
    audio: Buffer,
    filename: string,
    _opts?: { language?: string }
  ): Promise<string> {
    const env = getEnv();
    if (!env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not set — cannot transcribe voice");
    }

    // Build multipart/form-data with native FormData + Blob (Node 18+)
    const form = new FormData();
    const blob = audioBufferToBlob(audio);
    form.append("file", blob, filename);
    form.append("model", "whisper-large-v3");
    form.append("response_format", "json");
    // Intentionally omit "language" → Groq auto-detects uz/ru/en

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
        },
        body: form,
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Groq STT error ${response.status}: ${body.slice(0, 200)}`
      );
    }

    const data = (await response.json()) as { text?: string };
    if (!data.text) {
      throw new Error("Groq STT returned no text field");
    }
    return data.text.trim();
  }
}
