"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

/** Suppliers are part of Purchases now (a Suppliers tab beside what was bought from each), so
 *  an old link or bookmark to /suppliers lands there; ?new=1 opens a new supplier. */
export default function SuppliersPage() {
  const router = useRouter();
  useEffect(() => {
    const fresh = new URLSearchParams(window.location.search).get("new") === "1";
    router.replace(`/purchases?tab=suppliers${fresh ? "&newSupplier=1" : ""}`);
  }, [router]);
  return <Spinner />;
}
