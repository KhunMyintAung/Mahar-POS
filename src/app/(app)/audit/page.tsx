"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { Button, Card, Select, Spinner, Table, Empty, useToast } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { loginMethod } from "@/lib/loginMethod";

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
    <div className="mx-auto max-w-6xl space-y-3">
      <PageHeader title={<>Audit Logs</>}>
        <Select value={moduleFilter} onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }}>
          <option value="">All modules</option>
          {["auth", "wallet", "credit", "payable", "income_expense", "customer", "daily_close", "users", "settings"].map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </Select>
      </PageHeader>

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
              <td className="px-3 py-2 text-xs">{l.resourceType ?? loginMethod(l) ?? ""}</td>
              <td className="px-3 py-2 text-xs text-gray-500">{l.reason ?? ""}</td>
              <td className="px-3 py-2">
                {(l.before || l.after) && (
                  <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                    {expanded === l.id ? "Hide" : "Details"}
                  </Button>
                )}
                {expanded === l.id && l.action === "IMPORT" && l.module === "item" && l.after ? (
                  <ImportDetails after={l.after} />
                ) : expanded === l.id && (
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

interface ImportAfter {
  created?: number; updated?: number; unchanged?: number; rejected?: number;
  newItems?: string[];
  changed?: { name: string; changes: { field: string; from: string; to: string }[] }[];
  newCategories?: string[];
}

/** An item import in words: how many were new, which items changed and how. Imports from
 *  before these were kept show the counts only. */
function ImportDetails({ after }: { after: string }) {
  let d: ImportAfter;
  try {
    d = JSON.parse(after) as ImportAfter;
  } catch {
    return <pre className="mt-1 text-[10px]">{after}</pre>;
  }
  const value = (field: string, v: string) => (field === "price" || field === "cost" ? fmtMoney(v) : v);
  const fieldName: Record<string, string> = { price: "Price", cost: "Cost", stock: "Stock", category: "Category" };
  return (
    <div className="mt-1 max-w-xl space-y-2 rounded bg-gray-50 p-2 text-xs dark:bg-gray-800">
      <p>
        <span>{`${d.created ?? 0} new item(s)`}</span>
        {" · "}<span>{`${d.updated ?? 0} already on the list`}</span>
        {d.unchanged !== undefined && <>{" · "}<span>{`${d.unchanged} not changed`}</span></>}
        {(d.rejected ?? 0) > 0 && <>{" · "}<span className="text-red-600">{`${d.rejected} row(s) skipped`}</span></>}
      </p>
      {d.newCategories && d.newCategories.length > 0 && (
        <p><span className="font-semibold">New categories</span>: {d.newCategories.join(", ")}</p>
      )}
      {d.changed && d.changed.length > 0 && (
        <div>
          <p className="font-semibold">Changed</p>
          <ul className="space-y-0.5">
            {d.changed.map((c, i) => (
              <li key={i}>
                {c.name}:{" "}
                {c.changes.map((x, j) => (
                  <span key={j} className="mr-2 text-gray-600 dark:text-gray-300">
                    <span>{fieldName[x.field] ?? x.field}</span> {value(x.field, x.from)} → <b>{value(x.field, x.to)}</b>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.newItems && d.newItems.length > 0 && (
        <div>
          <p className="font-semibold">New items</p>
          <p className="text-gray-600 dark:text-gray-300">{d.newItems.join(", ")}</p>
        </div>
      )}
      {d.newItems === undefined && (d.updated ?? 0) > 0 && (
        <p className="text-gray-500">This import was before item-by-item details were kept, so only the counts are known. Items already on the list are updated, not added again.</p>
      )}
      {d.unchanged !== undefined && (d.updated ?? 0) > 0 && d.unchanged === d.updated && (d.created ?? 0) === 0 && (
        <p className="text-gray-500">The same file again: nothing changed.</p>
      )}
    </div>
  );
}
