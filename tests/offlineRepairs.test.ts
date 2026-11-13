import { beforeEach, describe, expect, it, vi } from "vitest";

// A browser's storage and events, enough for the queue.
const store = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  window: { dispatchEvent: () => true, addEventListener: () => {}, removeEventListener: () => {} },
});

const mocks = vi.hoisted(() => ({
  mode: "sync" as "online" | "sync" | "offline",
  api: vi.fn(),
}));
vi.mock("@/lib/client", () => ({ api: mocks.api }));
vi.mock("@/lib/device", () => ({ isDeviceShop: () => false }));
vi.mock("@/lib/netMode", () => ({
  getNetMode: () => mocks.mode,
  isNetworkError: (e: unknown) => e instanceof TypeError,
}));

import {
  LOCAL, NUMBER_TO_COME, applyOp, filterJobs, listRepairOps, overlay, repairAction, reservedNumbers, summarize, syncRepairs,
  type LocalJob, type RepairOp,
} from "@/lib/offlineRepairs";
import { offlineOpProblem } from "@/lib/offlineOp";
import { reserveNumbers } from "@/lib/sequence";

const U = "user-1";
const job = (over: Partial<LocalJob> = {}): LocalJob => ({
  id: "j1", jobNo: "MS0100", status: "RECEIVED", priority: "NORMAL",
  deviceBrand: "iPhone", deviceModel: "11", problem: "Screen",
  estimatedCost: "5000000", partsCost: "0", finalCost: "0", depositAmount: "0", paidAmount: "0",
  receivedAt: "2026-11-10T04:00:00.000Z",
  ...over,
});
const createBody = { deviceBrand: "Samsung", deviceModel: "A52", problem: "Battery", estimatedCost: "30000", depositAmount: "5000" };

beforeEach(() => {
  store.clear();
  mocks.api.mockReset();
  mocks.mode = "sync";
});

describe("repairs kept on the device", () => {
  it("sends at once in Sync later mode when the internet is there, marked so a retry records once", async () => {
    mocks.api.mockResolvedValue(job({ id: "srv-1" }));
    const r = await repairAction(U, "status", "srv-1", { status: "DONE" });
    expect(r.kept).toBe(false);
    const [path, opts] = mocks.api.mock.calls[0];
    expect(path).toBe("/api/v1/repairs/srv-1");
    expect(opts.body.offline.clientRef).toEqual(expect.any(String));
    expect(listRepairOps(U)).toHaveLength(0);
  });

  it("keeps a change when the internet is gone, and a later change to the same job waits behind it", async () => {
    mocks.api.mockRejectedValue(new TypeError("Failed to fetch"));
    const first = await repairAction(U, "status", "srv-1", { status: "IN_PROGRESS" }, { current: job({ id: "srv-1" }) });
    expect(first.kept).toBe(true);
    expect(first.job.status).toBe("IN_PROGRESS");
    mocks.api.mockReset();
    // Back online, but the first change is still waiting: this one must not overtake it.
    const second = await repairAction(U, "status", "srv-1", { status: "DONE" }, { current: first.job });
    expect(second.kept).toBe(true);
    expect(mocks.api).not.toHaveBeenCalled();
    expect(listRepairOps(U).map((o) => o.body.status)).toEqual(["IN_PROGRESS", "DONE"]);
  });

  it("does not keep a change the server refused for a reason", async () => {
    mocks.api.mockRejectedValue(new Error("A delivered job cannot become done"));
    await expect(repairAction(U, "status", "srv-1", { status: "DONE" })).rejects.toThrow(/cannot/);
    expect(listRepairOps(U)).toHaveLength(0);
  });

  it("in Offline mode keeps everything, and a repair taken in takes the next reserved number", async () => {
    mocks.mode = "offline";
    store.set(`mahar-pos:repair-numbers:${U}`, JSON.stringify([{ blockId: "b1", n: 101, jobNo: "MS0101" }, { blockId: "b1", n: 102, jobNo: "MS0102" }]));
    const r = await repairAction(U, "create", "new", createBody, { by: "Aye" });
    expect(mocks.api).not.toHaveBeenCalled();
    expect(r.kept).toBe(true);
    expect(r.job.id.startsWith(LOCAL)).toBe(true);
    expect(r.job.jobNo).toBe("MS0101");
    expect(r.job.paidAmount).toBe("500000");
    expect(reservedNumbers(U).map((x) => x.n)).toEqual([102]);
    expect(listRepairOps(U)[0].body.offlineNumber).toEqual({ blockId: "b1", n: 101 });
  });

  it("says the number is still to come once the reserved numbers run out", async () => {
    mocks.mode = "offline";
    const r = await repairAction(U, "create", "new", createBody);
    expect(r.job.jobNo).toBe(NUMBER_TO_COME);
  });

  it("is not used at all in Online only mode", async () => {
    mocks.mode = "online";
    mocks.api.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(repairAction(U, "create", "new", createBody)).rejects.toThrow();
    expect(listRepairOps(U)).toHaveLength(0);
  });
});

