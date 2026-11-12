import { prisma } from "./prisma";
import { matchesWords, searchWords } from "./searchWords";
import { stockByItem } from "./onlineShop";
import { fmtMoneyPlain } from "./format";
import { REPAIR_STATUS_MM } from "./repairStatus";

// ---------------------------------------------------------------------------
// What the shop's bot tells a customer besides its online list: where their repair stands,
// and what a spare part costs and how soon it can be fitted. Kept apart from the chat
// (telegramShop.ts) so the matching rules can be tested on their own.
// ---------------------------------------------------------------------------

const MM_DIGITS = "၀၁၂၃၄၅၆၇၈၉";

/** 3 → ၃, for numbers said in a Myanmar sentence. */
export function mmNumber(n: number): string {
  return String(n).replace(/\d/g, (d) => MM_DIGITS[Number(d)]);
}

/** ၀၉၇၇ → 0977: customers type phone numbers in either script. */
export function asciiDigits(text: string): string {
  return text.replace(/[၀-၉]/g, (d) => String(MM_DIGITS.indexOf(d)));
}

/** True when the phone on the voucher ends with the four digits the customer gave. */
export function phoneEndsWith(phone: string | null | undefined, lastFour: string): boolean {
  const digits = asciiDigits(phone ?? "").replace(/\D/g, "");
  return lastFour.length === 4 && digits.length >= 4 && digits.endsWith(lastFour);
}

/** Myanmar words for a part, and the ways the part is named in a shop's item list. A typed
 *  Myanmar word that is not here ("ဈေး", "ဘယ်လောက်လဲ") is only part of the question. */
const PART_WORDS: Record<string, string[]> = {
  "မှန်": ["lcd", "screen", "display", "glass", "touch", "oled", "amoled", "incell", "tft", "tl", "combo", "folder"],
  "စခရင်": ["lcd", "screen", "display", "oled", "amoled", "incell", "tft", "tl", "combo", "folder"],
  "တာ့ချ်": ["touch", "glass"],
  "ဘက်ထရီ": ["battery", "batt"],
  "ဓာတ်ခဲ": ["battery", "batt"],
  "အားသွင်းပေါက်": ["charging", "charge", "port", "board", "usb"],
  "အားသွင်း": ["charging", "charge", "port", "board", "usb"],
  "ကင်မရာ": ["camera", "cam"],
  "ကျောခွံ": ["back", "housing", "cover"],
  "ဘော်ဒီ": ["housing", "body", "frame"],
  "စပီကာ": ["speaker", "buzzer", "ringer"],
  "နားကြပ်ပေါက်": ["jack", "audio"],
  "မိုက်": ["mic", "microphone"],
  "ခလုတ်": ["button", "flex", "key"],
  "ကြိုး": ["flex", "cable"],
};
const MYANMAR = /[က-႟]/;

/** Every name a part type goes by, to tell an item that names its part ("A54 Battery") from
 *  one named for its phone alone ("Redmi Note 9", which a shop's screens are often called). */
const ANY_PART = new Set([...Object.values(PART_WORDS).flat(), "lcd", "battery", "camera", "speaker", "flex", "housing"]);

/** A part question split up: the phone it is for (English and digits as typed) and the part
 *  wanted (Myanmar part words as the names they stand for, or such a name typed in English).
 *  Other Myanmar words ("ဈေး", "ဘယ်လောက်လဲ") are only part of the asking and are dropped. */
export interface PartQuery { model: string[]; part: string[][] }

export function partQuery(query: string): PartQuery {
  const model: string[] = [];
  const part: string[][] = [];
  for (const word of searchWords(query)) {
    const known = Object.keys(PART_WORDS).find((k) => word.includes(k));
    if (known) part.push(PART_WORDS[known]);
    else if (MYANMAR.test(word)) continue;
    else if (ANY_PART.has(word)) part.push([word]);
    else model.push(word);
  }
  return { model, part };
}

/** True when an item is for the phone asked about: every model word is in its name. */
export function modelMatches(q: PartQuery, ...texts: (string | null | undefined)[]): boolean {
  return q.model.length > 0 && q.model.every((w) => matchesWords(w, ...texts));
}

/** True when an item is the part asked about (or no part was named). */
export function partMatches(q: PartQuery, ...texts: (string | null | undefined)[]): boolean {
  return q.part.every((choices) => choices.some((w) => matchesWords(w, ...texts)));
}

/** True when an item's name says what part it is. */
export function namesAPart(...texts: (string | null | undefined)[]): boolean {
  return searchWords(texts.filter(Boolean).join(" ").replace(/[()/,+-]/g, " ")).some((w) => ANY_PART.has(w));
}

/** The items that answer a part question: those for the phone that are the part asked for;
 *  when none says which part it is, those for the phone that name no part at all (a shop that
 *  lists its screens as "Redmi Note 9"), never another part ("Redmi Note 9 Battery"). */
export function pickParts<T>(q: PartQuery, items: T[], texts: (item: T) => (string | null | undefined)[]): T[] {
  const forPhone = items.filter((i) => modelMatches(q, ...texts(i)));
  if (q.part.length === 0) return forPhone;
  const exact = forPhone.filter((i) => partMatches(q, ...texts(i)));
  return exact.length > 0 ? exact : forPhone.filter((i) => !namesAPart(...texts(i)));
}

/** Top-level categories that hold spare parts ("Spare Parts", "Parts", "အပိုပစ္စည်း"). */
const PARTS_CATEGORY = /spare|^parts?$|အပိုပစ္စည်း/i;

