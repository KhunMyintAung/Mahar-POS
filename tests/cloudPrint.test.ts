import { describe, expect, it } from "vitest";
import { claimableWhere, cloudPrintBusinessIds, cloudPrintEnabled, CLAIM_STALE_MS } from "@/lib/cloudPrint";
import { stripScripts } from "@/lib/cloudPrintSend";

describe("which shops have cloud print", () => {
  it("is nobody's when the setting is missing or empty", () => {
    expect(cloudPrintEnabled("shop-1", undefined)).toBe(false);
    expect(cloudPrintEnabled("shop-1", "")).toBe(false);
    expect(cloudPrintEnabled("", " , ")).toBe(false);
  });

  it("is only the listed shops'", () => {
    const env = " shop-1 ,shop-2,";
    expect(cloudPrintBusinessIds(env)).toEqual(["shop-1", "shop-2"]);
    expect(cloudPrintEnabled("shop-1", env)).toBe(true);
    expect(cloudPrintEnabled("shop-2", env)).toBe(true);
    expect(cloudPrintEnabled("shop-3", env)).toBe(false);
  });

  it("does not match part of an id", () => {
    expect(cloudPrintEnabled("shop", "shop-1")).toBe(false);
  });
});

describe("what a station may take", () => {
  it("is only its own shop's waiting slips and ones a dead station left", () => {
    const now = new Date("2026-11-02T10:00:00Z");
    const where = claimableWhere("shop-1", now);
    expect(where.businessId).toBe("shop-1");
    expect(where.OR).toEqual([
      { status: "QUEUED" },
      { status: "PRINTING", claimedAt: { lt: new Date(now.getTime() - CLAIM_STALE_MS) } },
    ]);
  });
});

describe("a slip sent from a phone", () => {
  it("loses its scripts, so it cannot print itself or run on the station", () => {
    const html = '<p>Total</p><script>window.onload=()=>window.print();</script><SCRIPT type="x">a</SCRIPT ><b>1,000</b>';
    expect(stripScripts(html)).toBe("<p>Total</p><b>1,000</b>");
  });
});
