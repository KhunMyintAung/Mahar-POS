import { describe, expect, it } from "vitest";
import { canMove, REPAIR_STATUSES } from "@/services/repairService";

describe("repair job progress", () => {
  it("walks a normal repair through to the customer", () => {
    expect(canMove("RECEIVED", "IN_PROGRESS")).toBe(true);
    expect(canMove("IN_PROGRESS", "DONE")).toBe(true);
    expect(canMove("DONE", "DELIVERED")).toBe(true);
  });

  it("lets a job wait for parts and come back", () => {
    expect(canMove("IN_PROGRESS", "WAITING_PARTS")).toBe(true);
    expect(canMove("WAITING_PARTS", "IN_PROGRESS")).toBe(true);
  });

  it("will not take back a phone that has gone home", () => {
    // Money is booked on delivery; reopening would charge for it twice.
    for (const status of REPAIR_STATUSES) {
      expect(canMove("DELIVERED", status), status).toBe(false);
    }
  });

  it("will not revive a cancelled job", () => {
    for (const status of REPAIR_STATUSES) {
      expect(canMove("CANCELLED", status), status).toBe(false);
    }
  });

  it("will not hand back a device that was never worked on", () => {
    // Delivering straight from the counter would skip the charge being set.
    expect(canMove("RECEIVED", "DELIVERED")).toBe(false);
    expect(canMove("WAITING_PARTS", "DELIVERED")).toBe(false);
  });

  it("lets a finished job go back on the bench if it was not right", () => {
    expect(canMove("DONE", "IN_PROGRESS")).toBe(true);
  });

  it("refuses a status it has never heard of", () => {
    expect(canMove("RECEIVED", "POSTED")).toBe(false);
    expect(canMove("NONSENSE", "DONE")).toBe(false);
  });
});
