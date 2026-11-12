import { MANUAL, type ManualCategory, type ManualGuide } from "./manual";
import { CATEGORY_LABEL, MANUAL_LANGS, localGuide, localManual, manualPath, type ManualLang } from "./manualI18n";

/** The manual as plain HTML pages, with the styles and scripts inline, so the same page can be
 *  served here and, through the landing site's proxy, at maharpos.shop/manual.
 *
 *  Three languages, each at its own address so search engines index each one: Myanmar at
 *  /manual, English at /manual/en, Thai at /manual/th. The look follows the landing page
 *  (sites/maharpos.shop): the same greens and orange, and the phone's own fonts. */

const SITE = "https://maharpos.shop";
const APP = "https://app.maharpos.shop";
const HELP = "https://t.me/+2gc9ml7iMgk1ZThl";
const MM_DIGITS = "၀၁၂၃၄၅၆၇၈၉";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Counts are written in Myanmar digits on the Myanmar pages only. */
const num = (n: number, lang: ManualLang) => (lang === "my" ? String(n).replace(/\d/g, (d) => MM_DIGITS[Number(d)]) : String(n));

/** The words around the guides: headings, buttons and the support chat. */
const L: Record<ManualLang, {
  htmlLang: string; ogLocale: string; allGuides: string; guideWord: string; steps: (n: string) => string;
  indexTitle: string; indexDesc: string; indexH1: string; indexLead: string; eyebrow: (n: string) => string;
  free: string; search: string; none: string; tip: string; openApp: string; startFree: string; otherGuides: string; help: string;
  home: string; footer: string; ask: string; askSub: string; askHello: string; askSugg: string[]; askPlaceholder: string;
  askSend: string; askWait: string; askNoAnswer: string; askNoNet: string; titleSuffix: string;
}> = {
  my: {
    htmlLang: "my", ogLocale: "my_MM", allGuides: "လမ်းညွှန်အားလုံး", guideWord: "လမ်းညွှန်", steps: (n) => `အဆင့် ${n} ဆင့်`,
    indexTitle: "Mahar POS အသုံးပြုနည်း လမ်းညွှန်",
    indexDesc: "Mahar POS ၏ Function အားလုံးကို အဆင့်လိုက် မြန်မာလို ရှင်းပြထားသော အသုံးပြုနည်း လမ်းညွှန် — အရောင်း၊ ဖုန်းပြင်၊ Stock၊ ငွေစာရင်း၊ Report နှင့် ဝန်ထမ်း။",
    indexH1: "Mahar POS အသုံးပြုနည်း",
    indexLead: "အရောင်း၊ ဖုန်းပြင်၊ ဖုန်းဖြည့်၊ ငွေစာရင်း၊ ကုန်ပစ္စည်း၊ အစီရင်ခံစာနှင့် ဝန်ထမ်း စီမံခြင်း — Function တိုင်းကို အဆင့်လိုက် ရှင်းပြထားပါသည်။ မသိတာရှိရင် ညာဘက်အောက်က ခလုတ်ကို နှိပ်ပြီး မေးနိုင်ပါသည်။",
    eyebrow: (n) => `အသုံးပြုနည်း လမ်းညွှန် · ${n} ခု`,
    free: "Mahar POS ကို ယခု Develop လုပ်နေဆဲ ကာလ ဖြစ်သောကြောင့် Feature အားလုံးကို အခမဲ့ အသုံးပြုနိုင်ပါသည်။ နောင်တွင် ငွေပေးစနစ် ထည့်ပါက ကြိုတင် အသိပေးမည် ဖြစ်ပြီး သင့် Data များ မပျောက်ပါ။",
    search: "လမ်းညွှန် ရှာရန်…", none: "ကိုက်ညီသော လမ်းညွှန် မရှိပါ။ အခြားစကားလုံးဖြင့် ရှာကြည့်ပါ။", tip: "အကြံပြုချက်",
    openApp: "App ဖွင့်မည်", startFree: "အခမဲ့ အကောင့်ဖွင့်မည်", otherGuides: "အခြား လမ်းညွှန်များ", help: "အကူအညီ (Telegram)",
    home: "ပင်မစာမျက်နှာ", footer: "Mahar POS · ဖုန်းဆိုင်နှင့် ဆိုင်ငယ်များအတွက် Cloud POS",
    ask: "မေးမြန်းရန်", askSub: "Mahar POS ကို ဘယ်လိုသုံးရမလဲ — Function တိုင်း မေးနိုင်ပါသည်",
    askHello: "မင်္ဂလာပါ။ Mahar POS အသုံးပြုနည်း၊ Function တစ်ခုချင်း ဘယ်လို အလုပ်လုပ်သလဲ — ဘာမဆို မေးနိုင်ပါတယ်။ အဆင့်လိုက် ရှင်းပြပေးပါမယ်။",
    askSugg: ["ဖုန်းတစ်လုံး ဘယ်လို ရောင်းရမလဲ", "ဖုန်းပြင် Job ဘယ်လို ထည့်ရမလဲ", "နေ့ချုပ် ဘယ်လို ပိတ်ရမလဲ", "ဝန်ထမ်း အကောင့် ဘယ်လို ဖွင့်ရမလဲ"],
    askPlaceholder: "မေးခွန်း ရေးပါ...", askSend: "ပို့မည်", askWait: "ဖြေဆိုနေပါသည်...",
    askNoAnswer: "အဖြေ မရပါ။ ခဏနေမှ ပြန်မေးပါ။", askNoNet: "ချိတ်ဆက်မှု မရပါ။ Internet စစ်ပြီး ပြန်မေးပါ။",
    titleSuffix: "Mahar POS လမ်းညွှန်",
  },
  en: {
    htmlLang: "en", ogLocale: "en_US", allGuides: "All guides", guideWord: "User guide", steps: (n) => `${n} steps`,
    indexTitle: "Mahar POS user guide",
    indexDesc: "Step-by-step guides to every part of Mahar POS — sales, phone repairs, stock and IMEI, wallets, reports and staff.",
    indexH1: "How to use Mahar POS",
    indexLead: "Sales, repairs, top-up, wallets, items, reports and staff — every function explained step by step. If something is not clear, press the button at the bottom right and ask.",
    eyebrow: (n) => `User guide · ${n} guides`,
    free: "Mahar POS is still being developed, so every feature is free to use. If paid plans are added later you will be told in advance, and your data stays.",
    search: "Search the guides…", none: "No guide matches. Try another word.", tip: "Tip",
    openApp: "Open the app", startFree: "Create a free account", otherGuides: "Other guides", help: "Help (Telegram)",
    home: "Home", footer: "Mahar POS · Cloud POS for phone shops and small shops",
    ask: "Ask for support", askSub: "How to use Mahar POS — ask about any function",
    askHello: "Hello. Ask anything about using Mahar POS or how a function works. I will explain it step by step.",
    askSugg: ["How do I sell a phone?", "How do I add a repair job?", "How do I close the day?", "How do I open a staff account?"],
    askPlaceholder: "Write your question...", askSend: "Send", askWait: "Answering...",
    askNoAnswer: "No answer just now. Please ask again in a moment.", askNoNet: "No connection. Check your internet and ask again.",
    titleSuffix: "Mahar POS user guide",
  },
  th: {
    htmlLang: "th", ogLocale: "th_TH", allGuides: "คู่มือทั้งหมด", guideWord: "คู่มือการใช้งาน", steps: (n) => `${n} ขั้นตอน`,
    indexTitle: "คู่มือการใช้งาน Mahar POS",
    indexDesc: "คู่มือทีละขั้นตอนสำหรับทุกส่วนของ Mahar POS — การขาย งานซ่อมมือถือ สต็อกและ IMEI กระเป๋าเงิน รายงาน และพนักงาน",
    indexH1: "วิธีใช้งาน Mahar POS",
    indexLead: "การขาย งานซ่อม เติมเงิน กระเป๋าเงิน สินค้า รายงาน และพนักงาน — อธิบายทุกฟังก์ชันทีละขั้นตอน หากมีข้อสงสัย กดปุ่มที่มุมขวาล่างเพื่อถามได้",
    eyebrow: (n) => `คู่มือการใช้งาน · ${n} เรื่อง`,
    free: "Mahar POS ยังอยู่ระหว่างการพัฒนา จึงใช้ได้ทุกฟีเจอร์ฟรี หากมีระบบเสียเงินในอนาคตจะแจ้งล่วงหน้า และข้อมูลของคุณจะไม่หาย",
    search: "ค้นหาคู่มือ…", none: "ไม่พบคู่มือที่ตรงกัน ลองใช้คำอื่น", tip: "คำแนะนำ",
    openApp: "เปิดแอป", startFree: "สมัครใช้ฟรี", otherGuides: "คู่มืออื่น ๆ", help: "ขอความช่วยเหลือ (Telegram)",
    home: "หน้าหลัก", footer: "Mahar POS · ระบบ POS บนคลาวด์สำหรับร้านมือถือและร้านค้าขนาดเล็ก",
    ask: "ถามทีมสนับสนุน", askSub: "วิธีใช้ Mahar POS — ถามได้ทุกฟังก์ชัน",
    askHello: "สวัสดีครับ ถามได้ทุกเรื่องเกี่ยวกับการใช้งาน Mahar POS หรือการทำงานของแต่ละฟังก์ชัน จะอธิบายให้ทีละขั้นตอน",
    askSugg: ["ขายมือถือหนึ่งเครื่องทำอย่างไร", "เพิ่มงานซ่อมอย่างไร", "ปิดยอดประจำวันอย่างไร", "เปิดบัญชีพนักงานอย่างไร"],
    askPlaceholder: "พิมพ์คำถาม...", askSend: "ส่ง", askWait: "กำลังตอบ...",
    askNoAnswer: "ยังไม่ได้คำตอบ กรุณาถามใหม่อีกครั้งในอีกสักครู่", askNoNet: "เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วถามใหม่",
    titleSuffix: "คู่มือการใช้งาน Mahar POS",
  },
};