/** The categories of spare parts in a shop: the parts categories and every one under them. */
async function partCategoryIds(businessId: string): Promise<string[]> {
  const cats = await prisma.itemCategory.findMany({ where: { businessId, active: true }, select: { id: true, name: true, parentId: true } });
  const top = cats.filter((c) => !c.parentId && PARTS_CATEGORY.test(c.name.trim())).map((c) => c.id);
  return [...top, ...cats.filter((c) => c.parentId && top.includes(c.parentId)).map((c) => c.id)];
}

export async function hasSpareParts(businessId: string): Promise<boolean> {
  const ids = await partCategoryIds(businessId);
  return ids.length > 0 && (await prisma.item.count({ where: { businessId, categoryId: { in: ids }, active: true, deletedAt: null } })) > 0;
}

export interface PartQuote { id: string; name: string; price: bigint; inStock: boolean }

/** The spare parts that answer a customer's question, those on the shelf first. Never the
 *  cost price or how many are left: only the selling price and whether there is one. */
export async function findParts(businessId: string, query: string, limit = 8): Promise<{ parts: PartQuote[]; more: boolean }> {
  const q = partQuery(query);
  const ids = await partCategoryIds(businessId);
  if (q.model.length === 0 || ids.length === 0) return { parts: [], more: false };
  const items = await prisma.item.findMany({
    where: { businessId, categoryId: { in: ids }, active: true, deletedAt: null, sellingPrice: { gt: 0 } },
    select: { id: true, name: true, model: true, variant: true, sellingPrice: true, category: { select: { name: true } } },
    take: 3000,
  });
  // A sub-category's name ("Spare Parts › LCD") says what part an item is, like its own name.
  const hits = pickParts(q, items, (i) => [i.name, i.model, i.variant, i.category?.name]);
  const stock = await stockByItem(hits.map((i) => i.id));
  const parts = hits
    .map((i) => ({ id: i.id, name: [i.name, i.variant].filter(Boolean).join(" · "), price: i.sellingPrice, inStock: (stock.get(i.id) ?? 0) > 0 }))
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || a.name.localeCompare(b.name));
  return { parts: parts.slice(0, limit), more: parts.length > limit };
}

/** The answer to a part question, in Myanmar. */
export function partQuoteText(
  query: string,
  found: { parts: PartQuote[]; more: boolean },
  opts: { currency: string; hours: number; days: number; note: string },
): string {
  const lines = [`🔍 "${query}"`, ""];
  for (const p of found.parts) {
    lines.push(`• ${p.name}`);
    lines.push(`   💰 ${fmtMoneyPlain(p.price, opts.currency)}`);
    lines.push(p.inStock
      ? `   ✅ ပစ္စည်းရှိ · ${mmNumber(opts.hours)} နာရီအတွင်း ရပါမယ်`
      : `   ⏳ မှာယူရမည် · ${mmNumber(opts.days)} ရက်ခန့် ကြာပါမယ်`);
  }
  if (found.more) lines.push("", "နောက်ထပ် ရှိပါသေးတယ်။ ဖုန်း Model ကို ပိုတိကျအောင် ရိုက်ပါ။");
  if (opts.note) lines.push("", `ℹ️ ${opts.note}`);
  return lines.join("\n");
}

type CardJob = {
  jobNo: string; deviceBrand: string; deviceModel: string; problem: string; status: string;
  estimatedCost: bigint; finalCost: bigint; paidAmount: bigint;
};

const STATUS_HINT: Record<string, string> = {
  RECEIVED: "ဖုန်းကို လက်ခံထားပါတယ်။ မကြာခင် စစ်ဆေးပါမယ်။",
  CHECKING: "ဘာဖြစ်လဲ စစ်ဆေးနေပါတယ်။",
  IN_PROGRESS: "ပြင်နေပါတယ်။",
  WAITING_PARTS: "လိုတဲ့ ပစ္စည်း မှာထားပါတယ်။ ရောက်တာနဲ့ ပြင်ပေးပါမယ်။",
  DONE: "ပြင်ပြီးပါပြီ။ ဆိုင်မှာ လာယူလို့ ရပါပြီ။",
  CANNOT_REPAIR: "ပြင်လို့ မရပါ။ ဖုန်းကို ဆိုင်မှာ ပြန်လာယူပါ။",
  DELIVERED: "ဖုန်းကို ပြန်ပေးပြီးပါပြီ။ ကျေးဇူးတင်ပါတယ် 🙏",
  CANCELLED: "ဒီ ပြင်ဆင်မှုကို ပယ်ဖျက်ထားပါတယ်။",
};

/** A repair as the customer sees it: what the voucher and the status page already show, never
 *  the phone number, IMEI or what the parts cost the shop. */
export function repairCardText(job: CardJob, currency: string, heading?: string): string {
  const money = (minor: bigint) => fmtMoneyPlain(minor, currency);
  const lines = [
    ...(heading ? [heading, ""] : []),
    `🔧 ${job.jobNo}`,
    `📱 ${[job.deviceBrand, job.deviceModel].filter(Boolean).join(" ")}`,
    `🛠 ${job.problem}`,
    `📌 ${REPAIR_STATUS_MM[job.status] ?? job.status}`,
    STATUS_HINT[job.status] ?? "",
  ];
  if (job.finalCost > 0n) {
    lines.push("", `💰 ကျသင့်ငွေ ${money(job.finalCost)}`);
    if (job.paidAmount > 0n) lines.push(`   ပေးပြီး ${money(job.paidAmount)}`);
    if (job.finalCost > job.paidAmount && job.status !== "DELIVERED") lines.push(`   ကျန်ငွေ ${money(job.finalCost - job.paidAmount)}`);
  } else if (job.estimatedCost > 0n) {
    lines.push("", `💰 ခန့်မှန်း ကုန်ကျငွေ ${money(job.estimatedCost)}`);
  }
  return lines.filter((l, i, all) => l !== "" || (i > 0 && all[i - 1] !== "")).join("\n").trim();
}
