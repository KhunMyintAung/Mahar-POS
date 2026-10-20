import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  CalendarClock, Check, Globe, MapPin, MessageCircle, Phone, ReceiptText, Smartphone, Store, User, Wrench,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { verifyTrackToken } from "@/lib/repairTrack";
import { type RepairStatus } from "@/lib/repairStatus";

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

/** The headline for each status, written to the customer. */
const HEADLINE: Record<RepairStatus, string> = {
  RECEIVED: "ဖုန်းကို လက်ခံပြီးပါပြီ",
  CHECKING: "ဖုန်းကို စစ်ဆေးနေပါသည်",
  IN_PROGRESS: "ဖုန်းကို ပြင်ဆင်နေပါသည်",
  WAITING_PARTS: "အပိုပစ္စည်း စောင့်နေပါသည်",
  DONE: "ပြင်ပြီးပါပြီ — လာရွေးနိုင်ပါပြီ",
  CANNOT_REPAIR: "ပြင်၍ မရပါ — ဖုန်းလာယူနိုင်ပါသည်",
  DELIVERED: "ဖုန်းကို ပြန်ပေးပြီးပါပြီ",
  CANCELLED: "ပယ်ဖျက်ထားပါသည်",
};

/** The steps a repair goes through, and which statuses count as reaching each. */
const STEPS: { label: string; reached: RepairStatus[] }[] = [
  { label: "လက်ခံပြီး", reached: ["RECEIVED", "CHECKING", "IN_PROGRESS", "WAITING_PARTS", "DONE", "CANNOT_REPAIR", "DELIVERED"] },
  { label: "ပြင်ဆင်နေ", reached: ["CHECKING", "IN_PROGRESS", "WAITING_PARTS", "DONE", "CANNOT_REPAIR", "DELIVERED"] },
  { label: "ပြင်ပြီး", reached: ["DONE", "CANNOT_REPAIR", "DELIVERED"] },
  { label: "ပြန်ပေးပြီး", reached: ["DELIVERED"] },
];

const money = (minor: bigint) => `${(Number(minor) / 100).toLocaleString("en-US")} MMK`;
const when = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Yangon" }).format(d) : "-";

