# Mahar Mini POS

**အခမဲ့အသုံးပြုနိုင်သော Multi-tenant Mini Mart POS နှင့် ဆိုင်စာရင်းစနစ်**

Mahar Mini POS သည် Mini Mart၊ ဖုန်းဆိုင်နှင့် အသေးစားလုပ်ငန်းများအတွက်
အရောင်း POS၊ ကုန်ပစ္စည်း Stock၊ ငွေစာရင်းနှင့် အကြွေးစာရင်းများကို
တစ်နေရာတည်းမှာ မှတ်သားနိုင်တဲ့ Web App ဖြစ်ပါတယ်။ လူတိုင်းအခမဲ့ Register
လုပ်နိုင်ပြီး Account တစ်ခုချင်းစီ၏ Data ကို PostgreSQL Database တွင်
သီးသန့်ခွဲထားပါတယ်။

English: Mahar Mini POS is a free multi-tenant point-of-sale and business-record
web application for small shops. Every registered business has an isolated
PostgreSQL workspace.

Live: https://app.maharpos.shop · Landing: https://maharpos.shop · User guides: https://maharpos.shop/manual/

## အဓိကလုပ်ဆောင်ချက်များ

- **Sale POS** — Barcode Scan၊ Walk-in / ဖောက်သည်ရွေး၊ Cash + Wallet ခွဲပေးချေ၊
  80mm / 58mm Thermal Voucher (PDF ဖိုင်အမည် = Voucher နံပါတ်)
- **ပစ္စည်း၊ Stock နှင့် IMEI** — ဖုန်းတစ်လုံးချင်း IMEI ဖြင့် ဝယ်/ရောင်း/ရှာ၊ အဝယ်နှင့် FOC၊
  Stock မှတ်တမ်း (နေ့/လ)၊ Supplier
- **ဖုန်းဆိုင်လုပ်ငန်း** — Repair Job (စရံ၊ Status၊ QR ဖြင့် ဖောက်သည်ခြေရာခံ)၊ ဖုန်းဖြည့် Biller
  (Bonus / Discount %၊ Void၊ နေ့စဉ်စာရင်း)
- **ငွေစာရင်း** — Wallet၊ ငွေလွှဲ၊ ဝင်ငွေ/ထွက်ငွေ (စံ Category ၈ ခု)၊ ဖောက်သည်အကြွေးနှင့် ပေးရန်
- **Reports** — နေ့/လ/နှစ်ချုပ် Grand Report (ဝင်ငွေ − ထွက်ငွေ = အမြတ် → ဝန်ထမ်းလစာ → နောက်လအရင်း →
  အစုရှင်ခွဲဝေ)၊ ဆိုင်၏ Module အလိုက် ကော်လံ (Mini Mart တွင် Service/Top-up မပါ)၊
  Excel ထုတ်ခြင်းနှင့် Google Sheet Sync (တန်ဖိုးသာ ရေး၊ Sheet ပုံစံ မပြောင်း)
- **Telegram** — ကိုယ်ပိုင် Bot နှင့် အရောင်းချက်ချင်းသတိပေး / နေ့စဉ် Report bot
- **Login** — Username/Password၊ Google Login၊ Email ဖြင့် စကားဝှက် ပြန်သတ်မှတ်
- **Grand Admin Portal** (`/admin`) — Overview၊ Shops (Lock/Unlock)၊ Users (Disable / Sign out /
  Reset)၊ Activity၊ Email (Resend log နှင့် Broadcast)၊ App တွင်းကြေညာချက်
- **Users & Roles** — Role အလိုက် Permission၊ ဆိုင်ခွဲ (Branch)
- **PWA, Mobile, Myanmar / English** — ဖုန်းနှင့် Desktop၊ Home Screen App၊ ဘာသာစကား နှစ်မျိုး
- **စာလုံးမှား Auto ပြင်** — `iphne 12promax` → `iPhone 12 Pro Max`

## Data လုံခြုံရေး

