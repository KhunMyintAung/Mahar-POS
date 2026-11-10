import { describe, expect, it } from "vitest";
import { DEFAULT_REPAIR_FLOW, parseRepairFlow } from "@/lib/repairFlow";

describe("repair flow setting", () => {
  it("takes money on the job unless the shop chose record only", () => {
    expect(DEFAULT_REPAIR_FLOW.money).toBe("job");
    expect(parseRepairFlow(undefined).money).toBe("job");
    expect(parseRepairFlow({ parts: "stock" }).money).toBe("job");
    expect(parseRepairFlow({ parts: "stock", money: "record" })).toEqual({ parts: "stock", money: "record" });
    expect(parseRepairFlow({ money: "cash" }).money).toBe("job");
  });

  it("keeps the parts choice when money is set", () => {
    expect(parseRepairFlow({ parts: "job", money: "record" }).parts).toBe("job");
  });
});
