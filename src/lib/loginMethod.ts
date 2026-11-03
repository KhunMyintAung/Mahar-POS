/** How a sign-in was made, for the audit logs: "Google" or "Password".
 *
 *  Google sign-ins carry { method: "google" } in their audit record. Password sign-ins carry
 *  { method: "password" } from 2026-11-03; older ones carry nothing, and Google never fails
 *  with LOGIN_FAILED, so a sign-in record without a method was made with a password. */
export function loginMethod(log: { action: string; module: string; after?: string | null }): "Google" | "Password" | null {
  if (log.module !== "auth" || !["LOGIN", "LOGIN_FAILED", "REGISTER"].includes(log.action)) return null;
  let method: unknown;
  try {
    method = log.after ? (JSON.parse(log.after) as { method?: unknown }).method : undefined;
  } catch {
    method = undefined;
  }
  if (method === "google") return "Google";
  if (log.action === "REGISTER" && method !== "password") return null;
  return "Password";
}
