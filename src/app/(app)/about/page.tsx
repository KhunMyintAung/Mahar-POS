"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import QRCode from "qrcode";
import {
  ExternalLink, Globe2, HeartHandshake, MapPin, MessageCircle,
  QrCode, ShieldCheck, Smartphone,
} from "lucide-react";
import { DEFAULT_ABOUT, externalUrl, telegramUrl, tiktokUrl } from "@/lib/about";
import { useAuth } from "@/components/AppShell";

interface Donation {
  title: string;
  subtitle: string;
  name: string;
  payload: string;
}

function DonationCard({ item }: { item: Donation }) {
  const [qr, setQr] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(item.payload, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 520,
      color: { dark: "#111827", light: "#ffffff" },
    }).then((url) => {
      if (active) setQr(url);
    }).catch(() => {
      if (active) setQr("");
    });
    return () => { active = false; };
  }, [item.payload]);

  return (
    <article className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-950">
      <div className="relative grid aspect-square place-items-center bg-white p-3 dark:bg-gray-100">
        {qr ? (
          <Image src={qr} alt={`${item.title} QR code`} fill unoptimized className="object-contain p-3" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <QrCode size={38} />
            <span className="text-xs font-medium">Generating QR</span>
          </div>
        )}
      </div>
      <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <span className="text-xs font-semibold text-teal-700 dark:text-teal-400">{item.subtitle}</span>
        <h3 className="mt-1 text-base font-bold">{item.title}</h3>
        <p className="mt-2 break-all text-xs leading-5 text-gray-600 dark:text-gray-300">{item.name}</p>
      </div>
    </article>
  );
}

export default function AboutPage() {
  // Fixed content, not a per-shop document. This page is about the app and who made it,
  // which is the same for every business — reading it from settings only invited each shop
  // to rewrite it, and left a page of fields to maintain for no one's benefit.
  const about = DEFAULT_ABOUT;
  const { playEdition } = useAuth();

  // Hidden in the Play edition, as before: a store build must not solicit payments.
  const donations = playEdition
    ? []
    : [
        { title: "For Local KBZ Pay", subtitle: "Myanmar local donation", name: about.kbzName, payload: about.kbzPayload },
        { title: "For World Wide Crypto", subtitle: "USDT Deposit · BNB Smart Chain (BEP20)", name: about.cryptoName, payload: about.cryptoPayload },
        { title: "For Thailand PromptPay", subtitle: "Thai QR Payment", name: about.promptPayName, payload: about.promptPayPayload },
      ].filter((item) => item.payload);

  const links = [
    { label: "Facebook", value: "My Choice My Life", href: externalUrl(about.facebook) },
    { label: "TikTok", value: about.tiktok, href: tiktokUrl(about.tiktok) },
    { label: "Telegram", value: about.telegram, href: telegramUrl(about.telegram) },
    { label: "Community", value: "Join Telegram Community", href: externalUrl(about.community) },
    { label: "Website", value: about.website, href: externalUrl(about.website) },
  ].filter((link) => link.value && link.href);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="relative flex min-h-80 items-end overflow-hidden bg-gray-950 px-5 py-7 text-white sm:min-h-96 sm:px-8">
        <Image
          src={about.developerPhoto || "/khun-myint-aung.jpg"}
          alt={about.developer || "Developer"}
          fill
          priority
          className="object-cover object-[58%_62%]"
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="relative max-w-3xl">
          <span className="text-xs font-bold uppercase text-teal-100">About Us</span>
          <div className="mt-3 flex items-center gap-3">
            <Image src="/mahar-pos-logo.svg" alt="Mahar Shwe Mobile" width={56} height={56} className="rounded-lg bg-white p-1" />
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{about.appName}</h1>
              <p className="text-sm text-teal-100">Developed by {about.developer} · Version {about.version}</p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-teal-50">{about.description}</p>
          {about.location && (
            <div className="mt-4 flex flex-wrap gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5"><MapPin size={15} /> {about.location}</span>
              <span className="flex items-center gap-1.5"><ShieldCheck size={15} /> Private business workspace</span>
            </div>
          )}
          {about.developerPhotoSource && (
            <a href={about.developerPhotoSource} target="_blank" rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-xs text-teal-100 hover:text-white">
              <ExternalLink size={13} /> Photo source: Facebook
            </a>
          )}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <header className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
            <div><span className="text-xs font-bold text-teal-700 dark:text-teal-400">FOR SUPPORT</span>
              <h2 className="mt-1 text-lg font-bold">Contact &amp; Community</h2></div>
            <MessageCircle className="text-teal-700 dark:text-teal-400" size={24} />
          </header>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {links.map((link) => (
              <a href={link.href} target="_blank" rel="noreferrer" key={link.label}
                className="grid min-h-14 grid-cols-[5rem_1fr_auto] items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                <span className="text-xs font-semibold text-gray-500">{link.label}</span>
                <b className="min-w-0 truncate">{link.value}</b>
                <ExternalLink size={16} />
              </a>
            ))}
          </div>
        </article>

        <article className="flex flex-col border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <header className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-800">
            <div><span className="text-xs font-bold text-blue-700 dark:text-blue-400">CUSTOMER LIVE</span>
              <h2 className="mt-1 text-lg font-bold">Show our customer live</h2></div>
            <Smartphone className="text-blue-700 dark:text-blue-400" size={24} />
          </header>
          <p className="p-4 text-sm leading-6 text-gray-600 dark:text-gray-300">
            Latest updates, customer service, product information and support channels are available online.
          </p>
          {about.customerLiveUrl && (
            <a href={externalUrl(about.customerLiveUrl)} target="_blank" rel="noreferrer"
              className="mx-4 mb-4 mt-auto inline-flex min-h-11 w-fit items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white">
              <Globe2 size={18} /> Open Website
            </a>
          )}
        </article>
      </section>

      {donations.length > 0 && (
        <section className="border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <header className="flex items-start justify-between gap-4 border-b border-gray-200 p-4 dark:border-gray-800">
            <div><span className="text-xs font-bold text-teal-700 dark:text-teal-400">PLEASE DONATE</span>
              <h2 className="mt-1 text-lg font-bold">Support {about.appName}</h2>
              <p className="mt-1 text-sm text-gray-500">Choose a local, worldwide, or Thailand donation method.</p></div>
            <HeartHandshake className="text-teal-700 dark:text-teal-400" size={28} />
          </header>
          <div className="grid gap-4 p-4 md:grid-cols-3">
            {donations.map((item) => <DonationCard item={item} key={item.title} />)}
          </div>
        </section>
      )}

      <p className="pb-2 text-center text-xs text-gray-400">
        {about.copyright || `© ${new Date().getFullYear()} ${about.appName} · Developed by ${about.developer}`}
      </p>
    </div>
  );
}
