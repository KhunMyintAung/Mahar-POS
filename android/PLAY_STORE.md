# Mahar POS — Play Store တင်နည်း

Android App သည် app.maharpos.shop ကို Browser bar မပါဘဲ App အပြည့် ဖွင့်ပေးသော Trusted Web Activity (TWA) ဖြစ်သည်။
Website ကို Deploy လုပ်လိုက်တိုင်း App ထဲမှာလည်း ချက်ချင်း ပြောင်းသွားသဖြင့် App ကို ထပ်တင်စရာ မလိုပါ (App icon၊ အမည်၊ Version ပြောင်းမှသာ ထပ်တင်ရသည်)။

| အချက် | တန်ဖိုး |
|---|---|
| Package name | `app.maharpos.shop` (ပြောင်း၍ မရ) |
| App အမည် | Mahar POS |
| ဖွင့်သည့် လိပ်စာ | https://app.maharpos.shop/play-app (Play edition — About တွင် Donation မပြ) |
| Upload key | `C:\Users\Admin\maharpos-android-keys\upload.jks` (alias `upload`) — စကားဝှက်က အဲ Folder ထဲက `upload-password.txt` |
| Upload key SHA-256 | `5B:83:29:26:EC:08:A0:C9:E5:CE:42:52:24:CF:13:25:EE:B2:F8:D7:53:06:3A:38:9D:DA:01:63:FD:6F:14:DB` |

**သတိ — `maharpos-android-keys` Folder ကို USB / Google Drive (ကိုယ်ပိုင်) မှာ Backup ယူထားပါ။ ပျောက်သွားရင် App Update တင်လို့ မရတော့ပါ (Google Support ကို Reset တောင်းရမည်)။ Git ထဲ မထည့်ပါနှင့်။**

## ၁။ Developer အကောင့် (ကိုယ်တိုင် လုပ်ရန်)

1. https://play.google.com/console တွင် Developer account ဖွင့်ပါ (တစ်ကြိမ်ကြေး US$25)။
2. **Personal account** ဆိုလျှင် Production မတင်ခင် **Closed testing — Tester ၁၂ ယောက်၊ ရက် ၁၄ ရက် ဆက်တိုက်** စမ်းသုံးပြီးမှ Production Access တောင်းခွင့်ရသည်။ **Organization account** (ကုမ္ပဏီ၊ D-U-N-S နံပါတ် လိုသည်) ဆိုလျှင် ဒီစည်းကမ်း မရှိပါ။
3. Identity verification (မှတ်ပုံတင်/Passport) Google က တောင်းပါမည်။

## ၂။ App ဖန်တီးခြင်း

Play Console → Create app → App name: **Mahar POS**၊ Default language: **Burmese (my)** (သို့) English၊ App / Free ရွေးပါ။

## ၃။ Store listing (ကူးထည့်ရန်)

**App name (30):** Mahar POS

**Short description (80):**
ဖုန်းဆိုင်နှင့် လုပ်ငန်းများအတွက် အရောင်း၊ Stock၊ ဖုန်းပြင်၊ ငွေစာရင်း စီမံသော POS

**Full description:**
```
Mahar POS သည် ငွေရှင်းကောင်တာ (POS) တစ်ခုတည်း မဟုတ်ဘဲ ဆိုင်တစ်ဆိုင်လုံးကို ဖုန်းကနေ စီမံနိုင်သော လုပ်ငန်းသုံး Management Software ဖြစ်ပါသည်။

• အရောင်းနှင့် POS — Barcode Scan၊ လျှော့ဈေး၊ ငွေအပြည့်/တစ်စိတ်/အကြွေး၊ Voucher ထုတ်ခြင်း
• ဖုန်း IMEI လုံးချင်း မှတ်ခြင်းနှင့် Warranty ကတ်
• ဖုန်းပြင် — လက်ခံ၊ စရံ၊ QR ပါ Repair Voucher၊ ပြင်ဆရာ ကော်မရှင်
• Stock၊ ပျမ်းမျှ ဝယ်ဈေး၊ Supplier အဝယ်နှင့် ပေးရန်ကြွေး
• Cash / KPay / Wave ငွေစာရင်း၊ ငွေလွှဲ/ငွေထုတ် ဝန်ဆောင်မှု မှတ်တမ်း
• ဖုန်းဖြည့် (E-load / Top-up card) စာရင်း
• ဝင်ငွေ/ထွက်ငွေ၊ နေ့/လ/နှစ်ချုပ် အမြတ် အစီရင်ခံစာ
• ဝန်ထမ်း Role နှင့် ခွင့်ပြုချက်၊ ဆိုင်ခွဲများ၊ စစ်ဆေးမှတ်တမ်း (Audit log)
• Google Sheet Sync နှင့် Telegram အစီရင်ခံစာ

လုံခြုံရေး — ဝန်ထမ်းတစ်ယောက်ချင်း ကိုယ်ပိုင်အကောင့်၊ ခွင့်ရှိတာသာ လုပ်နိုင်ပြီး မှားလျှင် မဖျက်ဘဲ Void/Reverse ဖြင့် ပြန်လှန်၍ မှတ်တမ်း အပြည့် ကျန်ပါသည်။

ယခု Develop လုပ်နေဆဲ ကာလ ဖြစ်သောကြောင့် Feature အားလုံး အခမဲ့ ဖြစ်ပါသည်။
အသုံးပြုနည်း — https://maharpos.shop/manual
```

