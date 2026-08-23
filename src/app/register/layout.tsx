import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "အခမဲ့ အကောင့်ဖွင့်ရန်",
  description:
    "Mahar Mini POS မှာ အခမဲ့ အကောင့်ဖွင့်ပါ — ပိုက်ဆံအိတ်၊ ရောင်းအား၊ ကုန်ပစ္စည်းနှင့် အကြွေးစာရင်းကို ဖုန်းပေါ်မှာပဲ မှတ်ပါ။",
  alternates: { canonical: "/register" },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
