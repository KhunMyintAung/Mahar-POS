import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";

/** Everything in here is a shop's own books. It is behind sign-in, and it should not turn
 *  up in a search result even as a redirect. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
