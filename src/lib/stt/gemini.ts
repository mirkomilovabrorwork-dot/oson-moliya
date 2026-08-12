import type { SttProvider } from "./types";
import { getEnv } from "../env";

/**
 * Google Gemini Flash STT provider.
 * Uses multimodal generateContent with inline audio (base64).
 * Supports OGG/Opus natively — ideal for Telegram voice messages.
 *
 * Activate by setting STT_PROVIDER=gemini + GEMINI_API_KEY in .env.local.
 *
 * API reference: https://ai.google.dev/api/generate-content
 *
 * WHY A CHAIN AND NOT ONE MODEL (2026-08-12): this provider was pinned to
 * `gemini-2.5-flash`, and Google retired it — "no longer available to new
 * users", HTTP 404. Voice transcription was dead in production and the failure
 * was invisible from outside. A single pinned model is a time bomb; when one
 * dies the next is tried automatically.
 *
 * ListModels is NOT proof a model works: `gemini-2.5-flash` was still LISTED
 * for the key that 404s on it. Only a real generateContent call proves it.
 *
 * Order: `gemini-3-flash-preview` first — it is what the owner's other project
 * (Ustoz) transcribes Uzbek/Russian audio with, he rates that quality highly,
 * and it is the cheapest of the three. Then a stable named model, then the
 * `-latest` alias, which by definition always points at a live model.
 */
const MODEL_CHAIN = [
  "gemini-3-flash-preview",
  "gemini-3.5-flash",
  "gemini-flash-latest",
] as const;

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

    const failures: string[] = [];

    for (const model of MODEL_CHAIN) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
        // 404 = model retired/unavailable for this key; 429/5xx = busy.
        // Both are worth trying the next model for. Anything else (401/403 =
        // bad key, 400 = bad request) would fail identically on every model,
        // so fail fast instead of burning three calls.
        const retryable =
          response.status === 404 || response.status === 429 || response.status >= 500;
        failures.push(`${model}: ${response.status} ${bodyText.slice(0, 200)}`);
        if (!retryable) break;
        console.warn(
          `[stt/gemini] ${model} unavailable (${response.status}); trying next model`
        );
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        failures.push(`${model}: empty transcript`);
        console.warn(`[stt/gemini] ${model} returned no text; trying next model`);
        continue;
      }
      return text;
    }

    throw new Error(`Gemini STT failed on every model — ${failures.join(" | ")}`);
  }
}
