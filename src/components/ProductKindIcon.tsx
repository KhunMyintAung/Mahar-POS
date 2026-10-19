import {
  BatteryCharging, Cable, Camera, Gamepad2, HardDrive, Headphones, Laptop, Mouse, Package,
  PlugZap, Shield, ShoppingBag, Smartphone, Speaker, Tablet, Watch, Wrench, type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui";
import { productKind, type ProductKind } from "@/lib/productKind";

const LOOK: Record<ProductKind, { Icon: LucideIcon; label: string; tone: string }> = {
  phone: { Icon: Smartphone, label: "Phone", tone: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  earphone: { Icon: Headphones, label: "Earphone", tone: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  charger: { Icon: PlugZap, label: "Charger", tone: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  cable: { Icon: Cable, label: "Cable", tone: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  battery: { Icon: BatteryCharging, label: "Battery", tone: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  cover: { Icon: Shield, label: "Cover / Glass", tone: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
  speaker: { Icon: Speaker, label: "Speaker", tone: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  watch: { Icon: Watch, label: "Watch", tone: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
  tablet: { Icon: Tablet, label: "Tablet", tone: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  computer: { Icon: Laptop, label: "Computer", tone: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  storage: { Icon: HardDrive, label: "Storage", tone: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  mouse: { Icon: Mouse, label: "Mouse / Keyboard", tone: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  camera: { Icon: Camera, label: "Camera", tone: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  gaming: { Icon: Gamepad2, label: "Gaming", tone: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  repair: { Icon: Wrench, label: "Repair part", tone: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  accessory: { Icon: ShoppingBag, label: "Gadget", tone: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  product: { Icon: Package, label: "Product", tone: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

/** A picture for a product, picked from its name and category. */
export function ProductKindIcon({ item, size = 18, className }: {
  item: { name: string; category?: { name: string } | null };
  size?: number;
  className?: string;
}) {
  const { Icon, label, tone } = LOOK[productKind(item)];
  return (
    <span title={label} aria-label={label} className={cn("inline-flex shrink-0 items-center justify-center rounded-lg", tone, className)}>
      <Icon size={size} strokeWidth={2.2} />
    </span>
  );
}
