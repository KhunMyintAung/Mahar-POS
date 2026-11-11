import { randomInt } from "crypto";
import { adminUsers } from "./adminAccess";
import { currencyLanguage, type AppLanguage } from "./currency";
import { prisma } from "./prisma";

/** Email through Resend (https://resend.com), the provider the shop already uses.
 *
 *  Needs RESEND_API_KEY and RESEND_FROM in the environment; RESEND_REPLY_TO is optional.
 *  Without them nothing is sent and nothing fails: registration and sign-in never wait on
 *  email. New sign-ups are reported to ADMIN_NOTIFY_EMAIL, or else to the emails listed in
 *  ADMIN_USERS. Every send is written to EmailLog for the admin portal. */

export type MailKind = "WELCOME" | "RESET" | "SIGNUP_ALERT" | "FEEDBACK_ALERT" | "BROADCAST" | "TEST";

const RESEND_URL = "https://api.resend.com/emails";

export function mailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM?.trim());
}

const appUrl = () => (process.env.APP_URL ?? "https://app.maharpos.shop").replace(/\/+$/, "");
const appName = () => process.env.NEXT_PUBLIC_APP_NAME || "Mahar Mini POS";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Sends one email and logs it. Throws on failure, for callers that report it (forgot
 *  password); the failure is logged too. Returns Resend's id. */
