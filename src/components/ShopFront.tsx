"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, MapPin, Minus, Phone, Plus, Search, ShoppingBag, Truck, Wallet, X } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/components/ui";
import { groupByModel, variantLabel, type ModelGroup } from "@/lib/variants";

/** The customer's side of the Online Shop: the shop's items as cards with photos, price and
 *  stock; a cart; and a short form (name, phone, address) that sends the order. Written in
 *  Myanmar first, for the shop's own customers. */

interface ShopItem { id: string; name: string; description: string; category: string; price: string; stock: number; images: string[]; model: string; variant: string }
interface ShopInfo { name: string; logo: string; address: string; phone: string; intro: string; delivery: string; payment: string }

const imageUrl = (id: string) => `/api/public/item-image/${id}`;
const field = "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

export function ShopFront({ slug, shop, items }: { slug: string; shop: ShopInfo; items: ShopItem[] }) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [viewing, setViewing] = useState<ModelGroup<ShopItem> | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [done, setDone] = useState<{ orderNo: string; total: string } | null>(null);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const categories = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(), [items]);
  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => (!category || i.category === category) && (!needle || i.name.toLowerCase().includes(needle)));
  const lines = Object.entries(cart).flatMap(([id, quantity]) => { const item = byId.get(id); return item && quantity > 0 ? [{ item, quantity }] : []; });
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const total = lines.reduce((t, l) => t + BigInt(l.item.price) * BigInt(l.quantity), 0n);

  const setQty = (item: ShopItem, quantity: number) =>
    setCart((c) => ({ ...c, [item.id]: Math.max(0, Math.min(item.stock, quantity)) }));

  if (done) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 text-center shadow-sm">
          <CheckCircle2 size={56} className="mx-auto text-green-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">မှာယူမှု လက်ခံရရှိပါပြီ</h1>
            <p className="mt-1 text-sm text-gray-500">ဆိုင်မှ မကြာမီ ဖုန်းဆက်ပြီး အတည်ပြုပေးပါမည်</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <div className="text-xs text-gray-500">Order No.</div>
            <div className="font-mono text-2xl font-bold text-gray-900">{done.orderNo}</div>
            <div className="mt-1 text-lg font-semibold text-blue-600">{fmtMoney(done.total)} ကျပ်</div>
          </div>
          {shop.phone && <a href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 font-medium text-gray-700"><Phone size={16} />{shop.phone}</a>}
          <button type="button" onClick={() => { setDone(null); setCart({}); }} className="min-h-11 w-full rounded-xl bg-blue-600 font-semibold text-white">ဆက်ဝယ်မည်</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-gray-50 pb-28 text-gray-900">
      {/* Shop header */}
      <header className="bg-white px-4 pb-4 pt-5 shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          {shop.logo
            // eslint-disable-next-line @next/next/no-img-element -- the shop's own logo route
            ? <img src={shop.logo} alt="" className="h-14 w-14 shrink-0 rounded-xl object-contain ring-1 ring-gray-100" />
            : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white"><ShoppingBag size={26} /></div>}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{shop.name}</h1>
            {shop.intro && <p className="line-clamp-2 text-sm text-gray-600">{shop.intro}</p>}
          </div>
          {shop.phone && (
            <a href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-green-600 text-white" aria-label="Call the shop"><Phone size={18} /></a>
          )}
        </div>
        {shop.address && <p className="mx-auto mt-2 flex max-w-5xl items-start gap-1.5 text-xs text-gray-500"><MapPin size={13} className="mt-0.5 shrink-0" />{shop.address}</p>}
      </header>

      {/* Search + categories */}
      <div className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-5xl space-y-2">
          <label className="relative block">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ပစ္စည်း ရှာရန်…" className={cn(field, "pl-9")} />
          </label>
          {categories.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {["", ...categories].map((c) => (
                <button key={c || "all"} type="button" onClick={() => setCategory(c)} className={cn("shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm", category === c ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-700")}>
                  {c || "အားလုံး"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Products: one card per model; a model with variants is chosen inside its sheet. */}
      <section className="mx-auto grid max-w-5xl grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
        {groupByModel(shown).map((g) => {
          const item = g.items[0];
          const many = g.items.length > 1;
          const stock = g.items.reduce((n, it) => n + it.stock, 0);
          const inCart = many ? g.items.reduce((n, it) => n + (cart[it.id] ?? 0), 0) : cart[item.id] ?? 0;
          const out = stock <= 0;
          const cover = g.items.find((it) => it.images.length)?.images[0];
          const prices = g.items.map((it) => BigInt(it.price));
          const low = prices.reduce((a, b) => (b < a ? b : a));
          const high = prices.reduce((a, b) => (b > a ? b : a));
          return (
            <div key={g.key} className={cn("flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-100", out && "opacity-60")}>
              <button type="button" onClick={() => setViewing(g)} className="relative aspect-square bg-gray-100">
                {cover
                  // eslint-disable-next-line @next/next/no-img-element -- photos come from our own image route
                  ? <img src={imageUrl(cover)} alt={g.model} loading="lazy" className="h-full w-full object-cover" />
                  : <ShoppingBag size={32} className="absolute inset-0 m-auto text-gray-300" />}
                {out && <span className="absolute left-2 top-2 rounded-full bg-gray-900/80 px-2 py-0.5 text-xs font-medium text-white">ကုန်သွားပါပြီ</span>}
                {many && <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-gray-700">{g.items.length} မျိုး</span>}
              </button>
              <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                <button type="button" onClick={() => setViewing(g)} className="line-clamp-2 min-h-[2.5rem] text-left text-sm font-medium leading-tight [overflow-wrap:anywhere]">{g.model}</button>
                <div className="flex items-baseline justify-between gap-1">
                  <span className="text-base font-bold text-blue-600 tabular-nums">{low === high ? fmtMoney(low.toString()) : `${fmtMoney(low.toString())}+`}</span>
                  <span className={cn("shrink-0 text-[11px]", stock <= 2 ? "font-medium text-amber-600" : "text-gray-500")}>{out ? "" : `ကျန် ${stock}`}</span>
                </div>
                <div className="mt-auto">
                  {many ? (
                    <button type="button" disabled={out} onClick={() => setViewing(g)} className="flex min-h-10 w-full items-center justify-center gap-1 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:bg-gray-300">
                      {inCart > 0 ? `ခြင်းထဲ ${inCart} · ရွေးမည်` : "အမျိုးအစား ရွေးမည်"}
                    </button>
                  ) : inCart > 0 ? (
                    <Stepper value={inCart} max={item.stock} onChange={(n) => setQty(item, n)} />
                  ) : (
                    <button type="button" disabled={out} onClick={() => setQty(item, 1)} className="flex min-h-10 w-full items-center justify-center gap-1 rounded-xl bg-blue-600 text-sm font-semibold text-white disabled:bg-gray-300">
                      <Plus size={16} />ခြင်းထဲထည့်
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="col-span-full py-16 text-center text-sm text-gray-500">{items.length ? "ရှာသည့် ပစ္စည်း မတွေ့ပါ" : "ပစ္စည်းများ မကြာမီ တင်ပေးပါမည်"}</p>}
      </section>

      {/* Delivery and payment */}
      {(shop.delivery || shop.payment) && (
        <section className="mx-auto max-w-5xl space-y-2 px-4 text-sm text-gray-600">
          {shop.delivery && <p className="flex items-start gap-2 rounded-xl bg-white p-3 ring-1 ring-gray-100"><Truck size={16} className="mt-0.5 shrink-0 text-blue-600" />{shop.delivery}</p>}
          {shop.payment && <p className="flex items-start gap-2 rounded-xl bg-white p-3 ring-1 ring-gray-100"><Wallet size={16} className="mt-0.5 shrink-0 text-blue-600" />{shop.payment}</p>}
        </section>
      )}
      <p className="mt-6 text-center text-[11px] text-gray-400">Powered by Mahar Mini POS</p>

      {/* Cart bar */}
      {count > 0 && !checkout && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => setCheckout(true)} className="mx-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-blue-600 px-4 py-3 text-white shadow-xl">
            <span className="relative"><ShoppingBag size={22} /><span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold">{count}</span></span>
            <span className="min-w-0 flex-1 text-left text-lg font-bold tabular-nums">{fmtMoney(total.toString())} ကျပ်</span>
            <span className="rounded-xl bg-white/20 px-3 py-1.5 text-sm font-semibold">မှာယူမည်</span>
          </button>
        </div>
      )}

      {viewing && <ItemSheet group={viewing} cart={cart} onQty={setQty} onClose={() => setViewing(null)} />}
      {checkout && (
        <Checkout
          slug={slug}
          lines={lines}
          total={total}
          onQty={setQty}
          onClose={() => setCheckout(false)}
          onDone={(r) => { setCheckout(false); setDone(r); }}
        />
      )}
    </main>
  );
}

function Stepper({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex min-h-10 items-center overflow-hidden rounded-xl border border-blue-200 bg-blue-50">
      <button type="button" onClick={() => onChange(value - 1)} className="flex h-10 w-10 items-center justify-center text-blue-700" aria-label="One less"><Minus size={16} /></button>
      <span className="flex-1 text-center font-semibold tabular-nums text-blue-700">{value}</span>
      <button type="button" disabled={value >= max} onClick={() => onChange(value + 1)} className="flex h-10 w-10 items-center justify-center text-blue-700 disabled:opacity-30" aria-label="One more"><Plus size={16} /></button>
    </div>
  );
}

/** A bottom sheet on a phone, a centred panel on a computer. */
function Sheet({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <h2 className="truncate font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ItemSheet({ group, cart, onQty, onClose }: {
  group: ModelGroup<ShopItem>; cart: Record<string, number>;
  onQty: (item: ShopItem, n: number) => void; onClose: () => void;
}) {
  const [chosen, setChosen] = useState(() => group.items.find((it) => it.stock > 0)?.id ?? group.items[0].id);
  const [shown, setShown] = useState(0);
  const item = group.items.find((it) => it.id === chosen) ?? group.items[0];
  const inCart = cart[item.id] ?? 0;
  return (
    <Sheet title={group.model} onClose={onClose}>
      <div className="aspect-square bg-gray-100">
        {item.images[shown]
          // eslint-disable-next-line @next/next/no-img-element -- photos come from our own image route
          ? <img src={imageUrl(item.images[shown])} alt={item.name} className="h-full w-full object-contain" />
          : <ShoppingBag size={48} className="m-auto h-full text-gray-300" />}
      </div>
      {item.images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pt-3">
          {item.images.map((id, i) => (
            <button key={id} type="button" onClick={() => setShown(i)} className={cn("h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-2", i === shown ? "ring-blue-600" : "ring-transparent")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- photos come from our own image route */}
              <img src={imageUrl(id)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      <div className="space-y-3 p-4">
        {group.items.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => { setChosen(it.id); setShown(0); }}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-sm font-medium",
                  it.id === item.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700",
                  it.stock <= 0 && "opacity-50 line-through"
                )}
              >
                {variantLabel(it)}{cart[it.id] ? ` · ${cart[it.id]}` : ""}
              </button>
            ))}
          </div>
        )}
        <div>
          <h3 className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{item.name}</h3>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-blue-600 tabular-nums">{fmtMoney(item.price)} <span className="text-sm font-medium text-gray-500">ကျပ်</span></span>
            <span className="text-sm text-gray-500">{item.stock > 0 ? `ကျန် ${item.stock} ခု` : "ကုန်သွားပါပြီ"}</span>
          </div>
        </div>
        {item.description && <p className="whitespace-pre-line text-sm text-gray-600">{item.description}</p>}
        {item.stock > 0 && (inCart > 0
          ? <Stepper value={inCart} max={item.stock} onChange={(n) => onQty(item, n)} />
          : <button type="button" onClick={() => onQty(item, 1)} className="flex min-h-12 w-full items-center justify-center gap-1 rounded-xl bg-blue-600 font-semibold text-white"><Plus size={18} />ခြင်းထဲထည့်</button>)}
      </div>
    </Sheet>
  );
}

function Checkout({ slug, lines, total, onQty, onClose, onDone }: {
  slug: string; lines: { item: ShopItem; quantity: number }[]; total: bigint;
  onQty: (item: ShopItem, n: number) => void; onClose: () => void; onDone: (r: { orderNo: string; total: string }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send() {
    setError("");
    if (!name.trim()) return setError("နာမည် ထည့်ပါ");
    if (!/^[0-9+\-\s]{6,20}$/.test(phone.trim())) return setError("ဖုန်းနံပါတ် မှန်မှန် ထည့်ပါ");
    setBusy(true);
    try {
      const res = await fetch(`/api/public/shop/${encodeURIComponent(slug)}/order`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerName: name, customerPhone: phone, address, note, website,
          lines: lines.map((l) => ({ itemId: l.item.id, quantity: l.quantity })),
        }),
      });
      const data = await res.json().catch(() => null) as { ok?: boolean; error?: string; orderNo?: string; total?: string } | null;
      if (!res.ok || !data?.ok || !data.orderNo) throw new Error(data?.error ?? "မှာယူ၍ မရပါ။ ပြန်စမ်းကြည့်ပါ");
      onDone({ orderNo: data.orderNo, total: data.total ?? total.toString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "မှာယူ၍ မရပါ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="ခြင်းတောင်း" onClose={onClose}>
      <div className="space-y-4 p-4">
        <div className="divide-y divide-gray-100 rounded-2xl ring-1 ring-gray-100">
          {lines.map(({ item, quantity }) => (
            <div key={item.id} className="flex items-center gap-3 p-2.5">
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- photos come from our own image route */}
                {item.images[0] && <img src={imageUrl(item.images[0])} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{item.name}</div>
                <div className="text-xs text-gray-500 tabular-nums">{fmtMoney(item.price)} × {quantity}</div>
              </div>
              <div className="w-28 shrink-0"><Stepper value={quantity} max={item.stock} onChange={(n) => onQty(item, n)} /></div>
            </div>
          ))}
          <div className="flex justify-between p-3 text-base font-bold"><span>စုစုပေါင်း</span><span className="tabular-nums text-blue-600">{fmtMoney(total.toString())} ကျပ်</span></div>
        </div>

        <div className="space-y-2.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="နာမည် *" autoComplete="name" className={field} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="ဖုန်းနံပါတ် *" inputMode="tel" autoComplete="tel" className={field} />
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ပို့ရမည့် လိပ်စာ (ဆိုင်လာယူမည်ဆိုလျှင် မထည့်လည်းရ)" rows={2} className={field} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="မှတ်ချက် (အရောင်၊ အချိန် စသည်)" className={field} />
          {/* Left empty by people; bots fill it. */}
          <input value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="button" disabled={busy || lines.length === 0} onClick={send} className="min-h-12 w-full rounded-xl bg-blue-600 text-base font-semibold text-white disabled:bg-blue-300">
          {busy ? "ပို့နေသည်…" : `မှာယူမည် · ${fmtMoney(total.toString())} ကျပ်`}
        </button>
        <p className="text-center text-xs text-gray-500">ဆိုင်မှ ဖုန်းဆက်ပြီး အတည်ပြုမှသာ ငွေချေရပါမည်</p>
      </div>
    </Sheet>
  );
}
