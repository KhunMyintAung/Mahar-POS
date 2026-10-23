/** Shrinks a photo in the browser before it is uploaded: at most `max` pixels on its longer
 *  side, as WebP (JPEG where the browser cannot make WebP), lowering the quality until it is
 *  under `maxBytes`. A phone camera's 4 MB picture comes out at about 100 KB. */
export async function resizeImage(file: File, max = 1000, maxBytes = 380 * 1024): Promise<string> {
  const bitmap = await loadImage(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare photos");
  // A white backing, so a see-through PNG does not turn black as a JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const webp = canvas.toDataURL("image/webp", 0.8).startsWith("data:image/webp");
  const type = webp ? "image/webp" : "image/jpeg";
  for (const quality of [0.82, 0.72, 0.6, 0.5, 0.4]) {
    const url = canvas.toDataURL(type, quality);
    if (url.length * 0.75 <= maxBytes) return url;
  }
  throw new Error("That photo is too big even when made smaller");
}

/** Read as a data URL rather than a blob: URL, which the site's Content-Security-Policy
 *  (img-src 'self' data:) would not let the image load from. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("That file is not a photo this browser can open"));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
