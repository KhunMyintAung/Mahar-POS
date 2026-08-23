"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button, Input, Modal } from "./ui";
import { playBeep } from "@/lib/sound";

/** Reading a barcode with the phone's own camera.
 *
 *  Uses BarcodeDetector, which Chrome on Android backs with Google Play Services — the
 *  same decoder the Google apps use. It is built into the browser, so there is no library
 *  to load: the app has a strict content-security policy that blocks scripts from other
 *  hosts, and it has to keep working on a counter with no signal.
 *
 *  Where the browser has no decoder (iOS Safari today), the camera button is simply not
 *  offered. Typing still works, and so do the USB and Bluetooth scanners most counters
 *  already own — those pretend to be keyboards and need nothing from us.
 */

type DetectedBarcode = { rawValue: string };
type Detector = { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> };
type DetectorCtor = new (options?: { formats?: string[] }) => Detector;

function detectorCtor(): DetectorCtor | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null;
}

/** The formats a shop actually meets: retail EANs and UPCs, Code 128 on shelf labels,
 *  and QR because more and more local products carry one. */
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

export function scanningSupported(): boolean {
  return detectorCtor() !== null;
}

export function BarcodeScannerModal({
  open,
  onClose,
  onScan,
  title = "Scan a barcode",
}: {
  open: boolean;
  onClose: () => void;
  /** Return true to keep the camera running for the next item. */
  onScan: (code: string) => boolean | void;
  title?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [last, setLast] = useState("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    const Ctor = detectorCtor();
    if (!Ctor) {
      // Deferred, as elsewhere, so the update is an ordinary one rather than made during
      // the effect body.
      const timer = window.setTimeout(
        () => setError("This browser cannot scan. Type the number instead."),
        0
      );
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    let frame = 0;
    const detector = new Ctor({ formats: FORMATS });
    // The same code stays in front of the lens for many frames. Without this a single
    // barcode is reported dozens of times, which at a till means a dozen of the item.
    let lastSeen = "";
    let lastSeenAt = 0;

    async function run() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // The rear camera, which is the one pointed at the goods.
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (cancelled) return;
          try {
            const found = await detector.detect(video);
            const code = found[0]?.rawValue?.trim();
            const now = Date.now();
            if (code && (code !== lastSeen || now - lastSeenAt > 1500)) {
              lastSeen = code;
              lastSeenAt = now;
              setLast(code);
              playBeep();
              const keepGoing = onScan(code);
              if (!keepGoing) {
                cancelled = true;
                stop();
                onClose();
                return;
              }
            }
          } catch {
            // A frame that cannot be decoded is the normal case, not an error.
          }
          frame = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch (cameraError) {
        if (cancelled) return;
        setError(
          cameraError instanceof DOMException && cameraError.name === "NotAllowedError"
            ? "Camera permission was refused. Allow it, or type the number."
            : "The camera could not be opened. Type the number instead."
        );
      }
    }

    void run();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stop();
    };
  }, [open, onScan, onClose, stop]);

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-3">
        {error ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {error}
          </p>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-lg bg-black">
              <video ref={videoRef} className="h-64 w-full object-cover" playsInline muted />
              {/* A window to aim through. Holding the whole phone still is harder than
                  lining a code up inside a box. */}
              <div className="pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80" />
            </div>
            <p className="text-center text-xs text-gray-500">
              {last ? `Read ${last}` : "Hold the barcode inside the box."}
            </p>
          </>
        )}
        <Button variant="secondary" onClick={onClose} className="w-full">
          <X size={16} className="mr-1 inline" />Close
        </Button>
      </div>
    </Modal>
  );
}

/** A text field with the camera beside it, for entering one barcode. */
export function BarcodeInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);

  useEffect(() => {
    // Checked after mount: the server has no window to ask.
    const timer = window.setTimeout(() => setCanScan(scanningSupported()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label={label}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            inputMode="numeric"
          />
        </div>
        {canScan && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setScanning(true)}
            aria-label="Scan with the camera"
            className="min-h-11 sm:min-h-10"
          >
            <Camera size={18} />
          </Button>
        )}
      </div>
      <BarcodeScannerModal
        open={scanning}
        onClose={() => setScanning(false)}
        onScan={(code) => {
          onChange(code);
          // One code is all this field wants; the camera closes itself.
          return false;
        }}
      />
    </div>
  );
}
