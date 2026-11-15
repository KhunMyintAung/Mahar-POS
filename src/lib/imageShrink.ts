// Shrinks a picked image in the browser to a small data URL that lives in the database and
// travels with every print. Shared by the business logo and the per-wallet/biller logos.
//
// The image is redrawn onto a canvas, so even an SVG becomes a plain PNG with no script — a
// data: SVG shown in the app could otherwise be a path for one.

/** Largest stored logo: a wide word-mark keeps its full width, small enough for a slip. */
export const LOGO_MAX_WIDTH = 640;
export const LOGO_MAX_HEIGHT = 320;

/** The box around the non-transparent pixels, so empty PNG margins do not shrink the logo. */
function contentBox(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let top = h, left = w, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? { x: 0, y: 0, w, h } : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/** Shrink the picked image and hand back a data URL. PNG/WebP/GIF/SVG keep a transparent
 *  background as PNG; a JPEG stays JPEG. */
export function shrinkImage(file: File, maxW = LOGO_MAX_WIDTH, maxH = LOGO_MAX_HEIGHT): Promise<string> {
  return new Promise((resolve, reject) => {
    // Read as a data: URL, not a blob: one — the CSP allows data: images only.
    const reader = new FileReader();
    const img = new Image();
    img.onload = () => {
      const srcW = img.width || 640;
      const srcH = img.height || 320;
      const png = file.type !== "image/jpeg";

      const full = document.createElement("canvas");
      full.width = srcW;
      full.height = srcH;
      const fctx = full.getContext("2d", { willReadFrequently: true });
      if (!fctx) return reject(new Error("Could not read the image"));
      fctx.drawImage(img, 0, 0, srcW, srcH);
      const box = png ? contentBox(fctx, srcW, srcH) : { x: 0, y: 0, w: srcW, h: srcH };

      const scale = Math.min(1, maxW / box.w, maxH / box.h);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(box.w * scale));
      canvas.height = Math.max(1, Math.round(box.h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not read the image"));
      if (!png) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(png ? "image/png" : "image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("That file is not an image this browser can read. Try a PNG or JPG."));
    reader.onload = () => { img.src = String(reader.result); };
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}
