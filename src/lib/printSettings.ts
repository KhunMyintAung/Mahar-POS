"use client";

/** The receipt paper of the printer attached to this device.
 *
 *  Kept per device rather than per shop, because the printer belongs to the counter: a
 *  phone with a 58mm Bluetooth printer and a till PC with an 80mm XP-80C can share a shop.
 */

export type PaperWidth = 58 | 80;

const KEY = "mahar.paperWidth";

/** What a slip is laid out at; every slip is designed for this width. */
export const SLIP_LAYOUT_MM = 58;

/** How wide the slip prints. Xprinter XP-80C and most 80mm heads cover 72mm
 *  (576 dots); 71mm leaves a hair of room so nothing is clipped at the edge. */
const PRINTABLE_MM: Record<PaperWidth, number> = { 58: 58, 80: 71 };

export function getPaperWidth(): PaperWidth {
  try {
    return window.localStorage.getItem(KEY) === "80" ? 80 : 58;
  } catch {
    return 58;
  }
}

export function setPaperWidth(width: PaperWidth) {
  try {
    window.localStorage.setItem(KEY, String(width));
  } catch {
    // A private window cannot keep it; printing then uses 58mm.
  }
}

/** How much the 58mm slip is scaled to fill the paper's printable width. */
export function slipZoom(width: PaperWidth = getPaperWidth()): number {
  return PRINTABLE_MM[width] / SLIP_LAYOUT_MM;
}

export function printableMm(width: PaperWidth = getPaperWidth()): number {
  return PRINTABLE_MM[width];
}