function Logo({ src, name, size }: { src: string | null; name: string; size: "md" | "sm" }) {
  const box = size === "md" ? "h-14 w-14" : "h-11 w-11";
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise
    <img src={src} alt="" className={`${box} shrink-0 object-contain`} />
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
        select: { name: true, phone: true, address: true, logoUrl: true, website: true, telegram: true },
      })
    : null;

  if (!job || !business) {
    return (
      <main className="min-h-dvh bg-gray-100 px-4 py-16 text-center text-gray-800">
        <h1 className="text-xl font-bold">Repair not found</h1>
        <p className="mt-2 text-sm text-gray-500">ဤ QR ဖြင့် ပြုပြင်မှုမှတ်တမ်း မတွေ့ပါ။ ဆိုင်သို့ ဆက်သွယ်ပါ။</p>
      </main>
    );
  }

  const status = job.status as RepairStatus;
  const charge = job.finalCost > 0n ? job.finalCost : job.estimatedCost;
  const due = job.finalCost > job.paidAmount ? job.finalCost - job.paidAmount : 0n;

  const actions: { href: string; icon: ReactNode; label: string }[] = [];
  if (business.phone) actions.push({ href: `tel:${business.phone.replace(/[^\d+]/g, "")}`, icon: <Phone size={20} />, label: "ဖုန်းခေါ်ရန်" });
  if (business.address) {
    actions.push({
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.name} ${business.address}`)}`,
      icon: <MapPin size={20} />,
      label: "ဆိုင်တည်နေရာ",
    });
  }
  if (business.website) {
    const url = /^https?:\/\//.test(business.website) ? business.website : `https://${business.website}`;
    actions.push({ href: url, icon: <Globe size={20} />, label: "Online Shop" });
  }
  if (business.telegram) {
    const handle = business.telegram.replace(/^@/, "").replace(/^https?:\/\/t\.me\//, "");
    actions.push({ href: `https://t.me/${handle}`, icon: <MessageCircle size={20} />, label: "Telegram" });
  }

  return (
    // Its own light look whatever the phone's theme, like a printed slip.
    <main className="min-h-dvh bg-gray-100 text-gray-900">
      <div className="mx-auto w-full max-w-md space-y-4 px-4 py-5">
        <Card className="flex items-center gap-4 px-5 py-5">
          <Logo src={business.logoUrl} name={business.name} size="md" />
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-[0.15em] text-green-600">Repair Tracking</div>
            <h1 className="mt-1 text-2xl font-bold leading-tight">{business.name}</h1>
            <p className="mt-1 text-[15px] text-gray-500">ဖုန်းပြင်ဆင်မှုအခြေအနေကို လုံခြုံစွာ ကြည့်ရှုနိုင်ပါသည်။</p>
          </div>
        </Card>

        <section className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 px-6 py-5 text-white shadow-lg">
          <div className="flex items-center gap-4">
            <Wrench size={30} className="shrink-0 text-white/90" />
            <div>
              <div className="text-sm text-white/70">ဘောက်ချာနံပါတ်</div>
              <div className="text-3xl font-bold tracking-wide">{job.jobNo}</div>
            </div>
          </div>
          <div className="my-4 border-t border-white/15" />
          <div className="text-sm text-white/70">လက်ရှိအခြေအနေ</div>
          <div className="mt-1 text-2xl font-bold leading-snug">{HEADLINE[status] ?? status}</div>
        </section>

        {status !== "CANCELLED" && (
          <Card className="px-4 py-5">
            <ol className="flex items-start" aria-label="Progress">
              {STEPS.map((step, i) => {
                const done = step.reached.includes(status);
                const next = STEPS[i + 1]?.reached.includes(status);
                return (
                  <li key={step.label} className="relative flex flex-1 flex-col items-center">
                    {i < STEPS.length - 1 && (
                      <span className={`absolute left-1/2 top-5 h-0.5 w-full ${next ? "bg-green-300" : "bg-gray-200"}`} />
                    )}
                    <span
                      className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold ${
                        done ? "border-green-400 bg-green-100 text-green-700" : "border-gray-200 bg-white text-gray-400"
                      }`}
                    >
                      {done ? <Check size={18} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className={`mt-2 text-center text-sm ${done ? "font-semibold text-gray-900" : "text-gray-400"}`}>{step.label}</span>
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

        {job.customerName && <InfoCard icon={<User size={26} />} label="Customer" value={job.customerName} />}
        <InfoCard icon={<Smartphone size={26} />} label="Device" value={`${job.deviceBrand} ${job.deviceModel}`} />
        <InfoCard icon={<Wrench size={26} />} label="ပြင်ရန်" value={job.problem} />
        <InfoCard
          icon={<CalendarClock size={26} />}
          label={job.deliveredAt ? "ပြန်ပေးသည့်ရက်" : job.completedAt ? "ပြီးသည့်ရက်" : "လက်ခံသည့်ရက်"}
          value={when(job.deliveredAt ?? job.completedAt ?? job.receivedAt)}
        />

        <Card className="px-5 py-4">
          <div className="flex items-center gap-4">
            <span className="text-green-600"><ReceiptText size={26} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-gray-500">{job.finalCost > 0n ? "ကျသင့်ငွေ" : "ခန့်မှန်းကျသင့်ငွေ"}</div>
              <div className="text-lg font-bold">{charge > 0n ? money(charge) : "စစ်ဆေးပြီးမှ အတည်ပြုပါမည်"}</div>
            </div>
            {job.finalCost > 0n && due === 0n && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700">✔ ရှင်းပြီး</span>
            )}
          </div>
          {(job.paidAmount > 0n || due > 0n) && (
            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
              {job.paidAmount > 0n && <div className="flex justify-between"><span className="text-gray-500">ပေးပြီး</span><span>{money(job.paidAmount)}</span></div>}
              {due > 0n && <div className="flex justify-between"><span className="text-gray-500">ကျန်ငွေ</span><b className="text-red-600">{money(due)}</b></div>}
            </div>
          )}
        </Card>

        <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-sm text-gray-500">
          <Store size={15} /> ဖုန်းလာရွေးသည့်အခါ လက်ခံ Voucher ကို ယူလာပါ။
        </p>
      </div>
    </main>
  );
}
