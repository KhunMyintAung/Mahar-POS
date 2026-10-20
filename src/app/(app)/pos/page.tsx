"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Camera, CheckCircle2, History, Minus, Plus, Printer, Search, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { fmtMoney } from "@/lib/format";
import { Button, Card, Input, Modal, Select, Spinner, cn, useToast } from "@/components/ui";
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
import { printReceipt } from "@/lib/printReceipt";

interface Item {
  id: string; name: string; sku: string; barcode?: string;
  sellingPrice: string; stockLevels: { branchId: string; quantity: number }[];
  category?: { name: string }; unit?: { name: string };
}
interface Wallet { id: string; name: string; currency: string; currentBalance: string }
interface Contact { id: string; name: string; type: string }
/** warranty is set only for phones marked new or second-hand; null means none was offered. */
interface CartLine { item: Item; quantity: number; unitPrice: number; warranty?: WarrantyOption | null; note?: string }
interface SaleResult { txnNo: string; total: string; profit: string }
interface Draft {
  savedAt: number;
  lines: { itemId: string; quantity: number; unitPrice: number; warranty?: WarrantyOption | null; note?: string }[];
  discount: string;
  walletId: string;
  customerId: string;
  payMode: "full" | "credit" | "partial";
  partialAmount: string;
  cashReceived: string;
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
  const { defaultBranchId, me, hasPerm } = useAuth();
  const draftKey = `wallet-note:pos-draft:${me?.user.id ?? "anonymous"}`;

