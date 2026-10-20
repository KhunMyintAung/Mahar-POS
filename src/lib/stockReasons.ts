/** Why stock was moved by hand, so the movement list says what happened to a part rather
 *  than "adjustment". Kept free of server imports so the stock page shares it.
 *
 *  "out" reasons always take stock away and "in" always add it, whatever sign was typed;
 *  a correction can go either way.
 */

export type StockReason = "REPAIR_USE" | "DAMAGE" | "CORRECTION" | "RETURN_OUT" | "RETURN_IN" | "ADJUSTMENT";

export const STOCK_REASONS: { key: StockReason; label: string; direction: "out" | "in" | "either" }[] = [
  { key: "REPAIR_USE", label: "Used for repair", direction: "out" },
  { key: "DAMAGE", label: "Damaged", direction: "out" },
  { key: "CORRECTION", label: "Error / count correction", direction: "either" },
  { key: "RETURN_OUT", label: "Returned to supplier", direction: "out" },
  { key: "RETURN_IN", label: "Returned back to stock", direction: "in" },
  { key: "ADJUSTMENT", label: "Other", direction: "either" },
];

export const STOCK_REASON_KEYS = STOCK_REASONS.map((r) => r.key) as [StockReason, ...StockReason[]];

/** Labels for every movement type the list can show, including ones made elsewhere. */
export const MOVEMENT_LABELS: Record<string, string> = {
  ...Object.fromEntries(STOCK_REASONS.map((r) => [r.key, r.label])),
  ADJUSTMENT: "Adjustment",
  PURCHASE: "Purchase",
  SALE: "Sale",
  PURCHASE_RETURN: "Purchase return",
  SALE_RETURN: "Sale return",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  IMPORT: "CSV import",
};

/** The signed quantity for a reason: out reasons subtract, in reasons add. */
export function signedQuantity(reason: StockReason, quantity: number): number {
  const direction = STOCK_REASONS.find((r) => r.key === reason)?.direction ?? "either";
  if (direction === "out") return -Math.abs(quantity);
  if (direction === "in") return Math.abs(quantity);
  return quantity;
}
