import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Store, Wrench } from "lucide-react";
import { fetchRepairShops, type RepairShop } from "@/lib/repair-sheet";
import PosAd from "./PosAd";

export const metadata: Metadata = {
  title: "ဖုန်းပြင်ဆင်မှု စာရင်း",
  robots: { index: false, follow: false },
};

export const revalidate = 60;

export default async function RepairSheetIndexPage() {
  let shops: RepairShop[] = [];
  try {
    shops = await fetchRepairShops();
  } catch {
    shops = [];
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-10">
      <header className="mb-6 flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
          <Wrench className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">ဖုန်းပြင်ဆင်မှု စာရင်း</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Mahar Shwe Mobile · ဆိုင်ရွေးပါ</p>
        </div>
      </header>

      {shops.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900">
          Google Sheet ကို ဖတ်မရသေးပါ။ ခဏနေ ပြန်ကြည့်ပေးပါ။
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
          {shops.map((shop) => (
            <li key={shop.gid}>
              <Link href={`/repair-sheet/${shop.slug}`} className="flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/60">
                <Store className="size-5 text-blue-600" />
                <span className="flex-1 font-medium">{shop.name}</span>
                <span className="text-xs text-gray-400">/repair-sheet/{shop.slug}</span>
                <ChevronRight className="size-4 text-gray-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <PosAd />
    </main>
  );
}
