"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Button, Empty, Modal, Spinner, useToast } from "@/components/ui";

interface Proposal { id: string; name: string; fixed: string; model: string | null; fixedModel: string | null }

/** Items: puts existing product names right the same way new ones are (capitals, spelling,
 *  spacing). Shows each change first; only the ones left ticked are saved. */
export function TidyNames({ onDone }: { onDone: () => void }) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Proposal[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function start() {
    setOpen(true);
    setList(null);
    api<{ items: Proposal[] }>("/api/v1/items/tidy")
      .then((d) => { setList(d.items); setPicked(new Set(d.items.map((i) => i.id))); })
      .catch((e) => { push(e.message, "error"); setOpen(false); });
  }

  async function apply() {
    setBusy(true);
    try {
      const d = await api<{ updated: number }>("/api/v1/items/tidy", { method: "POST", body: { ids: [...picked] } });
      push(`${d.updated} names corrected`, "success");
      setOpen(false);
      onDone();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string, on: boolean) => setPicked((p) => { const n = new Set(p); if (on) n.add(id); else n.delete(id); return n; });

  return (
    <>
      <Button variant="secondary" onClick={start}>Tidy names</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Tidy names"
        wide
        footer={list && list.length > 0 ? (
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={apply} disabled={busy || picked.size === 0}>{busy ? "Saving…" : `Correct ${picked.size}`}</Button>
          </>
        ) : <Button variant="secondary" onClick={() => setOpen(false)}>Close</Button>}
      >
        {!list ? <Spinner /> : list.length === 0 ? <Empty message="Every name is already in order" /> : (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Capitals, spelling and spacing, the way new items are saved. Untick any you want kept as they are.</p>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={picked.size === list.length} onChange={(e) => setPicked(e.target.checked ? new Set(list.map((i) => i.id)) : new Set())} />
              {`All · ${list.length}`}
            </label>
            <div className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-700">
              {list.map((i) => (
                <label key={i.id} className="flex cursor-pointer items-start gap-2 px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={picked.has(i.id)} onChange={(e) => toggle(i.id, e.target.checked)} />
                  <div className="min-w-0">
                    <div className="text-gray-500 line-through decoration-gray-400">{i.name}</div>
                    <div className="font-medium">{i.fixed}</div>
                    {i.fixedModel !== i.model && <div className="text-xs text-gray-500">{`Model: ${i.model ?? ""} → ${i.fixedModel ?? ""}`}</div>}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