**App category:** Business  **Tags:** Point of sale, Inventory, Accounting
**Contact email:** (ကိုယ်တိုင် ထည့်ပါ)  **Website:** https://maharpos.shop
**Privacy policy:** https://app.maharpos.shop/privacy

**Graphics (ကိုယ်တိုင် ထည့်ရန်):**
- App icon 512×512 — `android/store_icon.png`
- Feature graphic 1024×500
- Phone screenshots ၂–၈ ပုံ (ဖုန်းမှာ App ဖွင့်ပြီး Dashboard၊ POS၊ ဖုန်းပြင်၊ Report စသည် ရိုက်ပါ — ဖောက်သည် အမည်/ဖုန်း မပါအောင် သတိထားပါ)

## ၄။ App content မေးခွန်းများ

- **Ads:** No ads
- **App access:** Login လိုသည် → Reviewer အတွက် Demo အကောင့် (email/password) ပေးရမည် — ဆိုင် Data အစစ် မပါသော စမ်းသပ်ဆိုင် တစ်ဆိုင် ဖွင့်ပေးပါ
- **Content rating:** Questionnaire ဖြေပါ (Business app — Violence/Gambling စသည် အားလုံး No) → Everyone
- **Target audience:** 18+
- **Data safety:**
  - Collects: Name, Email, Phone number (account)၊ Financial info → *Purchase history / other financial info* (ဆိုင်၏ အရောင်း/ငွေစာရင်း)၊ App activity
  - Shared with third parties: No (ဆိုင်က ကိုယ်တိုင် ချိတ်သော Google Sheet / Telegram မှလွဲ၍)
  - Encrypted in transit: Yes (HTTPS)
  - Users can request deletion: Yes (App ထဲက အကောင့်ဖျက်ခြင်း)
- **Financial features:** App သည် ငွေ မလွှဲပါ — ဆိုင်၏ စာရင်းမှတ်တမ်းသာ ဖြစ်ကြောင်း ရွေးပါ (No financial services)
- **Government app:** No

## ၅။ App Bundle တင်ခြင်း

1. Testing → Closed testing → Create release → `android/app-release-bundle.aab` ကို Upload လုပ်ပါ။
2. **Play App Signing** ကို လက်ခံပါ (Google က Signing key ကိုင်ပြီး ကျွန်ုပ်တို့ key က Upload key ဖြစ်သည်)။
3. Setup → App signing တွင် **App signing key certificate SHA-256** ကို ကူးပြီး ပေးပါ — `public/.well-known/assetlinks.json` ထဲ ထည့်ပြီး Deploy လုပ်ရမည်။ **မထည့်ရင် Play က Download လုပ်တဲ့ App မှာ အပေါ်က Browser bar ပေါ်နေပါမည်။**
4. Tester ၁၂ ယောက်၏ Gmail ထည့်ပြီး ရက် ၁၄ ရက် စမ်းခိုင်းပါ → Production access လျှောက်ပါ → Production release။

## ၆။ App ကို Update တင်ခြင်း (Icon/အမည်/Version ပြောင်းမှသာ)

`android/twa-manifest.json` တွင် `appVersionCode` ကို ၁ တိုးပြီး (`appVersionName` လည်း) Claude ကို "Android build လုပ်" ဟု ပြောပါ။
