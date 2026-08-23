import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ဝင်မည်",
  description: "Mahar Mini POS အကောင့်ဖြင့် ဝင်ပါ — ပိုက်ဆံအိတ်၊ ရောင်းအားနှင့် ဆိုင်စာရင်း။",
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
