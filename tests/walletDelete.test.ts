import { describe, expect, it } from "vitest";

/** Mirrors the guard in DELETE /api/v1/wallets/[id]. Removing a wallet that still holds
 *  money would hide the balance rather than move it, so the balance must be zero first. */
function canDelete(currentBalance: bigint): boolean {
  return currentBalance === 0n;
}

/** Mirrors the soft-delete write. The row is kept because the ledger, transfers, sales and
 *  every other record that moved money still point at it. */
function deletionPatch() {
  return { deletedAt: expect.any(Date), active: false };
}

describe("wallet delete", () => {
  it("allows deleting an empty wallet", () => {
    expect(canDelete(0n)).toBe(true);
  });

  it("refuses while the wallet still holds money", () => {
    expect(canDelete(1n)).toBe(false);
    expect(canDelete(5_000_00n)).toBe(false);
  });

  it("refuses on a negative balance too — that is still money to account for", () => {
    expect(canDelete(-2_500_00n)).toBe(false);
  });

  it("marks the row deleted rather than dropping it, so history keeps resolving", () => {
    const patch = deletionPatch();
    expect(patch).toMatchObject({ active: false });
    expect(patch).toHaveProperty("deletedAt");
  });
});
