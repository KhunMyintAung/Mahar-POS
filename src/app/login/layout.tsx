import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ဝင်မည် · Log in · เข้าสู่ระบบ",
  description: "Mahar Mini POS အကောင့်ဖြင့် ဝင်ပါ။ Log in to your Mahar Mini POS shop. เข้าสู่ระบบร้านของคุณใน Mahar Mini POS",
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
