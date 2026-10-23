import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicShop } from "@/lib/onlineShop";
import { ShopFront } from "@/components/ShopFront";

/** A shop's Online Shop: its items shown online, with photos, price and stock, and a cart
 *  that sends the order to the shop. Read fresh on every visit, so stock is as it is now. */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const shop = await publicShop(slug);
  if (!shop) return { title: "Shop not found", robots: { index: false, follow: false } };
  const first = shop.items.find((i) => i.images.length)?.images[0];
  return {
    title: `${shop.business.name} · Online Shop`,
    description: shop.cfg.intro || `${shop.business.name} — ပစ္စည်းများ ကြည့်ပြီး Online မှ မှာယူနိုင်ပါသည်`,
    alternates: { canonical: `/shop/${slug}` },
    openGraph: first ? { images: [{ url: `/api/public/item-image/${first}` }] } : undefined,
  };
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await publicShop(slug);
  if (!shop) notFound();
  return (
    <ShopFront
      slug={slug}
      shop={{
        name: shop.business.name,
        logo: shop.business.logoUrl ? `/api/public/shop-logo/${shop.business.id}` : "",
        address: shop.business.address ?? "",
        phone: shop.cfg.phone || shop.business.phone || "",
        intro: shop.cfg.intro,
        delivery: shop.cfg.delivery,
        payment: shop.cfg.payment,
      }}
      items={shop.items.map((i) => ({ ...i, price: i.price.toString() }))}
    />
  );
}
