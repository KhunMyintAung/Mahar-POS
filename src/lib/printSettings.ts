"use client";

/** The receipt paper of the printer attached to this device.
 *
 *  Kept per device rather than per shop, because the printer belongs to the counter: a
 *  phone with a 58mm Bluetooth printer and a till PC with an 80mm XP-80C can share a shop.
 */

export type PaperWidth = 58 | 80;

const KEY = "mahar.paperWidth";
const FIT_KEY = "mahar.paperFit72";

/** What a slip is laid out at; every slip is designed for this width. */
export const SLIP_LAYOUT_MM = 58;

/** Most 80mm heads (XP-80C included) print 72mm across; a printer that cuts the sides off a
 *  full 80mm slip is set to this instead. */
export const FIT_MM = 72;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A private window cannot keep it; printing then uses the defaults.
  }
}

export function getPaperWidth(): PaperWidth {
  return read(KEY) === "80" ? 80 : 58;
}

export function setPaperWidth(width: PaperWidth) {
  write(KEY, String(width));
}

/** Whether an 80mm slip is shrunk to the 72mm most printers can reach. */
export function getFit72(): boolean {
  return read(FIT_KEY) === "1";
}

export function setFit72(on: boolean) {
  write(FIT_KEY, on ? "1" : "0");
}

/** How wide the slip prints: the paper's full width, or 72mm when the edges were cut off. */
export function printableMm(width: PaperWidth = getPaperWidth(), fit72: boolean = getFit72()): number {
  if (width === 58) return 58;
  return fit72 ? FIT_MM : 80;
}

/** How much the 58mm slip is scaled to fill that width. */
export function slipZoom(width: PaperWidth = getPaperWidth(), fit72: boolean = getFit72()): number {
  return printableMm(width, fit72) / SLIP_LAYOUT_MM;
}
