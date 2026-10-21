import { Tx } from "@/lib/prisma";
import { ApiError } from "@/lib/api";

/** Per-unit IMEI / serial tracking for items marked trackSerial (phones).
 *
 *  A unit is IN_STOCK from the moment it is bought or registered, SOLD when a sale picks it,
 *  and REMOVED when stock is taken out for another reason. The stock count itself still
 *  lives in StockLevel; these records say which units make up that count. Every write here
 *  runs inside the caller's transaction, beside the stock movement it explains. */

/** An IMEI or serial as stored: no spaces or dashes, upper case. */
export function normalizeImei(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

const IMEI_PATTERN = /^[A-Z0-9]{5,32}$/;

/** Cleans a list, and refuses blanks, odd characters and the same number twice. */
export function cleanImeis(raw: string[] | undefined): string[] {
  const out: string[] = [];
  for (const r of raw ?? []) {
    const v = normalizeImei(r);
    if (!v) continue;
    if (!IMEI_PATTERN.test(v)) throw new ApiError(422, `"${r}" is not a valid IMEI or serial number`);
    if (out.includes(v)) throw new ApiError(422, `IMEI ${v} is entered twice`);
    out.push(v);
  }
  return out;
}

/** The trackSerial items among these ids. */
export async function trackedItemIds(tx: Tx, businessId: string, itemIds: string[]): Promise<Set<string>> {
  const rows = await tx.item.findMany({ where: { businessId, id: { in: itemIds }, trackSerial: true }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

/** Units coming into stock: bought, or added back by an adjustment. A number seen before and
 *  no longer in stock (sold, then traded back in) is taken in again on the same record. */
export async function receiveSerials(
  tx: Tx,
  opts: { businessId: string; branchId: string; itemId: string; imeis: string[]; purchaseId?: string; notes?: string }
) {
  for (const imei of opts.imeis) {
    const existing = await tx.itemSerial.findUnique({ where: { businessId_imei: { businessId: opts.businessId, imei } } });
    if (existing?.status === "IN_STOCK") throw new ApiError(422, `IMEI ${imei} is already in stock`);
    const data = {
      branchId: opts.branchId, itemId: opts.itemId, status: "IN_STOCK", purchaseId: opts.purchaseId ?? null,
      saleId: null, saleLineId: null, soldAt: null, receivedAt: new Date(), notes: opts.notes ?? null,
    };
    if (existing) await tx.itemSerial.update({ where: { id: existing.id }, data });
    else await tx.itemSerial.create({ data: { ...data, businessId: opts.businessId, imei } });
  }
}

/** Units leaving with a sale line. A number not recorded yet (a phone that was on the shelf
 *  before IMEIs were kept) is recorded as sold there and then. */
export async function sellSerials(
  tx: Tx,
  opts: { businessId: string; branchId: string; itemId: string; imeis: string[]; saleId: string; saleLineId: string }
) {
  const now = new Date();
  // A number not seen before can only be one of the units on the shelf that have no IMEI
  // yet. The sale's stock movement has already run, so the shelf held quantity + this line.
  const known = await tx.itemSerial.findMany({ where: { businessId: opts.businessId, imei: { in: opts.imeis } }, select: { imei: true } });
  const unknown = opts.imeis.length - known.length;
  if (unknown > 0) {
    const [level, recorded] = await Promise.all([
      tx.stockLevel.findUnique({ where: { itemId_branchId: { itemId: opts.itemId, branchId: opts.branchId } } }),
      tx.itemSerial.count({ where: { businessId: opts.businessId, itemId: opts.itemId, branchId: opts.branchId, status: "IN_STOCK" } }),
    ]);
    const withoutImei = (level?.quantity ?? 0) + opts.imeis.length - recorded;
    if (unknown > withoutImei) {
      throw new ApiError(422, withoutImei <= 0
        ? "That IMEI is not in stock. Pick one of the phones on the shelf."
        : `Only ${withoutImei} phone(s) on the shelf are without a recorded IMEI`);
    }
  }
  for (const imei of opts.imeis) {
    const existing = await tx.itemSerial.findUnique({ where: { businessId_imei: { businessId: opts.businessId, imei } }, include: { item: { select: { name: true } } } });
    if (existing && existing.status !== "IN_STOCK") throw new ApiError(422, `IMEI ${imei} is not in stock (${existing.status === "SOLD" ? "already sold" : "removed"})`);
    if (existing && existing.itemId !== opts.itemId) throw new ApiError(422, `IMEI ${imei} belongs to ${existing.item.name}`);
    const data = { status: "SOLD", saleId: opts.saleId, saleLineId: opts.saleLineId, soldAt: now };
    if (existing) await tx.itemSerial.update({ where: { id: existing.id }, data });
    else await tx.itemSerial.create({ data: { ...data, businessId: opts.businessId, branchId: opts.branchId, itemId: opts.itemId, imei } });
  }
}

/** A cancelled sale: its units are back on the shelf. */
export async function releaseSaleSerials(tx: Tx, saleId: string) {
  await tx.itemSerial.updateMany({ where: { saleId, status: "SOLD" }, data: { status: "IN_STOCK", saleId: null, saleLineId: null, soldAt: null } });
}

/** A cancelled purchase: the units it brought in go away again — unless one was sold since. */
export async function removePurchaseSerials(tx: Tx, purchaseId: string) {
  const sold = await tx.itemSerial.findFirst({ where: { purchaseId, status: { not: "IN_STOCK" } }, select: { imei: true } });
  if (sold) throw new ApiError(422, `Cannot cancel: IMEI ${sold.imei} from this purchase has already left stock`);
  await tx.itemSerial.deleteMany({ where: { purchaseId, status: "IN_STOCK" } });
}

/** Units taken out by a stock adjustment (damaged, used in a repair, sent back). */
export async function removeSerials(
  tx: Tx,
  opts: { businessId: string; branchId: string; itemId: string; imeis: string[]; notes?: string }
) {
  for (const imei of opts.imeis) {
    const u = await tx.itemSerial.findUnique({ where: { businessId_imei: { businessId: opts.businessId, imei } } });
    if (!u || u.itemId !== opts.itemId || u.branchId !== opts.branchId || u.status !== "IN_STOCK") {
      throw new ApiError(422, `IMEI ${imei} is not in stock for this item here`);
    }
    await tx.itemSerial.update({ where: { id: u.id }, data: { status: "REMOVED", notes: opts.notes ?? u.notes } });
  }
}

/** Phones already counted in stock before their IMEIs were kept: recorded without changing
 *  the count, and never more than the count leaves room for. */
export async function registerExistingSerials(
  tx: Tx,
  opts: { businessId: string; branchId: string; itemId: string; imeis: string[] }
) {
  const [level, recorded] = await Promise.all([
    tx.stockLevel.findUnique({ where: { itemId_branchId: { itemId: opts.itemId, branchId: opts.branchId } } }),
    tx.itemSerial.count({ where: { businessId: opts.businessId, itemId: opts.itemId, branchId: opts.branchId, status: "IN_STOCK" } }),
  ]);
  const room = (level?.quantity ?? 0) - recorded;
  if (opts.imeis.length > room) {
    throw new ApiError(422, room <= 0
      ? "Every unit in stock already has an IMEI. To add new phones, use Purchases or Stock in."
      : `Only ${room} unit(s) in stock are without an IMEI`);
  }
  await receiveSerials(tx, { ...opts, notes: "Registered for existing stock" });
}
