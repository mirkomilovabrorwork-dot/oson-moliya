import type { SttProvider } from "./types";
import { getEnv } from "../env";
import { audioBufferToBlob } from "./blob";

/**
 * Groq Whisper STT provider.
 * Uses whisper-large-v3 via Groq's OpenAI-compatible audio transcriptions endpoint.
 * When opts.language is one of "uz" | "ru" | "en", it is forwarded to Whisper to
 * prevent mis-detection (e.g. Uzbek being detected as Turkish). Otherwise omitted.
 */
export class GroqWhisperProvider implements SttProvider {
  async transcribe(
    audio: Buffer,
    filename: string,
    opts?: { language?: string }
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
    // Forward language hint when provided and valid — prevents Whisper from
    // mis-detecting Uzbek as Turkish (they are lexically close).
    if (opts?.language === "uz" || opts?.language === "ru" || opts?.language === "en") {
      form.append("language", opts.language);
    }

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
