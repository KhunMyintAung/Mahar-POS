import { BarChart3, Boxes, ShoppingCart, Wrench } from "lucide-react";

const FEATURES = [
  { icon: ShoppingCart, label: "အရောင်း / POS" },
  { icon: Boxes, label: "ကုန်ပစ္စည်း စာရင်း" },
  { icon: Wrench, label: "ဖုန်းပြင်ဆင်ခ" },
  { icon: BarChart3, label: "ဝင်ငွေ ထွက်ငွေ" },
];

/** Every shop's repair page ends with this: the shops reading it are the kind of small
 *  phone shop Mahar Mini POS is made for. */
export default function PosAd() {
  return (
    <aside className="mt-10 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-5 shadow-sm dark:border-blue-900 dark:from-blue-950/50 dark:to-gray-900">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mahar-icon-192.png" alt="" className="size-11 rounded-xl" />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">ကြော်ငြာ</p>
          <h2 className="font-bold">Mahar Mini POS — ဆိုင်စာရင်း အခမဲ့</h2>
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">
        ဒီစာရင်းလိုပဲ သင့်ဆိုင်ရဲ့ ရောင်းအား၊ ကုန်ပစ္စည်း၊ အကြွေးနဲ့ ဖုန်းပြင်ဆင်ခ စာရင်းတွေကို ဖုန်းထဲမှာပဲ အလွယ်တကူ ကိုင်လိုက်ပါ။
        Telegram နဲ့လည်း ချိတ်လို့ရပါတယ်။
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-2">
        {FEATURES.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-2 rounded-lg bg-white/70 px-2.5 py-2 text-xs font-medium dark:bg-gray-800/60">
            <Icon className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
            {label}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="https://app.maharpos.shop/register" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
          အခမဲ့ စတင်သုံးရန်
        </a>
        <a href="https://maharpos.shop" className="rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900">
          ပိုမိုသိရှိရန်
        </a>
      </div>
    </aside>
  );
}
