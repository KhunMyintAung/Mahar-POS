/** Why a counted item differs from the books. Chosen on the line while counting (never required),
 *  and written into the stock movement's note when the count is finished, so the movement list says
 *  what happened rather than just "stock count". Kept free of server imports so the screen shares it. */

export const COUNT_REASONS = [
  { key: "COUNT_ERROR", label: "Counting error" },
  { key: "REPAIR_USE", label: "Used in a repair, not recorded" },
  { key: "DAMAGE", label: "Damaged" },
  { key: "UNRECORDED_SALE", label: "Sold, not recorded" },
  { key: "LOST", label: "Missing or lost" },
  { key: "FOUND", label: "Found, not recorded before" },
  { key: "OTHER", label: "Other" },
] as const;

export type CountReason = (typeof COUNT_REASONS)[number]["key"];

export const COUNT_REASON_KEYS = COUNT_REASONS.map((r) => r.key) as [CountReason, ...CountReason[]];

/** The words for a stored reason, or null when there is none (or it is not one we know). */
export function countReasonLabel(key: string | null | undefined): string | null {
  return COUNT_REASONS.find((r) => r.key === key)?.label ?? null;
}
