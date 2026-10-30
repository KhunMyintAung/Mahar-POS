import Image from "next/image";
import { cn } from "@/components/ui";

/** Mahar Shwe Point's own coin, sized like a lucide icon so it can stand in for one in menus
 *  and tabs. */
export function MspLogo({ size = 16, className }: { size?: number; className?: string }) {
  return <Image src="/msp-coin-64.png" alt="" width={size} height={size} unoptimized className={cn("inline-block shrink-0 rounded-full", className)} />;
}
