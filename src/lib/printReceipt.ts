"use client";

/** Print the sale slip.
 *
 *  There is nothing to set up and nothing to undo. The print stylesheet keys off the slip
 *  being in the document at all — see globals.css — so this only has to ask for the print.
 *
 *  It used to add a class to <body> first and take it off a second later. That is what
 *  printed the Sale Complete screen on a phone: on Android, window.print() hands over to a
 *  system sheet and returns straight away, and the page is not rendered for the printer
 *  until a printer has been chosen, which is well over a second. The class was gone by
 *  then, so the printer was handed the ordinary app screen. Every variant of that fix is a
 *  race against how long someone takes to tap; not having any state to unwind is not.
 */
export function printReceipt() {
  if (typeof window === "undefined") return;
  window.print();
}
