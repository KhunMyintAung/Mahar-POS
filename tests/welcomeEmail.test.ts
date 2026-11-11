import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { temporaryPassword, welcomeEmail } from "@/lib/mail";

const base = { to: "owner@example.test", name: "Somchai", businessName: "Thai <Mobile>", username: "somchai" };

describe("welcome email", () => {
  it("gives the account's details and never a password the owner typed", () => {
    const m = welcomeEmail({ ...base, currency: "USD" });
    expect(m.subject).toContain("Thai <Mobile>");
    expect(m.text).toContain("Username: somchai");
    expect(m.text).toContain("Email: owner@example.test");
    expect(m.text).toContain("Password: the one you chose when you signed up");
    expect(m.text).not.toContain("Temporary password");
    // Whatever a shop is called is escaped in the HTML.
    expect(m.html).toContain("Thai &lt;Mobile&gt;");
    expect(m.html).not.toContain("<Mobile>");
  });

  it("sends a Google sign-up its username and a temporary password", () => {
    const m = welcomeEmail({ ...base, currency: "MMK", viaGoogle: true, temporaryPassword: "Abc234defGhj" });
    expect(m.text).toContain("Username: somchai");
    expect(m.text).toContain("Temporary password: Abc234defGhj");
    expect(m.html).toContain("Abc234defGhj");
    expect(m.html).toContain("Continue with Google");
    expect(m.html).toContain("/forgot-password");
  });

  it("greets in the shop's language: Thai for THB, Myanmar for MMK, English only for USD", () => {
    expect(welcomeEmail({ ...base, currency: "THB" }).html).toMatch(/[฀-๿]/);
    expect(welcomeEmail({ ...base, currency: "THB" }).html).not.toMatch(/[က-႟]/);
    expect(welcomeEmail({ ...base, currency: "MMK" }).html).toMatch(/[က-႟]/);
    expect(welcomeEmail({ ...base, currency: "USD" }).html).not.toMatch(/[฀-๿က-႟]/);
  });

  it("makes temporary passwords that are long, different and easy to read", () => {
    const made = new Set(Array.from({ length: 50 }, temporaryPassword));
    expect(made.size).toBe(50);
    for (const p of made) expect(p).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
  });
});