const STYLE = `:root{--ink:#10231c;--ink2:#40534b;--muted:#6b7c75;--line:#dfe6e1;--bg:#f6f8f5;--card:#fff;--deep:#0b3d2e;--deep2:#0f5540;--green:#12905f;--soft:#e3f4ec;--orange:#f59a0c;--orangeInk:#8a5200;--orangeSoft:#fff3dc;--link:#0d7a50}
@media (prefers-color-scheme:dark){:root{--ink:#e7efe9;--ink2:#b9c9c0;--muted:#8fa399;--line:#24382f;--bg:#0a1611;--card:#11211a;--soft:#12342a;--orangeInk:#ffd58a;--orangeSoft:#3a2c10;--link:#5fd3a2}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Myanmar","Myanmar Text",Pyidaungsu,"Noto Sans Thai","Leelawadee UI",Thonburi,sans-serif;line-height:1.7;font-size:16px}
html[lang=my] body{line-height:1.9}
a{color:var(--link)}h1,h2,h3,p{margin:0}h1,h2,h3{line-height:1.35;text-wrap:balance}html[lang=my] h1,html[lang=my] h2,html[lang=my] h3{line-height:1.6}
:focus-visible{outline:3px solid var(--orange);outline-offset:2px;border-radius:6px}
.bar{position:sticky;top:0;z-index:20;background:rgba(11,61,46,.97);color:#fff}
.bar div{max-width:960px;margin:auto;padding:0 16px;min-height:56px;display:flex;align-items:center;gap:10px}
.brand{display:flex;align-items:center;gap:8px;color:#fff;font-weight:800;font-size:17px;text-decoration:none;margin-right:auto;white-space:nowrap}
.brand img{width:32px;height:32px;border-radius:8px;background:#fff;padding:2px}.brand b{color:var(--orange)}
.all{color:#d5e6de;font-size:14px;font-weight:600;text-decoration:none;display:none}
.lang{display:flex;border:1px solid rgba(255,255,255,.3);border-radius:999px;overflow:hidden;flex-shrink:0}
.lang a{color:#d5e6de;font-size:13px;font-weight:700;padding:0 10px;min-height:34px;display:flex;align-items:center;text-decoration:none;line-height:1.2}
.lang a[aria-current]{background:#fff;color:var(--deep)}
@media(min-width:560px){.all{display:inline}}
.wrap{max-width:960px;margin:auto;padding:20px 16px 90px}
.crumb{font-size:14px;color:var(--muted);margin-bottom:12px}.crumb a{color:var(--muted)}
.head{background:linear-gradient(180deg,var(--deep),var(--deep2));border-radius:18px;color:#fff;padding:26px 22px;margin-bottom:18px}
.eyebrow{display:inline-block;font-size:13px;font-weight:700;color:#ffd58a;background:rgba(245,154,12,.14);border:1px solid rgba(245,154,12,.4);padding:2px 12px;border-radius:999px}
h1{font-size:clamp(24px,5.5vw,36px);font-weight:800;margin:10px 0 8px}.head p{color:#d5e6de;font-size:16px;max-width:44em}
.free{background:var(--orangeSoft);color:var(--orangeInk);border-radius:12px;padding:10px 14px;margin:0 0 16px;font-size:14px}
.find{width:100%;font:inherit;font-size:16px;min-height:46px;border:1px solid var(--line);border-radius:12px;padding:8px 14px;background:var(--card);color:var(--ink);margin-bottom:10px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}
.chips a{font-size:14px;font-weight:700;text-decoration:none;color:var(--ink2);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 14px}
.cat{margin:26px 0 10px;font-size:20px;font-weight:800;scroll-margin-top:70px}
.list{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(260px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;text-decoration:none;color:var(--ink);display:block}
.card:hover{border-color:var(--green)}
.card small{color:var(--green);font-weight:700;font-size:13px}.card h3{margin:2px 0 4px;font-size:17px;font-weight:800}.card p{color:var(--ink2);font-size:14px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.none{display:none;padding:22px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:12px;margin-top:14px}
.step{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin:10px 0;display:flex;gap:14px;align-items:flex-start}
.num{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:var(--deep);color:#fff;font-weight:800;flex:none;font-size:16px;line-height:1}
.step h2{font-size:18px;font-weight:800;margin-bottom:2px}.step p{color:var(--ink2);overflow-wrap:anywhere}
.tip{background:var(--soft);border-left:4px solid var(--green);padding:10px 14px;border-radius:10px;margin-top:10px;font-size:15px}
.pager{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
.pager a{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px;text-decoration:none;font-weight:700;font-size:14px;color:var(--ink)}.pager a:last-child{text-align:right}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:22px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:10px 20px;border-radius:999px;font-weight:700;font-size:15px;text-decoration:none;border:1.5px solid transparent}
.btn-gold{background:var(--orange);color:#231400}.btn-ghost{background:var(--card);border-color:var(--line);color:var(--ink)}
footer{text-align:center;color:var(--muted);font-size:13px;padding-top:26px}footer a{color:var(--muted)}
.ask-btn{position:fixed;right:16px;bottom:16px;z-index:40;display:flex;align-items:center;gap:8px;background:var(--orange);color:#231400;border:0;border-radius:999px;padding:12px 18px;font:inherit;font-weight:700;font-size:15px;box-shadow:0 6px 20px rgba(0,0,0,.22);cursor:pointer}
.ask-btn svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ask{position:fixed;right:16px;bottom:16px;z-index:50;width:min(420px,calc(100vw - 32px));height:min(620px,calc(100vh - 32px));background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden}
.ask.open{display:flex}
.ask-head{background:var(--deep);color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.ask-head b{font-size:15px}.ask-head small{display:block;color:#cfe2d9;font-size:12px;line-height:1.4}
.ask-x{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}
.ask-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;font-size:14px}
.msg{max-width:88%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;line-height:1.7}
.msg.u{align-self:flex-end;background:var(--deep);color:#fff;border-bottom-right-radius:4px}
.msg.a{align-self:flex-start;background:var(--bg);border:1px solid var(--line);border-bottom-left-radius:4px}
.msg.e{align-self:flex-start;background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
.ask-sugg{display:flex;flex-wrap:wrap;gap:6px}.ask-sugg button{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 10px;font:inherit;font-size:13px;color:var(--ink);cursor:pointer}
.ask-form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}
.ask-form textarea{flex:1;resize:none;height:44px;max-height:120px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;font:inherit;font-size:16px;background:var(--bg);color:var(--ink)}
.ask-form button{background:var(--orange);color:#231400;border:0;border-radius:12px;padding:0 16px;font:inherit;font-weight:700;cursor:pointer}.ask-form button:disabled{opacity:.5}
@media print{.ask,.ask-btn,.bar,.cta{display:none!important}}@media(max-width:600px){.head{padding:20px 16px}.step{padding:14px;gap:12px}}`;

