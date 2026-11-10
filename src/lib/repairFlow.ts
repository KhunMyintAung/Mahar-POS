/** How a shop gets its repair parts, set per shop in Settings → Repairs.
 *  - "stock": parts are bought into stock (Purchases, as Service) and taken from it for a job.
 *    Their cost counted as Daily Service Expense when bought, so Reports do not count a job's
 *    parts cost again; on the job it only shows the profit.
 *  - "job": no stock; the part is bought for each job and its price typed in at Mark as paid.
 *    Reports take that cost off service profit, on the day the job was paid.
 *
 *  And how its repair money is kept:
 *  - "job": taken on the job (deposit, Mark as paid, hand back) into a wallet.
 *  - "record": the job is a record only. Its charge and paid state are kept on the job, but no
 *    money moves; the shop types the day's repair money as Daily Service Income, so it is
 *    in the wallets and Reports once. */
export type RepairParts = "stock" | "job";
export type RepairMoney = "job" | "record";
export const REPAIR_FLOW_KEY = "repair_flow";
export interface RepairFlow { parts: RepairParts; money: RepairMoney }
export const DEFAULT_REPAIR_FLOW: RepairFlow = { parts: "stock", money: "job" };

export function parseRepairFlow(raw: unknown): RepairFlow {
  const v = (raw && typeof raw === "object" ? raw : {}) as Partial<RepairFlow>;
  return { parts: v.parts === "job" ? "job" : "stock", money: v.money === "record" ? "record" : "job" };
}