export async function sendMail(msg: { to: string | string[]; subject: string; html: string; text: string; kind?: MailKind; broadcastId?: string }): Promise<string | null> {
  if (!mailEnabled()) throw new Error("Email is not set up");
  const to = Array.isArray(msg.to) ? msg.to : [msg.to];
  const log = (data: { resendId?: string | null; status: string; error?: string }) =>
    prisma.emailLog.create({
      data: { to: to.join(", ").slice(0, 500), subject: msg.subject.slice(0, 300), kind: msg.kind ?? "TEST", broadcastId: msg.broadcastId, ...data },
    }).catch((e) => console.error("[mail log]", e));
  let res: Response;
  try {
    res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM!.trim(),
      to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(process.env.RESEND_REPLY_TO?.trim() ? { reply_to: process.env.RESEND_REPLY_TO.trim() } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    await log({ status: "FAILED", error: e instanceof Error ? e.message : "network error" });
    throw e;
  }
  const body = await res.text();
  if (!res.ok) {
    const error = `Resend answered ${res.status}: ${body.slice(0, 200)}`;
    await log({ status: "FAILED", error });
    throw new Error(error);
  }
  let id: string | null = null;
  try { id = (JSON.parse(body) as { id?: string }).id ?? null; } catch { /* no id */ }
  await log({ resendId: id, status: "SENT" });
  return id;
}

/** Fire and forget: the reason is logged, the caller carries on. */
function sendQuietly(label: string, msg: Parameters<typeof sendMail>[0]) {
  if (!mailEnabled()) return;
  sendMail(msg).catch((e) => console.error(`[mail] ${label}:`, e instanceof Error ? e.message : e));
}

/** A card layout that reads well in Gmail on a phone: the app's name on a blue band, the
 *  message on white, and where the email came from underneath. */
export function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:#1d4ed8;color:#ffffff;font-size:18px;font-weight:bold;padding:18px 28px">${esc(appName())}</td></tr>
<tr><td style="font-size:21px;font-weight:bold;padding:24px 28px 4px">${esc(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding:8px 28px 24px">${body}</td></tr>
<tr><td style="font-size:12px;color:#6b7280;background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 28px">${esc(appName())} · <a href="${esc(appUrl())}" style="color:#6b7280">${esc(appUrl().replace(/^https?:\/\//, ""))}</a></td></tr>
</table></td></tr></table></body></html>`;
}

export const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;

/** Label and value rows in a tinted box: the account's details. */
const details = (rows: [string, string][]) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f6ff;border:1px solid #dbe4ff;border-radius:10px;margin:14px 0">${rows
    .map(([k, v], i) => `<tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;width:38%;${i ? "border-top:1px solid #dbe4ff" : ""}">${esc(k)}</td><td style="padding:10px 14px;font-size:15px;font-weight:bold;${i ? "border-top:1px solid #dbe4ff" : ""}">${v}</td></tr>`)
    .join("")}</table>`;

/** A password to sign in with until the owner chooses their own: 12 letters and digits,
 *  without the ones that are easy to misread (0 O, 1 l I). */
export function temporaryPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => alphabet[randomInt(alphabet.length)]).join("");
}

export interface WelcomeEmail {
  to: string; name: string; businessName: string; username: string;
  /** The shop's main currency: the greeting under the details is in its language. */
  currency?: string;
  viaGoogle?: boolean;
  /** Signed up with Google, so no password was chosen: this one is sent to sign in without Google. */
  temporaryPassword?: string;
}

const GREETING: Record<AppLanguage, string> = {
  mm: "ကြိုဆိုပါတယ်။ သင့်ဆိုင် အသင့်ဖြစ်ပါပြီ။ အထက်ပါ အချက်အလက်များဖြင့် ဝင်ရောက်နိုင်ပါသည်။ ဤအီးမေးလ်ကို သိမ်းထားပါ။",
  th: "ยินดีต้อนรับ ร้านของคุณพร้อมใช้งานแล้ว เข้าสู่ระบบด้วยข้อมูลด้านบนได้เลย กรุณาเก็บอีเมลนี้ไว้",
  en: "",
};

/** The welcome email: the account's details (so the owner can find them again), how to sign
 *  in, and where to start. A password the owner typed themselves is never put in an email. */
export function welcomeEmail(p: WelcomeEmail): { subject: string; html: string; text: string } {
  const login = `${appUrl()}/login`;
  const manual = `${appUrl()}/manual`;
  const forgot = `${appUrl()}/forgot-password`;
  const password = p.temporaryPassword
    ? `<span style="font-family:Consolas,Menlo,monospace;font-size:16px;letter-spacing:0.5px">${esc(p.temporaryPassword)}</span>`
    : "The one you chose when you signed up";
  const rows: [string, string][] = [
    ["Shop", esc(p.businessName)],
    ["Username", `<span style="font-family:Consolas,Menlo,monospace;font-size:16px">${esc(p.username)}</span>`],
    ["Email", esc(p.to)],
    [p.temporaryPassword ? "Temporary password" : "Password", password],
  ];
  const how = p.viaGoogle
    ? `<p>Sign in with <b>Continue with Google</b>, using this same Google account${p.temporaryPassword ? ", or with the username and temporary password above" : ""}.</p>`
    : "<p>Sign in with your username or this email address, and your password.</p>";
  const change = p.temporaryPassword
    ? `<p style="color:#6b7280;font-size:13px">The temporary password was made for you and is only in this email. To choose your own, use <a href="${esc(forgot)}" style="color:#2563eb">Forgot password?</a> on the sign-in page.</p>`
    : `<p style="color:#6b7280;font-size:13px">Forgot your password? Use <a href="${esc(forgot)}" style="color:#2563eb">Forgot password?</a> on the sign-in page.</p>`;
  const steps = `<p style="margin:18px 0 6px;font-weight:bold">Where to start</p><ol style="margin:0;padding-left:20px"><li style="margin:4px 0">Settings: add your shop's phone, address and logo. They print on your receipts.</li><li style="margin:4px 0">Wallets: enter the cash and account balances you start with.</li><li style="margin:4px 0">Items: add what you sell, then make your first sale.</li></ol><p>The <a href="${esc(manual)}" style="color:#2563eb">user manual</a> explains each screen. Reply to this email if you need help.</p>`;
  const greeting = GREETING[currencyLanguage(p.currency)];
  const html = layout(
    `Welcome, ${p.name}!`,
    `<p>Your shop <b>${esc(p.businessName)}</b> is ready. Here are your account details. Please keep this email.</p>${details(rows)}${how}${button(login, "Open my shop")}${change}${steps}${greeting ? `<p style="border-top:1px solid #e5e7eb;padding-top:14px;margin-top:18px">${esc(greeting)}</p>` : ""}`,
  );
  const text = [
    `Welcome, ${p.name}!`,
    `Your shop ${p.businessName} is ready. Please keep this email.`,
    "",
    `Shop: ${p.businessName}`,
    `Username: ${p.username}`,
    `Email: ${p.to}`,
    p.temporaryPassword ? `Temporary password: ${p.temporaryPassword}` : "Password: the one you chose when you signed up",
    "",
    p.viaGoogle ? `Sign in with Continue with Google${p.temporaryPassword ? ", or with the username and temporary password above" : ""}.` : "Sign in with your username or this email address, and your password.",
    `Sign in: ${login}`,
    `To choose or reset a password: ${forgot}`,
    `User manual: ${manual}`,
    ...(greeting ? ["", greeting] : []),
  ].join("\n");
  return { subject: `Welcome to ${appName()} — ${p.businessName}`, html, text };
}

export function sendWelcomeEmail(p: WelcomeEmail) {
  sendQuietly("welcome", { kind: "WELCOME", to: p.to, ...welcomeEmail(p) });
}

export function notifyNewSignup(p: { businessName: string; email: string; username: string; method: string }) {
  const to = (process.env.ADMIN_NOTIFY_EMAIL?.split(",") ?? adminUsers()).map((x) => x.trim()).filter((x) => x.includes("@"));
  if (!to.length) return;
  const when = new Date().toLocaleString("en-GB", { timeZone: "Asia/Yangon" });
  sendQuietly("new signup", {
    kind: "SIGNUP_ALERT",
    to,
    subject: `New shop registered: ${p.businessName}`,
    html: layout("New shop registered", `<p><b>${esc(p.businessName)}</b></p><p>Email: ${esc(p.email)}<br>Username: ${esc(p.username)}<br>Signed up with: ${esc(p.method)}<br>Time: ${esc(when)} (Yangon)</p>${button(`${appUrl()}/admin`, "Open admin portal")}`),
    text: `New shop registered: ${p.businessName}\nEmail: ${p.email}\nUsername: ${p.username}\nMethod: ${p.method}\nTime: ${when}`,
  });
}

/** A shop sent feedback from the About page: the admin hears, to read it and pick whether it shows. */
export function notifyFeedback(p: { shopName: string; userName: string; rating: number | null; message: string }) {
  const to = (process.env.ADMIN_NOTIFY_EMAIL?.split(",") ?? adminUsers()).map((x) => x.trim()).filter((x) => x.includes("@"));
  if (!to.length) return;
  const stars = p.rating ? `${"★".repeat(p.rating)}${"☆".repeat(5 - p.rating)}` : "No rating";
  sendQuietly("feedback", {
    kind: "FEEDBACK_ALERT",
    to,
    subject: `Feedback from ${p.shopName}`,
    html: layout("New feedback", `<p><b>${esc(p.shopName)}</b> · ${esc(p.userName)}</p><p>${esc(stars)}</p><p style="white-space:pre-wrap">${esc(p.message)}</p>${button(`${appUrl()}/admin`, "Open admin portal")}`),
    text: `Feedback from ${p.shopName} (${p.userName})
${stars}

${p.message}`,
  });
}

export async function sendPasswordResetEmail(p: { to: string; name: string; link: string }) {
  await sendMail({
    kind: "RESET",
    to: p.to,
    subject: `Reset your ${appName()} password`,
    html: layout("Reset your password", `<p>Hi ${esc(p.name)},</p><p>Someone asked to reset the password for this account. If it was you, tap the button within 1 hour.</p>${button(p.link, "Set a new password")}<p style="color:#6b7280;font-size:13px">If you did not ask, ignore this email; your password stays the same.</p><p>စကားဝှက် အသစ်ပြောင်းရန် အပေါ်က ခလုတ်ကို ၁ နာရီအတွင်း နှိပ်ပါ။</p>`),
    text: `Hi ${p.name},\nReset your password within 1 hour:\n${p.link}\nIf you did not ask, ignore this email.`,
  });
}

/** A broadcast written in the admin composer, as email HTML and text.
 *
 *  Plain writing, no HTML: a blank line starts a new paragraph, "- " starts a bullet,
 *  **words** are bold, links are made clickable, and a line [button: Label](https://…)
 *  becomes a button. Everything typed is escaped first, so nothing in it runs as markup. */
export function renderBroadcast(subject: string, body: string): { html: string; text: string } {
  const inline = (line: string) =>
    esc(line)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#2563eb">$1</a>');
  const blocks = body.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const html = blocks.map((b) => {
    const btn = b.match(/^\[button:\s*(.+?)\]\((https?:\/\/[^\s)]+)\)$/i);
    if (btn) return button(btn[2], btn[1]);
    const lines = b.split("\n");
    if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
      return `<ul style="padding-left:20px;margin:12px 0">${lines.map((l) => `<li style="margin:4px 0">${inline(l.replace(/^\s*[-•]\s+/, ""))}</li>`).join("")}</ul>`;
    }
    return `<p style="margin:0 0 14px">${lines.map(inline).join("<br>")}</p>`;
  }).join("");
  const footer = `<p style="color:#9ca3af;font-size:12px;margin-top:20px">You get this because you have an account at ${esc(appName())}. Reply “Stop” to get no more of these.</p>`;
  const text = body.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[button:\s*(.+?)\]\((\S+?)\)/gi, "$1: $2") + "\n\nReply “Stop” to get no more of these.";
  return { html: layout(subject, html + footer), text };
}
