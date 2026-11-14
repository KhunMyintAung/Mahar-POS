import { describe, expect, it } from "vitest";
import { AUTHORIZED_HOSTS, ORIGIN_CANARY, ORIGIN_SITE, isAuthorizedHost } from "@/lib/origin";

describe("origin marks", () => {
  it("keeps a stable, searchable canary that names the site", () => {
    expect(ORIGIN_CANARY).toContain(ORIGIN_SITE);
    expect(ORIGIN_CANARY).toMatch(/^MAHARPOS-ORIGIN::/);
  });

  it("treats our own domains and their sub-domains as authorized", () => {
    for (const host of AUTHORIZED_HOSTS) {
      expect(isAuthorizedHost(host), host).toBe(true);
      expect(isAuthorizedHost("www." + host), "www." + host).toBe(true);
    }
    expect(isAuthorizedHost("app.maharpos.shop")).toBe(true);
    expect(isAuthorizedHost("APP.MAHARPOS.SHOP")).toBe(true);
    expect(isAuthorizedHost("app.maharpos.shop:3000")).toBe(true);
  });

  it("leaves development quiet", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]", "my-pc.local", "app.localhost"]) {
      expect(isAuthorizedHost(host), host).toBe(true);
    }
    // A blank or missing host is never flagged.
    expect(isAuthorizedHost("")).toBe(true);
    expect(isAuthorizedHost(null)).toBe(true);
  });

  it("flags a copy served from any other host", () => {
    for (const host of ["copycat.com", "maharpos.shop.evil.com", "notmaharpos.shop", "app.stolen.net"]) {
      expect(isAuthorizedHost(host), host).toBe(false);
    }
  });

  it("does not let a look-alike domain pass as a sub-domain", () => {
    // endsWith must be on a dot boundary, so "xmaharpos.shop" is not ours.
    expect(isAuthorizedHost("xmaharpos.shop")).toBe(false);
    expect(isAuthorizedHost("fakemaharpos.shop")).toBe(false);
  });
});
