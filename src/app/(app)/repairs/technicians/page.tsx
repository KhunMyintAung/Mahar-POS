"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Card, Empty, Spinner, Table, useToast } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { RepairTabs } from "@/components/RepairTabs";

/** Technician performance: for a month, each technician's repairs taken in, repaired, could
 *  not repair and still in work, what the repaired ones charged, the parts they used, what is
 *  left, and how many days a repair took. Counted by the name on the repair. */

interface Row {
  name: string; takenIn: number; repaired: number; cannotRepair: number; working: number;
  charged: string; parts: string; profit: string; avgDays: number | null;
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function TechniciansPage() {
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState<Row[] | null>(null);
  const { push } = useToast();

  useEffect(() => {
    api<{ technicians: Row[] }>(`/api/v1/repairs/technicians?month=${month}`)
      .then((d) => setRows(d.technicians))
      .catch((e) => push(e.message, "error"));
  }, [month, push]);

  const named = (rows ?? []).filter((r) => r.name);
  const best = named.reduce<Row | null>((b, r) => (!b || r.repaired > b.repaired ? r : b), null);

  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <PageHeader
        title={<RepairTabs />}
        lead={
          <>
            <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="min-h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
            {best && best.repaired > 0 && (
              <span className="text-sm text-gray-600 dark:text-gray-300">
                🏆 <b className="text-gray-900 dark:text-gray-100">{best.name}</b> · <span>{`${best.repaired} repaired`}</span>
              </span>
            )}
          </>
        }
      />

      {!rows ? <Spinner /> : rows.length === 0 ? (
        <Card><Empty message="No repairs in this month" /></Card>
      ) : (
        <Table headers={["Technician", "Taken in", "Repaired", "Could not repair", "In work now", "Charged", "Parts", "Profit", "Avg days"]} rightAlign={[1, 2, 3, 4, 5, 6, 7, 8]}>
          {rows.map((r) => (
            <tr key={r.name || "—"} className={r.name ? "" : "text-gray-500"}>
              <td className="px-3 py-2.5 font-medium">{r.name ? `🔧 ${r.name}` : "No technician"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.takenIn}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-green-600">{r.repaired}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.cannotRepair}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">{r.working}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.charged)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{fmtMoney(r.parts)}</td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${BigInt(r.profit) < 0n ? "text-red-600" : ""}`}>{fmtMoney(r.profit)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{r.avgDays ?? "—"}</td>
            </tr>
          ))}
        </Table>
      )}
      <p className="text-xs text-gray-500">
        Repaired, charged and parts count repairs finished (Done or Delivered) in the month. In work now is today&apos;s count. Put the technician on each repair when you take it in, or with Edit.
      </p>
    </div>
  );
}
