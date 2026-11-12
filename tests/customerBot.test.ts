import { describe, expect, it } from "vitest";
import { asciiDigits, mmNumber, partQuery, partQuoteText, phoneEndsWith, pickParts, repairCardText } from "@/lib/customerBot";

describe("customer bot: repair check", () => {
  it("matches the last four digits of the phone on the voucher, in either script", () => {
    expect(phoneEndsWith("09 777 123 456", "3456")).toBe(true);
    expect(phoneEndsWith("၀၉၇၇၇၁၂၃၄၅၆", "3456")).toBe(true);
    expect(phoneEndsWith("09777123456", "3457")).toBe(false);
    expect(phoneEndsWith(null, "3456")).toBe(false);
    expect(phoneEndsWith("123", "0123")).toBe(false);
    expect(asciiDigits("MS၀၀၁၂")).toBe("MS0012");
  });

  it("shows the job and the money, never the phone or IMEI", () => {
    const text = repairCardText({
      jobNo: "MS0012", deviceBrand: "Samsung", deviceModel: "A54", problem: "Screen broken", status: "DONE",
      estimatedCost: 0n, finalCost: 8_500_000n, paidAmount: 2_000_000n,
    }, "MMK");
    expect(text).toContain("MS0012");
    expect(text).toContain("ပြင်ပြီး");
    expect(text).toContain("85,000");
    expect(text).toContain("65,000");
  });

  it("gives the estimate when there is no final charge yet", () => {
    const text = repairCardText({
      jobNo: "MS0013", deviceBrand: "Apple", deviceModel: "iPhone 11", problem: "Battery", status: "CHECKING",
      estimatedCost: 4_000_000n, finalCost: 0n, paidAmount: 0n,
    }, "MMK");
    expect(text).toContain("ခန့်မှန်း");
    expect(text).not.toContain("ကျန်ငွေ");
  });
});

describe("customer bot: part prices", () => {
  const names = (list: string[]) => list.map((name) => ({ name }));
  const pick = (query: string, list: string[]) => pickParts(partQuery(query), names(list), (i) => [i.name]).map((i) => i.name);

  it("reads Myanmar part words as the names parts are listed under", () => {
    const q = partQuery("iPhone 11 မှန် ဈေးဘယ်လောက်လဲ");
    expect(q.model).toEqual(["iphone", "11"]);
    expect(q.part).toHaveLength(1);
    expect(q.part[0]).toContain("lcd");
    expect(pick("iPhone 11 မှန်", ["iPhone 11 LCD OLED", "iPhone 11 Battery", "iPhone 12 LCD", "IPHONE 11 TL BLACK INCELL"]))
      .toEqual(["iPhone 11 LCD OLED", "IPHONE 11 TL BLACK INCELL"]);
  });

  it("finds a model typed without its space", () => {
    expect(pick("note9 battery", ["Redmi Note 9 Battery", "Redmi Note 9 LCD"])).toEqual(["Redmi Note 9 Battery"]);
    expect(pick("A54 ဘက်ထရီ", ["Samsung A54 Batt"])).toEqual(["Samsung A54 Batt"]);
  });

  it("takes a part named for its phone alone, but never another part", () => {
    // A shop that lists its screens as just the phone's name.
    expect(pick("Redmi Note 9 မှန်", ["Redmi Note 9", "Redmi Note 9 Battery", "Redmi Note 10"])).toEqual(["Redmi Note 9"]);
    expect(pick("Redmi Note 9", ["Redmi Note 9", "Redmi Note 9 Battery"])).toEqual(["Redmi Note 9", "Redmi Note 9 Battery"]);
  });

  it("does not answer a question with no model in it", () => {
    expect(partQuery("မှန် ဈေး").model).toHaveLength(0);
    expect(partQuery("ဈေး ဘယ်လောက်လဲ")).toEqual({ model: [], part: [] });
    expect(pick("မှန်", ["anything"])).toEqual([]);
  });

  it("says how soon: hours when in stock, days when it has to be ordered", () => {
    const text = partQuoteText("iphone 11 မှန်", {
      parts: [
        { id: "1", name: "iPhone 11 LCD", price: 8_500_000n, inStock: true },
        { id: "2", name: "iPhone 11 LCD OLED", price: 12_000_000n, inStock: false },
      ],
      more: false,
    }, { currency: "MMK", hours: 3, days: 2, note: "လဲခ ပါပြီး" });
    expect(text).toContain(`${mmNumber(3)} နာရီအတွင်း`);
    expect(text).toContain(`${mmNumber(2)} ရက်ခန့်`);
    expect(text).toContain("85,000");
    expect(text).toContain("လဲခ ပါပြီး");
  });
});
