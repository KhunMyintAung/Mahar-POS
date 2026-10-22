"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";
import { LanguageSwitch } from "@/components/LanguageProvider";
import { api } from "@/lib/client";

/** Asks for the account's email and sends a reset link to it. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/v1/auth/forgot", { method: "POST", body: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-w-0 w-full flex-1 items-center justify-center overflow-x-hidden p-4 pt-16">
      <LanguageSwitch className="absolute right-4 top-4" />
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">Forgot password</h1>
        {sent ? (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-300">If an account uses that email, a reset link is on its way. Check your inbox (and spam). The link works for 1 hour.</p>
            <Link href="/login" className="mt-5 block text-center text-sm font-medium text-blue-600">Back to sign in</Link>
          </>
        ) : (
          <form onSubmit={submit} className="mt-3 space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Type the email of your account. We will send you a link to set a new password.</p>
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" disabled={loading || !email.includes("@")} className="w-full">{loading ? "Sending…" : "Send reset link"}</Button>
            <Link href="/login" className="block text-center text-sm text-gray-500 hover:text-blue-600">Back to sign in</Link>
          </form>
        )}
      </Card>
    </main>
  );
}