/** Sends a visitor to the manual in their own language: the one they chose on this site
 *  before (shared with the landing page), else their phone's language, else their region from
 *  the device clock. Search engines and link previews are left on the page they asked for, so
 *  each language keeps its own address in search results. A click on the language switch is a
 *  choice and is remembered. */
function langScript(lang: ManualLang, paths: Record<ManualLang, string>) {
  return `<script>(function(){var here=${JSON.stringify(lang)},to=${JSON.stringify(paths)};
function ok(l){return l==="my"||l==="en"||l==="th"}
document.querySelectorAll(".lang a").forEach(function(a){a.addEventListener("click",function(){try{localStorage.setItem("mp-lang",a.getAttribute("hreflang"))}catch(e){}})});
if(/bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|viber|preview|lighthouse/i.test(navigator.userAgent))return;
var want="";try{want=localStorage.getItem("mp-lang")||""}catch(e){}
if(!ok(want)){var ls=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language||""];
for(var i=0;i<ls.length&&!want;i++){if(/^my\\b/i.test(ls[i]))want="my";else if(/^th\\b/i.test(ls[i]))want="th"}
if(!want){var z="";try{z=Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch(e){}
want=z==="Asia/Yangon"||z==="Asia/Rangoon"?"my":z==="Asia/Bangkok"?"th":"en"}}
if(want!==here&&to[want])location.replace(to[want]+location.search+location.hash);
})();</script>`;
}

