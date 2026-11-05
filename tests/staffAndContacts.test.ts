import { describe, expect, it } from "vitest";
import { absentDeduction, daysInMonth, unpaidDays } from "@/services/staffService";
import { parseContactCsv } from "@/lib/contactCsv";
import { defaultFeaturesForMode, parseModuleAccess } from "@/lib/modules";

describe("staff pay", () => {
  it("counts absences whole, half days half, leave free", () => {
    expect(unpaidDays(["PRESENT", "ABSENT", "HALF", "LEAVE", "ABSENT"])).toBe(2.5);
  });
  it("takes a day's pay per day off, rounded to whole kyat", () => {
    expect(daysInMonth("2026-11")).toBe(30);
    expect(daysInMonth("2028-02")).toBe(29);
    // 300,000 / 30 * 1.5 = 15,000
    expect(absentDeduction(30_000_000n, 1.5, 30)).toBe(1_500_000n);
    // 250,000 / 31 = 8,064.52 -> 8,065
    expect(absentDeduction(25_000_000n, 1, 31)).toBe(806_500n);
    expect(absentDeduction(25_000_000n, 0, 31)).toBe(0n);
  });
  it("is off until a shop switches it on", () => {
    expect(defaultFeaturesForMode("BOTH").staff).toBe(false);
    expect(parseModuleAccess({ mode: "BOTH", features: { pos: true } }).features.staff).toBe(false);
    expect(parseModuleAccess({ mode: "BOTH", features: { staff: true } }).features.staff).toBe(true);
  });
});

describe("contact CSV", () => {
  it("reads customers and suppliers, with Myanmar or English types", () => {
    const csv = "﻿Name,Phone,Type,Address,Credit limit\r\nKo Aung,09-123 456,Customer,Yangon,\"50,000\"\r\n\"KK, Parts\",0998,ကုန်သည်,,\r\n,0911,Customer,,\r\nMa Hla,,Robot,,\r\nU Ba,,,,\r\n";
    const r = parseContactCsv(csv, "SUPPLIER");
    expect(r.contacts.map((c) => [c.name, c.type, c.phone, c.creditLimit])).toEqual([
      ["Ko Aung", "CUSTOMER", "09123456", "50000"],
      ["KK, Parts", "SUPPLIER", "0998", ""],
      ["U Ba", "SUPPLIER", "", ""],
    ]);
    expect(r.rejected.map((x) => x.row)).toEqual([4, 5]);
  });
  it("needs a Name column and reports unknown ones", () => {
    expect(parseContactCsv("Phone\n0911").rejected[0].reason).toBe("No Name column");
    expect(parseContactCsv("Name,Colour\nA,red").unknownColumns).toEqual(["colour"]);
  });
});
