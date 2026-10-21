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

/** The page margin on 80mm paper. Same setup as the multishop app, which prints cleanly on
 *  the XP-80C: the printer is told the paper is 80mm and keeps 3mm clear at each side. */
export const PAGE_MARGIN_MM = 3;

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

/** How wide the slip itself prints: inside the margins on 80mm, edge to edge on 58mm. */
export function printableMm(width: PaperWidth = getPaperWidth()): number {
  return width === 80 ? 80 - 2 * PAGE_MARGIN_MM : 58;
}

/** How much the 58mm slip is scaled to fill that width. */
export function slipZoom(width: PaperWidth = getPaperWidth()): number {
  return printableMm(width) / SLIP_LAYOUT_MM;
}

/** The print page rules. 80mm names the paper size and its margins, as the multishop app
 *  does. 58mm keeps margin 0 and no size: Android's print view ignored a 58mm size and
 *  printed the slip small in the corner of a full page. */
export function pageCss(width: PaperWidth = getPaperWidth()): string {
  return width === 80
    ? `@page{size:80mm auto;margin:${PAGE_MARGIN_MM}mm}`
    : "@page{margin:0}";
}
