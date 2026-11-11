"use client";

/** Slip printing, taken from the multishop app (src/printing/projectPrintUtils.js), which
 *  prints cleanly on the shop's XP-80C.
 *
 *  Each slip is written as a small page of its own in a new window, with its own styles,
 *  and prints as soon as it has loaded. Nothing from the app page reaches the printer.
 *  The window is opened at once, in the click, so a browser does not block it as a popup;
 *  the slip is written into it when it is ready (the voucher's QR code takes a moment).
 */

import QRCode from "qrcode";
import type { ReceiptData } from "@/components/SaleReceipt";
import type { RepairVoucherData } from "@/components/RepairVoucher";
import type { RepairStatus } from "@/lib/repairStatus";
import { voucherText } from "@/lib/repairVoucherText";
import { receiptText } from "@/lib/saleReceiptText";
import { targetPaperWidth } from "@/lib/printSettings";
import { cloudPrintActive, sendToCloudPrinter } from "@/lib/cloudPrintSend";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nl2br(value: unknown): string {
  return escapeHtml(value).replaceAll("\n", "<br/>");
}

const money = (value: number) => Math.round(value || 0).toLocaleString("en-US");

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Opens the print window. Call it straight from the click; a window opened later, after
 *  an await, is blocked as a popup. */
export function openPrintWindow(): Window | null {
  // A phone sending to the counter printer has no print view to open.
  if (cloudPrintActive()) return null;
  const popup = window.open("", "_blank", "width=430,height=760");
  if (popup) {
    popup.document.write('<!doctype html><html><body style="font-family:Arial;padding:30px;text-align:center">Preparing slip…</body></html>');
    popup.document.close();
  }
  return popup;
}

function printWindow(targetWindow: Window | null, html: string, title: string): boolean {
  if (cloudPrintActive()) {
    void sendToCloudPrinter(title, html);
    return true;
  }
  const popup = targetWindow || window.open("", "_blank", "width=430,height=760");
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  return true;
}

const paper = () => (targetPaperWidth() === 58 ? "58mm" : "80mm");

/** Prints once the slip (and its logo and QR) has loaded. With closeAfter, the window
 *  closes itself once the print dialog is done, on a computer. A phone returns from print()
 *  before the slip has gone to the printer, so there it is left open for the user to close. */
function autoPrint(closeAfter = false): string {
  if (!closeAfter) return "<script>window.onload=()=>window.print();</script>";
  return "<script>window.onload=()=>{if(!matchMedia('(pointer: coarse)').matches)window.onafterprint=()=>setTimeout(()=>window.close(),300);window.print();};</script>";
}

