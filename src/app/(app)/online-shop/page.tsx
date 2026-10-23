"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Copy, ExternalLink, ImagePlus, MapPin, Phone, Search, ShoppingCart, Star, Trash2, X } from "lucide-react";
import { api } from "@/lib/client";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { resizeImage } from "@/lib/imageResize";
import { Button, Card, Empty, Input, Spinner, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

/** Online Shop: the orders customers send from the shop's public page, the items shown
 *  there with their photos, and the page's address and words. */

interface OrderLine { id: string; itemId: string; name: string; quantity: number; unitPrice: string }
interface Order {
  id: string; orderNo: string; status: "NEW" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
  customerName: string; customerPhone: string; address: string | null; note: string | null;
  total: string; saleId: string | null; createdAt: string; lines: OrderLine[];
}
interface Product {
  id: string; name: string; sku: string; price: string; onlineVisible: boolean;
  description: string; category: string; stock: number; images: string[];
}
interface ShopSettings {
  slug: string; suggestedSlug: string; shopPhone: string;
  enabled: boolean; intro: string; delivery: string; payment: string; phone: string;
}

const TABS = [["orders", "Orders"], ["products", "Products"], ["settings", "Shop settings"]] as const;
type Tab = (typeof TABS)[number][0];

const STATUS: Record<Order["status"], { label: string; tone: string }> = {
  NEW: { label: "New", tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  CONFIRMED: { label: "Confirmed", tone: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  COMPLETED: { label: "Completed", tone: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
  CANCELLED: { label: "Cancelled", tone: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

const imageUrl = (id: string) => `/api/public/item-image/${id}`;
const field = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none focus:border-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 sm:text-sm";

export default function OnlineShopPage() {
  const [tab, setTab] = useState<Tab>("orders");
  return (
    <div className="mx-auto max-w-5xl space-y-3">
      <PageHeader title={<>Online Shop</>} />
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn("min-w-0 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium", tab === key ? "bg-white text-blue-600 shadow dark:bg-gray-900" : "text-gray-600 dark:text-gray-300")}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "orders" && <OrdersTab />}
      {tab === "products" && <ProductsTab />}
      {tab === "settings" && <SettingsTab />}
    </div>
  );
}

/* ---------------- Orders ---------------- */

/** Puts an order in the POS cart, the way POS keeps its own unfinished sale, so opening POS
 *  shows it ready to ring up. Asks first when POS already has a cart going. */
function putOrderInPos(key: string, order: Order): "ok" | "kept" | "failed" {
  try {
    const current = JSON.parse(localStorage.getItem(key) ?? "null") as { lines?: unknown[] } | null;
    if (current?.lines?.length && !window.confirm("POS has items in its cart. Replace them with this order?")) return "kept";
    localStorage.setItem(key, JSON.stringify({
      savedAt: Date.now(),
      lines: order.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, unitPrice: Number(BigInt(l.unitPrice)) / 100 })),
      discount: "0", walletId: "", customerId: "", payMode: "full", partialAmount: "", cashReceived: "",
      onlineOrder: { id: order.id, orderNo: order.orderNo, customerName: order.customerName, customerPhone: order.customerPhone },
    }));
    return "ok";
  } catch {
    return "failed";
  }
}

function OrdersTab() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"" | Order["status"]>("NEW");
  const [busy, setBusy] = useState<string | null>(null);
  const { push } = useToast();
  const { me, hasPerm } = useAuth();
  const router = useRouter();

  const load = useCallback(() => {
    api<{ orders: Order[]; counts: Record<string, number> }>(`/api/v1/online-shop/orders${filter ? `?status=${filter}` : ""}`)
      .then((d) => { setOrders(d.orders); setCounts(d.counts); })
      .catch((e) => push(e.message, "error"));
  }, [filter, push]);
  useEffect(load, [load]);

  async function setStatus(order: Order, status: Order["status"]) {
    setBusy(order.id);
    try {
      await api(`/api/v1/online-shop/orders/${order.id}`, { method: "PATCH", body: { status } });
      push(status === "CANCELLED" ? `${order.orderNo} cancelled` : `${order.orderNo} confirmed`);
      load();
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }

  function ringUp(order: Order) {
    const done = putOrderInPos(`mahar-pos:pos-draft:${me?.user.id ?? "anonymous"}`, order);
    if (done === "failed") push("Could not open POS", "error");
    if (done === "ok") router.push("/pos");
  }

  const chips: ["" | Order["status"], string][] = [["NEW", "New"], ["CONFIRMED", "Confirmed"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"], ["", "All"]];
  const canAct = hasPerm("sale.create");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([key, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setFilter(key)}
            className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium", filter === key ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200")}
          >
            {label}
            {key && counts[key] ? <span className={cn("rounded-full px-1.5 text-xs", filter === key ? "bg-white/25" : "bg-gray-100 dark:bg-gray-800")}>{counts[key]}</span> : null}
          </button>
        ))}
      </div>

      {!orders ? <Spinner /> : orders.length === 0 ? (
        <Empty message={filter === "NEW" ? "No new orders. Orders customers send from your shop page show here." : "No orders here"} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((o) => (
            <Card key={o.id} className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-sm font-semibold">{o.orderNo}</div>
                  <div className="text-xs text-gray-500">{fmtDateTime(o.createdAt)}</div>
                </div>
                <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", STATUS[o.status].tone)}>{STATUS[o.status].label}</span>
              </div>
              <div className="space-y-1 text-sm">
                <div className="font-medium">{o.customerName}</div>
                <a href={`tel:${o.customerPhone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-1.5 text-blue-600"><Phone size={14} />{o.customerPhone}</a>
                {o.address && <div className="flex items-start gap-1.5 text-gray-600 dark:text-gray-300"><MapPin size={14} className="mt-0.5 shrink-0" /><span className="[overflow-wrap:anywhere]">{o.address}</span></div>}
                {o.note && <div className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">{o.note}</div>}
              </div>
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-100 text-sm dark:divide-gray-800 dark:border-gray-800">
                {o.lines.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <span className="shrink-0 text-xs text-gray-500">× {l.quantity}</span>
                    <b className="w-24 shrink-0 text-right tabular-nums">{fmtMoney(BigInt(l.unitPrice) * BigInt(l.quantity))}</b>
                  </div>
                ))}
                <div className="flex justify-between px-2.5 py-1.5 font-semibold"><span>Total</span><span className="tabular-nums text-blue-600">{fmtMoney(o.total, "MMK")}</span></div>
              </div>
              {canAct && (o.status === "NEW" || o.status === "CONFIRMED") && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => ringUp(o)}><ShoppingCart size={14} className="mr-1 inline" />Ring up in POS</Button>
                  {o.status === "NEW" && <Button size="sm" variant="secondary" disabled={busy === o.id} onClick={() => setStatus(o, "CONFIRMED")}><Check size={14} className="mr-1 inline" />Confirm</Button>}
                  <Button size="sm" variant="ghost" disabled={busy === o.id} onClick={() => window.confirm(`Cancel ${o.orderNo}?`) && setStatus(o, "CANCELLED")}><X size={14} className="mr-1 inline" />Cancel</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Products ---------------- */

function ProductsTab() {
  const [items, setItems] = useState<Product[] | null>(null);
  const [q, setQ] = useState("");
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { push } = useToast();
  const { hasPerm } = useAuth();
  const canEdit = hasPerm("item.manage");

  const load = useCallback(() => {
    api<{ items: Product[] }>("/api/v1/online-shop/products").then((d) => setItems(d.items)).catch((e) => push(e.message, "error"));
  }, [push]);
  useEffect(load, [load]);

  const patchLocal = (id: string, patch: Partial<Product>) => setItems((list) => list?.map((i) => (i.id === id ? { ...i, ...patch } : i)) ?? list);

  async function toggle(item: Product) {
    const next = !item.onlineVisible;
    patchLocal(item.id, { onlineVisible: next });
    try {
      await api(`/api/v1/online-shop/products/${item.id}`, { method: "PATCH", body: { onlineVisible: next } });
    } catch (e) {
      patchLocal(item.id, { onlineVisible: !next });
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (!items) return <Spinner />;
  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => (!onlyOnline || i.onlineVisible) && (!needle || `${i.name} ${i.sku} ${i.category}`.toLowerCase().includes(needle)));
  const onlineCount = items.filter((i) => i.onlineVisible).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" className={cn(field, "min-h-10 pl-9")} />
        </label>
        <button
          type="button"
          onClick={() => setOnlyOnline((v) => !v)}
          className={cn("min-h-10 whitespace-nowrap rounded-lg border px-3 text-sm font-medium", onlyOnline ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200")}
        >
          Shown online ({onlineCount})
        </button>
      </div>
      <p className="text-xs text-gray-500">Turn on the items customers can see and order. Add photos so they look good.</p>

      {shown.length === 0 ? <Empty message="No items" /> : (
        <div className="space-y-2">
          {shown.map((item) => (
            <Card key={item.id} className="space-y-3 p-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setOpen(open === item.id ? null : item.id)} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800" aria-label={`Photos of ${item.name}`}>
                  {item.images[0]
                    // eslint-disable-next-line @next/next/no-img-element -- served by our own route; nothing for next/image to optimise
                    ? <img src={imageUrl(item.images[0])} alt="" className="h-full w-full object-cover" />
                    : <ImagePlus size={20} className="m-auto text-gray-400" />}
                </button>
                <button type="button" onClick={() => setOpen(open === item.id ? null : item.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium">{item.name}</div>
                  <div className="text-xs text-gray-500">{fmtMoney(item.price)} MMK · stock {item.stock} · {item.images.length} photo{item.images.length === 1 ? "" : "s"}</div>
                </button>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                  <span className="hidden sm:inline">Show online</span>
                  <span className={cn("relative h-6 w-11 rounded-full transition", item.onlineVisible ? "bg-green-600" : "bg-gray-300 dark:bg-gray-700")}>
                    <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", item.onlineVisible ? "left-5" : "left-0.5")} />
                  </span>
                  <input type="checkbox" className="sr-only" checked={item.onlineVisible} disabled={!canEdit} onChange={() => toggle(item)} />
                </label>
              </div>
              {open === item.id && <ProductEditor item={item} canEdit={canEdit} onChange={(patch) => patchLocal(item.id, patch)} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductEditor({ item, canEdit, onChange }: { item: Product; canEdit: boolean; onChange: (patch: Partial<Product>) => void }) {
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState(item.description);
  const fileRef = useRef<HTMLInputElement>(null);
  const { push } = useToast();

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    let images = item.images;
    try {
      for (const file of [...files].slice(0, 4 - images.length)) {
        const dataUrl = await resizeImage(file);
        const created = await api<{ id: string }>(`/api/v1/online-shop/products/${item.id}`, { method: "POST", body: { dataUrl } });
        images = [...images, created.id];
        onChange({ images });
      }
    } catch (e) {
      push(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this photo?")) return;
    try {
      await api(`/api/v1/online-shop/images/${id}`, { method: "DELETE" });
      onChange({ images: item.images.filter((x) => x !== id) });
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function makeFirst(id: string) {
    try {
      await api(`/api/v1/online-shop/images/${id}`, { method: "PATCH", body: { first: true } });
      onChange({ images: [id, ...item.images.filter((x) => x !== id)] });
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function saveDescription() {
    if (description === item.description) return;
    try {
      await api(`/api/v1/online-shop/products/${item.id}`, { method: "PATCH", body: { description } });
      onChange({ description });
      push("Saved");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <div className="grid grid-cols-4 gap-2">
        {item.images.map((id, i) => (
          <div key={id} className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by our own route */}
            <img src={imageUrl(id)} alt="" className="h-full w-full object-cover" />
            {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] font-medium text-white">Cover</span>}
            {canEdit && (
              <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 p-1">
                {i > 0 && <button type="button" onClick={() => makeFirst(id)} className="rounded bg-white/90 p-1 text-gray-700" title="Make cover" aria-label="Make cover"><Star size={13} /></button>}
                <button type="button" onClick={() => remove(id)} className="rounded bg-white/90 p-1 text-red-600" title="Delete photo" aria-label="Delete photo"><Trash2 size={13} /></button>
              </div>
            )}
          </div>
        ))}
        {canEdit && item.images.length < 4 && (
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 dark:border-gray-700"
          >
            {uploading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" /> : <Camera size={20} />}
            {uploading ? "Uploading…" : "Add photo"}
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
      <p className="text-xs text-gray-500">Up to 4 photos. The first is the cover on the shop page. Photos are made smaller before they upload.</p>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description (shown to customers)</span>
        <textarea
          value={description}
          disabled={!canEdit}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          rows={3}
          maxLength={1000}
          placeholder="e.g. 8GB / 256GB, 1 year warranty, box and charger included"
          className={field}
        />
      </label>
    </div>
  );
}

/* ---------------- Settings ---------------- */

function SettingsTab() {
  const [cfg, setCfg] = useState<ShopSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const { push } = useToast();
  const { hasPerm } = useAuth();
  const canEdit = hasPerm("item.manage");

  useEffect(() => {
    api<ShopSettings>("/api/v1/online-shop/settings")
      .then((c) => setCfg(c.slug ? c : { ...c, slug: c.suggestedSlug }))
      .catch((e) => push(e.message, "error"));
  }, [push]);

  if (!cfg) return <Spinner />;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = `${origin}/shop/${cfg.slug}`;

  async function save() {
    if (!cfg) return;
    setBusy(true);
    try {
      const saved = await api<Partial<ShopSettings>>("/api/v1/online-shop/settings", {
        method: "PUT",
        body: { slug: cfg.slug, enabled: cfg.enabled, intro: cfg.intro, delivery: cfg.delivery, payment: cfg.payment, phone: cfg.phone },
      });
      setCfg({ ...cfg, ...saved });
      push(cfg.enabled ? "Saved. Your shop is open." : "Saved. The shop page is off.");
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold">Shop page</div>
          <p className="text-xs text-gray-500">Customers see it only while it is on.</p>
        </div>
        <button type="button" role="switch" aria-checked={cfg.enabled} disabled={!canEdit} onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })} className="flex items-center gap-2 text-sm font-medium">
          <span className={cn("relative h-6 w-11 rounded-full transition", cfg.enabled ? "bg-green-600" : "bg-gray-300 dark:bg-gray-700")}>
            <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition", cfg.enabled ? "left-5" : "left-0.5")} />
          </span>
          {cfg.enabled ? "On" : "Off"}
        </button>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Shop address</span>
        <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
          <span className="whitespace-nowrap bg-gray-50 px-2 py-2 text-xs text-gray-500 dark:bg-gray-800">…/shop/</span>
          <input
            value={cfg.slug}
            disabled={!canEdit}
            onChange={(e) => setCfg({ ...cfg, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            placeholder="mahar-shwe-mobile"
            className="min-h-10 min-w-0 flex-1 bg-white px-2 text-base outline-none dark:bg-gray-900 sm:text-sm"
          />
        </div>
      </label>
      {cfg.slug && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm dark:bg-blue-950/40">
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-blue-700 dark:text-blue-300">{link}</span>
          <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(link).then(() => push("Link copied"))}><Copy size={14} className="mr-1 inline" />Copy</Button>
          <a href={`/shop/${cfg.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center rounded-lg px-2.5 text-xs font-medium text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/40"><ExternalLink size={14} className="mr-1" />Open</a>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">A line about the shop</span>
        <textarea value={cfg.intro} disabled={!canEdit} onChange={(e) => setCfg({ ...cfg, intro: e.target.value })} rows={2} maxLength={300} placeholder="ဖုန်းအသစ်/အဟောင်း၊ Accessories အစုံ ရနိုင်ပါသည်" className={field} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Delivery</span>
        <textarea value={cfg.delivery} disabled={!canEdit} onChange={(e) => setCfg({ ...cfg, delivery: e.target.value })} rows={2} maxLength={300} className={field} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Payment</span>
        <textarea value={cfg.payment} disabled={!canEdit} onChange={(e) => setCfg({ ...cfg, payment: e.target.value })} rows={2} maxLength={300} className={field} />
      </label>
      <Input label="Phone for customers" value={cfg.phone} disabled={!canEdit} onChange={(e) => setCfg({ ...cfg, phone: e.target.value })} placeholder={cfg.shopPhone || "09…"} inputMode="tel" />

      {canEdit && <Button disabled={busy || !cfg.slug} onClick={save}>{busy ? "Saving…" : "Save"}</Button>}
    </Card>
  );
}