- Business တစ်ခုချင်းစီ၏ Data ကို `businessId` ဖြင့် သီးသန့်ခွဲထားပါတယ်။
- Branch နှင့် User Permission ကို API Server ဘက်တွင် စစ်ဆေးပါတယ်။
- အရေးကြီးသော Save၊ Update၊ Delete၊ Import နှင့် Admin လုပ်ဆောင်ချက်များကို
  Audit Log မှတ်တမ်းတင်ပါတယ်။
- ငွေကြေးပမာဏများကို Floating-point မသုံးဘဲ `BigInt` minor units ဖြင့်
  သိမ်းဆည်းပါတယ်။
- Database အပြောင်းအလဲအများစုကို Transaction အတွင်း အပြီးလုပ်ဆောင်ပါတယ်။

### Admin panel (`/admin`)

စာမျက်နှာဖွင့်လိုက်တာနဲ့ **ကိန်းဂဏန်းများ ချက်ခြင်း ပေါ်ပါတယ်** — ဒါတွေက
ဒီ Service အကြောင်း အချက်အလက်ဖြစ်ပြီး ဘယ်သူ့အကြောင်းမှ မဖော်ပြပါဘူး။

**ဘယ်လုပ်ငန်း၊ ဘယ်သူ** ဆိုတဲ့ နာမည်များကို မြင်ဖို့တော့ ဝင်ခွင့် လိုပါတယ်။
နည်းလမ်း နှစ်မျိုး ရှိပြီး နှစ်ခုစလုံး ရည်ရွယ်ချက်ရှိရှိ သတ်မှတ်ရပါတယ် —

**၁။ Passcode** — `ADMIN_PASSCODE` သတ်မှတ်ထားရင် စာမျက်နှာက passcode
တောင်းပါတယ်။ မှန်ရင် ၈ နာရီစာ cookie တစ်ခု ချပေးပါတယ်။ Passcode ကိုယ်တိုင်
cookie ထဲ မထည့်ပါဘူး — သက်တမ်းကို HMAC နဲ့ လက်မှတ်ထိုးထားတာမို့ ခိုးသွားလည်း
ကျန်တဲ့ နာရီစာပဲ တန်ဖိုးရှိပါတယ်။ မှားရိုက်တာ ၁၅ မိနစ်အတွင်း ၈ ကြိမ်ကျော်ရင်
ခဏ ပိတ်ထားပါတယ်။

```
ADMIN_PASSCODE=<passcode>
```

**၂။ အကောင့်စာရင်း** — `ADMIN_USERS` ထဲ username သို့မဟုတ် email စာရင်း
(comma ခြား) ထည့်ထားရင် အဲဒီအကောင့်နဲ့ Login ဝင်ထားသူက passcode ရိုက်စရာ
မလိုဘဲ မြင်ရပါတယ်။

```
ADMIN_USERS=khunmyintaung,khunmyintaung@gmail.com
```

နှစ်ခုစလုံး မသတ်မှတ်ထားရင် အသေးစိတ်ကို **ဘယ်သူမှ မမြင်ရပါဘူး**။
မသတ်မှတ်တာကို "လူတိုင်းရ" လို့ အဓိပ္ပာယ်ယူရင် ဖြစ်တတ်တဲ့ အမှားက
အကြီးဆုံးမို့ပါ။

"ဝင်ခွင့်ရှိသူ Owner တိုင်း" လို့ မထားရတဲ့ အကြောင်းရင်း — ဒီ deployment မှာ
အကောင့်တိုင်းက သူ့လုပ်ငန်းရဲ့ Owner ဖြစ်နေလို့ပါ။ ဒါဆိုရင် register လုပ်ထားသူ
တိုင်းက ကျန်လုပ်ငန်းအားလုံးရဲ့ နာမည်၊ ဝန်ထမ်းနဲ့ Audit မှတ်တမ်းကို ဖတ်လို့
ရသွားမှာပါ။ အဲဒါတွေက တခြားသူတွေရဲ့ Data ဖြစ်ပြီး ကျွန်ုပ်တို့ရဲ့ Privacy
Policy မှာ မမျှဝေဘူးလို့ ကြေညာထားပါတယ်။