  const load = useCallback(() => {
    api<{ items: Item[] }>("/api/v1/items?pageSize=200&active=1")
      .then((data) => setItems(data.items))
      .catch((error) => push(error.message, "error"));
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
  }, [push]);

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
            return [{ item, quantity: Math.min(line.quantity, stock), unitPrice: line.unitPrice, warranty: line.warranty ?? null, note: line.note }];
          }).filter((line) => line.quantity > 0));
          setDiscount(draft.discount);
          setWalletId(draft.walletId);
          setCustomerId(draft.customerId);
          setPayMode(draft.payMode);
          setPartialAmount(draft.partialAmount);
          setCashReceived(draft.cashReceived);
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
      lines: cart.map((line) => ({ itemId: line.item.id, quantity: line.quantity, unitPrice: line.unitPrice, warranty: line.warranty, note: line.note })),
      discount, walletId, customerId, payMode, partialAmount, cashReceived,
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [cart, cashReceived, customerId, discount, draftKey, draftReady, partialAmount, payMode, walletId]);

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

  function stockOf(item: Item) {
    return item.stockLevels
      .filter((level) => !defaultBranchId || level.branchId === defaultBranchId)
      .reduce((total, level) => total + level.quantity, 0);
  }

  function inCart(id: string) {
    return cart.reduce((total, line) => line.item.id === id ? total + line.quantity : total, 0);
  }

  function addToCart(item: Item) {
    if (inCart(item.id) >= stockOf(item)) {
      push(`No more stock for ${item.name}`, "error");
      return;
    }
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (existing) {
        return current.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, {
        item,
        quantity: 1,
        unitPrice: Number(BigInt(item.sellingPrice)) / 100,
        // A new or second-hand phone starts on the shop's first warranty choice for it.
        warranty: warrantyOptionsFor(warrantySettings, phoneCondition(item))[0] ?? null,
      }];
    });
    // Both tapping a product and scanning a barcode arrive here, so one beep covers both.
    // The out-of-stock case above returns before this: it gets the error tone instead.
    playBeep();
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
    if (!exact) return false;
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
  const canCheckout = cart.length > 0 && disc >= 0 && disc <= subtotal &&
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
            note: line.note?.trim() || undefined,
          })),
          discount: disc.toString(),
          paidAmount: paidAmount.toString(),
          walletId: paidAmount > 0 ? walletId : undefined,
          payments: split
            ? [{ walletId, amount: part1.toString() }, { walletId: wallet2Id, amount: part2.toString() }]
            : undefined,
        },
      });
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
    <div className="mx-auto max-w-7xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Sales &amp; POS</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{cart.reduce((sum, line) => sum + line.quantity, 0)} item(s)</span>
          {hasPerm("sale.view") && <Link href="/sales"><Button variant="secondary" size="sm"><History size={15} className="mr-1 inline" />Sale History</Button></Link>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-3">
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
          <div className="grid max-h-[42dvh] grid-cols-2 gap-2 overflow-y-auto sm:max-h-[55dvh] sm:grid-cols-3 lg:max-h-[70vh] xl:grid-cols-4">
            {filtered.map((item) => {
              const available = stockOf(item) - inCart(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  disabled={available <= 0}
                  // Full name on hover / long-press; the tile itself shows two lines so a row
                  // of parts with long compatibility lists stays the height of a short one.
                  title={`${item.name}\n${item.sku}`}
                  className={cn(
                    "flex min-h-[5.5rem] flex-col justify-between gap-1.5 rounded-lg border border-gray-200 bg-white p-2.5 text-left shadow-sm transition hover:border-blue-400 dark:border-gray-800 dark:bg-gray-900",
                    available <= 0 && "opacity-40"
                  )}
                >
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

        <Card className="h-fit space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Cart ({cart.length})</h3>
            {cart.length > 0 && (
              <button type="button" onClick={clearSale} className="text-xs font-medium text-red-600">Clear</button>
            )}
          </div>
          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">Tap items to add them</p>
          ) : (
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {cart.map((line) => (
                <div key={line.item.id} className="space-y-2 border-b border-gray-100 pb-2 text-sm last:border-0 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 truncate font-medium">{line.item.name}</div>
                    <b className="tabular-nums">{(line.unitPrice * line.quantity).toLocaleString()} MMK</b>
                    <button onClick={() => changeQuantity(line.item.id, 0)} className="min-h-9 min-w-9 rounded-lg p-2 text-gray-400 hover:text-red-500" aria-label={`Remove ${line.item.name}`}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {(() => {
                    const condition = phoneCondition(line.item);
                    const options = warrantyOptionsFor(warrantySettings, condition);
                    if (options.length === 0) return null;
                    return (
                      <div className="space-y-1.5 rounded-lg bg-green-50 px-2 py-1.5 text-xs dark:bg-green-900/20">
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
                  <div className="flex items-end justify-between gap-2">
                    <Input
                      label="Selling price"
                      value={line.unitPrice.toString()}
                      onChange={(event) => {
                        const value = Math.max(0, readAmount(event.target.value));
                        setCart((current) => current.map((entry) => entry.item.id === line.item.id ? { ...entry, unitPrice: value } : entry));
                      }}
                      inputMode="decimal"
                      className="max-w-32"
                    />
                    <div className="flex h-10 shrink-0 items-center overflow-hidden rounded-lg border border-gray-300 dark:border-gray-700">
                      <button type="button" onClick={() => changeQuantity(line.item.id, line.quantity - 1)} className="h-full w-10 p-2" aria-label="Decrease quantity"><Minus size={15} /></button>
                      <span className="w-10 text-center font-semibold tabular-nums">{line.quantity}</span>
                      <button type="button" onClick={() => changeQuantity(line.item.id, line.quantity + 1)} disabled={line.quantity >= stockOf(line.item)} className="h-full w-10 p-2 disabled:opacity-30" aria-label="Increase quantity"><Plus size={15} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t border-gray-200 pt-3 text-sm dark:border-gray-700">
            <div className="flex justify-between"><span>Subtotal</span><b className="tabular-nums">{subtotal.toLocaleString()} MMK</b></div>
            <div className="flex items-center justify-between gap-2">
              <span>Discount</span>
              <input value={discount} onChange={(event) => setDiscount(event.target.value)} className="w-28 rounded border border-gray-300 px-2 py-1 text-right text-sm dark:border-gray-700 dark:bg-gray-800" inputMode="decimal" />
            </div>
            {disc > subtotal && <p className="text-xs text-red-600">Discount cannot exceed subtotal.</p>}
            <div className="flex justify-between text-base"><span className="font-semibold">Total</span><b className="tabular-nums text-blue-600">{total.toLocaleString()} MMK</b></div>
          </div>

          <div className="space-y-2">
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

          <Button className="w-full" disabled={busy || !canCheckout} onClick={() => setReviewOpen(true)}>
            Review sale · {total.toLocaleString()} MMK
          </Button>
        </Card>
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
              <Button variant="secondary" onClick={() => receipt && printReceipt()} disabled={!receipt}>
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
    </div>
  );
}
