/**
 * Client-only helper: shrink a captured receipt photo to <=1600px on its long
 * side before upload (plan section 3.2 step 4 — keeps the multipart POST small
 * over 4G). Re-encodes as JPEG via a canvas; falls back to the original file if
 * the browser can't decode it (canvas/createImageBitmap missing).
 */
export async function resizeImageForUpload(file: File, maxDimension = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}