## Developer

<img src="public/khun-myint-aung.jpg" alt="Khun Myint Aung" width="180">

| အချက်အလက် | အသေးစိတ် |
| --- | --- |
| Developer | **Khun Myint Aung** |
| Organization | **Mahar Shwe Mobile** |
| Location | Hsisheng Township, Shan State, Taunggyi |
| Facebook | [My Choice My Life](https://www.facebook.com/Mychoicemylife2018) |
| Telegram | [@Mylifemychoice68](https://t.me/Mylifemychoice68) |
| Community | [Telegram Community](https://t.me/+2gc9ml7iMgk1ZThl) |
| TikTok | [@maharshwemobile](https://www.tiktok.com/@maharshwemobile) |
| Website | [maharshwe.online](https://maharshwe.online/) |

ဒီ Project ကို Community အတွက် အခမဲ့မျှဝေထားပါတယ်။ Bug Report၊ အကြံပြုချက်နှင့်
အသုံးပြုနည်းမေးမြန်းမှုများကို Facebook သို့မဟုတ် Telegram Community မှတစ်ဆင့်
ဆက်သွယ်နိုင်ပါတယ်။

## Technology

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Zod validation
- Vitest
- PM2 and Nginx production deployment

## Local Development

လိုအပ်ချက်များ:

- Node.js 20 or newer
- PostgreSQL
- Git

```powershell
git clone https://github.com/maharshwemobile-lgtm/mahar-mini-pos.git
cd mahar-mini-pos
npm install
Copy-Item .env.example .env
```

`.env` ထဲမှ `DATABASE_URL` နှင့် `AUTH_SECRET` ကို ကိုယ့် Local Development
Environment အတွက်သာ ဖြည့်ပါ။ Production secret များကို မသုံးပါနှင့်။

```powershell
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Browser တွင် [http://localhost:3000](http://localhost:3000) ကိုဖွင့်ပါ။

### Development Seed Accounts

အောက်ပါ Account များသည် Local Development Seed Data အတွက်သာဖြစ်ပါတယ်။
Production တွင် လုံးဝမသုံးရပါ။

| Username | Role | Password |
| --- | --- | --- |
| `owner` | Owner | `Password123!` |
| `admin` | Admin | `Password123!` |
| `cashier` | Cashier | `Password123!` |
| `accountant` | Accountant | `Password123!` |

## Quality Checks

```powershell
npm run lint
npm test
npm run build
git diff --check
```

## Project Structure

```text
src/
  app/          Next.js pages and REST API routes
  components/   UI components, AppShell, language and PWA controls
  lib/          Authentication, tenant, money and utility functions
  services/     POS, stock, wallet, biller, repair and accounting logic
prisma/         PostgreSQL schema, migrations and seed data
tests/          Automated tests
public/         Public images, icons and PWA assets
```

## Deployment

`.github/workflows/build-standalone.yml` က Next.js standalone package
(`mahar-mini-pos-standalone.tar.gz`) ကို ဆောက်ပေးပါတယ်။ VPS ပေါ်မှာ
Extract လုပ်၊ `.env.production` ထည့်ပြီး PM2 နဲ့ Run ပါ။ Domain၊ Nginx
Config နှင့် Android TWA package များကို ဒီ Repo မှာ မထည့်ထားပါ။

SSH private key၊ `.env.production`၊ Database URL၊ API Key၊ Password နှင့် Token
များကို GitHub ထဲ မတင်ပါနှင့်။

## License

ဤ Project ကို [MIT License](LICENSE) ဖြင့် အခမဲ့အသုံးပြု၊ ပြင်ဆင်နှင့်
မျှဝေနိုင်ပါတယ်။ မူရင်း Copyright နှင့် License Notice ကို ဆက်လက်ထည့်သွင်းထားရပါမယ်။

Copyright (c) 2026 Khun Myint Aung.
