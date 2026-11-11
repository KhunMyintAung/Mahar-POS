import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  CalendarClock, Check, Globe, MapPin, MessageCircle, Phone, ReceiptText, Smartphone, Store, User, Wrench,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { verifyTrackToken } from "@/lib/repairTrack";
import { type RepairStatus } from "@/lib/repairStatus";
import { asCurrency } from "@/lib/currency";
import { isTimeZone } from "@/lib/format";
import { REPAIR_VOUCHER_SETTING } from "@/services/repairService";
import { parseRepairVoucherSettings, voucherLanguage } from "@/lib/repairVoucherSettings";
import { TRACK_TEXT, voucherText } from "@/lib/repairVoucherText";

/** The page a customer reaches by scanning their repair voucher.
 *
 *  Anyone holding the voucher can open it, so it shows what the voucher already shows —
 *  the customer's name, the device, the job — and never the phone number or IMEI. What the
 *  customer came for is up top: where the repair stands, and how to reach the shop.
 */

export const metadata: Metadata = {
  title: "Repair status",
  robots: { index: false, follow: false },
};

/** Which statuses count as reaching each step (taken in, repairing, done, handed back). */
const STEP_REACHED: RepairStatus[][] = [
  ["RECEIVED", "CHECKING", "IN_PROGRESS", "WAITING_PARTS", "DONE", "CANNOT_REPAIR", "DELIVERED"],
  ["CHECKING", "IN_PROGRESS", "WAITING_PARTS", "DONE", "CANNOT_REPAIR", "DELIVERED"],
  ["DONE", "CANNOT_REPAIR", "DELIVERED"],
  ["DELIVERED"],
];

const amount = (minor: bigint, currency: string) => `${(Number(minor) / 100).toLocaleString("en-US")} ${currency}`;
const whenIn = (d: Date | null, timeZone: string) =>
  d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone }).format(d) : "-";

