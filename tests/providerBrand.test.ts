import { describe, expect, it } from "vitest";
import { brandFor } from "@/lib/providerBrand";

describe("brandFor", () => {
  it("matches a mobile wallet before its bank (KBZ Pay is not KBZ bank)", () => {
    expect(brandFor("KBZ Pay").label).toBe("KPay");
    expect(brandFor("kbzpay").kind).toBe("wallet");
    expect(brandFor("KBZ Bank").label).toBe("KBZ");
    expect(brandFor("KBZ").kind).toBe("bank");
  });

  it("knows Myanmar telecoms", () => {
    expect(brandFor("MPT").label).toBe("MPT");
    expect(brandFor("Ooredoo topup").label).toBe("Ooredoo");
    expect(brandFor("ATOM eload").label).toBe("ATOM");
    expect(brandFor("Mytel").label).toBe("Mytel");
    for (const t of ["MPT", "Ooredoo", "ATOM", "Mytel"]) expect(brandFor(t).kind).toBe("telecom");
  });

  it("gives Wave a light colour that needs dark text", () => {
    expect(brandFor("Wave Money").label).toBe("Wave");
    expect(brandFor("Wave Money").dark).toBe(true);
  });

  it("marks cash with a banknote rather than letters", () => {
    expect(brandFor("Cash").cash).toBe(true);
    expect(brandFor("ငွေသား").cash).toBe(true);
    expect(brandFor("Cash drawer").cash).toBe(true);
  });

  it("falls back to steady initials and a steady colour for an unknown name", () => {
    const a = brandFor("Shwe Yaung Store");
    expect(a.label).toBe("SY");
    // Same name, same colour every time.
    expect(brandFor("Shwe Yaung Store").color).toBe(a.color);
    expect(brandFor("Zawgyi").label).toBe("ZA");
  });

  it("gives every brand a non-empty colour", () => {
    for (const name of ["KBZ", "AYA Pay", "CB Bank", "MPT", "Wave", "Random Co", "Cash"]) {
      expect(brandFor(name).color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
