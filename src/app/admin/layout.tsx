import type { Metadata } from "next";

/** Aggregate figures, not a page anyone should reach from a search result. */
export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
