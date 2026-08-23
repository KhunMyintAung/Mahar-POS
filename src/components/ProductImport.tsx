"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Card, Modal, Table, useToast } from "@/components/ui";
import { CSV_TEMPLATE } from "@/lib/productCsv";

interface Planned {
  row: number;
  name: string;
  sku: string;
  action: "CREATE" | "UPDATE";
  sellingPrice: string;
  quantity: number;
}
interface Rejected {
  row: number;
  raw: string;
  reason: string;
}
interface Preview {
  willCreate: number;
  willUpdate: number;
  planned: Planned[];
  rejected: Rejected[];
  unknownColumns: string[];
}

/** Import products from a CSV, showing what will happen before anything is written. */
export function ProductImport({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { push } = useToast();

  function reset() {
    setCsv("");
    setFileName("");
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function readFile(file: File) {
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setPreview(null);
    // Straight to the preview: choosing the file is the whole of the user's intent, and
    // making them press a second button to see what it contains helps nobody.
    await run(text, false);
  }

  async function run(text: string, commit: boolean) {
    setBusy(true);
    try {
      const result = await api<Preview & { created?: number; updated?: number }>(
        "/api/v1/items/import",
        { method: "POST", body: { csv: text, commit } }
      );
      if (commit) {
        push(`Imported — ${result.created ?? 0} new, ${result.updated ?? 0} updated`);
        setOpen(false);
        reset();
        onDone();
      } else {
        setPreview(result);
      }
    } catch (error) {
      push(error instanceof Error ? error.message : "Import failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wallet-note-products.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Upload size={16} className="mr-1 inline" />Import CSV
      </Button>

      <Modal
        open={open}
        onClose={() => { setOpen(false); reset(); }}
        title="Import products from a CSV"
        wide
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void readFile(file);
              }}
              className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            />
            <Button variant="secondary" size="sm" onClick={downloadTemplate}>
              <Download size={15} className="mr-1 inline" />Template
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Columns: name, sku, barcode, category, cost, price, quantity, min stock. Only the
            name is required — a SKU is made from the name when the column is empty, and a
            category that does not exist yet is created.
          </p>

          {busy && !preview && <p className="text-sm text-gray-500">Reading {fileName}…</p>}

          {preview && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Card className="py-2">
                  <div className="text-lg font-bold text-green-600">{preview.willCreate}</div>
                  <div className="text-xs text-gray-500">new</div>
                </Card>
                <Card className="py-2">
                  <div className="text-lg font-bold text-blue-600">{preview.willUpdate}</div>
                  <div className="text-xs text-gray-500">updated</div>
                </Card>
                <Card className="py-2">
                  <div className={`text-lg font-bold ${preview.rejected.length ? "text-red-600" : "text-gray-400"}`}>
                    {preview.rejected.length}
                  </div>
                  <div className="text-xs text-gray-500">skipped</div>
                </Card>
              </div>

              {preview.unknownColumns.length > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                  These columns were not recognised and will be ignored:{" "}
                  <b>{preview.unknownColumns.join(", ")}</b>
                </p>
              )}

              {preview.rejected.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-red-600">Rows that will be skipped</h3>
                  <div className="max-h-40 overflow-y-auto">
                    <Table headers={["Line", "Why", "Content"]}>
                      {preview.rejected.map((row) => (
                        <tr key={row.row}>
                          <td className="px-3 py-1.5 tabular-nums">{row.row}</td>
                          <td className="px-3 py-1.5 text-red-600">{row.reason}</td>
                          <td className="max-w-[16rem] truncate px-3 py-1.5 font-mono text-xs text-gray-500">{row.raw}</td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </div>
              )}

              {preview.planned.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold">What will be saved</h3>
                  <div className="max-h-56 overflow-y-auto">
                    <Table headers={["Line", "Product", "SKU", "Price", "Qty", ""]} rightAlign={[3, 4]}>
                      {preview.planned.map((row) => (
                        <tr key={row.row}>
                          <td className="px-3 py-1.5 tabular-nums text-gray-500">{row.row}</td>
                          <td className="px-3 py-1.5">{row.name}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{row.sku}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{row.sellingPrice}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{row.quantity}</td>
                          <td className="px-3 py-1.5">
                            <span className={`text-xs font-medium ${row.action === "CREATE" ? "text-green-600" : "text-blue-600"}`}>
                              {row.action === "CREATE" ? "new" : "update"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={reset}>Choose another file</Button>
                <Button
                  onClick={() => void run(csv, true)}
                  disabled={busy || preview.planned.length === 0}
                >
                  {busy
                    ? "Saving…"
                    : `Import ${preview.planned.length} product${preview.planned.length === 1 ? "" : "s"}`}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
