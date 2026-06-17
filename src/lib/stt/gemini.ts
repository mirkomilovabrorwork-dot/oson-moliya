import type { SttProvider } from "./types";
import { getEnv } from "../env";

/**
 * Google Gemini 2.5 Flash STT provider.
 * Uses multimodal generateContent with inline audio (base64).
 * Supports OGG/Opus natively — ideal for Telegram voice messages.
 *
 * Activate by setting STT_PROVIDER=gemini + GEMINI_API_KEY in .env.local.
 *
 * API reference: https://ai.google.dev/api/generate-content
 */

/** Derive MIME type from filename extension. Default to audio/ogg (Telegram voice). */
function mimeFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "ogg":
    case "oga":
    default:
      return "audio/ogg";
  }
}

/** Build a language-aware transcription prompt. */
function transcribePrompt(lang?: string): string {
  switch (lang) {
    case "ru":
      return "Transcribe this audio verbatim in Russian. Output only the transcript text — no quotes, no commentary, no language tags.";
    case "en":
      return "Transcribe this audio verbatim in English. Output only the transcript text — no quotes, no commentary, no language tags.";
    case "uz":
    default:
      return "Transcribe this audio verbatim in Uzbek. Output only the transcript text — no quotes, no commentary, no language tags.";
  }
}

export class GeminiFlashProvider implements SttProvider {
  async transcribe(
    audio: Buffer,
    filename: string,
    opts?: { language?: string }
  ): Promise<string> {
    const env = getEnv();
    if (!env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is not set — cannot use Gemini STT"
      );
    }

    const mimeType = mimeFromFilename(filename);
    const base64Data = audio.toString("base64");
    const prompt = transcribePrompt(opts?.language);

    const body = {
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Data } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: { temperature: 0, responseMimeType: "text/plain" },
    };

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new Error(
        `Gemini STT error ${response.status}: ${bodyText.slice(0, 500)}`
      );
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      throw new Error(
        `Gemini STT returned no transcript text. Response: ${JSON.stringify(data).slice(0, 500)}`
      );
    }
    return text;
  }
}
