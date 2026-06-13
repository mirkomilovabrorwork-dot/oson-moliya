import { getEnv } from "../env";

/**
 * Downloads a Telegram file to a Buffer.
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

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