function page(opts: { lang: ManualLang; title: string; description: string; slug?: string; body: string; schema: object }) {
  const t = L[opts.lang];
  const paths = Object.fromEntries(MANUAL_LANGS.map((l) => [l, manualPath(l, opts.slug)])) as Record<ManualLang, string>;
  const canonical = SITE + paths[opts.lang];
  const alternates = MANUAL_LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${SITE}${paths[l]}">`).join("") +
    `<link rel="alternate" hreflang="x-default" href="${SITE}${paths.my}">`;
  const switcher = MANUAL_LANGS.map((l) =>
    `<a href="${paths[l]}" hreflang="${l}" lang="${l}"${l === opts.lang ? ' aria-current="true"' : ""}>${{ my: "မြန်မာ", en: "EN", th: "ไทย" }[l]}</a>`).join("");
  return `<!doctype html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${canonical}">
${alternates}
<meta name="robots" content="index, follow">
<meta property="og:type" content="article"><meta property="og:site_name" content="Mahar POS">
<meta property="og:title" content="${esc(opts.title)}"><meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${canonical}"><meta property="og:locale" content="${t.ogLocale}">
<meta property="og:image" content="${APP}/mahar-icon-512.png"><meta name="twitter:card" content="summary">
<meta name="theme-color" content="#0b3d2e">
<link rel="icon" type="image/png" href="${APP}/mahar-icon-192.png">
<script type="application/ld+json">${JSON.stringify(opts.schema).replace(/</g, "\\u003c")}</script>
<style>${STYLE}</style>
</head>
<body>
<header class="bar"><div><a class="brand" href="${SITE}/"><img src="${APP}/mahar-icon-192.png" alt="" width="32" height="32"><span>Mahar <b>POS</b></span></a><a class="all" href="${manualPath(opts.lang)}">${esc(t.allGuides)}</a><nav class="lang" aria-label="Language">${switcher}</nav></div></header>
<main class="wrap">
${opts.body}
<div class="cta"><a class="btn btn-gold" href="${APP}/register">${esc(t.startFree)}</a><a class="btn btn-ghost" href="${APP}">${esc(t.openApp)}</a>${opts.slug ? `<a class="btn btn-ghost" href="${manualPath(opts.lang)}">${esc(t.otherGuides)}</a>` : ""}<a class="btn btn-ghost" href="${HELP}" rel="noopener">${esc(t.help)}</a></div>
<footer><a href="${SITE}/">${esc(t.footer)}</a></footer>
</main>
${ask(opts.lang)}
${langScript(opts.lang, paths)}
</body></html>`;
}

