"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, Wrench } from "lucide-react";
import { api } from "@/lib/client";
import { cn } from "@/components/ui";

/** Repair Jobs and the order list (parts customers asked for) side by side, with how many
 *  orders are still open, so one waiting for a part is never out of sight. */
export function RepairTabs({ openOrders }: { openOrders?: number }) {
  const pathname = usePathname();
  const [fetched, setFetched] = useState<number | null>(null);
  useEffect(() => {
    if (openOrders !== undefined) return;
    api<{ open: number }>("/api/v1/part-orders?count=1").then((d) => setFetched(d.open)).catch(() => {});
  }, [openOrders]);
  const open = openOrders ?? fetched ?? 0;
  const tabs = [
    { href: "/repairs", label: "Repair Jobs", icon: Wrench, on: pathname === "/repairs" },
    { href: "/repairs/orders", label: "အမှာစာရင်း", icon: ClipboardList, on: pathname.startsWith("/repairs/orders") },
  ];
  return (
    <div className="no-print flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
            t.on ? "bg-white text-blue-600 shadow dark:bg-gray-900" : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
          )}
        >
          <t.icon size={16} />{t.label}
          {t.href === "/repairs/orders" && open > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">{open}</span>
          )}
        </Link>
      ))}
    </div>
  );
}
