"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";
import { LanguageSwitch } from "@/components/LanguageProvider";
import { api } from "@/lib/client";

/** Sets a new password from the emailed link (?token=…). */
export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Read straight from the URL, as the login page does, to keep this page static.
    const frame = window.requestAnimationFrame(() => setToken(new URLSearchParams(window.location.search).get("token") ?? ""));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== again) { setError("The two passwords are not the same"); return; }
    setError("");
    setLoading(true);
    try {
      const d = await api<{ username: string }>("/api/v1/auth/reset", { method: "POST", body: { token, password } });
      setDone(d.username);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set the password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-w-0 w-full flex-1 items-center justify-center overflow-x-hidden p-4 pt-16">
      <LanguageSwitch className="absolute right-4 top-4" />
      <Card className="w-full max-w-sm">
        <h1 className="mb-3 text-xl font-bold">Set a new password</h1>
        {done ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">Your password is changed. Sign in with username <b>{done}</b> and the new password.</p>
            <Link href="/login" className="mt-5 block rounded-lg bg-blue-600 px-3 py-2.5 text-center text-sm font-medium text-white">Sign in</Link>
          </>
        ) : !token ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">This link is not complete. Open the link from the email again, or <Link href="/forgot-password" className="text-blue-600">ask for a new one</Link>.</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Input label="New password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            <Input label="New password again" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading || password.length < 8} className="w-full">{loading ? "Saving…" : "Save new password"}</Button>
            <p className="text-xs text-gray-500">At least 8 characters.</p>
          </form>
        )}
      </Card>
    </main>
  );
}