function baseStyles(): string {
  const width = paper();
  return `
    /* No page size and no margins: the printer's own roll is the page, and the slip, as
       wide as the roll, fills it edge to edge. The shop's current app prints this way on
       its XP-80C; naming a size and margins made the printer leave blank sides. */
    @page{margin:0}
    *{box-sizing:border-box}
    body{width:${width};max-width:100%;margin:0 auto;padding:1mm 2mm;font-family:Arial,'Pyidaungsu','Myanmar Text',sans-serif;color:#111;font-size:11px;background:#fff;overflow-wrap:anywhere}
    .slip-logo{display:block;max-width:100%;height:56px;object-fit:contain;margin:0 auto 4px auto}
    /* A thermal head prints black or nothing, so a coloured logo loses every shade lighter
       than mid-grey. A see-through PNG logo prints solid black; a JPEG in strong greys. */
    @media print{.slip-logo{filter:grayscale(1) contrast(1.8)}.slip-logo[src^="data:image/png"]{filter:grayscale(1) brightness(0)}}
    h1,h2,p{text-align:center;margin:2px 0}h1{font-size:18px}h2{font-size:14px}.muted{color:#555}.left{text-align:left}.right{text-align:right}.center{text-align:center}
    .meta{margin:6px 0;padding:4px 0;border-top:1px dashed #777;border-bottom:1px dashed #777}.meta div,.summary div{display:flex;justify-content:space-between;gap:10px;padding:1.5px 0}.meta span,.summary span{color:#444}
    /* Fixed layout + anywhere-wrap (body): a long run with no spaces, like an email in the
       repair problem, wraps instead of pushing the slip past the paper. */
    table{width:100%;table-layout:fixed;border-collapse:collapse;margin-top:4px}table:not(.items) th{width:34%}th,td{padding:3px 2px;border-bottom:1px dashed #999;vertical-align:top}th{text-align:left;font-size:10px}td small{display:block;color:#555;margin-top:2px}
    /* Fixed columns: a long item name wraps instead of pushing the table past the paper. */
    table.items{table-layout:fixed}table.items td,table.items th{overflow-wrap:anywhere;word-break:break-word}
    table.items .c-qty{width:9%}table.items .c-price,table.items .c-total{width:23%;white-space:nowrap;overflow-wrap:normal;word-break:normal}
    .summary{margin-top:6px}.grand{font-size:15px;font-weight:bold;border-top:2px solid #111;margin-top:3px;padding-top:4px!important}.void{margin:9px 0;padding:6px;border:2px solid #b91c1c;color:#b91c1c;font-weight:bold;text-align:center;letter-spacing:2px}
    .voucher-no{margin:6px 0 2px;padding:5px 0 3px;border-top:1px dashed #777;text-align:center}.voucher-no span{display:block;font-size:10px;color:#444}.voucher-no b{display:block;font-size:26px;letter-spacing:1px;line-height:1.1}
    .summary .paid{display:inline-block;margin-left:6px;padding:0 5px;border:1.5px solid #111;border-radius:3px;color:#111;font-size:11px;font-weight:bold;vertical-align:middle}
    .footer{margin-top:8px;padding-top:5px;border-top:1px dashed #777;text-align:center;white-space:normal}.footer-tag{display:block;margin-top:8px;font-weight:900}.warranty{margin-top:9px;font-size:9px;color:#444;text-align:center}.qr-link{word-break:break-all;font-size:9px;color:#333}
    .terms{margin:4px 0 0 0;padding-left:14px;text-align:left;font-size:9.5px;line-height:1.3}.qr{display:block;width:28mm;height:28mm;margin:5px auto 1px auto}
    .sign{display:flex;justify-content:space-between;margin-top:18px}.sign div{border-top:1px solid #111;padding:2px 6px;text-align:center}
    @media print{body{padding:0}.no-print{display:none!important}}
  `;
}

function brandBlock(shop: { name: string; logo?: string; phone?: string; address?: string; subtitle?: string }, title: string): string {
  const logo = shop.logo ? `<img class="slip-logo" src="${escapeHtml(shop.logo)}" alt="Logo"/>` : "";
  const contacts = [shop.phone, shop.address].filter(Boolean).map(escapeHtml).join(" · ");
  return `${logo}<h1>${escapeHtml(shop.name || "Mahar Shwe Mobile")}</h1><p>${escapeHtml(title)}</p>${shop.subtitle ? `<p class="muted">${escapeHtml(shop.subtitle)}</p>` : ""}${contacts ? `<p class="muted">${contacts}</p>` : ""}`;
}

