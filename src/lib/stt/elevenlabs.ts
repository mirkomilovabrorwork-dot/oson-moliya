import type { SttProvider } from "./types";
import { getEnv } from "../env";
import { audioBufferToBlob } from "./blob";

/**
 * ElevenLabs Scribe STT provider.
 * Uses scribe_v2 via ElevenLabs speech-to-text API.
 * Optimised for Uzbek (ISO-639-3: "uzb"); also supports Russian and English.
 *
 * Activate by setting STT_PROVIDER=elevenlabs + ELEVENLABS_API_KEY in .env.local.
 *
 * API reference: https://elevenlabs.io/docs/api-reference/speech-to-text/convert
 */

/** Maps opts.language (ISO-639-1 or short code) to ElevenLabs ISO-639-3 codes. */
function toLanguageCode(lang?: string): string {
  switch (lang) {
    case "uz":
      return "uzb";
    case "ru":
      return "rus";
    case "en":
      return "eng";
    default:
      return "uzb"; // Default to Uzbek — primary use case
  }
}

export class ElevenLabsScribeProvider implements SttProvider {
  async transcribe(
    audio: Buffer,
    filename: string,
    opts?: { language?: string }
  ): Promise<string> {
    const env = getEnv();
    if (!env.ELEVENLABS_API_KEY) {
      throw new Error(
        "ELEVENLABS_API_KEY is not set — cannot use ElevenLabs STT"
      );
    }

    const form = new FormData();
    const blob = audioBufferToBlob(audio, "audio/ogg");
    form.append("file", blob, filename);
    form.append("model_id", "scribe_v1");

    const languageCode = toLanguageCode(opts?.language);
    form.append("language_code", languageCode);

    const response = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": env.ELEVENLABS_API_KEY,
        },
        body: form,
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `ElevenLabs STT error ${response.status}: ${body.slice(0, 200)}`
      );
    }

    const data = (await response.json()) as { text?: string };
    const text = data.text?.trim();
    if (!text) {
      throw new Error("ElevenLabs STT returned no text field");
    }
    return text;
  }
}