/** "Ask for support": a chat that answers from the whole manual (POST /manual/ask). Answers
 *  are shown as text, never as HTML. */
function ask(lang: ManualLang) {
  const t = L[lang];
  return `<button class="ask-btn" id="askOpen" type="button" aria-haspopup="dialog"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17h.01"/></svg>${esc(t.ask)}</button>
<section class="ask" id="ask" role="dialog" aria-label="${esc(t.ask)}">
<div class="ask-head"><div><b>${esc(t.ask)}</b><small>${esc(t.askSub)}</small></div><button class="ask-x" id="askClose" type="button" aria-label="Close">×</button></div>
<div class="ask-log" id="askLog"><div class="msg a">${esc(t.askHello)}</div>
<div class="ask-sugg" id="askSugg">${t.askSugg.map((s) => `<button type="button">${esc(s)}</button>`).join("")}</div></div>
<form class="ask-form" id="askForm"><textarea id="askText" placeholder="${esc(t.askPlaceholder)}" aria-label="Question" maxlength="1000"></textarea><button type="submit" id="askSend">${esc(t.askSend)}</button></form>
</section>
<script>
(function(){
var T=${JSON.stringify({ wait: t.askWait, none: t.askNoAnswer, net: t.askNoNet })};
var box=document.getElementById("ask"),log=document.getElementById("askLog"),form=document.getElementById("askForm"),text=document.getElementById("askText"),send=document.getElementById("askSend"),sugg=document.getElementById("askSugg"),opener=document.getElementById("askOpen"),turns=[],busy=false;
function open(){box.classList.add("open");opener.style.display="none";text.focus();}
function close(){box.classList.remove("open");opener.style.display="";}
opener.onclick=open;document.getElementById("askClose").onclick=close;
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&box.classList.contains("open"))close();});
function add(kind,t){var d=document.createElement("div");d.className="msg "+kind;d.textContent=t;log.appendChild(d);log.scrollTop=log.scrollHeight;return d;}
function clean(t){return t.replace(/\\*\\*(.+?)\\*\\*/g,"$1").replace(/^#+\\s*/gm,"");}
function ask(q){
  q=q.trim();if(!q||busy)return;busy=true;send.disabled=true;if(sugg)sugg.remove();sugg=null;
  add("u",q);turns.push({role:"user",content:q});text.value="";
  var wait=add("a",T.wait);
  fetch("/manual/ask",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({messages:turns.slice(-8)})})
    .then(function(r){return r.json();})
    .then(function(j){
      if(j&&j.ok){var a=clean(j.data.answer);wait.textContent=a;turns.push({role:"assistant",content:a});}
      else{wait.className="msg e";wait.textContent=(j&&j.error)||T.none;turns.pop();}
    })
    .catch(function(){wait.className="msg e";wait.textContent=T.net;turns.pop();})
    .then(function(){busy=false;send.disabled=false;log.scrollTop=log.scrollHeight;});
}
form.onsubmit=function(e){e.preventDefault();ask(text.value);};
text.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask(text.value);}});
if(sugg)sugg.addEventListener("click",function(e){if(e.target.tagName==="BUTTON")ask(e.target.textContent);});
if(/[?&]ask=1/.test(location.search))open();
})();
</script>`;
}

