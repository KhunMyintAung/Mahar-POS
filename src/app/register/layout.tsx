import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "အခမဲ့ အကောင့်ဖွင့်ရန် · Create a free account · สมัครใช้ฟรี",
  description:
    "Mahar Mini POS မှာ အခမဲ့ အကောင့်ဖွင့်ပါ — အရောင်း၊ Stock၊ ဖုန်းပြင်နှင့် ငွေစာရင်း။ " +
    "Create a free account for your shop: sales, stock, repairs and money. " +
    "สมัครใช้ฟรีสำหรับร้านของคุณ: ขาย สต็อก งานซ่อม และบัญชีเงิน",
  alternates: { canonical: "/register" },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
