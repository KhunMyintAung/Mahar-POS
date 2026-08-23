"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import { Button, Card, Select, Spinner, Table, Empty, useToast } from "@/components/ui";

interface Log {
  id: string; action: string; module: string; resourceType?: string; resourceId?: string;
  before?: string; after?: string; reason?: string; ip?: string; createdAt: string;
  user?: { name: string; username: string };
}
interface Data { logs: Log[]; total: number; page: number; pageSize: number }

export default function AuditPage() {
  const [data, setData] = useState<Data | null>(null);
  const [page, setPage] = useState(1);
  const [moduleFilter, setModuleFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { push } = useToast();

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (moduleFilter) params.set("module", moduleFilter);
    api<Data>(`/api/v1/audit-logs?${params}`).then(setData).catch((e) => push(e.message, "error"));
  }, [page, moduleFilter, push]);
  useEffect(load, [load]);

  if (!data) return <Spinner />;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Audit Logs</h1>
        <Select value={moduleFilter} onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }}>
          <option value="">All modules</option>
          {["auth", "wallet", "credit", "payable", "income_expense", "customer", "daily_close", "users", "settings"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
      </div>

      {data.logs.length === 0 ? (
        <Card><Empty message="No audit entries" /></Card>
      ) : (
        <Table headers={["Time", "User", "Action", "Module", "Resource", "Reason", ""]}>
          {data.logs.map((l) => (
            <tr key={l.id}>
              <td className="px-3 py-2 text-xs text-gray-500">{fmtDateTime(l.createdAt)}</td>
              <td className="px-3 py-2 text-xs">{l.user?.name ?? "—"}</td>
              <td className="px-3 py-2 text-xs font-semibold">{l.action}</td>
              <td className="px-3 py-2 text-xs">{l.module}</td>
              <td className="px-3 py-2 text-xs">{l.resourceType ?? ""}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{l.reason ?? ""}</td>
              <td className="px-3 py-2">
                {(l.before || l.after) && (
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                    {expanded === l.id ? "Hide" : "Details"}
                  </Button>
                )}
                {expanded === l.id && (
                  <pre className="mt-1 max-w-md overflow-x-auto rounded bg-gray-50 p-2 text-[10px] dark:bg-gray-800">
                    {l.before && `Before: ${l.before}\n`}
                    {l.after && `After: ${l.after}`}
                  </pre>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-gray-500">Page {page} of {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
