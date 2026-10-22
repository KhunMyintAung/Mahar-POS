import { adminUsers } from "./adminAccess";
import { prisma } from "./prisma";

/** Email through Resend (https://resend.com), the provider the shop already uses.
 *
 *  Needs RESEND_API_KEY and RESEND_FROM in the environment; RESEND_REPLY_TO is optional.
 *  Without them nothing is sent and nothing fails: registration and sign-in never wait on
 *  email. New sign-ups are reported to ADMIN_NOTIFY_EMAIL, or else to the emails listed in
 *  ADMIN_USERS. Every send is written to EmailLog for the admin portal. */

export type MailKind = "WELCOME" | "RESET" | "SIGNUP_ALERT" | "BROADCAST" | "TEST";

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

/** A plain card layout that reads well in Gmail on a phone. */
export function layout(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td style="font-size:18px;font-weight:bold;color:#1d4ed8;padding-bottom:4px">${esc(appName())}</td></tr>
<tr><td style="font-size:20px;font-weight:bold;padding:12px 0">${esc(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${body}</td></tr>
<tr><td style="font-size:12px;color:#6b7280;padding-top:24px">${esc(appName())} · ${esc(appUrl())}</td></tr>
</table></td></tr></table></body></html>`;
}

export const button = (href: string, label: string) =>
  `<p style="margin:20px 0"><a href="${esc(href)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold;display:inline-block">${esc(label)}</a></p>`;

export function sendWelcomeEmail(p: { to: string; name: string; businessName: string; username: string; viaGoogle?: boolean }) {
  const login = `${appUrl()}/login`;
  const how = p.viaGoogle ? "Sign in any time with the same Google account." : `Your username is <b>${esc(p.username)}</b>.`;
  sendQuietly("welcome", {
    kind: "WELCOME",
    to: p.to,
    subject: `Welcome to ${appName()} — ${p.businessName}`,
    html: layout(`Welcome, ${p.name}!`, `<p>Your shop <b>${esc(p.businessName)}</b> is ready.</p><p>${how}</p>${button(login, "Open my shop")}<p>ကြိုဆိုပါတယ်။ သင့်ဆိုင် အသင့်ဖြစ်ပါပြီ။</p>`),
    text: `Welcome, ${p.name}!\nYour shop ${p.businessName} is ready.\n${p.viaGoogle ? "Sign in with the same Google account." : `Username: ${p.username}`}\n${login}`,
  });
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
