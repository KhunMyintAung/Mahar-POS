"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, useToast } from "@/components/ui";

/** Longest side of the stored logo. Plenty for a 58mm slip, small enough to live in the
 *  database and travel with every print. */
const MAX_SIDE = 360;

/** Shrink the picked image in the browser and hand back a data URL.
 *  PNG keeps a transparent background; anything else becomes JPEG, which is far smaller. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not read the image"));
      const png = file.type === "image/png";
      if (!png) {
        // JPEG has no transparency; a white ground matches the paper.
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(png ? "image/png" : "image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file is not an image"));
    };
    img.src = url;
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
      <p className="mb-3 mt-1 text-xs text-gray-500">Printed at the top of every voucher and receipt.</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-white dark:border-gray-700">
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
            accept="image/png,image/jpeg,image/webp"
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
