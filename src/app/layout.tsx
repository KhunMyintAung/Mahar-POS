import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Myanmar } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";
import { InstalledAppMark } from "@/components/InstalledAppMark";
import { OriginGuard } from "@/components/OriginGuard";
import { ORIGIN_CANARY, ORIGIN_NOTICE, ORIGIN_SITE } from "@/lib/origin";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Not every phone has a good Myanmar font of its own. The browser fetches it only when Myanmar
// text is on screen, so it is not preloaded.
const notoMyanmar = Noto_Sans_Myanmar({ variable: "--font-noto-myanmar", subsets: ["myanmar"], weight: ["400", "500", "600", "700"], preload: false, display: "swap" });

/** Where the site actually lives, used to make every canonical and social URL absolute.
 *  Search engines treat a relative canonical as no canonical at all. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maharpos.shop";

/** What a search result or a shared link says under the title, in Myanmar, English and Thai. */
const SHARE_TEXT =
  "အရောင်း၊ Stock နှင့် IMEI၊ ဖုန်းပြင် Job၊ ငွေစာရင်းနှင့် Report — ဖုန်းတစ်လုံးထဲမှ၊ အခမဲ့။ " +
  "Sales, stock and IMEI, repair jobs, wallets and reports from one phone — free. " +
  "ขาย สต็อกและ IMEI งานซ่อม กระเป๋าเงิน และรายงาน ในมือถือเครื่องเดียว — ใช้ฟรี";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // One line in the three languages the app speaks: a shared link is read by shops in
  // Myanmar and in Thailand, and a link preview cannot know which one is looking.
  title: {
    default: "Mahar Mini POS — ဖုန်းဆိုင် POS · Phone shop POS · POS ร้านมือถือ",
    // Every other page reads "<its title> · Mahar Mini POS", so a search result says which
    // page it is without each page repeating the brand itself.
    template: "%s · Mahar Mini POS",
  },
  description: SHARE_TEXT,
  keywords: [
    "Mahar POS", "Mahar Mini POS",
    "ဖုန်းဆိုင် POS", "ဖုန်းပြင်ဆိုင် စာရင်း", "IMEI စာရင်း", "မြန်မာ POS", "အရောင်း စာရင်း", "Stock စာရင်း", "Mini Mart POS",
    "phone shop POS", "mobile repair shop software", "IMEI tracking", "free cloud POS", "POS Myanmar", "POS Thailand",
    "โปรแกรมร้านมือถือ", "POS ร้านมือถือ", "ระบบร้านซ่อมมือถือ", "โปรแกรมขายหน้าร้าน ฟรี", "ระบบ IMEI",
  ],
  manifest: "/manifest.webmanifest",
  // Ownership marks: name the real author in every page's head, and leave a searchable
  // signature so a copied build can be found (see src/lib/origin.ts).
  generator: "Mahar POS (maharpos.shop)",
  creator: "maharpos.shop",
  publisher: "maharpos.shop",
  other: {
    "x-origin": ORIGIN_SITE,
    "x-origin-canary": ORIGIN_CANARY,
    "x-origin-notice": ORIGIN_NOTICE,
  },
  applicationName: "Mahar Mini POS",
  appleWebApp: { capable: true, title: "Mahar Mini POS", statusBarStyle: "default" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Mahar Mini POS",
    locale: "my_MM",
    alternateLocale: ["en_US", "th_TH"],
    url: SITE_URL,
    title: "Mahar Mini POS — ဖုန်းဆိုင် POS · Phone shop POS · POS ร้านมือถือ",
    description: SHARE_TEXT,
    images: [{ url: "/mahar-icon-512.png", width: 512, height: 512, alt: "Mahar Mini POS" }],
  },
  twitter: {
    card: "summary",
    title: "Mahar Mini POS — ဖုန်းဆိုင် POS · Phone shop POS · POS ร้านมือถือ",
    description: SHARE_TEXT,
    images: ["/mahar-icon-512.png"],
  },
  icons: {
    icon: [
      { url: "/mahar-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/mahar-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/mahar-apple-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

/** The service worker serves /_next/static/ from its cache first. Built files carry a
 *  content hash, so that is safe in production; the dev server reuses the same file names,
 *  so a registered worker kept handing the browser old code after every change. In
 *  development it is therefore taken out again, along with what it cached. */
const SERVICE_WORKER_SCRIPT =
  process.env.NODE_ENV === "production"
    ? `if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));`
    : `if("serviceWorker" in navigator)navigator.serviceWorker.getRegistrations().then(rs=>{rs.forEach(r=>r.unregister());if(rs.length&&window.caches)caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k))))}).catch(()=>{});`;

export const viewport: Viewport = {
  themeColor: "#1d4ed8",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${notoMyanmar.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script
          // apply saved theme before paint to avoid flashing
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem("wn-theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch{}
${SERVICE_WORKER_SCRIPT}
/* The browser fires beforeinstallprompt once, usually before React has hydrated. A
   listener added by a component therefore misses it and the Install button never
   appears. Catch it here and hand it over once the component is listening. */
addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__wnInstallPrompt=e;dispatchEvent(new Event("wn-install-ready"))});
addEventListener("appinstalled",function(){window.__wnInstallPrompt=null});`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        {/* A second copy of the signature in the rendered body, for a copy that keeps the
            markup but strips the head meta. Hidden and out of the accessibility tree. */}
        <div hidden aria-hidden="true" data-origin={ORIGIN_SITE}>{ORIGIN_CANARY}</div>
        <InstalledAppMark />
        <OriginGuard />
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