/** The sale receipt, as the multishop app prints it. */
export function printSaleReceipt(sale: ReceiptData, targetWindow: Window | null = null): boolean {
  // In the shop's currency, and in Thai for a THB shop.
  const t = receiptText(sale.currency);
  const cur = escapeHtml(sale.currency ?? "MMK");
  const foc = escapeHtml(t.foc);
  const items = sale.lines.map((item) => {
    const meta = [
      item.warranty ? `${item.warrantyUntil ? "✔ " : ""}${item.warranty}${item.warrantyUntil ? ` (${t.until} ${new Date(item.warrantyUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })})` : ""}` : "",
      item.imeis?.length ? `IMEI: ${item.imeis.join(", ")}` : "",
      item.note ? `${t.note}: ${item.note}` : "",
    ].filter(Boolean).join(" · ");
    return `
    <tr>
      <td>${escapeHtml(item.name)}${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</td>
      <td class="center c-qty">${Number(item.quantity || 0)}</td>
      <td class="right c-price">${item.unitPrice === 0 ? foc : money(item.unitPrice)}</td>
      <td class="right c-total">${item.unitPrice === 0 ? foc : money(item.unitPrice * item.quantity)}</td>
    </tr>`;
  }).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(sale.txnNo)}</title><style>${baseStyles()}</style></head><body>
    ${brandBlock({ name: sale.shopName, logo: sale.shopLogo, phone: sale.shopPhone, address: sale.shopAddress }, t.title)}
    <div class="meta"><div><span>${escapeHtml(t.invoice)}</span><b>${escapeHtml(sale.txnNo)}</b></div><div><span>${escapeHtml(t.date)}</span><b>${escapeHtml(when(sale.at))}</b></div>${sale.cashierName ? `<div><span>${escapeHtml(t.cashier)}</span><b>${escapeHtml(sale.cashierName)}</b></div>` : ""}</div>
    <table class="items"><thead><tr><th>${escapeHtml(t.item)}</th><th class="center c-qty">${escapeHtml(t.qty)}</th><th class="right c-price">${escapeHtml(t.price)}</th><th class="right c-total">${escapeHtml(t.amount)}</th></tr></thead><tbody>${items}</tbody></table>
    <div class="summary"><div><span>${escapeHtml(t.subtotal)}</span><b>${money(sale.subtotal)}</b></div>${sale.discount > 0 ? `<div><span>${escapeHtml(t.discount)}</span><b>${money(sale.discount)}</b></div>` : ""}<div class="grand"><span>${escapeHtml(t.total)}</span><b>${money(sale.total)} ${cur}</b></div>${sale.paid !== sale.total || sale.change > 0 ? `<div><span>${escapeHtml(t.paid)}</span><b>${money(sale.paid)}</b></div>` : ""}${sale.change > 0 ? `<div><span>${escapeHtml(t.change)}</span><b>${money(sale.change)}</b></div>` : ""}${sale.credit > 0 ? `<div><span>${escapeHtml(t.owing)}</span><b>${money(sale.credit)}</b></div>` : ""}<div><span>${escapeHtml(t.customer)}</span><b>${escapeHtml(sale.customerName || t.walkIn)}</b></div></div>
    <div class="footer">${escapeHtml(t.thanks)}</div>
    ${autoPrint()}</body></html>`;
  return printWindow(targetWindow, html, sale.txnNo);
}

/** A purchase as the shop's slip printer prints it (80mm, or 58mm when set so): the same
 *  page as the sale receipt, with what was bought, its cost, the supplier and how it was paid. */
export interface PurchaseSlipData {
  txnNo: string; createdAt: string; status: string; paymentStatus: string;
  /** paid: in all; paidSince: of it, paid to the supplier after the purchase. */
  subtotal: number; discount: number; total: number; paid: number; paidSince?: number;
  reference?: string | null; notes?: string | null;
  lines: { name: string; quantity: number; unitCost: number; lineTotal: number; imeis: string[] }[];
  shopName: string; shopPhone?: string | null; shopAddress?: string | null;
  /** The shop's main currency, printed after the total. MMK when not given. */
  currency?: string;
  supplierName: string | null; supplierPhone: string | null; walletName: string | null; createdByName: string | null;
}

export function printPurchaseVoucher(p: PurchaseSlipData, targetWindow: Window | null = null): boolean {
  const cancelled = p.status === "CANCELLED";
  const owed = cancelled ? 0 : Math.max(0, p.total - p.paid);
  const items = p.lines.map((l) => `
    <tr>
      <td>${escapeHtml(l.name)}${l.imeis.length ? `<small>IMEI: ${escapeHtml(l.imeis.join(", "))}</small>` : ""}</td>
      <td class="center c-qty">${l.quantity}</td>
      <td class="right c-price">${l.unitCost === 0 ? "FOC" : money(l.unitCost)}</td>
      <td class="right c-total">${money(l.lineTotal)}</td>
    </tr>`).join("");
  const state = cancelled ? "Cancelled" : owed <= 0 ? "Paid" : p.paid > 0 ? "Part paid" : "Credit";
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(p.txnNo)}</title><style>${baseStyles()}</style></head><body>
    ${brandBlock({ name: p.shopName, phone: p.shopPhone ?? undefined, address: p.shopAddress ?? undefined }, "Purchase Voucher")}
    ${cancelled ? '<div class="void">CANCELLED</div>' : ""}
    <div class="meta"><div><span>Voucher</span><b>${escapeHtml(p.txnNo)}</b></div><div><span>Date</span><b>${escapeHtml(when(p.createdAt))}</b></div><div><span>Supplier</span><b>${escapeHtml(p.supplierName ?? "—")}${p.supplierPhone ? ` · ${escapeHtml(p.supplierPhone)}` : ""}</b></div>${p.reference ? `<div><span>Reference</span><b>${escapeHtml(p.reference)}</b></div>` : ""}${p.createdByName ? `<div><span>Recorded by</span><b>${escapeHtml(p.createdByName)}</b></div>` : ""}</div>
    <table class="items"><thead><tr><th>Item</th><th class="center c-qty">Qty</th><th class="right c-price">Cost</th><th class="right c-total">Amount</th></tr></thead><tbody>${items}</tbody></table>
    <div class="summary">${p.discount > 0 ? `<div><span>Subtotal</span><b>${money(p.subtotal)}</b></div><div><span>Discount</span><b>-${money(p.discount)}</b></div>` : ""}<div class="grand"><span>Total</span><b>${money(p.total)} ${escapeHtml(p.currency ?? "MMK")}</b></div><div><span>Paid${p.walletName ? ` (${escapeHtml(p.walletName)})` : ""}</span><b>${money(p.paid - (p.paidSince ?? 0))}</b></div>${p.paidSince ? `<div><span>Paid to supplier since</span><b>${money(p.paidSince)}</b></div>` : ""}${owed > 0 ? `<div><span>Credit (still owed)</span><b>${money(owed)}</b></div>` : ""}<div><span>Status</span><b>${state}</b></div></div>
    ${p.notes ? `<p class="muted left">${nl2br(p.notes)}</p>` : ""}
    <div class="sign"><div>Received by</div><div>Supplier</div></div>
    ${autoPrint(true)}</body></html>`;
  return printWindow(targetWindow, html, p.txnNo);
}

