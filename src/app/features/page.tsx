import Image from "next/image";
import Link from "next/link";
import {
  Boxes, FileBarChart, HandCoins, MinusCircle,
  Package, Receipt, ScrollText, Send, ShoppingCart, Truck, UserCog, Users, Wallet,
} from "lucide-react";
import { PageToggles } from "@/components/ThemeToggle";
import { SITE_URL } from "../layout";
import { PRO_PRICE_MMK, TIER_PRICE_MMK, TERM_SAVING_MMK, TIER_PRICE_THB, TERM_SAVING_THB, TRIAL_DAYS } from "@/lib/plan";

const PRICE = PRO_PRICE_MMK.toLocaleString("en-US");
const FULL_PRICE = TIER_PRICE_MMK.FULL.toLocaleString("en-US");
const SAVE_6 = TERM_SAVING_MMK[6].toLocaleString("en-US");
const SAVE_12 = TERM_SAVING_MMK[12].toLocaleString("en-US");

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
  inLanguage: ["my", "en", "th"],
  url: `${SITE_URL}/`,
  description:
    "ပိုက်ဆံအိတ်၊ ရောင်းအား၊ ကုန်ပစ္စည်း၊ ဝင်ငွေထွက်ငွေ၊ အကြွေးနှင့် ငွေလဲနှုန်း — " +
    "မြန်မာဆိုင်ငယ်များအတွက် စာရင်းကိုင် app။",
  // Free to start, with an optional Pro plan — told to Google as two offers.
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "MMK" },
    { "@type": "Offer", name: "Pro", price: String(PRO_PRICE_MMK), priceCurrency: "MMK", description: "Pro, per month" },
    { "@type": "Offer", name: "Fully Access", price: String(TIER_PRICE_MMK.FULL), priceCurrency: "MMK", description: "Fully Access, per month" },
  ],
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
  { title: "Myanmar, English or Thai", text: "Switch language whenever you like." },
  { title: "Works like an app", text: "Install it on a phone from the browser — no store needed." },
  { title: "Many branches, one picture", text: "Keep branches apart, then see the whole business together." },
  { title: "Free to start", text: `Create an account and begin — no card. The core stays free; Pro is ${PRICE} Ks a month after a ${TRIAL_DAYS}-day free trial.` },
];

/** The two plans, for the pricing section. The Pro list names what Free does not include, so a
 *  shop can see exactly what the money buys. */
const PLANS: { name: string; price: string; per: string; blurb: string; points: string[]; featured?: boolean }[] = [
  {
    name: "Free",
    price: "0",
    per: "Ks",
    blurb: "The everyday counter, at no cost.",
    points: ["Sales and POS", "Items and stock", "Purchases and repairs", "One wallet and customers", "One branch", "Unlimited items"],
  },
  {
    name: "Pro",
    price: PRICE,
    per: "Ks / month",
    blurb: `Everything, after a ${TRIAL_DAYS}-day free trial.`,
    featured: true,
    points: [
      "Everything in Free",
      "Reports — profit and the detailed ones",
      "More than one branch, with stock transfer",
      "Online shop and the Telegram customer bot",
      "Top-up billers",
      "Full money tools — transfer, cash-out, credit",
      "Staff and roles, audit log",
      "Offline mode and pop-up notifications",
    ],
  },
  {
    name: "Fully Access",
    price: FULL_PRICE,
    per: "Ks / month",
    blurb: "Pro, plus no limits and a faster answer.",
    points: ["Everything in Pro", "Unlimited data and photo input", "Quick support"],
  },
];

const SAVING_NOTE = `Pay for 6 months and save ${SAVE_6} Ks; pay for a year and save ${SAVE_12} Ks. Pay by KBZ Pay in Myanmar or PromptPay in Thailand.`;
/** Thai shops pay in baht on their own list; stated separately so each language can read it whole. */
const THAI_NOTE = `In Thailand, pay by PromptPay in baht: Pro ${TIER_PRICE_THB.PRO} THB and Fully Access ${TIER_PRICE_THB.FULL} THB a month, saving ${TERM_SAVING_THB[6]} THB for 6 months and ${TERM_SAVING_THB[12]} THB for a year.`;

export default function FeaturesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 text-gray-800 dark:text-gray-200 sm:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_SCHEMA) }}
      />
      <PageToggles className="absolute right-4 top-4" />

      <div className="flex flex-col items-center text-center">
        <div className="rounded-2xl bg-white p-1.5 ring-1 ring-gray-100 dark:ring-gray-800">
          <Image src="/mahar-pos-logo.svg" alt="Mahar Mini POS" width={52} height={52} />
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
          <h2 className="text-xl font-bold">Pricing</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Start free. Move to Pro when you want the rest — and every shop gets a {TRIAL_DAYS}-day Pro trial to try it.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={plan.featured
                  ? "rounded-xl border-2 border-blue-500 p-4 dark:border-blue-500"
                  : "rounded-xl border border-gray-200 p-4 dark:border-gray-800"}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base font-bold">{plan.name}</h3>
                  {plan.featured && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">Free trial</span>}
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {plan.price} <span className="text-sm font-medium text-gray-500">{plan.per}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{plan.blurb}</p>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {plan.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-gray-600 dark:text-gray-300">
                      <span className="mt-0.5 shrink-0 text-blue-600">✓</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {/* Constants, not JSX text with numbers, so the translator can match the whole string. */}
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">{SAVING_NOTE}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{THAI_NOTE}</p>
        </section>

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
