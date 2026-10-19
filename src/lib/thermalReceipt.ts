import type { ReceiptData } from "@/components/SaleReceipt";

/** The slip as plain text, for a 58mm Bluetooth thermal printer.
 *
 *  A counter's printer is an Xprinter-class roll printer paired over Bluetooth, and those
 *  are not printers as far as a browser is concerned — there is no driver behind
 *  window.print(), so the browser offers Save as PDF and nothing else. The way through on
 *  Android is RawBT, which every shop with one of these already has: it takes the text
 *  over a rawbt: link and does the talking to the printer.
 *
 *  So the output is columns of characters, not a layout. 58mm at the usual font is 32
 *  characters, which is why every width here is counted rather than styled.
 */

/** Characters across a 58mm roll in the printer's normal font. */
export const WIDTH_58MM = 32;

function money(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Pad a name and an amount to the full width, amount hard against the right.
 *
 *  When the two would collide the name gives way, because a price that has lost a digit is
 *  worse than a name that has lost a letter — one is a wrong number, the other is still
 *  recognisable to whoever is holding the goods.
 */
export function row(left: string, right: string, width = WIDTH_58MM): string {
  const room = width - right.length - 1;
  if (room < 1) return right.slice(-width);
  const name = left.length > room ? left.slice(0, room) : left;
  return name + " ".repeat(width - name.length - right.length) + right;
}

export function centre(text: string, width = WIDTH_58MM): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return " ".repeat(left) + text;
}

/** Break a long product name over as many lines as it needs. */
export function wrap(text: string, width = WIDTH_58MM): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word.length > width ? word.slice(0, width) : word;
      continue;
    }
    if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word.length > width ? word.slice(0, width) : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function buildTextReceipt(data: ReceiptData, width = WIDTH_58MM): string {
  const rule = "-".repeat(width);
  const lines: string[] = [];

  lines.push(centre(data.shopName, width));
  if (data.shopPhone) lines.push(centre(data.shopPhone, width));
  if (data.shopAddress) for (const part of wrap(data.shopAddress, width)) lines.push(centre(part, width));
  lines.push(rule);

  lines.push(data.txnNo);
  lines.push(new Date(data.at).toLocaleString("en-GB", { hour12: false }));
  if (data.customerName) lines.push(`Customer: ${data.customerName}`);
  if (data.cashierName) lines.push(`By: ${data.cashierName}`);
  lines.push(rule);

  for (const line of data.lines) {
    // The name gets its own line so a long one never squeezes the numbers.
    for (const part of wrap(line.name, width)) lines.push(part);
    lines.push(row(`  ${line.quantity} x ${money(line.unitPrice)}`, money(line.quantity * line.unitPrice), width));
  }
  lines.push(rule);

  lines.push(row("Subtotal", money(data.subtotal), width));
  if (data.discount > 0) lines.push(row("Discount", `-${money(data.discount)}`, width));
  lines.push(row("TOTAL", money(data.total), width));
  lines.push(row("Paid", money(data.paid), width));
  if (data.change > 0) lines.push(row("Change", money(data.change), width));
  if (data.credit > 0) lines.push(row("Owing", money(data.credit), width));

  lines.push(rule);
  lines.push(centre("Thank you", width));
  // Blank lines so the last line clears the tear-off edge on printers with no cutter.
  lines.push("", "", "");

  return lines.join("\n");
}

/** The link that hands the slip to RawBT.
 *
 *  Base64 rather than the text form: a receipt contains #, & and newlines, and those do
 *  not survive being put in a URL as they are.
 */
export function rawbtUrl(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `rawbt:base64,${btoa(binary)}`;
}