/** The repair voucher, as the multishop app prints it, with this app's QR to the customer's
 *  status page, its "paid" stamp and the shop's own terms from Settings. */
export async function printRepairVoucher(repair: RepairVoucherData, targetWindow: Window | null = null): Promise<boolean> {
  const cloud = cloudPrintActive();
  const popup = targetWindow ?? openPrintWindow();
  if (!popup && !cloud) return false;
  let qr = "";
  if (repair.trackUrl) {
    try {
      qr = await QRCode.toDataURL(repair.trackUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" });
    } catch {
      qr = "";
    }
  }
  // A delivered job prints as the customer's receipt: no drop-off warnings, QR or signatures.
  const receipt = repair.status === "DELIVERED";
  if (receipt) qr = "";
  // In the shop's language and currency (not the screen's): the voucher is the customer's.
  const t = voucherText(repair.language, "print");
  const cur = escapeHtml(repair.currency ?? "MMK");
  const terms = repair.terms ?? t.terms;
  const qrCaption = repair.qrCaption ?? t.qrCaption;
  const device = [repair.deviceBrand, repair.deviceModel].filter(Boolean).join(" ") || "-";
  const charged = repair.finalCost > 0 ? repair.finalCost : repair.estimatedCost;
  const balance = Math.max(0, charged - repair.paidAmount);
  const settled = repair.finalCost > 0 && balance === 0;
  const collectedSub = [t.collectedSub, repair.deliveredAt ? when(repair.deliveredAt) : ""].filter(Boolean).join(" · ");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(repair.jobNo)}</title><style>${baseStyles()}</style></head><body>
    ${brandBlock({ name: repair.shopName, logo: repair.shopLogo, phone: repair.shopPhone, address: repair.shopAddress, subtitle: repair.tagline }, receipt ? t.receiptTitle : t.voucherTitle)}
    ${receipt ? `<div style="margin:6px auto 4px;width:fit-content;border:2px solid #000;border-radius:4px;padding:3px 10px;text-align:center"><div style="font-size:17px;font-weight:700">${escapeHtml(t.collected)}</div>${collectedSub ? `<div style="font-size:10px;font-weight:700">${escapeHtml(collectedSub)}</div>` : ""}</div>` : ""}
    <div class="voucher-no"><span>${escapeHtml(t.voucherNo)}</span><b>${escapeHtml(repair.jobNo)}</b></div>
    <div class="meta" style="margin-top:2px"><div><span>${escapeHtml(t.receivedDate)}</span><b>${escapeHtml(when(repair.at))}</b></div>${receipt && repair.deliveredAt ? `<div><span>${escapeHtml(t.deliveredDate)}</span><b>${escapeHtml(when(repair.deliveredAt))}</b></div>` : ""}<div><span>${escapeHtml(t.name)}</span><b>${escapeHtml(repair.customerName || "-")}</b></div>${repair.customerPhone ? `<div><span>${escapeHtml(t.phone)}</span><b>${escapeHtml(repair.customerPhone)}</b></div>` : ""}</div>
    <table><tbody><tr><th>${escapeHtml(t.device)}</th><td>${escapeHtml(device)}</td></tr>${repair.imei ? `<tr><th>${escapeHtml(t.imei)}</th><td>${escapeHtml(repair.imei)}</td></tr>` : ""}<tr><th>${escapeHtml(t.problem)}</th><td>${escapeHtml(repair.problem || "-")}</td></tr>${repair.accessories ? `<tr><th>${escapeHtml(t.accessories)}</th><td>${escapeHtml(repair.accessories)}</td></tr>` : ""}<tr><th>${escapeHtml(t.status)}</th><td>${escapeHtml(t.statuses[repair.status as RepairStatus] ?? repair.status)}</td></tr></tbody></table>
    <div class="summary"><div><span>${escapeHtml(repair.finalCost > 0 ? t.charge : t.estimated)}</span><b>${charged > 0 ? `${money(charged)} ${cur}` : escapeHtml(t.toConfirm)}</b></div><div><span>${escapeHtml(repair.finalCost > 0 ? t.paid : t.deposit)}</span><b>${money(repair.paidAmount)} ${cur}</b></div>${charged > 0 ? `<div class="grand"><span>${escapeHtml(t.balance)}</span><b>${money(balance)} ${cur}${settled ? `<span class="paid">${escapeHtml(t.settled)}</span>` : ""}</b></div>` : ""}</div>
    ${qr ? `<img class="qr" src="${qr}" alt="QR"/>${qrCaption ? `<p class="qr-link">${escapeHtml(qrCaption)}</p>` : ""}` : ""}
    <div class="footer">${receipt ? escapeHtml(t.thanks) : terms.length > 0 ? `<b>${escapeHtml(t.notice)}</b><ul class="terms">${terms.map((line) => `<li>${nl2br(line)}</li>`).join("")}</ul>` : escapeHtml(t.keep)}</div>
    ${receipt ? "" : `<div class="sign"><div>${repair.receivedByName ? `<b>${escapeHtml(repair.receivedByName)}</b><br/>` : ""}${escapeHtml(t.receiver)}</div><div>${escapeHtml(t.collector)}</div></div>`}
    ${autoPrint(true)}</body></html>`;
  return printWindow(popup, html, repair.jobNo);
}
