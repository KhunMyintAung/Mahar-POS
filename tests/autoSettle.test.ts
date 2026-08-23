import { describe, expect, it } from "vitest";

/** Mirrors the pairing autoSettleClosedSessions() does: a closed session settles only
 *  once an official number exists for its own draw date. */
function pickSettleable(
  sessions: { id: string; drawDate: string }[],
  official: { drawDate: string; resultNumber: string }[]
) {
  const byDate = new Map(official.map((o) => [o.drawDate, o.resultNumber]));
  const settle: { id: string; resultNumber: string }[] = [];
  const skip: string[] = [];
  for (const s of sessions) {
    const n = byDate.get(s.drawDate);
    if (n) settle.push({ id: s.id, resultNumber: n });
    else skip.push(s.id);
  }
  return { settle, skip };
}

describe("auto settle pairing", () => {
  const official = [
    { drawDate: "2026-08-01", resultNumber: "479" },
    { drawDate: "2026-07-16", resultNumber: "214" },
  ];

  it("settles sessions whose draw date has an official number", () => {
    const { settle } = pickSettleable(
      [{ id: "a", drawDate: "2026-08-01" }, { id: "b", drawDate: "2026-07-16" }],
      official
    );
    expect(settle).toEqual([
      { id: "a", resultNumber: "479" },
      { id: "b", resultNumber: "214" },
    ]);
  });

  it("leaves a session alone when its date has no result yet", () => {
    const { settle, skip } = pickSettleable([{ id: "c", drawDate: "2026-07-30" }], official);
    expect(settle).toHaveLength(0);
    expect(skip).toEqual(["c"]);
  });

  it("never borrows another date's number", () => {
    const { settle } = pickSettleable(
      [{ id: "d", drawDate: "2026-07-31" }, { id: "e", drawDate: "2026-08-01" }],
      official
    );
    // Only the 08-01 session settles; 07-31 must not pick up 479.
    expect(settle).toEqual([{ id: "e", resultNumber: "479" }]);
  });

  it("handles several sessions sharing one draw date", () => {
    const { settle } = pickSettleable(
      [
        { id: "x", drawDate: "2026-08-01" },
        { id: "y", drawDate: "2026-08-01" },
        { id: "z", drawDate: "2026-08-01" },
      ],
      official
    );
    expect(settle.map((s) => s.resultNumber)).toEqual(["479", "479", "479"]);
  });
});
