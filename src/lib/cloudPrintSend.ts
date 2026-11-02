"use client";

/** The phone's side of cloud print (see lib/cloudPrint.ts): instead of opening the print
 *  view, a slip is sent to the server for the shop's print station to print on the XP-80C.
 *
 *  It only ever happens on a phone, in a shop the server has switched it on for, and only
 *  while this phone has not turned it off in Settings. A computer prints as it always has,
 *  through its own print dialog and the shared printer.
 */

const OFF_KEY = "mahar.cloudPrintOff";

/** The toast that says how a sent slip went; AppShell shows it. */
export const CLOUD_PRINT_EVENT = "mahar:cloud-print";
export type CloudPrintNotice = { ok: boolean; message: string };

let allowedForShop = false;

/** Set from the signed-in user's shop (/auth/me), once it has loaded. */
export function setCloudPrintAllowed(allowed: boolean) {
  allowedForShop = allowed;
}

export function cloudPrintAllowed(): boolean {
  return allowedForShop;
}

/** A touch screen with no mouse: a phone or tablet, not a till PC (even a touch-screen one,
 *  which also has a mouse and so hovers). */
export function isPhoneDevice(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(hover: none)").matches;
  } catch {
    return false;
  }
}

export function cloudPrintOnThisPhone(): boolean {
  try {
    return window.localStorage.getItem(OFF_KEY) !== "1";
  } catch {
    return true;
  }
}

export function setCloudPrintOnThisPhone(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(OFF_KEY);
    else window.localStorage.setItem(OFF_KEY, "1");
  } catch {
    // A private window cannot keep it; the phone then sends slips to the station.
  }
}

/** Whether a print on this device goes to the shop's counter printer. */
export function cloudPrintActive(): boolean {
  if (typeof window === "undefined") return false;
  return allowedForShop && isPhoneDevice() && cloudPrintOnThisPhone();
}

/** The slip's own scripts (the self-printing onload) are taken out: the station prints the
 *  page itself, and it renders it with scripts off anyway. */
export function stripScripts(html: string): string {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
}

function notify(detail: CloudPrintNotice) {
  window.dispatchEvent(new CustomEvent<CloudPrintNotice>(CLOUD_PRINT_EVENT, { detail }));
}

/** Send one slip page to the station. Resolves true once the server has it. */
export async function sendToCloudPrinter(title: string, html: string): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/print-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: title.trim().slice(0, 120) || "Slip", html: stripScripts(html) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
    notify({ ok: true, message: "Counter printer ဆီ ပို့ပြီးပါပြီ · Sent to the counter printer" });
    return true;
  } catch (e) {
    notify({ ok: false, message: `Printer ဆီ မပို့နိုင်ပါ · Could not send: ${e instanceof Error ? e.message : "network error"}` });
    return false;
  }
}
