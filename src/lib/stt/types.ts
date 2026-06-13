/**
 * Swappable Speech-to-Text provider interface.
 * Both GroqWhisperProvider and OpenAiTranscribe implement this.
 */
export interface SttProvider {
  /**
   * Transcribe audio to text.
   * @param audio  Raw audio bytes (e.g. OGG/Opus from Telegram voice messages)
   * @param filename  Hint filename with extension, e.g. "voice.oga"
   * @param opts  Optional hints; language is omitted by default for autodetect
   */
  transcribe(
    audio: Buffer,
    filename: string,
    opts?: { language?: string }
  ): Promise<string>;
}
