import { describe, expect, it } from "vitest";
import { partModelCodes, repairFitsPart } from "@/lib/partMatch";

describe("which repairs a part fits", () => {
  it("reads the model codes out of a part's name", () => {
    expect(partModelCodes("Vivo Y28 4G/Y29/Y19s 4G")).toEqual(["y28", "y29", "y19s"]);
    expect(partModelCodes("iPhone 13 Screen")).toEqual(["iphone13"]);
    expect(partModelCodes("Xiaomi Redmi 12C/POCO C55 TL Black")).toEqual(["12c", "c55"]);
    expect(partModelCodes("Battery 5000mAh 33W")).toEqual([]);
  });

  it("fits a repair whose phone carries one of the codes, as a whole number", () => {
    const codes = partModelCodes("Vivo Y28 4G/Y29/Y19s 4G");
    expect(repairFitsPart({ deviceBrand: "Vivo", deviceModel: "Y28" }, codes)).toBe(true);
    expect(repairFitsPart({ deviceBrand: "Vivo", deviceModel: "Y28 4G" }, codes)).toBe(true);
    expect(repairFitsPart({ deviceBrand: "Vivo", deviceModel: "Y19s" }, codes)).toBe(true);
    expect(repairFitsPart({ deviceBrand: "Vivo", deviceModel: "Y280" }, codes)).toBe(false);
    expect(repairFitsPart({ deviceBrand: "Oppo", deviceModel: "A17K" }, codes)).toBe(false);
    expect(repairFitsPart({ deviceBrand: "Redmi", deviceModel: "12C" }, partModelCodes("Redmi 12C/POCO C55"))).toBe(true);
  });
});
