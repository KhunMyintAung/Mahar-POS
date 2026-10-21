import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/LanguageProvider";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/** Where the site actually lives, used to make every canonical and social URL absolute.
 *  Search engines treat a relative canonical as no canonical at all. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maharpos.shop";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Mahar Mini POS — ဆိုင်စာရင်းနှင့် ပိုက်ဆံအိတ် စီမံခန့်ခွဲမှု",
    // Every other page reads "<its title> · Mahar Mini POS", so a search result says which
    // page it is without each page repeating the brand itself.
    template: "%s · Mahar Mini POS",
  },
  description:
    "ပိုက်ဆံအိတ်၊ ရောင်းအား၊ ကုန်ပစ္စည်း၊ ဝင်ငွေထွက်ငွေ၊ အကြွေးနှင့် ဖုန်းပြင်ဆင်ခ — " +
    "မြန်မာဆိုင်ငယ်များအတွက် အခမဲ့ စာရင်းကိုင် app။ ဖုန်းပေါ်မှာပဲ သုံးလို့ရပြီး Telegram နဲ့လည်း ချိတ်လို့ရပါတယ်။",
  keywords: [
    "ပိုက်ဆံအိတ်", "ငွေစာရင်း", "ဆိုင်စာရင်း", "အကြွေးစာရင်း", "ဝင်ငွေ ထွက်ငွေ",
    "Mahar Mini POS", "မြန်မာ POS", "မီနီမတ် စာရင်း", "ဖုန်းဆိုင် စာရင်း",
    "ကုန်ပစ္စည်းစာရင်း", "Myanmar accounting app", "small business app Myanmar",
  ],
  manifest: "/manifest.webmanifest",
  applicationName: "Mahar Mini POS",
  appleWebApp: { capable: true, title: "Mahar Mini POS", statusBarStyle: "default" },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Mahar Mini POS",
    locale: "my_MM",
    url: SITE_URL,
    title: "Mahar Mini POS — ဆိုင်စာရင်းနှင့် ပိုက်ဆံအိတ်",
    description:
      "ပိုက်ဆံအိတ်၊ ရောင်းအား၊ ကုန်ပစ္စည်းနှင့် အကြွေးစာရင်း — မြန်မာဆိုင်ငယ်များအတွက် အခမဲ့ စာရင်းကိုင် app။",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "Mahar Mini POS" }],
  },
  twitter: {
    card: "summary",
    title: "Mahar Mini POS — ဆိုင်စာရင်းနှင့် ပိုက်ဆံအိတ်",
    description: "မြန်မာဆိုင်ငယ်များအတွက် အခမဲ့ စာရင်းကိုင် app။",
    images: ["/icon-512.png"],
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
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
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
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
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
