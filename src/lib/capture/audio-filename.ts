/**
 * Map an uploaded audio blob's MIME type to a filename with the right
 * extension, so the STT provider (src/lib/stt/gemini.ts mimeFromFilename)
 * picks the correct audio/* content type. Never trust a client-supplied
 * filename directly; derive it from the blob's own `type`.
 */
export function filenameForAudioMime(mimeType: string | null | undefined): string {
  const type = (mimeType || "").toLowerCase().split(";")[0].trim();
  switch (type) {
    case "audio/webm":
      return "voice.webm";
    case "audio/ogg":
      return "voice.ogg";
    case "audio/mp4":
      return "voice.mp4";
    case "audio/mpeg":
      return "voice.mp3";
    case "audio/wav":
      return "voice.wav";
    default:
      return "voice.webm";
  }
}
