import { getEnv } from "../env";

/** Maximum audio file size accepted for STT (5 MB). */
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

/**
 * Downloads a Telegram file to a Buffer.
 * Aborts (throws) if the Content-Length header exceeds MAX_AUDIO_BYTES so we
 * never buffer a large file into memory.
 *
 * Usage:
 *   const fileInfo = await ctx.api.getFile(fileId);
 *   const buf = await downloadTelegramFile(fileInfo.file_path!);
 */
export async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const env = getEnv();
  const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download Telegram file: HTTP ${response.status} for path ${filePath}`
    );
  }

  // Abort early if Content-Length says the file is too large
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_AUDIO_BYTES) {
    throw new Error(
      `Audio file too large: ${contentLength} bytes (limit ${MAX_AUDIO_BYTES})`
    );
  }

  const arrayBuffer = await response.arrayBuffer();

  // Secondary check on actual size after download
  if (arrayBuffer.byteLength > MAX_AUDIO_BYTES) {
    throw new Error(
      `Audio file too large: ${arrayBuffer.byteLength} bytes (limit ${MAX_AUDIO_BYTES})`
    );
  }

  return Buffer.from(arrayBuffer);
}
