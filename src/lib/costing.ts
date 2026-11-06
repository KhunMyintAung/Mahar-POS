/** Weighted average cost, the usual way a shop values stock bought at changing prices:
 *  what is on the shelf and what just came in are pooled, and every unit is then worth the
 *  pool's total cost over its count.
 *
 *    5 on hand at 3,000 + 10 bought at 3,500 → (15,000 + 35,000) / 15 = 3,333
 *
 *  - Nothing on hand (or a count below zero) → the new price alone.
 *  - No cost known yet for the stock on hand (0) → the new price alone, not an average with 0.
 *  - A free (FOC) delivery joins the pool at no cost and brings the average down; with
 *    nothing on hand it leaves the cost as it was, so the item never looks free.
 *  All in minor units, rounded to the nearest one. */
export function averageCost(onHand: number, oldCost: bigint, quantity: number, unitCost: bigint): bigint {
  if (quantity <= 0) return oldCost;
  if (onHand <= 0 || oldCost <= 0n) return unitCost > 0n ? unitCost : oldCost;
  const units = BigInt(onHand + quantity);
  const pool = BigInt(onHand) * oldCost + BigInt(quantity) * unitCost;
  return (pool * 2n + units) / (units * 2n);
}
