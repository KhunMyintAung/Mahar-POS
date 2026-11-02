import { MANUAL, MANUAL_CATEGORY_LABEL, type ManualCategory, type ManualGuide } from "./manual";

/** The manual as plain HTML pages, with the styles inline and no scripts, so the same page
 *  can be served here and, through the landing site's proxy, at maharpos.shop/manual. */

const SITE = "https://maharpos.shop";
const APP = "https://app.maharpos.shop";
const HELP = "https://t.me/+2gc9ml7iMgk1ZThl";
const MM_DIGITS = "၀၁၂၃၄၅၆၇၈၉";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mmNumber = (n: number) => String(n).replace(/\d/g, (d) => MM_DIGITS[Number(d)]);

const STYLE = `:root{--ink:#182235;--muted:#667085;--blue:#1265d8;--gold:#C9950B;--bg:#f4f7fb;--line:#e5e9f0;--card:#fff;--green:#087f5b;--head1:#0E1B2C;--head2:#31435C;--num:#FFF4D6;--numInk:#8F6A05;--tip:#ecfdf5;--tipInk:#145b45}
@media (prefers-color-scheme:dark){:root{--ink:#e6eaf2;--muted:#9aa4b5;--blue:#6aa8ff;--bg:#0d131d;--line:#243043;--card:#151d2a;--num:#3a2f10;--numInk:#f3ce5c;--tip:#0f2a22;--tipInk:#9fe3c8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,"Noto Sans Myanmar","Myanmar Text",system-ui,sans-serif;line-height:1.8}
a{color:var(--blue)}.wrap{max-width:900px;margin:auto;padding:20px 16px 70px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;font-size:14px}.top a{text-decoration:none;font-weight:600}
.brand{display:flex;align-items:center;gap:8px;color:var(--ink)}.brand img{width:32px;height:32px;border-radius:8px}
header{background:linear-gradient(135deg,var(--head1),var(--head2));border-radius:22px;color:#fff;padding:30px 28px;margin-bottom:22px}
.eyebrow{font-size:13px;letter-spacing:.06em;color:#F3CE5C}h1{font-size:clamp(24px,4vw,38px);line-height:1.3;margin:6px 0 10px}header p{margin:0;color:#e3e8f0;font-size:16px}
.step{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px 20px;margin:14px 0;display:flex;gap:16px;align-items:flex-start}
.num{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--num);color:var(--numInk);font-weight:800;flex:none;font-size:18px}
.step h2{margin:0 0 4px;font-size:19px;line-height:1.45}.step p{margin:0;color:var(--muted)}
.tip{background:var(--tip);border-left:4px solid var(--green);padding:12px 16px;border-radius:10px;color:var(--tipInk);margin-top:14px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}.btn{display:inline-block;padding:12px 18px;border-radius:12px;font-weight:700;text-decoration:none}
.btn-gold{background:var(--gold);color:#fff}.btn-ghost{background:var(--card);border:1px solid var(--line);color:var(--ink)}
.cat{margin:28px 0 10px;font-size:20px}.list{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;text-decoration:none;color:var(--ink);display:block}
.card small{color:var(--gold);font-weight:700}.card h3{margin:4px 0 6px;font-size:17px;line-height:1.5}.card p{margin:0;color:var(--muted);font-size:14px}
.pager{display:flex;justify-content:space-between;gap:10px;margin-top:22px;font-size:15px}.pager a{text-decoration:none;font-weight:600;max-width:48%}
footer{text-align:center;color:var(--muted);font-size:13px;padding-top:24px}@media(max-width:600px){header{padding:22px 18px}.step{padding:14px;gap:12px}}`;

function page(opts: { title: string; description: string; canonical: string; body: string }) {
  return `<!doctype html>
<html lang="my">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${opts.canonical}">
<link rel="icon" type="image/png" href="${APP}/mahar-icon-192.png">
<style>${STYLE}</style>
</head>
<body><main class="wrap">
<div class="top"><a class="brand" href="${SITE}/"><img src="${APP}/mahar-icon-192.png" alt=""><span>Mahar POS</span></a><a href="/manual">လမ်းညွှန်အားလုံး</a></div>
${opts.body}
<div class="cta"><a class="btn btn-gold" href="${APP}">App ဖွင့်မည်</a><a class="btn btn-ghost" href="/manual">အခြား လမ်းညွှန်များ</a><a class="btn btn-ghost" href="${HELP}">အကူအညီ (Telegram)</a></div>
<footer>Mahar POS · app.maharpos.shop</footer>
</main></body></html>`;
}

function card(g: ManualGuide) {
  return `<a class="card" href="/manual/${g.slug}"><small>${esc(MANUAL_CATEGORY_LABEL[g.category])} · အဆင့် ${mmNumber(g.steps.length)} ဆင့်</small><h3>${esc(g.title)}</h3><p>${esc(g.description)}</p></a>`;
}

export function manualIndexHtml(): string {
  const sections = (Object.keys(MANUAL_CATEGORY_LABEL) as ManualCategory[]).map((c) => {
    const guides = MANUAL.filter((g) => g.category === c);
    return `<h2 class="cat">${esc(MANUAL_CATEGORY_LABEL[c])}</h2><div class="list">${guides.map(card).join("")}</div>`;
  }).join("");
  return page({
    title: "Mahar POS အသုံးပြုနည်း လမ်းညွှန်",
    description: "Mahar POS ၏ Function အားလုံးကို အဆင့်လိုက် မြန်မာလို ရှင်းပြထားသော အသုံးပြုနည်း လမ်းညွှန်။",
    canonical: `${SITE}/manual`,
    body: `<header><div class="eyebrow">အသုံးပြုနည်း လမ်းညွှန် · ${mmNumber(MANUAL.length)} ခု</div><h1>Mahar POS အသုံးပြုနည်း</h1><p>အရောင်း၊ ဖုန်းပြင်၊ ဖုန်းဖြည့်၊ ငွေစာရင်း၊ ကုန်ပစ္စည်း၊ အစီရင်ခံစာနှင့် ဝန်ထမ်း စီမံခြင်း — Function တိုင်းကို အဆင့်လိုက် ရှင်းပြထားပါသည်။</p></header>${sections}`,
  });
}

export function manualGuideHtml(g: ManualGuide): string {
  const i = MANUAL.indexOf(g);
  const prev = MANUAL[i - 1];
  const next = MANUAL[i + 1];
  const steps = g.steps.map((s, n) => `<section class="step"><span class="num">${mmNumber(n + 1)}</span><div><h2>${esc(s.t)}</h2><p>${esc(s.d)}</p></div></section>`).join("");
  const tips = (g.tips ?? []).map((t) => `<div class="tip"><strong>အကြံပြုချက် —</strong> ${esc(t)}</div>`).join("");
  const pager = `<nav class="pager">${prev ? `<a href="/manual/${prev.slug}">‹ ${esc(prev.title)}</a>` : "<span></span>"}${next ? `<a href="/manual/${next.slug}" style="text-align:right">${esc(next.title)} ›</a>` : "<span></span>"}</nav>`;
  return page({
    title: `${g.title} — Mahar POS လမ်းညွှန်`,
    description: g.description,
    canonical: `${SITE}/manual/${g.slug}`,
    body: `<header><div class="eyebrow">${esc(MANUAL_CATEGORY_LABEL[g.category])} · အဆင့် ${mmNumber(g.steps.length)} ဆင့်</div><h1>${esc(g.title)}</h1><p>${esc(g.description)}</p></header>${steps}${tips}${pager}`,
  });
}

export const htmlResponse = (html: string, status = 200) =>
  new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
