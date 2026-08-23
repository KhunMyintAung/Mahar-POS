import { afterEach, describe, expect, it } from "vitest";
import { adminUsers, isAdminIdentity, issueUnlockToken, passcodeMatches, unlockTokenValid } from "@/lib/adminAccess";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("who reaches the admin panel", () => {
  it("nobody, when the list is not set", () => {
    // The panel reports every business. An unset setting must close it, not open it.
    delete process.env.ADMIN_USERS;
    expect(adminUsers()).toEqual([]);
    expect(isAdminIdentity({ username: "khunmyintaung", email: "k@x.com" })).toBe(false);
  });

  it("nobody, when the list is blank or only separators", () => {
    for (const value of ["", "   ", ",", " , , "]) {
      process.env.ADMIN_USERS = value;
      expect(adminUsers(), value).toEqual([]);
      expect(isAdminIdentity({ username: "anyone" }), value).toBe(false);
    }
  });

  it("matches on username or email, either case", () => {
    process.env.ADMIN_USERS = "KhunMyintAung, owner@example.com";
    expect(isAdminIdentity({ username: "khunmyintaung" })).toBe(true);
    expect(isAdminIdentity({ username: "someone", email: "OWNER@example.com" })).toBe(true);
  });

  it("turns away an account that is not named", () => {
    process.env.ADMIN_USERS = "khunmyintaung";
    // Any stranger who signs up with Google is an Owner of their own business, so being
    // an Owner cannot be what decides this.
    expect(isAdminIdentity({ username: "stranger", email: "stranger@gmail.com" })).toBe(false);
    expect(isAdminIdentity(null)).toBe(false);
    expect(isAdminIdentity({})).toBe(false);
  });

  it("does not treat a missing name as a match against a blank entry", () => {
    process.env.ADMIN_USERS = "khunmyintaung";
    expect(isAdminIdentity({ username: null, email: null })).toBe(false);
    expect(isAdminIdentity({ username: "", email: "" })).toBe(false);
  });
});

describe("passcodeMatches", () => {
  afterEach(() => {
    delete process.env.ADMIN_PASSCODE;
  });

  it("refuses everything when no passcode is configured", () => {
    expect(passcodeMatches("Mahar1234")).toBe(false);
    expect(passcodeMatches("")).toBe(false);
  });

  it("accepts the configured passcode and nothing else", () => {
    process.env.ADMIN_PASSCODE = "Mahar1234";
    expect(passcodeMatches("Mahar1234")).toBe(true);
    expect(passcodeMatches("mahar1234")).toBe(false);
    expect(passcodeMatches("Mahar123")).toBe(false);
  });

  it("handles a Burmese passcode rather than throwing on it", () => {
    // A multi-byte passcode compared against a shorter guess used to throw inside
    // timingSafeEqual and take the whole page down instead of refusing the attempt.
    process.env.ADMIN_PASSCODE = "မဟာရွှေ၁၂၃၄";
    expect(passcodeMatches("မဟာရွှေ၁၂၃၄")).toBe(true);
    expect(() => passcodeMatches("x")).not.toThrow();
    expect(passcodeMatches("x")).toBe(false);
  });
});

describe("unlock token", () => {
  it("accepts a token it just issued", () => {
    process.env.AUTH_SECRET = "test-secret";
    const now = Date.now();
    expect(unlockTokenValid(issueUnlockToken(now).value, now + 1000)).toBe(true);
  });

  it("refuses one that has run out", () => {
    process.env.AUTH_SECRET = "test-secret";
    const now = Date.now();
    const token = issueUnlockToken(now);
    expect(unlockTokenValid(token.value, now + (token.maxAge + 1) * 1000)).toBe(false);
  });

  it("refuses a token whose expiry has been edited", () => {
    process.env.AUTH_SECRET = "test-secret";
    const now = Date.now();
    const [, signature] = issueUnlockToken(now).value.split(".");
    const forged = `${now + 99 * 3600_000}.${signature}`;
    expect(unlockTokenValid(forged, now)).toBe(false);
  });

  it("refuses junk", () => {
    expect(unlockTokenValid(undefined)).toBe(false);
    expect(unlockTokenValid("nonsense")).toBe(false);
  });
});
