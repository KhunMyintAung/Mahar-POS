import { describe, expect, it } from "vitest";
import { withDonation, withoutDonation, type Donation } from "@/lib/community";

const d = (id: string, amount: number, date = "2026-11-19"): Donation => ({ id, name: id, amount, method: "KBZ Pay", date });

describe("top donations list", () => {
  it("adds an entry and keeps the biggest first", () => {
    const out = withDonation([d("a", 5000), d("b", 90000)], d("c", 15000));
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("never lists the same payment twice (an entry with the same id replaces the old one)", () => {
    const out = withDonation([d("pro-1", 15000)], d("pro-1", 85000));
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(85000);
  });

  it("takes an entry off by id, leaving the rest", () => {
    const out = withoutDonation([d("a", 1), d("pro-1", 2), d("b", 3)], "pro-1");
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("stays within the 200 the admin editor accepts, dropping the smallest", () => {
    const many = Array.from({ length: 200 }, (_, i) => d(`x${i}`, 1000 + i));
    const out = withDonation(many, d("big", 999999));
    expect(out).toHaveLength(200);
    expect(out[0].id).toBe("big");
    expect(out.some((x) => x.id === "x0")).toBe(false); // the smallest was dropped
  });

  it("fits a payment's id in the 40 characters the admin list allows", () => {
    const id = `pro-${"7b20000c-88ff-4368-a3e1-129950a38eee"}`;
    expect(id.length).toBeLessThanOrEqual(40);
  });
});
