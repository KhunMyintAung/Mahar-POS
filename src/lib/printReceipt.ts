"use client";

/** Print the slip on screen — the repair voucher or the sale receipt — and nothing else.
 *
 *  The slip is copied into a hidden frame of its own and that frame is printed. The page
 *  around it never reaches the printer, so nothing depends on print CSS hiding it: that
 *  approach printed the whole Repair page, open dialog and buttons included, in Chrome.
 *
 *  The frame is left in place after printing and only replaced by the next print. On
 *  Android, print() returns at once and the page is rendered for the printer only after a
 *  printer has been chosen; removing the frame on any timer would race that, which is what
 *  once printed the app screen instead of the slip.
 */

const FRAME_ID = "print-frame";

function slipElement(): Element | null {
  return document.querySelector("#repair-voucher > *, #sale-receipt > *");
}

function frameDocument(slip: Element): string {
  // The app's own stylesheets, so the slip looks exactly as it does on screen.
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')]
    .map((node) => node.outerHTML)
    .join("");
  const htmlClass = document.documentElement.className.replace(/\bdark\b/g, "");
  return `<!doctype html><html lang="my" class="${htmlClass}"><head><meta charset="utf-8">`
    + `<title>${document.title}</title>${styles}`
    + `<style>@page{margin:0}html,body{margin:0;padding:0;background:#fff;color:#000}</style>`
    + `</head><body>${slip.outerHTML}</body></html>`;
}

/** Resolves once the frame's stylesheets and images (the QR code) have loaded. */
function ready(doc: Document): Promise<void> {
  const waits: Promise<unknown>[] = [];
  for (const link of doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    if (!link.sheet) waits.push(new Promise((r) => { link.onload = r; link.onerror = r; }));
  }
  for (const img of doc.images) {
    if (!img.complete) waits.push(new Promise((r) => { img.onload = r; img.onerror = r; }));
  }
  // Never hang the button on a stylesheet that does not answer.
  const timeout = new Promise((r) => setTimeout(r, 3000));
  return Promise.race([Promise.all(waits), timeout]).then(() => undefined);
}

export async function printReceipt() {
  if (typeof window === "undefined") return;
  const slip = slipElement();
  if (!slip) {
    window.print();
    return;
  }
  await printElement(slip);
}

/** Print one element, such as an on-screen preview, through the same isolated frame. */
export async function printElement(slip: Element) {
  if (typeof window === "undefined") return;
  document.getElementById(FRAME_ID)?.remove();
  const frame = document.createElement("iframe");
  frame.id = FRAME_ID;
  frame.setAttribute("aria-hidden", "true");
  // Off screen but laid out at the roll's width, so the browser renders it for real.
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:58mm;height:10px;border:0;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    window.print();
    return;
  }
  doc.open();
  doc.write(frameDocument(slip));
  doc.close();
  await ready(doc);
  win.focus();
  win.print();
}
