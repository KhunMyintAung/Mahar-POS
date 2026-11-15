import { describe, expect, it } from "vitest";
import { PROVIDER_LOGOS, providerLogoFor } from "@/lib/providerLogos";

describe("providerLogoFor", () => {
  it("has a data-URL logo for each known provider", () => {
    for (const key of ["atom", "mpt", "mytel", "u9"]) {
      expect(PROVIDER_LOGOS[key], key).toMatch(/^data:image\//);
    }
  });

  it("matches a biller named after a provider, whatever the wording", () => {
    expect(providerLogoFor("MPT T02605")).toBe(PROVIDER_LOGOS.mpt);
    expect(providerLogoFor("MPT Eload")).toBe(PROVIDER_LOGOS.mpt);
    expect(providerLogoFor("ATOM ELOAD")).toBe(PROVIDER_LOGOS.atom);
    expect(providerLogoFor("Atom")).toBe(PROVIDER_LOGOS.atom);
    expect(providerLogoFor("Mytel Test")).toBe(PROVIDER_LOGOS.mytel);
    expect(providerLogoFor("U9")).toBe(PROVIDER_LOGOS.u9);
  });

  it("returns null for a name that is not a known provider", () => {
    expect(providerLogoFor("NearMe")).toBeNull();
    expect(providerLogoFor("KBZ")).toBeNull();
    expect(providerLogoFor("Cash")).toBeNull();
    // Not a loose substring: "atomic" is not ATOM.
    expect(providerLogoFor("atomic services")).toBeNull();
  });
});
