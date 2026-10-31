/** Every shop's repair page ends with this: the shops reading it are the kind of small
 *  phone shop Mahar Mini POS is made for. */
export default function PosAd() {
  return (
    <aside className="mt-4 flex flex-wrap items-center gap-2 rounded border border-blue-200 bg-blue-50 px-2.5 py-2 text-xs dark:border-blue-900 dark:bg-blue-950/40">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/mahar-icon-192.png" alt="" className="size-7 rounded" />
      <p className="min-w-0 flex-1">
        <b>Mahar Mini POS</b> <span className="text-gray-500">· ကြော်ငြာ</span>
        <br />
        <span className="text-gray-600 dark:text-gray-300">ရောင်းအား၊ ကုန်ပစ္စည်း၊ အကြွေး၊ ဖုန်းပြင်ဆင်ခ စာရင်း — ဖုန်းထဲမှာ အခမဲ့</span>
      </p>
      <a href="https://app.maharpos.shop/register" className="rounded bg-blue-600 px-2.5 py-1.5 font-semibold text-white hover:bg-blue-700">
        အခမဲ့ သုံးရန်
      </a>
    </aside>
  );
}
