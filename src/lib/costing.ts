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

/** The weighted average with a delivery taken back out of the pool, for a cancelled purchase:
 *  the reverse of `averageCost`.
 *
 *    10 at 500 + 10 bought at 1,000 → 750; cancel the 10 → (15,000 − 10,000) / 10 = 500
 *
 *  - Nothing would be left on hand → the cost stays as it is (there is nothing to value).
 *  - The pool would come to nothing or less (the price on hand has moved since) → stays too.
 *  All in minor units, rounded to the nearest one. */
export function averageCostWithout(onHand: number, cost: bigint, quantity: number, unitCost: bigint): bigint {
  const left = onHand - quantity;
  if (quantity <= 0 || left <= 0 || cost <= 0n) return cost;
  const pool = BigInt(onHand) * cost - BigInt(quantity) * unitCost;
  if (pool <= 0n) return cost;
  const units = BigInt(left);
  return (pool * 2n + units) / (units * 2n);
}
