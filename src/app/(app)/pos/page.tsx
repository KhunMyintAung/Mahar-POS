"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Minus, Plus, Printer, Search, ShieldCheck, Trash2, ShoppingCart } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Input, Modal, Select, Spinner, cn, useToast } from "@/components/ui";
import { useAuth } from "@/components/AppShell";
import { playBeep, playSuccess } from "@/lib/sound";
import { SaleReceipt, type ReceiptData } from "@/components/SaleReceipt";
import { ProductKindIcon } from "@/components/ProductKindIcon";
import { WarrantyCardDialog, warrantyLines } from "@/components/WarrantyCard";
import {
  DEFAULT_WARRANTY, WARRANTY_SETTING, parseWarrantySettings, phoneCondition, warrantyOptionsFor,
  warrantyUntil, type WarrantyOption, type WarrantySettings,
} from "@/lib/warranty";
import { BarcodeScannerModal, scanningSupported } from "@/components/BarcodeScanner";
import { printSaleReceipt } from "@/lib/slipPrint";
import { PageHeader } from "@/components/PageHeader";
import { groupByModel, variantLabel, type ModelGroup } from "@/lib/variants";

interface Item {
  id: string; name: string; sku: string; barcode?: string;
  sellingPrice: string; stockLevels: { branchId: string; quantity: number }[];
  category?: { name: string }; unit?: { name: string };
  /** One IMEI per unit: picked at the till, one line per phone model. */
  trackSerial?: boolean;
  /** Variants: items of one model share a tile, and the variant is picked from it. */
  model?: string | null; variant?: string | null;
}

/** FOC is offered only on accessories (Accessories / Accessory, any case). */
const isAccessory = (item: Item) => /accessor/i.test(item.category?.name ?? "");

interface Wallet { id: string; name: string; currency: string; currentBalance: string }
interface Contact { id: string; name: string; type: string }
/** warranty is set only for phones marked new or second-hand; null means none was offered. */
/** imeis: for an IMEI-tracked item, the phones being sold; quantity is their count. */
/** foc: a free gift with the sale (charger, case, glass…): sold at 0, still leaves stock,
 *  its cost counts against the sale's profit. listPrice is the price to go back to. */
interface CartLine { item: Item; quantity: number; unitPrice: number; warranty?: WarrantyOption | null; note?: string; imeis?: string[]; foc?: boolean; listPrice?: number }
interface SaleResult { id: string; txnNo: string; total: string; profit: string }
/** An Online Shop order being rung up: Online Shop → Orders puts it in the draft. */
interface OnlineOrderRef { id: string; orderNo: string; customerName: string; customerPhone: string }
interface Draft {
  savedAt: number;
  lines: { itemId: string; quantity: number; unitPrice: number; warranty?: WarrantyOption | null; note?: string; imeis?: string[]; foc?: boolean; listPrice?: number }[];
  discount: string;
  walletId: string;
  customerId: string;
  payMode: "full" | "credit" | "partial";
  partialAmount: string;
  cashReceived: string;
  onlineOrder?: OnlineOrderRef | null;
}

const DRAFT_LIFETIME = 12 * 60 * 60 * 1000;

function readAmount(value: string) {
  return parseFloat(value.replace(/,/g, "")) || 0;
}

function cashSuggestions(total: number) {
  if (total <= 0) return [];
  const steps = [1000, 5000, 10000, 50000, 100000];
  return [...new Set([total, ...steps.map((step) => Math.ceil(total / step) * step)])]
    .filter((amount) => amount >= total)
    .sort((a, b) => a - b)
    .slice(0, 4);
}

