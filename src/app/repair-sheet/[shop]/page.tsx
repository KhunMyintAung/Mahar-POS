import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchRepairSheet, fetchRepairTabs } from "@/lib/repair-sheet";
import RepairSheetView from "../RepairSheetView";

export const revalidate = 60;

type Props = { params: Promise<{ shop: string }> };

async function findShop(slug: string) {
  const tabs = await fetchRepairTabs().catch(() => []);
  return tabs.find((tab) => tab.slug === decodeURIComponent(slug).toLowerCase()) ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await findShop((await params).shop);
  return {
    title: shop ? `${shop.name} · ဖုန်းပြင်ဆင်မှု စာရင်း` : "ဖုန်းပြင်ဆင်မှု စာရင်း",
    // Customers' names are on it: reachable by link, kept out of search results.
    robots: { index: false, follow: false },
  };
}

export default async function RepairShopSheetPage({ params }: Props) {
  const shop = await findShop((await params).shop);
  if (!shop) notFound();

  let sheet = null;
  let failed = false;
  try {
    sheet = await fetchRepairSheet(shop.gid);
  } catch {
    failed = true;
  }
  if (!failed && !sheet) notFound();

  return <RepairSheetView shopName={shop.name} sheet={sheet} />;
}
