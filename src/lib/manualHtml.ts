import { MANUAL, MANUAL_CATEGORY_LABEL, type ManualCategory, type ManualGuide } from "./manual";

/** The manual as plain HTML pages, with the styles and the one script (the "Ask for support"
 *  chat) inline, so the same page can be served here and, through the landing site's proxy,
 *  at maharpos.shop/manual. */

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
footer{text-align:center;color:var(--muted);font-size:13px;padding-top:24px}
.free{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--gold);border-radius:12px;padding:10px 14px;margin:0 0 18px;font-size:14px;color:var(--muted)}
.ask-btn{position:fixed;right:16px;bottom:16px;z-index:40;display:flex;align-items:center;gap:8px;background:var(--gold);color:#fff;border:0;border-radius:999px;padding:12px 18px;font:inherit;font-weight:700;font-size:15px;box-shadow:0 6px 20px rgba(0,0,0,.18);cursor:pointer}
.ask-btn svg{width:20px;height:20px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.ask{position:fixed;right:16px;bottom:16px;z-index:50;width:min(420px,calc(100vw - 32px));height:min(620px,calc(100vh - 32px));background:var(--card);border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden}
.ask.open{display:flex}
.ask-head{background:linear-gradient(135deg,var(--head1),var(--head2));color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:8px}
.ask-head b{font-size:15px}.ask-head small{display:block;color:#cdd5e1;font-size:12px;line-height:1.4}
.ask-x{background:transparent;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px}
.ask-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;font-size:14px}
.msg{max-width:88%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word;line-height:1.7}
.msg.u{align-self:flex-end;background:var(--blue);color:#fff;border-bottom-right-radius:4px}
.msg.a{align-self:flex-start;background:var(--bg);border:1px solid var(--line);border-bottom-left-radius:4px}
.msg.e{align-self:flex-start;background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
.ask-sugg{display:flex;flex-wrap:wrap;gap:6px}.ask-sugg button{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:5px 10px;font:inherit;font-size:13px;color:var(--ink);cursor:pointer}
.ask-form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line)}
.ask-form textarea{flex:1;resize:none;height:44px;max-height:120px;border:1px solid var(--line);border-radius:12px;padding:10px 12px;font:inherit;font-size:14px;background:var(--bg);color:var(--ink)}
.ask-form button{background:var(--gold);color:#fff;border:0;border-radius:12px;padding:0 16px;font:inherit;font-weight:700;cursor:pointer}.ask-form button:disabled{opacity:.5}
@media print{.ask,.ask-btn{display:none!important}}@media(max-width:600px){header{padding:22px 18px}.step{padding:14px;gap:12px}}`;

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
</main>
${ASK}
</body></html>`;
}

/** "Ask for support": a chat that answers from the whole manual (POST /manual/ask). Answers
 *  are shown as text, never as HTML. */
const ASK = `<button class="ask-btn" id="askOpen" type="button" aria-haspopup="dialog"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17h.01"/></svg>Ask for support</button>
<section class="ask" id="ask" role="dialog" aria-label="Ask for support">
<div class="ask-head"><div><b>Ask for support</b><small>Mahar POS ကို ဘယ်လိုသုံးရမလဲ — Function တိုင်း မေးနိုင်ပါသည်</small></div><button class="ask-x" id="askClose" type="button" aria-label="Close">×</button></div>
<div class="ask-log" id="askLog"><div class="msg a">မင်္ဂလာပါ။ Mahar POS အသုံးပြုနည်း၊ Function တစ်ခုချင်း ဘယ်လို အလုပ်လုပ်သလဲ — ဘာမဆို မေးနိုင်ပါတယ်။ အဆင့်လိုက် ရှင်းပြပေးပါမယ်။</div>
<div class="ask-sugg" id="askSugg"><button type="button">ဖုန်းတစ်လုံး ဘယ်လို ရောင်းရမလဲ</button><button type="button">ဖုန်းပြင် Job ဘယ်လို ထည့်ရမလဲ</button><button type="button">နေ့ချုပ် ဘယ်လို ပိတ်ရမလဲ</button><button type="button">ဝန်ထမ်း အကောင့် ဘယ်လို ဖွင့်ရမလဲ</button></div></div>
<form class="ask-form" id="askForm"><textarea id="askText" placeholder="မေးခွန်း ရေးပါ..." aria-label="Question" maxlength="1000"></textarea><button type="submit" id="askSend">ပို့မည်</button></form>
</section>
<script>
(function(){
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
  var wait=add("a","ဖြေဆိုနေပါသည်...");
  fetch("/manual/ask",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({messages:turns.slice(-8)})})
    .then(function(r){return r.json();})
    .then(function(j){
      if(j&&j.ok){var a=clean(j.data.answer);wait.textContent=a;turns.push({role:"assistant",content:a});}
      else{wait.className="msg e";wait.textContent=(j&&j.error)||"အဖြေ မရပါ။ ခဏနေမှ ပြန်မေးပါ။";turns.pop();}
    })
    .catch(function(){wait.className="msg e";wait.textContent="ချိတ်ဆက်မှု မရပါ။ Internet စစ်ပြီး ပြန်မေးပါ။";turns.pop();})
    .then(function(){busy=false;send.disabled=false;log.scrollTop=log.scrollHeight;});
}
form.onsubmit=function(e){e.preventDefault();ask(text.value);};
text.addEventListener("keydown",function(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();ask(text.value);}});
if(sugg)sugg.addEventListener("click",function(e){if(e.target.tagName==="BUTTON")ask(e.target.textContent);});
if(/[?&]ask=1/.test(location.search))open();
})();
</script>`;

/** Why it costs nothing now. */
const FREE = `<div class="free">Mahar POS ကို ယခု Develop လုပ်နေဆဲ ကာလ ဖြစ်သောကြောင့် Feature အားလုံးကို အခမဲ့ အသုံးပြုနိုင်ပါသည်။ နောင်တွင် ငွေပေးစနစ် ထည့်ပါက ကြိုတင် အသိပေးမည် ဖြစ်ပြီး သင့် Data များ မပျောက်ပါ။</div>`;

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
    body: `<header><div class="eyebrow">အသုံးပြုနည်း လမ်းညွှန် · ${mmNumber(MANUAL.length)} ခု</div><h1>Mahar POS အသုံးပြုနည်း</h1><p>အရောင်း၊ ဖုန်းပြင်၊ ဖုန်းဖြည့်၊ ငွေစာရင်း၊ ကုန်ပစ္စည်း၊ အစီရင်ခံစာနှင့် ဝန်ထမ်း စီမံခြင်း — Function တိုင်းကို အဆင့်လိုက် ရှင်းပြထားပါသည်။ မသိတာရှိရင် ညာဘက်အောက်က Ask for support ကို နှိပ်ပြီး မေးနိုင်ပါသည်။</p></header>${FREE}${sections}`,
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
