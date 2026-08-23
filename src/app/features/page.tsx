import Link from "next/link";
import {
  Boxes, FileBarChart, HandCoins, MinusCircle,
  Package, Receipt, ScrollText, Send, ShoppingCart, Truck, UserCog, Users, Wallet,
} from "lucide-react";
import { LanguageSwitch } from "@/components/LanguageProvider";

/** This is the page search engines actually land on, so it carries the description a
 *  Myanmar shop owner would recognise — the words they would type — rather than the
 *  English product blurb the page itself opens with. */
export const metadata = {
  title: "ဆိုင်စာရင်း၊ ပိုက်ဆံအိတ်နှင့် ရောင်းအား — Mahar Mini POS ဆိုတာဘာလဲ",
  description:
    "ပိုက်ဆံအိတ်၊ ရောင်းအား၊ ကုန်ပစ္စည်း၊ ဝင်ငွေထွက်ငွေ၊ အကြွေး၊ ငွေလဲနှုန်း၊ ဖုန်းပြင်ဆင်ခနှင့် " +
    "ဖုန်းဖြည့်ကဒ် — မြန်မာဆိုင်ငယ်များအတွက် အခမဲ့ စာရင်းကိုင် app။ စာအုပ်မလို၊ ဖုန်းပေါ်မှာပဲ ပြီးပါတယ်။",
  alternates: { canonical: "/features" },
  openGraph: {
    title: "ဆိုင်စာရင်း၊ ပိုက်ဆံအိတ်နှင့် ရောင်းအား — Mahar Mini POS",
    description: "မြန်မာဆိုင်ငယ်များအတွက် အခမဲ့ စာရင်းကိုင် app။ ပိုက်ဆံအိတ်၊ ရောင်းအား၊ ကုန်ပစ္စည်း၊ အကြွေး။",
    url: "/features",
  },
};

/** Told to Google as data rather than left for it to infer from the prose: what the thing
 *  is, who it is for, and that it costs nothing. This is what produces the rich result. */
const APP_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Mahar Mini POS",
  alternateName: ["ပိုက်ဆံအိတ်", "Mahar Mini POS ပိုက်ဆံအိတ်", "ဆိုင်စာရင်း app"],
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, Android, iOS",
  inLanguage: ["my", "en"],
  url: "https://walletnote.online/",
  description:
    "ပိုက်ဆံအိတ်၊ ရောင်းအား၊ ကုန်ပစ္စည်း၊ ဝင်ငွေထွက်ငွေ၊ အကြွေးနှင့် ငွေလဲနှုန်း — " +
    "မြန်မာဆိုင်ငယ်များအတွက် စာရင်းကိုင် app။",
  offers: { "@type": "Offer", price: "0", priceCurrency: "MMK" },
  featureList: [
    "ပိုက်ဆံအိတ်", "ငွေလွှဲ", "အကြွေးစာရင်း", "ဝင်ငွေ ထွက်ငွေ",
    "ရောင်းအား POS", "ကုန်ပစ္စည်းစာရင်း", "ငွေလဲနှုန်း", "ဖုန်းပြင်ဆင်ခ", "ဖုန်းဖြည့်ကဒ်", "Telegram bot",
  ],
};

/** The public description of the app, for someone deciding whether to sign up.
 *
 *  Every claim here matches something the app actually does — the sections mirror the
 *  feature list a business picks from at sign-up, so this page cannot promise a module
 *  that is not there.
 */
const HERO =
  "Mahar Mini POS keeps a small business's money, stock and records in one private workspace — on a phone, in Myanmar or English, without a shelf of notebooks.";

