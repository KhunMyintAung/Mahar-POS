import { NextRequest } from "next/server";
import { publicJson } from "@/lib/publicResponse";

export const dynamic = "force-dynamic";

/** How-to guides for the landing page (maharpos.shop), written for this app.
 *  Categories match the page's filter chips: start, pos, manage. */

const LABEL = { start: "စတင်ခြင်း", pos: "POS", manage: "စီမံခန့်ခွဲမှု" } as const;
type Cat = keyof typeof LABEL;

const GUIDES: { slug: string; category: Cat; title: string; description: string; steps: string[] }[] = [
  {
    slug: "register-google-login", category: "start", title: "Account ဖွင့်ပြီး Login ဝင်နည်း",
    description: "Email/Password သို့မဟုတ် Google ဖြင့် အကောင့်ဖွင့်ခြင်း၊ စကားဝှက်မေ့လျှင် Email ဖြင့် ပြန်သတ်မှတ်ခြင်း။",
    steps: ["app.maharpos.shop ကိုဖွင့်ပါ", "Create a free account နှိပ်ပါ (သို့) Continue with Google နှိပ်ပါ", "ဆိုင်အမျိုးအစား (ဖုန်းဆိုင် / Mini Mart / All-in-one) ရွေးပါ", "စကားဝှက်မေ့ပါက Login မှ Forgot password? ဖြင့် Email link ယူပါ"],
  },
  {
    slug: "business-profile-setup", category: "start", title: "ဆိုင်အချက်အလက်၊ Logo၊ မြေပုံ ထည့်နည်း",
    description: "ဆိုင်အမည်၊ ဖုန်း၊ လိပ်စာ၊ Logo (အလျားလိုက် Logo ပါရ)၊ ဆိုင်တည်နေရာ မြေပုံနှင့် မြို့ကို Settings မှ ထည့်နည်း။",
    steps: ["Settings → Business info ကိုဖွင့်ပါ", "ဆိုင်အမည်၊ ဖုန်း၊ လိပ်စာ ဖြည့်ပါ", "Logo တင်ပါ (Voucher ပေါ်တွင် ပါမည်)", "Use my location နှိပ်ပြီး မြေပုံနှင့် မြို့ကို အလိုအလျောက် ထည့်ပါ"],
  },
  {
    slug: "products-stock-setup", category: "manage", title: "ပစ္စည်း၊ Category၊ Barcode ထည့်နည်း",
    description: "ပစ္စည်းအသစ်၊ Category၊ Barcode၊ ဝယ်ဈေး/ရောင်းဈေး၊ အနည်းဆုံးလက်ကျန် သတ်မှတ်ခြင်း။ ပစ္စည်းအသစ်များ အပေါ်ဆုံးတွင် ပြမည်။",
    steps: ["Items ကိုဝင်ပါ", "New item နှိပ်ပြီး အမည်၊ Category၊ Barcode ဖြည့်ပါ", "ဝယ်ဈေး၊ ရောင်းဈေး၊ Min stock ထည့်ပါ", "နာမည်စာလုံးပေါင်းမှားလျှင် (ဥပမာ samsng a15) အလိုအလျောက် Samsung A15 ဟု ပြင်ပေးမည်"],
  },
  {
    slug: "imei-tracking", category: "manage", title: "ဖုန်း IMEI လုံးချင်း မှတ်နည်း",
    description: "Phone New / Phone Second ပစ္စည်းများကို IMEI တစ်လုံးချင်း ဝယ်ယူ၊ ရောင်းချ၊ ရှာဖွေနိုင်ခြင်း။",
    steps: ["Items တွင် Track IMEI ကို ဖွင့်ပါ", "Purchase တွင် ဖုန်းတစ်လုံးချင်း IMEI ထည့်ပါ", "POS တွင် ရောင်းသည့် IMEI ကို ရွေးပါ (သို့) Scan ဖတ်ပါ", "Stock စာမျက်နှာ ရှာဖွေအကွက်တွင် IMEI နောက်ဆုံးဂဏန်း ၄ လုံး ရိုက်ရှာပါ"],
  },
  {
    slug: "sale-pos-checkout", category: "pos", title: "Sale POS ရောင်းချနည်း",
    description: "ပစ္စည်းရှာ၊ Cart ထည့်၊ Walk-in သို့မဟုတ် ဖောက်သည်ရွေး၊ Cash နှင့် Wallet ခွဲပေးချေပြီး Voucher ထုတ်နည်း။",
    steps: ["အရောင်းနှင့် POS ကိုဝင်ပါ", "ပစ္စည်းကို နှိပ်/ရှာ/Barcode ဖတ်၍ Cart ထဲထည့်ပါ", "Walk-in customer သို့မဟုတ် ဖောက်သည်အမည် ရွေးပါ", "Split payment ဖြင့် Cash တစ်ဝက် Wallet တစ်ဝက် ခွဲပေးနိုင်သည်", "Complete နှိပ်ပြီး Voucher Print ထုတ်ပါ"],
  },
  {
    slug: "sales-history-void-reprint", category: "pos", title: "အရောင်းမှတ်တမ်း၊ Voucher ပြန်ထုတ်၊ Void",
    description: "အရောင်းမှတ်တမ်းရှာခြင်း၊ 80mm/58mm Voucher ပြန်ထုတ်ခြင်း (PDF ဖိုင်အမည် = Voucher နံပါတ်)၊ မှားရောင်းထားသည်ကို Cancel လုပ်ခြင်း။",
    steps: ["Sale History ကိုဝင်ပါ", "Voucher နံပါတ် / ဖောက်သည်ဖြင့် ရှာပါ", "Print နှိပ်ပြီး Voucher ပြန်ထုတ်ပါ", "မှားနေပါက Cancel နှိပ်ပါ (Stock နှင့် ငွေ ပြန်ဝင်မည်)"],
  },
  {
    slug: "repair-service-flow", category: "pos", title: "ဖုန်းပြင် Repair Job အသုံးပြုနည်း",
    description: "ဖုန်းလက်ခံ၊ Brand/Model မှတ်၊ စရံငွေယူ၊ Status ပြောင်း၊ ငွေရှင်းပြီး Repair Voucher (QR ပါ) ထုတ်နည်း။",
    steps: ["Repair Jobs → Take in a device နှိပ်ပါ", "ဖောက်သည်၊ Brand၊ Model၊ ပြဿနာ ဖြည့်ပါ (iphne 12promax ဟုရိုက်လည်း iPhone 12 Pro Max ဖြစ်မည်)", "Status ကို Checking → In Progress → Completed ပြောင်းပါ", "Pay နှိပ်ပြီး ငွေရှင်းပါ၊ Voucher ပေါ်က QR ဖြင့် ဖောက်သည် Status ကြည့်နိုင်သည်"],
  },
  {
    slug: "bill-eload-flow", category: "pos", title: "ဖုန်းဖြည့် Biller (Eload / Bill) အသုံးပြုနည်း",
    description: "Biller တစ်ခုချင်း လက်ကျန်၊ ဖြည့်ငွေ (Bonus / Discount %)၊ ရောင်းငွေ၊ Void နှင့် နေ့စဉ်စာရင်း။",
    steps: ["ဖုန်းဖြည့် Biller များ ကိုဝင်ပါ", "Edit တွင် Sell % နှင့် Refill % (Bonus သို့မဟုတ် Discount) သတ်မှတ်ပါ", "Refill: ပေးငွေ ထည့်ပါ၊ ရမည့်ပမာဏ အလိုအလျောက်တွက်မည်", "Sell: ရောင်းငွေ သို့မဟုတ် ကျန်ငွေ ရိုက်ပါ၊ မှားပါက Void လုပ်ပါ"],
  },
  {
    slug: "money-service-transfer", category: "pos", title: "Wallet နှင့် ငွေလွှဲ",
    description: "Cash, KPay, Wave စသည့် Wallet များ၏ လက်ကျန်၊ Wallet အချင်းချင်း ငွေလွှဲခြင်းနှင့် ငွေစာရင်း။",
    steps: ["Wallets ကိုဝင်ပါ", "Wallet အသစ် (Cash / KPay / Wave) ထည့်ပါ", "Transfer ဖြင့် Wallet တစ်ခုမှ တစ်ခုသို့ ငွေရွှေ့ပါ", "Wallet တစ်ခုချင်း ဝင်ငွေ/ထွက်ငွေ မှတ်တမ်း ကြည့်ပါ"],
  },
  {
    slug: "customer-credit-debt", category: "manage", title: "ဖောက်သည်အကြွေး / ပေးရန်အကြွေး",
    description: "ဖောက်သည်ထံမှ ရရန်အကြွေး၊ ပြန်ဆပ်ငွေ၊ Supplier ကို ပေးရန်အကြွေးများ မှတ်နည်း။",
    steps: ["Credit & Payable ကိုဝင်ပါ", "အကြွေးအသစ် မှတ်ပါ (သို့) POS တွင် ငွေမပြည့်ဘဲ ရောင်းပါ", "ပြန်ဆပ်ငွေ ရရှိသည့်အခါ Collect နှိပ်ပါ", "Supplier ပေးရန်ကို Purchase တွင် Pay later ဖြင့် မှတ်ပါ"],
  },
  {
    slug: "other-income-expense", category: "manage", title: "အခြားဝင်ငွေ / ထွက်ငွေ မှတ်နည်း",
    description: "Daily Service / Sale / Bill / General Income နှင့် Expense စံ Category ၈ ခု (အမည်ပြောင်းရ၊ ဖျက်မရ) နှင့် ကိုယ်ပိုင် Category များ။",
    steps: ["Income & Expense ကိုဝင်ပါ", "ဝင်ငွေ သို့မဟုတ် ထွက်ငွေ ရွေးပြီး Category၊ ပမာဏ၊ Wallet ထည့်ပါ", "Categories တွင် အမည်ပြောင်း သို့မဟုတ် ကိုယ်ပိုင် Category ထည့်ပါ", "ဝန်ထမ်းလစာကို Staff Salary Category ဖြင့် မှတ်ပါ"],
  },
  {
    slug: "purchasing-flow", category: "manage", title: "ကုန်ဝယ်ခြင်း (Purchase) နှင့် FOC",
    description: "Supplier ထံမှ ကုန်ဝယ်၊ ငွေအပြည့်/တစ်စိတ်/နောက်မှပေး၊ အခမဲ့ (FOC) ပစ္စည်းများ Stock ထဲထည့်နည်း။",
    steps: ["Purchases → New purchase နှိပ်ပါ", "ပစ္စည်းရှာ၍ ထည့်ပြီး အရေအတွက်၊ ဝယ်ဈေး ဖြည့်ပါ", "အခမဲ့ရသော ပစ္စည်းကို FOC အမှန်ခြစ်ပါ (ဝယ်ဈေး မပြောင်းပါ)", "Pay full / part / later ရွေးပြီး Save နှိပ်ပါ"],
  },
  {
    slug: "daily-close-report", category: "manage", title: "Reports — နေ့ချုပ်၊ လချုပ်၊ နှစ်ချုပ်",
    description: "အရောင်း၊ ဆားဗစ်၊ ဖုန်းဖြည့်၊ အခြား ဝင်ငွေ/ထွက်ငွေ၊ အမြတ်၊ ဝန်ထမ်းလစာ၊ နောက်လအရင်းနှင့် အစုရှင်ခွဲဝေငွေ (Grand Report)။",
    steps: ["Reports ကိုဝင်ပါ", "Day / Month / Year / Custom ရွေးပါ", "⚙ တွင် လစာ Category၊ နောက်လအရင်း %၊ အစုရှင်များ သတ်မှတ်ပါ", "Grand Report နှင့် Daily summary ကြည့်ပါ"],
  },
  {
    slug: "google-sheet-sync", category: "manage", title: "Excel ထုတ်ခြင်းနှင့် Google Sheet Backup",
    description: "Report ကို Excel (Grand Report, Daily summary, Stock) ထုတ်ခြင်းနှင့် Google Sheet သို့ နေ့စဉ် အလိုအလျောက် Backup လုပ်ခြင်း။",
    steps: ["Reports တွင် Excel နှိပ်၍ ဖိုင်ထုတ်ပါ", "Google Sheet backup → How to set up တွင် Script ကို Copy ကူးပါ", "Google Sheet → Extensions → Apps Script တွင် ထည့်ပြီး Web app အဖြစ် Deploy လုပ်ပါ", "Web app URL ကို ထည့်ပြီး နေ့စဉ် Backup အချိန် သတ်မှတ်ပါ"],
  },
  {
    slug: "telegram-reports", category: "manage", title: "Telegram ဖြင့် အရောင်းသတိပေးနှင့် နေ့စဉ် Report",
    description: "ရောင်းချမှုတိုင်း Telegram သို့ ချက်ချင်းပို့ခြင်းနှင့် သတ်မှတ်ချိန်တွင် နေ့စဉ် Report ပို့ခြင်း။",
    steps: ["Telegram စာမျက်နှာကိုဝင်ပါ", "Reports bot token ထည့်ပါ", "Chat ID များ ထည့်ပြီး Live / Daily ရွေးပါ", "နေ့စဉ် Report ပို့မည့်အချိန် သတ်မှတ်ပါ"],
  },
  {
    slug: "staff-permission", category: "manage", title: "ဝန်ထမ်း၊ Role နှင့် ဆိုင်ခွဲ (Branch)",
    description: "ဝန်ထမ်းအကောင့်ဖွင့်ခြင်း၊ Role/Permission ခွဲခြင်း၊ ဆိုင်ခွဲများ ထည့်ခြင်း။ Settings ကို ပိုင်ရှင်သာ မြင်ရသည်။",
    steps: ["Settings → Users & Roles ကိုဝင်ပါ", "Role အသစ်ဖန်တီးပြီး Permission ရွေးပါ", "ဝန်ထမ်းအကောင့်ဖွင့်ပြီး Role နှင့် ဆိုင်ခွဲ သတ်မှတ်ပါ", "Branches တွင် ဆိုင်ခွဲအသစ် ထည့်ပါ"],
  },
  {
    slug: "printer-setup", category: "start", title: "Voucher Printer (80mm / 58mm) ချိတ်နည်း",
    description: "XP-80C စသည့် Thermal printer ဖြင့် Voucher အပြည့် ထုတ်ရန် စာရွက်အရွယ်ရွေးခြင်း။",
    steps: ["Settings → Printer paper တွင် 80mm သို့မဟုတ် 58mm ရွေးပါ", "Voucher Print နှိပ်ပါ", "Print dialog တွင် Printer ရွေးပြီး Margins: None ထားပါ", "PDF သိမ်းလျှင် ဖိုင်အမည်သည် Voucher နံပါတ် ဖြစ်မည်"],
  },
];

export async function GET(req: NextRequest) {
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 30));
  return publicJson({
    ok: true,
    total: GUIDES.length,
    guides: GUIDES.slice(0, limit).map((g) => ({ ...g, categoryLabel: LABEL[g.category], manualUrl: "" })),
  });
}
