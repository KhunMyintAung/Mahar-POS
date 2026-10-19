import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { verifyTrackToken } from "@/lib/repairTrack";
import { REPAIR_STATUS_LABELS, REPAIR_STATUS_MM, type RepairStatus } from "@/lib/repairStatus";

/** The page a customer reaches by scanning their repair voucher.
 *
 *  Anyone holding the voucher can open it, so it shows the job and nothing about the
 *  customer: no name, no phone, no IMEI. What is left is what they came to find out —
 *  is it ready, and what do I owe.
 */

export const metadata: Metadata = {
  title: "Repair status",
  robots: { index: false, follow: false },
};

const STEPS: RepairStatus[] = ["RECEIVED", "CHECKING", "IN_PROGRESS", "DONE", "DELIVERED"];

const money = (minor: bigint) => `${(Number(minor) / 100).toLocaleString("en-US")} MMK`;
const when = (d: Date | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Yangon" }).format(d) : "-";

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const jobId = verifyTrackToken(decodeURIComponent(token));
  const job = jobId
    ? await prisma.repairJob.findFirst({ where: { id: jobId, deletedAt: null } })
    : null;
  const business = job
    ? await prisma.business.findUnique({ where: { id: job.businessId }, select: { name: true, phone: true, address: true, logoUrl: true } })
    : null;

  if (!job || !business) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center text-gray-800 dark:text-gray-200">
        <h1 className="text-xl font-bold">Repair not found</h1>
        <p className="mt-2 text-sm text-gray-500">ဤ QR ဖြင့် ပြုပြင်မှုမှတ်တမ်း မတွေ့ပါ။ ဆိုင်သို့ ဆက်သွယ်ပါ။</p>
      </main>
    );
  }

  const status = job.status as RepairStatus;
  const stepIndex = STEPS.indexOf(status === "WAITING_PARTS" ? "IN_PROGRESS" : status === "CANNOT_REPAIR" ? "DONE" : status);
  const charge = job.finalCost > 0n ? job.finalCost : job.estimatedCost;
  const due = job.finalCost > job.paidAmount ? job.finalCost - job.paidAmount : 0n;

  return (
    <main className="mx-auto w-full max-w-md px-4 py-8 text-gray-800 dark:text-gray-200">
      <header className="text-center">
        {business.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL; there is nothing to optimise
          <img src={business.logoUrl} alt="" className="mx-auto mb-2 max-h-20 max-w-[60%] object-contain" />
        )}
        <h1 className="text-xl font-bold">{business.name}</h1>
        {(business.phone || business.address) && (
          <p className="mt-1 text-sm text-gray-500">{[business.phone, business.address].filter(Boolean).join(" · ")}</p>
        )}
      </header>

      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">ဘောက်ချာနံပါတ်</p>
            <p className="font-mono text-lg font-bold">{job.jobNo}</p>
            <p className="text-sm">{job.deviceBrand} {job.deviceModel}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-blue-600">{REPAIR_STATUS_MM[status] ?? status}</p>
            <p className="text-xs text-gray-500">{REPAIR_STATUS_LABELS[status] ?? status}</p>
          </div>
        </div>

        {status !== "CANCELLED" && (
          <ol className="mt-5 grid grid-cols-5 gap-1" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s} className="text-center">
                <div className={`h-1.5 rounded-full ${i <= stepIndex ? "bg-blue-600" : "bg-gray-200 dark:bg-gray-700"}`} />
                <span className={`mt-1 block text-[10px] ${i === stepIndex ? "font-semibold text-blue-600" : "text-gray-500"}`}>
                  {REPAIR_STATUS_MM[s]}
                </span>
              </li>
            ))}
          </ol>
        )}

        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-gray-500">ပြင်ရန်</dt><dd className="text-right">{job.problem}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-gray-500">လက်ခံသည့်ရက်</dt><dd>{when(job.receivedAt)}</dd></div>
          {job.completedAt && <div className="flex justify-between gap-3"><dt className="text-gray-500">ပြီးသည့်ရက်</dt><dd>{when(job.completedAt)}</dd></div>}
          {job.deliveredAt && <div className="flex justify-between gap-3"><dt className="text-gray-500">ပြန်ပေးသည့်ရက်</dt><dd>{when(job.deliveredAt)}</dd></div>}
          <div className="flex justify-between gap-3 border-t border-gray-100 pt-2 dark:border-gray-800">
            <dt className="text-gray-500">{job.finalCost > 0n ? "ကျသင့်ငွေ" : "ခန့်မှန်းကျသင့်ငွေ"}</dt>
            <dd className="font-semibold">{charge > 0n ? money(charge) : "စစ်ဆေးပြီးမှ အတည်ပြုပါမည်"}</dd>
          </div>
          {job.paidAmount > 0n && <div className="flex justify-between gap-3"><dt className="text-gray-500">ပေးပြီး</dt><dd>{money(job.paidAmount)}</dd></div>}
          {due > 0n && <div className="flex justify-between gap-3"><dt className="text-gray-500">ကျန်ငွေ</dt><dd className="font-bold text-red-600">{money(due)}</dd></div>}
          {job.finalCost > 0n && due === 0n && (
            <div className="pt-1 text-center">
              <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-sm font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">✔ ရှင်းပြီး</span>
            </div>
          )}
        </dl>
      </section>

      <p className="mt-4 text-center text-xs text-gray-500">
        ဖုန်းလာရွေးသည့်အခါ လက်ခံ Voucher ကို ယူလာပါ။
      </p>
    </main>
  );
}
