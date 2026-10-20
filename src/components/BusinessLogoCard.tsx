"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, useToast } from "@/components/ui";

/** Largest stored logo. Wide word-mark logos keep their full width; plenty for a 58mm slip
 *  and small enough to live in the database and travel with every print. */
const MAX_WIDTH = 640;
const MAX_HEIGHT = 320;

/** The box around the non-transparent pixels, so empty margins in a PNG do not shrink the
 *  logo on the slip. */
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

/** Shrink the picked image in the browser and hand back a data URL.
 *  PNG, WebP, GIF and SVG keep a transparent background as PNG; a JPEG stays JPEG. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // Read as a data: URL, not a blob: one. The live site's content security policy allows
    // data: images only, so a blob: URL fails to load and every file looked "not an image".
    const reader = new FileReader();
    const img = new Image();
    img.onload = () => {
      // An SVG without a size reports 0; draw it at a sensible width instead.
      const srcW = img.width || 640;
      const srcH = img.height || 320;
      const png = file.type !== "image/jpeg";

      // Draw at full size first so the empty margins can be cut off before shrinking.
      const full = document.createElement("canvas");
      full.width = srcW;
      full.height = srcH;
      const fctx = full.getContext("2d", { willReadFrequently: true });
      if (!fctx) return reject(new Error("Could not read the image"));
      fctx.drawImage(img, 0, 0, srcW, srcH);
      const box = png ? contentBox(fctx, srcW, srcH) : { x: 0, y: 0, w: srcW, h: srcH };

      const scale = Math.min(1, MAX_WIDTH / box.w, MAX_HEIGHT / box.h);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(box.w * scale));
      canvas.height = Math.max(1, Math.round(box.h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not read the image"));
      if (!png) {
        // JPEG has no transparency; a white ground matches the paper.
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

/** Settings → Business logo. Saved as soon as it is picked, and printed on every slip. */
export function BusinessLogoCard({ initial, onSaved }: { initial: string | null; onSaved: () => void }) {
  const [logo, setLogo] = useState<string | null>(initial);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { push } = useToast();

  async function save(value: string) {
    setBusy(true);
    try {
      await api("/api/v1/settings", { method: "PATCH", body: { logoUrl: value } });
      setLogo(value || null);
      onSaved();
      push(value ? "Logo saved" : "Logo removed");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    try {
      await save(await shrink(file));
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  return (
    <Card>
      <h3 className="text-sm font-semibold">Business logo</h3>
      <p className="mb-3 mt-1 text-xs text-gray-500"><span>Printed at the top of every voucher and receipt.</span> <span>Square or wide logos both work (PNG, JPG, WebP, GIF, SVG).</span></p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-48 max-w-full items-center justify-center p-2 overflow-hidden rounded-lg border border-dashed border-gray-300 bg-white dark:border-gray-700">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise
            <img src={logo} alt="Business logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <ImagePlus className="text-gray-300" size={28} />
          )}
        </div>
        <div className="flex gap-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <Button disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus size={16} className="mr-1 inline" />{logo ? "Change logo" : "Upload logo"}
          </Button>
          {logo && (
            <Button variant="secondary" disabled={busy} onClick={() => save("")}>
              <Trash2 size={16} className="mr-1 inline" />Remove
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
