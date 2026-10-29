import { describe, expect, it } from "vitest";
import { buildCsv } from "@/lib/csv";

describe("buildCsv", () => {
  it("puts each table under its name with a blank line between, quoting what needs it", () => {
    const csv = buildCsv([
      { name: "Summary", rows: [["Item", "Amount"], ["Sales, POS", 1500], ['Say "hi"', null]] },
      { name: "ငွေ", rows: [["ဝင်ငွေ", 10]] },
    ]);
    expect(csv).toBe('﻿Summary\r\nItem,Amount\r\n"Sales, POS",1500\r\n"Say ""hi""",\r\n\r\nငွေ\r\nဝင်ငွေ,10\r\n');
  });
});
