export interface AboutContent {
  appName: string;
  version: string;
  description: string;
  developer: string;
  developerPhoto: string;
  developerPhotoSource: string;
  location: string;
  phone: string;
  telegram: string;
  community: string;
  tiktok: string;
  facebook: string;
  website: string;
  customerLiveUrl: string;
  copyright: string;
  kbzName: string;
  kbzPayload: string;
  cryptoName: string;
  cryptoPayload: string;
  promptPayName: string;
  promptPayPayload: string;
}

export const DEFAULT_ABOUT: AboutContent = {
  appName: "Mahar Mini POS",
  version: "1.0.0",
  description: "Developed by Mahar Shwe Mobile for simple, private business records and Mini Mart operations.",
  developer: "Khun Myint Aung",
  developerPhoto: "/khun-myint-aung.jpg",
  developerPhotoSource: "https://www.facebook.com/Mychoicemylife2018",
  location: "Hsisheng Township, Shan State, Taunggyi",
  phone: "",
  telegram: "@Mylifemychoice68",
  community: "https://t.me/+2gc9ml7iMgk1ZThl",
  tiktok: "@maharshwemobile",
  facebook: "https://www.facebook.com/Mychoicemylife2018",
  website: "https://maharshwe.shop",
  customerLiveUrl: "https://maharshwe.shop/#live",
  copyright: "",
  kbzName: "Khun Myint Aung (*******4052)",
  kbzPayload: "hQZLQlpQYXlhQE8C8FACEFECMTFXFgl3g5QFLSYGEBAfnwgEAQGfJAEwF519efdc3ff89=",
  cryptoName: "0x63179f1c1b2e04c189b2fb0c8081904110d5d54a",
  cryptoPayload: "0x63179f1c1b2e04c189b2fb0c8081904110d5d54a",
  promptPayName: "MR. KHUN MYINT AUNG",
  promptPayPayload: "00020101021229370016A0000006770101110113006694407024653037645802TH6304DEAC",
};

export function telegramUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return value ? `https://t.me/${value.replace(/^@/, "")}` : "";
}

export function tiktokUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return value ? `https://www.tiktok.com/@${value.replace(/^@/, "")}` : "";
}

export function externalUrl(value: string) {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
