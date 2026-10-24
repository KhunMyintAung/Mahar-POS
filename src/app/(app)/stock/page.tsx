"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

/** Stock is part of Items now (stock levels, Adjust, IMEIs and the Movements tab), so an old
 *  link or bookmark to /stock lands there. */
export default function StockPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/items"); }, [router]);
  return <Spinner />;
}
