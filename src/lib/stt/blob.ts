/**
 * Build an upload Blob from a Node Buffer without leaking bytes from the
 * Buffer's underlying (possibly larger, pooled) ArrayBuffer.
 *
 * We copy exactly this Buffer's bytes into a fresh, exactly-sized Uint8Array
 * (a valid BlobPart), so the upload contains only the audio — never trailing
 * pool bytes that would corrupt the Telegram audio.
 */
export function audioBufferToBlob(audio: Buffer, type = "audio/ogg"): Blob {
  const exact = new Uint8Array(audio.byteLength);
  exact.set(audio);
  return new Blob([exact], { type });
}
