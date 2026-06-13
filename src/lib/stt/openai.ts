import type { SttProvider } from "./types";
import { audioBufferToBlob } from "./blob";

/**
 * OpenAI Transcription stub — thin implementation using gpt-4o-transcribe.
 * Active only when STT_PROVIDER=openai; not tested by automated tests.
 */
export class OpenAiTranscribe implements SttProvider {
  async transcribe(
    audio: Buffer,
    filename: string,
    opts?: { language?: string }
  ): Promise<string> {
    // OpenAI API key is not a required env var in this project; read directly.
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set — cannot use OpenAI STT");
    }

    const form = new FormData();
    const blob = audioBufferToBlob(audio);
    form.append("file", blob, filename);
    form.append("model", "gpt-4o-transcribe");
    form.append("response_format", "json");
    if (opts?.language) {
      form.append("language", opts.language);
    }

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `OpenAI STT error ${response.status}: ${body.slice(0, 200)}`
      );
    }

    const data = (await response.json()) as { text?: string };
    if (!data.text) {
      throw new Error("OpenAI STT returned no text field");
    }
    return data.text.trim();
  }
}
