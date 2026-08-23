"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Input } from "@/components/ui";
import { api } from "@/lib/client";

export default function AccountDeletionPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api("/api/v1/account-deletion", {
        method: "POST",
        body: { username, email, reason: reason || undefined },
      });
      setMessage("Your deletion request has been recorded. We will verify the account before deleting its associated data.");
      setReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit the request");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 py-8">
      <Card className="w-full max-w-lg">
        <h1 className="text-xl font-bold">Delete Mahar Mini POS account</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
          Submit the owner username and registered email. After verification, the account and
          associated workspace data will be deleted. Data required for security, fraud
          prevention, or legal obligations may be retained only where necessary.
        </p>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          <Input
            label="Owner username"
            value={username}
            onChange={(event) => setUsername(event.target.value.toLowerCase())}
            autoComplete="username"
            required
          />
          <Input
            label="Registered email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value.toLowerCase())}
            autoComplete="email"
            required
          />
          <Input
            label="Reason (optional)"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
          />
          {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button className="w-full" variant="danger" type="submit" disabled={busy || !username || !email}>
            {busy ? "Submitting..." : "Request account deletion"}
          </Button>
        </form>

        <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm">
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/privacy">Privacy policy</Link>
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/">Back to Mahar Mini POS</Link>
        </div>
      </Card>
    </main>
  );
}
