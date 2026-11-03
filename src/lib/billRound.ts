/** A bill is always sold for a round sum (3,000, 40,000). When the operator's balance fell
 *  by an odd amount (4,635), the customer paid the next thousand up (5,000) and the rest is
 *  the shop's profit. */
export function roundUpBill(kyat: number) {
  return kyat > 0 ? Math.ceil(Math.round(kyat) / 1000) * 1000 : 0;
}

/** The same, in minor units (BigInt ×100). */
export function roundUpBillMinor(minor: bigint) {
  const step = 1000_00n;
  return minor > 0n ? ((minor + step - 1n) / step) * step : 0n;
}
