"use client";

import { useCallback, useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Spinner, Table, useToast } from "@/components/ui";

interface Day {
  date: string; income: string; expense: string; creditCollected: string; payablePaid: string; netCashMovement: string;
}
interface Report { from: string; to: string; daily: Day[]; totals: Record<string, string> }

function toNum(minor: string): number {
  return Number(BigInt(minor)) / 100;
}

export default function ReportsPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { push } = useToast();

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    api<Report>(`/api/v1/reports/summary?${params}`)
      .then(setReport)
      .catch((e) => push(e.message, "error"));
  }, [from, to, push]);
  useEffect(load, [load]);

  if (!report) return <Spinner />;

  const chartData = report.daily.map((d) => ({
    date: d.date.slice(5),
    income: toNum(d.income),
    expense: toNum(d.expense),
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold">Reports</h1>
        <div className="flex flex-wrap items-end gap-2">
          <Input label="From" type="date" value={from || report.from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="To" type="date" value={to || report.to} onChange={(e) => setTo(e.target.value)} />
          <Button variant="secondary" onClick={() => window.print()}><Printer size={16} className="mr-1 inline" />Print</Button>
        </div>
      </div>

      <p className="text-sm text-gray-500">Business report · {report.from} to {report.to} · generated {new Date().toLocaleString()}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><div className="text-xs uppercase text-gray-500">Income − Expense</div><div className="text-lg font-bold tabular-nums">{fmtMoney((BigInt(report.totals.income) - BigInt(report.totals.expense)).toString(), "MMK")}</div></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Daily income vs expense</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData}>
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} width={70} />
              <Tooltip formatter={(v) => Number(v).toLocaleString()} />
              <Legend />
              <Bar dataKey="income" fill="#16a34a" name="Income" />
              <Bar dataKey="expense" fill="#dc2626" name="Expense" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-semibold">Net cash trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" fontSize={11} />
              <YAxis fontSize={11} width={70} />
              <Tooltip formatter={(v) => Number(v).toLocaleString()} />
              <Legend />
              <Line dataKey="netCashMovement" stroke="#2563eb" name="Net cash" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-semibold">Daily breakdown</h3>
        <Table
          headers={["Date", "Income", "Expense", "Collected", "Paid", "Net cash"]}
          rightAlign={[1, 2, 3, 4, 5]}
        >
          {report.daily.map((d) => (
            <tr key={d.date}>
              <td className="px-3 py-2 text-xs">{d.date}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(d.income)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(d.expense)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(d.creditCollected)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(d.payablePaid)}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${BigInt(d.netCashMovement) >= 0n ? "text-green-600" : "text-red-600"}`}>{fmtMoney(d.netCashMovement)}</td>
            </tr>
          ))}
        </Table>
      </Card>

    </div>
  );
}