export default function PosPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [bump, setBump] = useState(0);
  // Every IMEI on the shelf in this branch, by item, for the picker and for scanning.
  const [shelfImeis, setShelfImeis] = useState<Map<string, string[]>>(new Map());
  const [imeiInput, setImeiInput] = useState<Record<string, string>>({});
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [customers, setCustomers] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("ALL");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [warrantySettings, setWarrantySettings] = useState<WarrantySettings>(DEFAULT_WARRANTY);
  const [discount, setDiscount] = useState("0");
  const [walletId, setWalletId] = useState("");
  // Part of the payment into a second wallet, e.g. half cash and half KBZPay.
  const [splitOn, setSplitOn] = useState(false);
  const [wallet2Id, setWallet2Id] = useState("");
  const [splitAmount, setSplitAmount] = useState("");
  const [newCustomer, setNewCustomer] = useState<{ name: string; phone: string } | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [payMode, setPayMode] = useState<"full" | "credit" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [onlineOrder, setOnlineOrder] = useState<OnlineOrderRef | null>(null);
  // A model tile tapped: its variants, to pick one from.
  const [picking, setPicking] = useState<ModelGroup<Item> | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastSale, setLastSale] = useState<SaleResult | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [cardFor, setCardFor] = useState<ReceiptData | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const { push } = useToast();
  const { defaultBranchId, me, hasPerm, phoneShop } = useAuth();
  // Phone warranties are a phone shop's: a mini mart offers none, whatever an item is called.
  const offered = phoneShop ? warrantySettings : { ...warrantySettings, newPhone: [], secondHand: [] };
  const draftKey = `mahar-pos:pos-draft:${me?.user.id ?? "anonymous"}`;

  const load = useCallback(() => {
    api<{ items: Item[] }>("/api/v1/items?pageSize=1000&active=1")
      .then((data) => setItems(data.items))
      .catch((error) => push(error.message, "error"));
    api<{ units: { imei: string; itemId: string }[] }>(`/api/v1/serials?status=IN_STOCK${defaultBranchId ? `&branchId=${defaultBranchId}` : ""}`)
      .then((data) => {
        const byItem = new Map<string, string[]>();
        for (const u of data.units) byItem.set(u.itemId, [...(byItem.get(u.itemId) ?? []), u.imei]);
        setShelfImeis(byItem);
      })
      .catch(() => {});
    api<Wallet[]>("/api/v1/wallets").then((data) => {
      setWallets(data);
      const cash = data.find((wallet) => wallet.currency === "MMK");
      if (cash) setWalletId((current) => current || cash.id);
    }).catch(() => {});
    api<{ contacts: Contact[] }>("/api/v1/customers?type=CUSTOMER&pageSize=200")
      .then((data) => setCustomers(data.contacts)).catch(() => {});
    api<{ settings: Record<string, unknown> }>(`/api/v1/settings?key=${WARRANTY_SETTING}`)
      .then((data) => setWarrantySettings(parseWarrantySettings(data.settings[WARRANTY_SETTING])))
      .catch(() => {});
  }, [push, defaultBranchId]);

  useEffect(load, [load]);

  useEffect(() => {
    // Asked after mount: there is no window on the server to ask whether it can decode.
    const timer = window.setTimeout(() => setCanScan(scanningSupported()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!items || draftReady) return;
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(draftKey);
        const draft = raw ? JSON.parse(raw) as Draft : null;
        if (draft && Date.now() - draft.savedAt < DRAFT_LIFETIME) {
          const byId = new Map(items.map((item) => [item.id, item]));
          setCart(draft.lines.flatMap((line) => {
            const item = byId.get(line.itemId);
            if (!item) return [];
            const stock = item.stockLevels
              .filter((level) => !defaultBranchId || level.branchId === defaultBranchId)
              .reduce((total, level) => total + level.quantity, 0);
            if (item.trackSerial) {
              const imeis = (line.imeis ?? []).slice(0, stock);
              return [{ item, quantity: imeis.length, unitPrice: line.unitPrice, warranty: line.warranty ?? null, note: line.note, imeis, foc: line.foc, listPrice: line.listPrice }];
            }
            return [{ item, quantity: Math.min(line.quantity, stock), unitPrice: line.unitPrice, warranty: line.warranty ?? null, note: line.note, foc: line.foc, listPrice: line.listPrice }];
          }).filter((line) => line.quantity > 0 || line.item.trackSerial));
          setDiscount(draft.discount);
          setWalletId(draft.walletId);
          setCustomerId(draft.customerId);
          setPayMode(draft.payMode);
          setPartialAmount(draft.partialAmount);
          setCashReceived(draft.cashReceived);
          setOnlineOrder(draft.onlineOrder ?? null);
        } else if (raw) {
          localStorage.removeItem(draftKey);
        }
      } catch {
        localStorage.removeItem(draftKey);
      }
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [defaultBranchId, draftKey, draftReady, items]);

  useEffect(() => {
    if (!draftReady) return;
    const draft: Draft = {
      savedAt: Date.now(),
      lines: cart.map((line) => ({ itemId: line.item.id, quantity: line.quantity, unitPrice: line.unitPrice, warranty: line.warranty, note: line.note, imeis: line.imeis, foc: line.foc, listPrice: line.listPrice })),
      discount, walletId, customerId, payMode, partialAmount, cashReceived, onlineOrder,
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [cart, cashReceived, customerId, discount, draftKey, draftReady, onlineOrder, partialAmount, payMode, walletId]);

  // Ready for a barcode scanner on a computer. On a phone the keyboard would pop up over
  // the products every time the page opens, so the cursor waits for a tap there.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && cart.length > 0) {
        event.preventDefault();
        setReviewOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cart.length]);

  const categories = useMemo(() => {
    if (!items) return [];
    return [...new Set(items.map((item) => item.category?.name).filter(Boolean) as string[])].sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    // Nothing on the shelf, nothing to sell: items out of stock in this branch are left off
    // the till. They still show under Items and Stock, where they can be restocked.
    const inStock = (item: Item) => item.stockLevels
      .filter((level) => !defaultBranchId || level.branchId === defaultBranchId)
      .reduce((total, level) => total + level.quantity, 0) > 0;
    return items.filter((item) =>
      inStock(item) &&
      (category === "ALL" || item.category?.name === category) &&
      (!needle || item.name.toLowerCase().includes(needle) || item.sku.toLowerCase().includes(needle) || item.barcode?.toLowerCase().includes(needle))
    );
  }, [category, items, q, defaultBranchId]);

  /** The tapped tile pops and the cart bar bounces. */
  function showAdded(itemId: string) {
    setFlashId(itemId);
    setBump((n) => n + 1);
    window.setTimeout(() => setFlashId((id) => (id === itemId ? null : id)), 700);
  }

  function stockOf(item: Item) {
    return item.stockLevels
      .filter((level) => !defaultBranchId || level.branchId === defaultBranchId)
      .reduce((total, level) => total + level.quantity, 0);
  }

  function inCart(id: string) {
    return cart.reduce((total, line) => line.item.id === id ? total + line.quantity : total, 0);
  }

  function addToCart(item: Item, imei?: string) {
    if (item.trackSerial) {
      addTrackedUnit(item, imei);
      return;
    }
    if (inCart(item.id) >= stockOf(item)) {
      push(`No more stock for ${item.name}`, "error");
      return;
    }
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (existing) {
        return current.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      // The newest line goes on top, where the cashier is looking.
      return [{
        item,
        quantity: 1,
        unitPrice: Number(BigInt(item.sellingPrice)) / 100,
        // A new or second-hand phone starts on the shop's first warranty choice for it.
        warranty: warrantyOptionsFor(offered, phoneCondition(item))[0] ?? null,
      }, ...current];
    });
    // Both tapping a product and scanning a barcode arrive here, so one beep covers both.
    // The out-of-stock case above returns before this: it gets the error tone instead.
    playBeep();
    showAdded(item.id);
  }

  /** A tracked phone: its row is opened, and the IMEI added when one is given. */
  function addTrackedUnit(item: Item, imei?: string) {
    const code = imei?.replace(/[\s-]/g, "").toUpperCase();
    const line = cart.find((l) => l.item.id === item.id);
    const chosen = line?.imeis ?? [];
    if (code && cart.some((l) => l.imeis?.includes(code))) {
      push(`IMEI ${code} is already in the cart`, "error");
      return;
    }
    if (code && chosen.length >= stockOf(item)) {
      push(`No more stock for ${item.name}`, "error");
      return;
    }
    if (!code && line) return; // already on the list; its picker is open
    if (!code && stockOf(item) <= 0) {
      push(`No more stock for ${item.name}`, "error");
      return;
    }
    const imeis = code ? [...chosen, code] : chosen;
    setCart((current) => line
      ? current.map((l) => l.item.id === item.id ? { ...l, imeis, quantity: imeis.length } : l)
      : [{
          item, imeis, quantity: imeis.length,
          unitPrice: Number(BigInt(item.sellingPrice)) / 100,
          warranty: warrantyOptionsFor(offered, phoneCondition(item))[0] ?? null,
        }, ...current]);
    playBeep();
    showAdded(item.id);
  }

  function removeImei(itemId: string, imei: string) {
    setCart((current) => current.map((l) => {
      if (l.item.id !== itemId) return l;
      const imeis = (l.imeis ?? []).filter((x) => x !== imei);
      return { ...l, imeis, quantity: imeis.length };
    }));
  }

  function changeQuantity(itemId: string, quantity: number) {
    const line = cart.find((entry) => entry.item.id === itemId);
    if (!line) return;
    if (quantity <= 0) {
      setCart((current) => current.filter((entry) => entry.item.id !== itemId));
      return;
    }
    setCart((current) => current.map((entry) =>
      entry.item.id === itemId ? { ...entry, quantity: Math.min(quantity, stockOf(entry.item)) } : entry
    ));
  }

  /** Put the item with this code in the cart. Shared by the three ways a code arrives:
   *  typed, sent by a USB or Bluetooth scanner (they type and press Enter), or read by
   *  the camera. */
  function addByCode(code: string): boolean {
    const needle = code.trim().toLowerCase();
    if (!needle || !items) return false;
    const exact = items.find(
      (item) => item.sku.toLowerCase() === needle || item.barcode?.toLowerCase() === needle
    );
    if (!exact) {
      const imei = code.replace(/[\s-]/g, "").toUpperCase();
      for (const [itemId, list] of shelfImeis) {
        if (!list.includes(imei)) continue;
        const item = items.find((it) => it.id === itemId);
        if (item) { addToCart(item, imei); return true; }
      }
      return false;
    }
    addToCart(exact);
    return true;
  }

  function closeSaleComplete() {
    setLastSale(null);
    setReceipt(null);
  }

  function scan(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    if (addByCode(q)) {
      event.preventDefault();
      setQ("");
    }
  }

  const subtotal = cart.reduce((total, line) => total + line.quantity * line.unitPrice, 0);
  const disc = readAmount(discount);
  const total = Math.max(0, subtotal - disc);
  const paidAmount = payMode === "full" ? total : payMode === "credit" ? 0 : Math.min(total, readAmount(partialAmount));
  const creditAmount = total - paidAmount;
  const received = readAmount(cashReceived);
  const change = payMode === "full" ? Math.max(0, received - total) : 0;
  const split = splitOn && paidAmount > 0;
  const part2 = split ? Math.min(readAmount(splitAmount), paidAmount) : 0;
  const part1 = paidAmount - part2;
  const splitOk = !split || (part2 > 0 && part1 > 0 && Boolean(wallet2Id) && wallet2Id !== walletId);
  const missingImei = cart.find((l) => l.item.trackSerial && l.quantity < 1);
  const canCheckout = cart.length > 0 && !missingImei && disc >= 0 && disc <= subtotal &&
    (paidAmount === 0 || Boolean(walletId)) && splitOk &&
    (creditAmount === 0 || Boolean(customerId)) &&
    (payMode !== "full" || !cashReceived || received >= total);

  function clearSale() {
    setCart([]);
    setDiscount("0");
    setPartialAmount("");
    setCashReceived("");
    setPayMode("full");
    setCustomerId("");
    setSplitOn(false);
    setWallet2Id("");
    setSplitAmount("");
    setOnlineOrder(null);
    localStorage.removeItem(draftKey);
  }

  /** Adds a customer from the till without leaving the sale, and picks them. */
  async function addCustomer() {
    if (!newCustomer?.name.trim()) return;
    setBusy(true);
    try {
      const c = await api<Contact>("/api/v1/customers", {
        method: "POST",
        body: { name: newCustomer.name.trim(), phone: newCustomer.phone.trim() || undefined, type: "CUSTOMER" },
      });
      setCustomers((list) => [...list, c].sort((a, b) => a.name.localeCompare(b.name)));
      setCustomerId(c.id);
      setNewCustomer(null);
    } catch (e) {
      push(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (!canCheckout) return;
    setBusy(true);
    try {
      const sale = await api<SaleResult>("/api/v1/sales", {
        method: "POST",
        body: {
          branchId: defaultBranchId,
          customerId: customerId || undefined,
          lines: cart.map((line) => ({
            itemId: line.item.id,
            quantity: line.quantity,
            unitPrice: line.unitPrice.toString(),
            warranty: line.warranty?.label,
            warrantyDays: line.warranty?.days,
            warrantyCondition: line.warranty ? phoneCondition(line.item) ?? undefined : undefined,
            note: [line.foc ? "FOC (gift)" : "", line.note?.trim() ?? ""].filter(Boolean).join(" · ") || undefined,
            imeis: line.item.trackSerial ? line.imeis : undefined,
          })),
          discount: disc.toString(),
          paidAmount: paidAmount.toString(),
          walletId: paidAmount > 0 ? walletId : undefined,
          payments: split
            ? [{ walletId, amount: part1.toString() }, { walletId: wallet2Id, amount: part2.toString() }]
            : undefined,
          notes: onlineOrder ? `Online order ${onlineOrder.orderNo} · ${onlineOrder.customerName} ${onlineOrder.customerPhone}` : undefined,
        },
      });
      // The online order this sale rang up is done; the sale stands even if this fails.
      if (onlineOrder) {
        api(`/api/v1/online-shop/orders/${onlineOrder.id}`, { method: "PATCH", body: { status: "COMPLETED", saleId: sale.id } })
          .catch((e) => push(e instanceof Error ? e.message : "Could not close the online order", "error"));
      }
      // Captured before clearSale empties the cart, or there would be nothing to print.
      setReceipt({
        txnNo: sale.txnNo,
        at: new Date().toISOString(),
        shopName: me?.business?.name ?? "Mahar Mini POS",
        shopLogo: me?.business?.logoUrl ?? undefined,
        shopPhone: me?.business?.phone ?? undefined,
        shopAddress: me?.business?.address ?? undefined,
        customerName: customers.find((c) => c.id === customerId)?.name,
        cashierName: me?.user.name,
        lines: cart.map((line) => ({
          name: line.item.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          warranty: line.warranty?.label,
          warrantyUntil: line.warranty ? warrantyUntil(new Date(), line.warranty.days)?.toISOString() : undefined,
          warrantyCondition: line.warranty ? phoneCondition(line.item) ?? undefined : undefined,
          note: line.note?.trim() || undefined,
          imeis: line.imeis?.length ? line.imeis : undefined,
          foc: line.foc || undefined,
        })),
        subtotal,
        discount: disc,
        total,
        paid: paidAmount,
        change,
        credit: creditAmount,
      });
      setReviewOpen(false);
      setLastSale(sale);
      // A finished sale opens a modal rather than a toast, so it would otherwise be the
      // one completion in the app that made no sound.
      playSuccess();
      clearSale();
      load();
    } catch (error) {
      push(error instanceof Error ? error.message : "Sale failed", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!items) return <Spinner />;

  return (
    <div className={cn("mx-auto max-w-7xl", cart.length > 0 && "pb-20 lg:pb-0")}>
      <PageHeader title={<>Sales &amp; POS</>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="min-w-0 space-y-3 lg:col-span-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-3 text-gray-400" />
              <input
                ref={searchRef}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onKeyDown={scan}
                placeholder="Search or scan barcode..."
                className="min-h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-700 dark:bg-gray-800"
              />
              {canScan && (
                <button
                  type="button"
                  onClick={() => setScanning(true)}
                  aria-label="Scan with the camera"
                  title="Scan with the camera"
                  className="absolute right-1.5 top-1.5 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Camera size={17} />
                </button>
              )}
            </div>
            <Select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="ALL">All categories</option>
              {categories.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
          </div>
          <div className="grid max-h-[42dvh] grid-cols-2 gap-2 overflow-y-auto sm:max-h-[55dvh] sm:grid-cols-3 lg:max-h-[calc(100dvh-9.5rem)] xl:grid-cols-4">
            {groupByModel(filtered).map((g) => {
              // A model with variants is one tile; the variant is picked from it.
              if (g.items.length > 1) {
                const left = g.items.reduce((n, it) => n + Math.max(0, stockOf(it) - inCart(it.id)), 0);
                const prices = g.items.map((it) => BigInt(it.sellingPrice));
                const low = prices.reduce((a, b) => (b < a ? b : a));
                const high = prices.reduce((a, b) => (b > a ? b : a));
                return (
                  <button
                    key={g.key}
                    onClick={() => setPicking(g)}
                    disabled={left <= 0}
                    title={g.items.map((it) => it.name).join("\n")}
                    className={cn(
                      "relative flex min-h-[5.5rem] flex-col justify-between gap-1.5 rounded-lg border border-blue-200 bg-blue-50/40 p-2.5 text-left shadow-sm transition hover:border-blue-400 dark:border-blue-900 dark:bg-blue-950/20",
                      left <= 0 && "opacity-40"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <ProductKindIcon item={g.items[0]} size={15} className="mt-0.5 h-7 w-7 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-xs font-medium leading-[1.35] [overflow-wrap:anywhere]">{g.model}</div>
                        <div className="text-[11px] text-blue-700 dark:text-blue-300">{`${g.items.length} variants`}</div>
                      </div>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-bold tabular-nums text-blue-600">{low === high ? fmtMoney(low.toString()) : `${fmtMoney(low.toString())}+`}</span>
                      <span className={cn("shrink-0 text-[11px]", left <= 2 ? "font-medium text-amber-600" : "text-gray-500")}>
                        stock {left}
                      </span>
                    </div>
                  </button>
                );
              }
              const item = g.items[0];
              const available = stockOf(item) - inCart(item.id);
              const flashing = flashId === item.id;
              return (
                <button
                  key={flashing ? `${item.id}-flash` : item.id}
                  onClick={() => addToCart(item)}
                  disabled={available <= 0}
                  // Full name on hover / long-press; the tile itself shows two lines so a row
                  // of parts with long compatibility lists stays the height of a short one.
                  title={`${item.name}\n${item.sku}`}
                  className={cn(
                    "relative flex min-h-[5.5rem] flex-col justify-between gap-1.5 rounded-lg border border-gray-200 bg-white p-2.5 text-left shadow-sm transition hover:border-blue-400 dark:border-gray-800 dark:bg-gray-900",
                    available <= 0 && "opacity-40",
                    flashing && "animate-tile-pop border-green-500 ring-2 ring-green-400/60"
                  )}
                >
                  {flashing && (
                    <span className="animate-fade-check pointer-events-none absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-500 text-[11px] font-bold text-white">✓</span>
                  )}

                  <div className="flex items-start gap-2">
                    <ProductKindIcon item={item} size={15} className="mt-0.5 h-7 w-7 rounded-md" />
                    <div className="line-clamp-2 min-w-0 flex-1 text-xs font-medium leading-[1.35] [overflow-wrap:anywhere]">
                      {item.name}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold tabular-nums text-blue-600">{fmtMoney(item.sellingPrice)}</span>
                    <span className={cn("shrink-0 text-[11px]", available <= 2 ? "font-medium text-amber-600" : "text-gray-500")}>
                      stock {available}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 space-y-3 lg:col-span-2">
        <div id="pos-cart" className="scroll-mt-4" />
        {/* Desktop: the cart is a panel the height of the screen. Lines and payment scroll
            inside it, and the total with the Review button stays pinned at its foot, so the
            cashier never scrolls the page to see what the sale comes to. */}
        <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:sticky lg:top-3 lg:max-h-[calc(100dvh-1.5rem)]">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2.5 dark:border-gray-800">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart size={16} className="text-blue-600" />Cart
              {cart.length > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{cart.reduce((sum, line) => sum + line.quantity, 0)}</span>}
            </h3>
            {cart.length > 0 && (
              <button type="button" onClick={clearSale} className="text-xs font-medium text-red-600">Clear</button>
            )}
          </div>
          {onlineOrder && (
            <div className="flex shrink-0 items-center gap-2 border-b border-purple-100 bg-purple-50 px-3 py-1.5 text-xs text-purple-800 dark:border-purple-900 dark:bg-purple-950/40 dark:text-purple-200">
              <span className="min-w-0 flex-1 truncate">🛍️ Online order <b>{onlineOrder.orderNo}</b> · {onlineOrder.customerName} {onlineOrder.customerPhone}</span>
              <button type="button" className="shrink-0 font-medium hover:underline" onClick={() => setOnlineOrder(null)}>Unlink</button>
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2.5">
          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Tap items to add them</p>
          ) : (
            <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800 lg:max-h-none lg:overflow-visible">
              {cart.map((line) => (
                <div key={line.item.id} className="space-y-1.5 py-2 text-sm first:pt-0">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium leading-tight" title={line.item.name}>{line.item.name}</div>
                      <div className="text-[11px] tabular-nums text-gray-500">{line.foc ? "🎁 FOC" : `${line.unitPrice.toLocaleString()} × ${line.quantity}`}</div>
                    </div>
                    {line.item.trackSerial ? (
                      <span className="flex h-8 shrink-0 items-center rounded-md bg-blue-50 px-2 text-xs font-semibold tabular-nums text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {line.quantity} pc{line.quantity === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-gray-300 dark:border-gray-700">
                        <button type="button" onClick={() => changeQuantity(line.item.id, line.quantity - 1)} className="flex h-full w-8 items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800" aria-label="Decrease quantity"><Minus size={14} /></button>
                        <span className="w-7 text-center text-sm font-semibold tabular-nums">{line.quantity}</span>
                        <button type="button" onClick={() => changeQuantity(line.item.id, line.quantity + 1)} disabled={line.quantity >= stockOf(line.item)} className="flex h-full w-8 items-center justify-center hover:bg-gray-50 disabled:opacity-30 dark:hover:bg-gray-800" aria-label="Increase quantity"><Plus size={14} /></button>
                      </div>
                    )}
                    <b className="w-24 shrink-0 text-right tabular-nums">{(line.unitPrice * line.quantity).toLocaleString()}</b>
                    <button onClick={() => changeQuantity(line.item.id, 0)} className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40" aria-label={`Remove ${line.item.name}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {line.foc ? (
                      <span className="flex h-7 items-center font-medium text-pink-700 dark:text-pink-300">Free gift · 0 MMK</span>
                    ) : (
                      <label className="flex items-center gap-1.5 text-gray-500">
                        Price
                        <input
                          aria-label={`Selling price for ${line.item.name}`}
                          value={line.unitPrice.toString()}
                          onChange={(event) => {
                            const value = Math.max(0, readAmount(event.target.value));
                            setCart((current) => current.map((entry) => entry.item.id === line.item.id ? { ...entry, unitPrice: value } : entry));
                          }}
                          inputMode="decimal"
                          className="h-7 w-28 rounded-md border border-gray-300 bg-white px-2 text-right text-xs tabular-nums text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                        />
                      </label>
                    )}
                    {/* Gifts are accessories (charger, case, glass); a line already marked keeps the box to undo it. */}
                    {(line.foc || isAccessory(line.item)) && <label className={cn("ml-auto flex cursor-pointer items-center gap-1 text-[11px] font-medium", line.foc ? "text-pink-700 dark:text-pink-300" : "text-gray-400")} title="Free gift with the sale">
                      <input
                        type="checkbox"
                        className="h-3 w-3"
                        checked={Boolean(line.foc)}
                        onChange={(e) => setCart((current) => current.map((entry) => entry.item.id !== line.item.id ? entry
                          : e.target.checked
                            ? { ...entry, foc: true, listPrice: entry.unitPrice, unitPrice: 0 }
                            : { ...entry, foc: false, unitPrice: entry.listPrice ?? Number(BigInt(entry.item.sellingPrice)) / 100 }))}
                      />
                      FOC
                    </label>}
                  </div>
                  {(() => {
                    const condition = phoneCondition(line.item);
                    const options = warrantyOptionsFor(offered, condition);
                    if (options.length === 0) return null;
                    return (
                      <div className="space-y-1 rounded-md bg-green-50 px-2 py-1 text-xs dark:bg-green-900/20">
                        <label className="flex items-center gap-2">
                          <ShieldCheck size={15} className="shrink-0 text-green-600" />
                          <span className="shrink-0 font-medium text-green-700 dark:text-green-300">
                            {condition === "NEW" ? "New phone" : "Second-hand"}
                          </span>
                          <select
                            aria-label={`Warranty for ${line.item.name}`}
                            value={line.warranty?.label ?? ""}
                            onChange={(e) => {
                              const picked = options.find((o) => o.label === e.target.value) ?? null;
                              setCart((current) => current.map((entry) => entry.item.id === line.item.id ? { ...entry, warranty: picked } : entry));
                            }}
                            className="min-h-8 min-w-0 flex-1 rounded-md border border-green-200 bg-white px-2 text-xs dark:border-green-800 dark:bg-gray-800"
                          >
                            {options.map((o) => <option key={o.label} value={o.label}>{o.label}</option>)}
                          </select>
                        </label>
                        {/* Printed on the receipt and the warranty card. */}
                        <input
                          aria-label={`Note for ${line.item.name}`}
                          value={line.note ?? ""}
                          maxLength={200}
                          placeholder="Note: IMEI, traded in with iPhone 8…"
                          onChange={(e) => setCart((current) => current.map((entry) => entry.item.id === line.item.id ? { ...entry, note: e.target.value } : entry))}
                          className="min-h-8 w-full rounded-md border border-green-200 bg-white px-2 text-xs dark:border-green-800 dark:bg-gray-800"
                        />
                      </div>
                    );
                  })()}
                  {line.item.trackSerial && (() => {
                    // The phones on the shelf for this model that are not already in the cart.
                    const taken = new Set(cart.flatMap((l) => l.imeis ?? []));
                    const free = (shelfImeis.get(line.item.id) ?? []).filter((i) => !taken.has(i));
                    const typed = imeiInput[line.item.id] ?? "";
                    const add = (value: string) => {
                      if (!value.trim()) return;
                      addTrackedUnit(line.item, value);
                      setImeiInput((m) => ({ ...m, [line.item.id]: "" }));
                    };
                    return (
                      <div className="space-y-1 rounded-md border border-blue-200 bg-blue-50/60 p-1.5 dark:border-blue-900 dark:bg-blue-950/30">
                        <div className="flex flex-wrap gap-1.5">
                          {(line.imeis ?? []).map((imei) => (
                            <span key={imei} className="flex items-center gap-1 rounded-md bg-white px-2 py-1 font-mono text-xs shadow-sm dark:bg-gray-800">
                              {imei}
                              <button type="button" aria-label={`Remove ${imei}`} onClick={() => removeImei(line.item.id, imei)} className="text-gray-400 hover:text-red-600">×</button>
                            </span>
                          ))}
                          {(line.imeis ?? []).length === 0 && <span className="text-xs font-medium text-red-600">Pick the IMEI of the phone being sold</span>}
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            list={`imeis-${line.item.id}`}
                            value={typed}
                            onChange={(e) => {
                              const v = e.target.value;
                              // Choosing from the list fills the whole number: add it straight away.
                              if (free.includes(v.trim().toUpperCase())) add(v);
                              else setImeiInput((m) => ({ ...m, [line.item.id]: v }));
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(typed); } }}
                            placeholder={free.length ? `Pick or scan IMEI (${free.length} in stock)` : "Scan or type IMEI"}
                            className="min-h-9 min-w-0 flex-1 rounded-md border border-blue-200 bg-white px-2 font-mono text-xs dark:border-blue-800 dark:bg-gray-800"
                          />
                          <datalist id={`imeis-${line.item.id}`}>
                            {free.map((i) => <option key={i} value={i} />)}
                          </datalist>
                          <Button size="sm" variant="secondary" disabled={!typed.trim()} onClick={() => add(typed)}>Add</Button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t border-gray-100 pt-2.5 dark:border-gray-800">
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select label="Customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">Walk-in customer</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </Select>
              </div>
              {hasPerm("customer.manage") && (
                <Button variant="secondary" className="shrink-0" onClick={() => setNewCustomer({ name: "", phone: "" })} aria-label="New customer">
                  <Plus size={16} />
                </Button>
              )}
            </div>
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-[11px] dark:bg-gray-800 sm:text-xs">
              {(["full", "partial", "credit"] as const).map((mode) => (
                <button key={mode} onClick={() => setPayMode(mode)} className={cn("min-h-9 min-w-0 flex-1 rounded-md px-1 py-1.5 font-medium capitalize sm:px-2", payMode === mode ? "bg-white shadow dark:bg-gray-700" : "text-gray-500")}>
                  {mode === "full" ? "Full" : mode === "partial" ? "Partial" : "Credit"}
                </button>
              ))}
            </div>
            {payMode === "partial" && <Input label="Amount received now" value={partialAmount} onChange={(event) => setPartialAmount(event.target.value)} inputMode="decimal" />}
            {payMode === "full" && (
              <>
                <Input label="Cash received (optional)" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} inputMode="decimal" />
                <div className="flex flex-wrap gap-1.5">
                  {cashSuggestions(total).map((amount) => (
                    <button key={amount} type="button" onClick={() => setCashReceived(amount.toString())} className="rounded-lg border border-gray-300 px-2 py-1 text-xs tabular-nums dark:border-gray-700">
                      {amount.toLocaleString()}
                    </button>
                  ))}
                </div>
                {cashReceived && received < total && <p className="text-xs text-red-600">Cash received is less than the total.</p>}
                {cashReceived && received >= total && <p className="text-sm font-semibold text-green-600">Change: {change.toLocaleString()} MMK</p>}
              </>
            )}
            {paidAmount > 0 && (
              <Select label={split ? "First wallet" : "Receive into wallet"} value={walletId} onChange={(event) => setWalletId(event.target.value)}>
                {wallets.filter((wallet) => wallet.currency === "MMK").map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>{wallet.name} ({fmtMoney(wallet.currentBalance)})</option>
                ))}
              </Select>
            )}
            {paidAmount > 0 && !splitOn && (
              <button type="button" className="text-xs font-medium text-blue-600 hover:underline" onClick={() => {
                setSplitOn(true);
                setWallet2Id(wallets.find((w) => w.currency === "MMK" && w.id !== walletId)?.id ?? "");
                setSplitAmount(String(Math.round(paidAmount / 2)));
              }}>
                Split into two wallets
              </button>
            )}
            {split && (
              <div className="space-y-2 rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                <div className="grid grid-cols-2 gap-2">
                  <Select label="Second wallet" value={wallet2Id} onChange={(event) => setWallet2Id(event.target.value)}>
                    <option value="">Choose…</option>
                    {wallets.filter((wallet) => wallet.currency === "MMK" && wallet.id !== walletId).map((wallet) => (
                      <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                    ))}
                  </Select>
                  <Input label="Amount" value={splitAmount} onChange={(event) => setSplitAmount(event.target.value)} inputMode="decimal" />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">First wallet gets <b className="tabular-nums text-gray-800 dark:text-gray-200">{part1.toLocaleString()}</b> MMK</span>
                  <button type="button" className="font-medium text-gray-500 hover:text-red-600" onClick={() => setSplitOn(false)}>Remove split</button>
                </div>
                {!splitOk && <p className="text-xs text-red-600">Choose a second wallet and an amount less than {paidAmount.toLocaleString()}.</p>}
              </div>
            )}
            {creditAmount > 0 && (
              <p className={cn("text-xs", customerId ? "text-amber-600" : "text-red-600")}>
                {customerId
                  ? `${customers.find((c) => c.id === customerId)?.name ?? "The customer"} will owe ${creditAmount.toLocaleString()} MMK.`
                  : `Choose a customer above. ${creditAmount.toLocaleString()} MMK will be owed.`}
              </p>
            )}
          </div>

          </div>

          {/* Pinned foot: subtotal, discount, total and the button, always on screen. */}
          <div className="shrink-0 space-y-2 border-t border-gray-200 bg-gray-50/80 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950/40">
            <div className="flex items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span>Subtotal <b className="tabular-nums text-gray-900 dark:text-gray-100">{subtotal.toLocaleString()}</b></span>
              <label className="flex items-center gap-1.5">
                Discount
                <input value={discount} onChange={(event) => setDiscount(event.target.value)} className="h-7 w-24 rounded-md border border-gray-300 bg-white px-2 text-right text-xs tabular-nums text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" inputMode="decimal" />
              </label>
            </div>
            {disc > subtotal && <p className="text-xs text-red-600">Discount cannot exceed subtotal.</p>}
            {missingImei && (
              <p className="text-xs font-medium text-red-600">
                <span>Pick the IMEI for</span> <span>{missingImei.item.name}</span>
              </p>
            )}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Total</div>
                <div className="truncate text-xl font-bold tabular-nums text-blue-600">{total.toLocaleString()} <span className="text-xs font-semibold text-gray-500">MMK</span></div>
              </div>
              <Button className="min-h-11 shrink-0 px-5" disabled={busy || !canCheckout} onClick={() => setReviewOpen(true)}>
                Review sale
              </Button>
            </div>
          </div>
        </div>

        </div>
      </div>

      <Modal open={Boolean(newCustomer)} onClose={() => setNewCustomer(null)} title="New customer">
        {newCustomer && (
          <div className="space-y-3">
            <Input label="Name" value={newCustomer.name} autoFocus onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
            <Input label="Phone" value={newCustomer.phone} inputMode="tel" onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setNewCustomer(null)}>Cancel</Button>
              <Button onClick={addCustomer} disabled={busy || !newCustomer.name.trim()}>Add</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(picking)} onClose={() => setPicking(null)} title={picking?.model ?? ""}>
        {picking && (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {picking.items.map((it) => {
              const left = stockOf(it) - inCart(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  disabled={left <= 0}
                  onClick={() => { addToCart(it); setPicking(null); }}
                  className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-gray-50 disabled:opacity-40 dark:hover:bg-gray-800"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{variantLabel(it)}</span>
                    <span className="block truncate text-[11px] text-gray-500">{it.sku}</span>
                  </span>
                  <span className={cn("shrink-0 text-xs", left <= 2 ? "font-medium text-amber-600" : "text-gray-500")}>{`stock ${left}`}</span>
                  <b className="w-24 shrink-0 text-right text-sm tabular-nums text-blue-600">{fmtMoney(it.sellingPrice)}</b>
                </button>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal open={reviewOpen} onClose={() => setReviewOpen(false)} title="Review sale">
        <div className="space-y-4">
          <div className="max-h-52 space-y-2 overflow-y-auto text-sm">
            {cart.map((line) => (
              <div key={line.item.id} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{line.item.name} × {line.quantity}</span>
                <b className="shrink-0 tabular-nums">{(line.unitPrice * line.quantity).toLocaleString()} MMK</b>
              </div>
            ))}
          </div>
          <div className="space-y-1 border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
            <div className="flex justify-between"><span>Total</span><b>{total.toLocaleString()} MMK</b></div>
            <div className="flex justify-between"><span>Received</span><b>{paidAmount.toLocaleString()} MMK</b></div>
            {split && (
              <div className="space-y-0.5 pl-3 text-xs text-gray-500">
                <div className="flex justify-between"><span>{wallets.find((w) => w.id === walletId)?.name}</span><span className="tabular-nums">{part1.toLocaleString()}</span></div>
                <div className="flex justify-between"><span>{wallets.find((w) => w.id === wallet2Id)?.name}</span><span className="tabular-nums">{part2.toLocaleString()}</span></div>
              </div>
            )}
            <div className="flex justify-between"><span>Customer</span><b>{customers.find((c) => c.id === customerId)?.name ?? "Walk-in customer"}</b></div>
            {creditAmount > 0 && <div className="flex justify-between text-amber-600"><span>Customer owes</span><b>{creditAmount.toLocaleString()} MMK</b></div>}
            {change > 0 && <div className="flex justify-between text-green-600"><span>Change</span><b>{change.toLocaleString()} MMK</b></div>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => setReviewOpen(false)}>Back</Button>
            <Button disabled={busy} onClick={checkout}>{busy ? "Processing..." : "Complete sale"}</Button>
          </div>
        </div>
      </Modal>

      {/* Closing this clears the slip too. It is kept in the document for the print
          stylesheet to find, so leaving it behind would mean a later print of any other
          page quietly produced the last customer's receipt. */}
      <Modal open={Boolean(lastSale)} onClose={closeSaleComplete} title="Sale complete">
        {lastSale && (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto text-green-600" size={48} />
            <div>
              <p className="font-mono text-lg font-bold">{lastSale.txnNo}</p>
              <p className="mt-1 text-2xl font-bold text-blue-600">{fmtMoney(lastSale.total)} MMK</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => receipt && printSaleReceipt(receipt)} disabled={!receipt}>
                <Printer size={16} className="mr-1 inline" />Print slip
              </Button>
              <Button onClick={() => { closeSaleComplete(); searchRef.current?.focus(); }}>New sale</Button>
            </div>
            {receipt && warrantyLines(receipt).length > 0 && (
              <Button variant="secondary" className="w-full" onClick={() => setCardFor(receipt)}>
                <ShieldCheck size={16} className="mr-1 inline text-green-600" />Warranty card
              </Button>
            )}
          </div>
        )}
      </Modal>
      <WarrantyCardDialog receipt={cardFor} onClose={() => setCardFor(null)} />
      {/* The camera stays open across scans: a basket is many items, and closing it after
          each one would mean re-opening it for every single line. */}
      <BarcodeScannerModal
        open={scanning}
        onClose={() => setScanning(false)}
        title="Scan items into the sale"
        onScan={(code) => {
          if (!addByCode(code)) {
            push(`No item with code ${code}`, "error");
          }
          return true;
        }}
      />
      {receipt && <SaleReceipt data={receipt} />}
      {/* Phones: the cart is below the products, so a bar above the bottom menu says what is
          in it and takes the cashier there. It bounces each time something is added. */}
      {cart.length > 0 && (
        <button
          type="button"
          onClick={() => document.getElementById("pos-cart")?.scrollIntoView({ behavior: "smooth", block: "start" })}
          className="no-print fixed inset-x-3 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-white shadow-lg lg:hidden"
        >
          <span key={bump} className="animate-cart-bump relative">
            <ShoppingCart size={22} />
            <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[11px] font-bold text-white">
              {cart.reduce((sum, line) => sum + line.quantity, 0)}
            </span>
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-[11px] opacity-80">Cart</span>
            <span className="block truncate text-base font-bold tabular-nums">{total.toLocaleString()} MMK</span>
          </span>
          <span className="rounded-lg bg-white/20 px-3 py-1.5 text-sm font-semibold">View cart ↓</span>
        </button>
      )}
    </div>
  );
}