const GROUPS: { title: string; blurb: string; items: { icon: typeof Wallet; label: string; text: string }[] }[] = [
  {
    title: "Money",
    blurb: "Every kyat in and out, across as many wallets as you keep.",
    items: [
      { icon: Wallet, label: "Wallets", text: "Cash, KBZPay, bank — each with its own balance and history." },
      { icon: Send, label: "Transfer", text: "Move money between wallets, with a fee if there is one." },
      { icon: MinusCircle, label: "Withdraw", text: "Take money out and keep the reason with it." },
      { icon: Receipt, label: "Income & Expense", text: "Daily takings and costs under your own categories." },
      { icon: HandCoins, label: "Credit & Payable", text: "Who owes you, who you owe, and what has been settled." },
    ],
  },
  {
    title: "Shop",
    blurb: "For a counter that sells things.",
    items: [
      { icon: ShoppingCart, label: "Sales & POS", text: "Ring up a sale by barcode or search, and take payment." },
      { icon: Package, label: "Items", text: "Prices, cost, units and categories." },
      { icon: Boxes, label: "Stock", text: "What is on the shelf, what moved, and what is running low." },
      { icon: Truck, label: "Purchases", text: "What you bought in, from whom, and what is still owed." },
    ],
  },
  {
    title: "Everything else",
    blurb: "The parts that keep a business honest with itself.",
    items: [
      { icon: FileBarChart, label: "Reports", text: "Daily close, profit and loss, and export to a spreadsheet." },
      { icon: Users, label: "Customers", text: "Contacts, balances and history in one place." },
      { icon: UserCog, label: "Users & Roles", text: "Staff accounts that only reach what you allow." },
      { icon: ScrollText, label: "Audit Logs", text: "Who changed what, when — nothing is edited silently." },
    ],
  },
];

const POINTS = [
  { title: "Your workspace is yours", text: "Each business is separate. No other business can see your records." },
  { title: "Only what you use", text: "Pick your kind of business at sign-up and the rest stays out of the way." },
  { title: "Myanmar or English", text: "Switch language whenever you like." },
  { title: "Works like an app", text: "Install it on a phone from the browser — no store needed." },
  { title: "Many branches, one picture", text: "Keep branches apart, then see the whole business together." },
  { title: "Free to start", text: "Create an account and begin. Nothing to pay up front." },
];

export default function FeaturesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 text-gray-800 dark:text-gray-200 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_SCHEMA) }}
      />
      <LanguageSwitch className="absolute right-4 top-4" />

      <div className="flex flex-col items-center text-center">
        <div className="rounded-2xl bg-blue-600 p-3 text-white">
          <Wallet size={30} />
        </div>
        <h1 className="mt-4 text-3xl font-bold">What is Mahar Mini POS?</h1>
        {/* A constant, not JSX text: the translator matches whole strings, and JSX would
            fold the line break into a space that has to be guessed at. */}
        <p className="mt-3 max-w-2xl text-base leading-7 text-gray-600 dark:text-gray-300">
          {HERO}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/register"
            className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Create a free account
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-11 items-center rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            Sign in
          </Link>
        </div>
      </div>

      <div className="mt-12 space-y-10">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="text-xl font-bold">{group.title}</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{group.blurb}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
                >
                  <div className="flex items-center gap-2">
                    <item.icon size={18} className="shrink-0 text-blue-600" />
                    <h3 className="text-sm font-semibold">{item.label}</h3>
                  </div>
                  <p className="mt-1.5 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <section>
          <h2 className="text-xl font-bold">Good to know</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {POINTS.map((point) => (
              <div key={point.title} className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
                <h3 className="text-sm font-semibold">{point.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {point.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-12 flex flex-col items-center gap-4 border-t border-gray-200 pt-8 text-center dark:border-gray-800">
        <p className="text-sm text-gray-600 dark:text-gray-300">Ready to start?</p>
        <Link
          href="/register"
          className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Create a free account
        </Link>
        <div className="flex flex-wrap justify-center gap-4 text-xs">
          <Link className="text-gray-500 hover:text-blue-600" href="/login">Sign in</Link>
          <Link className="text-gray-500 hover:text-blue-600" href="/privacy">Privacy</Link>
          <Link className="text-gray-500 hover:text-red-600" href="/account-deletion">Delete account</Link>
        </div>
      </div>
    </main>
  );
}