/** The contents page's search box: hides the cards that do not contain what was typed. */
const FIND_SCRIPT = `<script>(function(){var q=document.getElementById("find"),none=document.getElementById("none");if(!q)return;
q.addEventListener("input",function(){var v=q.value.trim().toLowerCase(),shown=0;
document.querySelectorAll(".card").forEach(function(c){var hit=!v||c.textContent.toLowerCase().indexOf(v)>=0;c.style.display=hit?"":"none";if(hit)shown++});
document.querySelectorAll("section[data-cat]").forEach(function(s){s.style.display=s.querySelector('.card:not([style*="none"])')?"":"none"});
none.style.display=shown?"none":"block"});})();</script>`;

function card(g: ManualGuide, lang: ManualLang) {
  return `<a class="card" href="${manualPath(lang, g.slug)}"><small>${esc(L[lang].steps(num(g.steps.length, lang)))}</small><h3>${esc(g.title)}</h3><p>${esc(g.description)}</p></a>`;
}

export function manualIndexHtml(lang: ManualLang = "my"): string {
  const t = L[lang];
  const guides = localManual(lang);
  const cats = Object.keys(CATEGORY_LABEL[lang]) as ManualCategory[];
  const sections = cats.map((c) =>
    `<section data-cat="${c}"><h2 class="cat" id="${c}">${esc(CATEGORY_LABEL[lang][c])}</h2><div class="list">${guides.filter((g) => g.category === c).map((g) => card(g, lang)).join("")}</div></section>`).join("");
  const chips = `<nav class="chips" aria-label="${esc(t.allGuides)}">${cats.map((c) => `<a href="#${c}">${esc(CATEGORY_LABEL[lang][c])}</a>`).join("")}</nav>`;
  return page({
    lang, title: t.indexTitle, description: t.indexDesc,
    schema: {
      "@context": "https://schema.org", "@type": "CollectionPage", name: t.indexTitle, description: t.indexDesc, inLanguage: t.htmlLang,
      url: SITE + manualPath(lang), isPartOf: { "@type": "WebSite", name: "Mahar POS", url: SITE + "/" },
      hasPart: guides.map((g) => ({ "@type": "TechArticle", headline: g.title, url: SITE + manualPath(lang, g.slug) })),
    },
    body: `<div class="head"><span class="eyebrow">${esc(t.eyebrow(num(MANUAL.length, lang)))}</span><h1>${esc(t.indexH1)}</h1><p>${esc(t.indexLead)}</p></div>
<p class="free">${esc(t.free)}</p>
<input class="find" id="find" type="search" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}">
${chips}${sections}<p class="none" id="none">${esc(t.none)}</p>${FIND_SCRIPT}`,
  });
}