function Logo({ src, name, size }: { src: string | null; name: string; size: "md" | "sm" }) {
  const box = size === "md" ? "h-14 w-14" : "h-11 w-11";
  return src ? (
    // Height fixed, width free, so a wide word-mark logo is not squeezed into a square.
    // eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise
    <img src={src} alt="" className={`${size === "md" ? "h-14 max-w-[9rem]" : "h-11 max-w-[7rem]"} w-auto shrink-0 object-contain`} />
  ) : (
    <div className={`${box} flex shrink-0 items-center justify-center rounded-xl bg-green-50 text-lg font-bold text-green-700`}>
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${className}`}>{children}</section>;
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <Card className="flex items-center gap-4 px-5 py-4">
      <span className="text-green-600">{icon}</span>
      <div className="min-w-0">
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-lg font-bold text-gray-900">{value}</div>
      </div>
    </Card>
  );
}

function Action({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className="flex items-center justify-center gap-2 px-3 py-4 text-[15px] font-semibold text-gray-900 hover:bg-gray-50"
    >
      <span className="text-green-600">{icon}</span>{children}
    </a>
  );
}

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const jobId = verifyTrackToken(decodeURIComponent(token));
  const job = jobId
    ? await prisma.repairJob.findFirst({ where: { id: jobId, deletedAt: null } })
    : null;
  const business = job
    ? await prisma.business.findUnique({
        where: { id: job.businessId },
        select: { currency: true, timezone: true, name: true, phone: true, address: true, city: true, latitude: true, longitude: true, logoUrl: true, website: true, websiteLabel: true, telegram: true },
      })
    : null;

  if (!job || !business) {
    return (
      <main data-no-i18n className="min-h-dvh bg-gray-100 px-4 py-16 text-center text-gray-800">
        <h1 className="text-xl font-bold">Repair not found</h1>
        {/* No shop to take a language from, so it is said in each. */}
        <p className="mt-2 text-sm text-gray-500">{TRACK_TEXT.en.notFound}</p>
        <p className="mt-1 text-sm text-gray-500">{TRACK_TEXT.mm.notFound}</p>
        <p className="mt-1 text-sm text-gray-500">{TRACK_TEXT.th.notFound}</p>
      </main>
    );
  }

  // In the language and currency of the shop's voucher, which this page is the other half of.
  const currency = asCurrency(business.currency);
  const setting = await prisma.systemSetting.findUnique({
    where: { businessId_key: { businessId: job.businessId, key: REPAIR_VOUCHER_SETTING } },
  });
  let stored: unknown = {};
  try { stored = setting ? JSON.parse(setting.value) : {}; } catch { stored = {}; }
  const language = voucherLanguage(parseRepairVoucherSettings(stored, currency).language, currency);
  const t = TRACK_TEXT[language];
  const v = voucherText(language);
  const money = (minor: bigint) => amount(minor, currency);
  // Times as the shop's own clock shows them.
  const zone = isTimeZone(business.timezone) ? business.timezone : "Asia/Yangon";
  const when = (d: Date | null) => whenIn(d, zone);

  const status = job.status as RepairStatus;
  const charge = job.finalCost > 0n ? job.finalCost : job.estimatedCost;
  const due = job.finalCost > job.paidAmount ? job.finalCost - job.paidAmount : 0n;

  const actions: { href: string; icon: ReactNode; label: string }[] = [];
  if (business.phone) actions.push({ href: `tel:${business.phone.replace(/[^\d+]/g, "")}`, icon: <Phone size={20} />, label: t.call });
  // The pinned location is exact; without one the map searches the shop's name and address.
  const hasPin = business.latitude != null && business.longitude != null;
  if (hasPin || business.address) {
    const query = hasPin
      ? `${business.latitude},${business.longitude}`
      : [business.name, business.address, business.city].filter(Boolean).join(" ");
    actions.push({
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
      icon: <MapPin size={20} />,
      label: t.location,
    });
  }
  if (business.website) {
    const url = /^https?:\/\//.test(business.website) ? business.website : `https://${business.website}`;
    actions.push({ href: url, icon: <Globe size={20} />, label: business.websiteLabel?.trim() || "Online Shop" });
  }
  if (business.telegram) {
    const handle = business.telegram.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
    actions.push({ href: `https://t.me/${handle}`, icon: <MessageCircle size={20} />, label: "Telegram" });
  }

  return (
    // Its own light look whatever the phone's theme, like a printed slip.
    <main data-no-i18n lang={language === "mm" ? "my" : language} className="min-h-dvh bg-gray-100 text-gray-900">
      <div className="mx-auto w-full max-w-md space-y-4 px-4 py-5">
        <Card className="flex items-center gap-4 px-5 py-5">
          <Logo src={business.logoUrl} name={business.name} size="md" />
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-[0.15em] text-green-600">{t.title}</div>
            <h1 className="mt-1 text-2xl font-bold leading-tight">{business.name}</h1>
            <p className="mt-1 text-[15px] text-gray-500">{t.intro}</p>
          </div>
        </Card>

        <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 px-6 py-5 text-white shadow-lg">
          <div className="flex items-center gap-4">
            <Wrench size={30} className="shrink-0 text-white/90" />
            <div>
              <div className="text-sm text-white/70">{v.voucherNo}</div>
              <div className="text-3xl font-bold tracking-wide">{job.jobNo}</div>
            </div>
          </div>
          <div className="my-4 border-t border-white/15" />
          <div className="text-sm text-white/70">{t.currentStatus}</div>
          <div className="mt-1 text-2xl font-bold leading-snug">{t.headline[status] ?? status}</div>
        </section>

        {status !== "CANCELLED" && (
          <Card className="px-4 py-5">
            <ol className="flex items-start" aria-label="Progress">
              {STEP_REACHED.map((reached, i) => {
                const done = reached.includes(status);
                const next = STEP_REACHED[i + 1]?.includes(status);
                return (
                  <li key={i} className="relative flex flex-1 flex-col items-center">
                    {i < STEP_REACHED.length - 1 && (
                      <span className={`absolute left-1/2 top-5 h-0.5 w-full ${next ? "bg-green-300" : "bg-gray-200"}`} />
                    )}
                    <span
                      className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold ${
                        done ? "border-green-400 bg-green-100 text-green-700" : "border-gray-200 bg-white text-gray-400"
                      }`}
                    >
                      {done ? <Check size={18} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className={`mt-2 text-center text-sm ${done ? "font-semibold text-gray-900" : "text-gray-400"}`}>{t.steps[i]}</span>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 px-5 py-4">
            <Logo src={business.logoUrl} name={business.name} size="sm" />
            <div className="min-w-0">
              <div className="text-lg font-bold">{business.name}</div>
              {business.address && <div className="text-sm text-gray-500">{business.address}</div>}
            </div>
          </div>
          {actions.length > 0 && (
            <div className="grid grid-cols-2 border-t border-gray-200 [&>*:nth-child(even)]:border-l [&>*:nth-child(n+3)]:border-t [&>*]:border-gray-200">
              {actions.map((a) => <Action key={a.label} href={a.href} icon={a.icon}>{a.label}</Action>)}
            </div>
          )}
        </Card>

        {job.customerName && <InfoCard icon={<User size={26} />} label={t.customer} value={job.customerName} />}
        <InfoCard icon={<Smartphone size={26} />} label={v.device} value={`${job.deviceBrand} ${job.deviceModel}`} />
        <InfoCard icon={<Wrench size={26} />} label={v.problem} value={job.problem} />
        <InfoCard
          icon={<CalendarClock size={26} />}
          label={job.deliveredAt ? v.deliveredDate : job.completedAt ? t.completedDate : v.receivedDate}
          value={when(job.deliveredAt ?? job.completedAt ?? job.receivedAt)}
        />

        <Card className="px-5 py-4">
          <div className="flex items-center gap-4">
            <span className="text-green-600"><ReceiptText size={26} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-gray-500">{job.finalCost > 0n ? v.charge : v.estimated}</div>
              <div className="text-lg font-bold">{charge > 0n ? money(charge) : v.toConfirm}</div>
            </div>
            {job.finalCost > 0n && due === 0n && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">{v.settled}</span>
            )}
          </div>
          {(job.paidAmount > 0n || due > 0n) && (
            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
              {job.paidAmount > 0n && <div className="flex justify-between"><span className="text-gray-500">{v.paid}</span><span>{money(job.paidAmount)}</span></div>}
              {due > 0n && <div className="flex justify-between"><span className="text-gray-500">{v.balance}</span><b className="text-red-600">{money(due)}</b></div>}
            </div>
          )}
        </Card>

        <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-sm text-gray-500">
          <Store size={15} /> {t.bring}
        </p>
      </div>
    </main>
  );
}
