"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client";
import { cn } from "@/components/ui";

/** Repair Jobs and the order list side by side, as the page's name in the top bar (passed to
 *  PageHeader as its title), with how many parts are still to get — so a part waiting is never
 *  out of sight, and neither page gives up a row to the switch. */
export function RepairTabs({ openOrders }: { openOrders?: number }) {
  const pathname = usePathname();
  const [fetched, setFetched] = useState<number | null>(null);
  useEffect(() => {
    if (openOrders !== undefined) return;
    api<{ open: number }>("/api/v1/part-orders?count=1").then((d) => setFetched(d.open)).catch(() => {});
  }, [openOrders]);
  const open = openOrders ?? fetched ?? 0;
  const tabs = [
    { href: "/repairs", label: "ပြုပြင်ရေး", on: pathname === "/repairs" },
    { href: "/repairs/orders", label: "အမှာစာရင်း", on: pathname.startsWith("/repairs/orders") },
  ];
  return (
    <span className="inline-flex gap-0.5 rounded-lg bg-gray-100 p-0.5 align-middle dark:bg-gray-800">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-semibold transition",
            t.on ? "bg-white text-blue-600 shadow-sm dark:bg-gray-900" : "font-medium text-gray-500 hover:text-gray-900 dark:text-gray-400"
          )}
        >
          {t.label}
          {t.href === "/repairs/orders" && open > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{open}</span>}
        </Link>
      ))}
    </span>
  );
}