export function manualGuideHtml(original: ManualGuide, lang: ManualLang = "my"): string {
  const t = L[lang];
  const g = localGuide(original, lang);
  const i = MANUAL.indexOf(original);
  const prev = MANUAL[i - 1] && localGuide(MANUAL[i - 1], lang);
  const next = MANUAL[i + 1] && localGuide(MANUAL[i + 1], lang);
  const steps = g.steps.map((s, n) => `<section class="step"><span class="num">${num(n + 1, lang)}</span><div><h2>${esc(s.t)}</h2><p>${esc(s.d)}</p></div></section>`).join("");
  const tips = (g.tips ?? []).map((tip) => `<p class="tip"><strong>${esc(t.tip)} —</strong> ${esc(tip)}</p>`).join("");
  const pager = `<nav class="pager">${prev ? `<a href="${manualPath(lang, prev.slug)}">‹ ${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a href="${manualPath(lang, next.slug)}">${esc(next.title)} ›</a>` : "<span></span>"}</nav>`;
  const category = CATEGORY_LABEL[lang][g.category];
  return page({
    lang, slug: g.slug, title: `${g.title} — ${t.titleSuffix}`, description: g.description,
    schema: {
      "@context": "https://schema.org", "@type": "TechArticle", headline: g.title, description: g.description, inLanguage: t.htmlLang,
      url: SITE + manualPath(lang, g.slug), articleSection: category,
      publisher: { "@type": "Organization", name: "Mahar POS", url: SITE + "/" },
      isPartOf: { "@type": "CollectionPage", name: t.indexTitle, url: SITE + manualPath(lang) },
    },
    body: `<p class="crumb"><a href="${manualPath(lang)}">${esc(t.guideWord)}</a> › ${esc(category)}</p>
<div class="head"><span class="eyebrow">${esc(category)} · ${esc(t.steps(num(g.steps.length, lang)))}</span><h1>${esc(g.title)}</h1><p>${esc(g.description)}</p></div>${steps}${tips}${pager}`,
  });
}

export const htmlResponse = (html: string, status = 200) =>
  new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