describe("sending kept repairs", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ ok: true, data }) });

  it("sends a repair taken in, then its later changes to the id the server gave it", async () => {
    mocks.mode = "offline";
    store.set(`mahar-pos:repair-numbers:${U}`, JSON.stringify([{ blockId: "b1", n: 101, jobNo: "MS0101" }]));
    const made = await repairAction(U, "create", "new", createBody);
    await repairAction(U, "status", made.job.id, { status: "IN_PROGRESS" }, { current: made.job });
    fetchMock.mockResolvedValueOnce(ok({ id: "srv-9" })).mockResolvedValueOnce(ok({ id: "srv-9" }));
    mocks.api.mockResolvedValue({ blockId: "b2", numbers: [] });

    const r = await syncRepairs(U);
    expect(r).toEqual({ sent: 2, failed: 0, stopped: null });
    const [createUrl, createInit] = fetchMock.mock.calls[0];
    expect(createUrl).toBe("/api/v1/repairs");
    const sent = JSON.parse(createInit.body);
    expect(sent.offline.number).toEqual({ blockId: "b1", n: 101 });
    expect(sent.offlineNumber).toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/v1/repairs/srv-9");
    expect(listRepairOps(U)).toHaveLength(0);
  });

  it("marks a refused change and holds that job's later changes, while other jobs still go", async () => {
    mocks.mode = "offline";
    await repairAction(U, "status", "a", { status: "DONE" });
    await repairAction(U, "status", "a", { status: "DELIVERED" });
    await repairAction(U, "status", "b", { status: "DONE" });
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({ ok: false, error: "Not allowed" }) })
      .mockResolvedValueOnce(ok({ id: "b" }));
    mocks.api.mockResolvedValue({ blockId: "b2", numbers: [] });

    const r = await syncRepairs(U);
    expect(r).toEqual({ sent: 1, failed: 1, stopped: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const left = listRepairOps(U);
    expect(left.map((o) => [o.jobRef, o.status])).toEqual([["a", "failed"], ["a", "pending"]]);
    expect(left[0].error).toBe("Not allowed");
  });

  it("stops without the internet and keeps everything", async () => {
    mocks.mode = "offline";
    await repairAction(U, "status", "a", { status: "DONE" });
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const r = await syncRepairs(U);
    expect(r.stopped).toBe("offline");
    expect(listRepairOps(U)).toHaveLength(1);
  });
});

describe("the list with kept changes", () => {
  const op = (over: Partial<RepairOp>): RepairOp => ({ clientRef: "c1", at: "2026-11-12T05:00:00.000Z", kind: "status", jobRef: "j1", body: {}, status: "pending", ...over });

  it("shows a hand-back as delivered and paid", () => {
    const j = applyOp(job({ finalCost: "6000000", paidAmount: "1000000", status: "DONE" }), op({ body: { status: "DELIVERED", walletId: "w" } }));
    expect(j.status).toBe("DELIVERED");
    expect(j.paidAmount).toBe("6000000");
    expect(j.deliveredAt).toBe("2026-11-12T05:00:00.000Z");
    expect(j.offline).toBe("pending");
  });

  it("puts repairs taken in on this device first", () => {
    const local = { ...job({ id: `${LOCAL}c9`, jobNo: "MS0101" }) };
    const list = overlay([job()], [op({ kind: "create", clientRef: "c9", jobRef: `${LOCAL}c9`, job: local })]);
    expect(list.map((j) => j.id)).toEqual([`${LOCAL}c9`, "j1"]);
  });

  it("filters and counts a kept list the way the server does", () => {
    const jobs = [
      job({ id: "1", status: "IN_PROGRESS", customerName: "Ko Aung" }),
      job({ id: "2", status: "DONE", finalCost: "50000", paidAmount: "0" }),
      job({ id: "3", status: "DELIVERED", cannotRepair: true, receivedAt: "2026-10-03T04:00:00.000Z" }),
      // Done with no price yet: waiting for its price, not money owed.
      job({ id: "4", status: "DONE", finalCost: "0", paidAmount: "0" }),
      job({ id: "5", status: "CANCELLED" }),
    ];
    expect(filterJobs(jobs, { status: "WORKING" }).map((j) => j.id)).toEqual(["1"]);
    expect(filterJobs(jobs, { status: "UNPAID" }).map((j) => j.id)).toEqual(["2"]);
    expect(filterJobs(jobs, { status: "RETURNED_UNFIXED" }).map((j) => j.id)).toEqual(["3"]);
    expect(filterJobs(jobs, { q: "aung" }).map((j) => j.id)).toEqual(["1"]);
    expect(filterJobs(jobs, { month: "2026-10" }).map((j) => j.id)).toEqual(["3"]);
    const s = summarize(jobs, "2026-11");
    expect([s.total, s.inWorkflow, s.completed, s.cancelled, s.unpaid]).toEqual([4, 1, 2, 1, 1]);
    // Each job in one count only: the counts add up to the total.
    expect(s.inWorkflow + s.completed + s.cannotRepair + s.delivered + s.cancelled).toBe(s.total);
  });
});

describe("the server's side", () => {
  const now = new Date("2026-11-13T10:00:00Z");
  it("accepts a change made earlier, refuses one from the future or too long ago", () => {
    expect(offlineOpProblem(new Date("2026-11-12T10:00:00Z"), now)).toBeNull();
    expect(offlineOpProblem(new Date("2026-11-13T11:00:00Z"), now)).toMatch(/still to come/);
    expect(offlineOpProblem(new Date("2026-09-01T10:00:00Z"), now)).toMatch(/older than/);
    expect(offlineOpProblem(new Date("nonsense"), now)).toMatch(/not a time/);
  });

  it("sets aside a block of numbers from the shop's counter", async () => {
    let next = 101;
    const tx = {
      numberSequence: {
        upsert: vi.fn(async ({ update }: { update: { next: { increment: number } } }) => {
          next += update.next.increment;
          return { next };
        }),
      },
    };
    const first = await reserveNumbers(tx as never, "biz", "REPAIR", 20);
    expect(first).toBe(101);
    expect(next).toBe(121);
  });
});
