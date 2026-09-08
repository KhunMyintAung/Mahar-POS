"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Card } from "@/components/ui";
import { PwaInstall } from "@/components/PwaInstall";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { LanguageSwitch } from "@/components/LanguageProvider";
import { api } from "@/lib/client";

/** Google sends people back here with a reason when sign-in did not go through. Each one
 *  says what to do next rather than just reporting that it did not work. */
const SIGN_IN_ERRORS: Record<string, string> = {
  google_disabled: "That account has been disabled. Please contact your admin.",
  google_signup_failed: "Could not create an account from that Google address. Please try again.",
  google_unverified: "That Google address is not verified. Verify it with Google, then try again.",
  google_cancelled: "Google sign-in was cancelled.",
  google_state: "That sign-in link expired. Please try again.",
  google_failed: "Google sign-in could not be completed. Please try again.",
  google_unavailable: "Google sign-in is not set up for this site.",
  locked: "Account is locked. Try again shortly.",
};

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Read straight from the URL rather than through useSearchParams, which would make
    // this page dynamic and need a Suspense boundary for one query parameter. Deferred a
    // frame so it is an ordinary update rather than one during mount.
    const frame = window.requestAnimationFrame(() => {
      const reason = new URLSearchParams(window.location.search).get("error");
      if (reason) setError(SIGN_IN_ERRORS[reason] ?? "Sign-in failed. Please try again.");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/v1/auth/login", { method: "POST", body: { username, password } });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-w-0 w-full flex-1 items-center justify-center overflow-x-hidden p-4 pt-16">
      <LanguageSwitch className="absolute right-4 top-4" />
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 pt-2">
          <div className="rounded-2xl bg-white p-1.5 ring-1 ring-gray-100 dark:ring-gray-800">
            <Image src="/mahar-pos-logo.svg" alt="Mahar Mini POS" width={48} height={48} />
          </div>
          <h1 className="text-xl font-bold">Mahar Mini POS</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Sign in to your account</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <Input label="Username or email" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={loading || !username || !password} className="w-full">
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <GoogleSignIn />

        <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
          New to Mahar Mini POS?{" "}
          <Link className="font-medium text-blue-600 hover:text-blue-700" href="/register">
            Create a free account
          </Link>
        </p>
        <div className="mt-3 flex justify-center">
          <PwaInstall />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
          <Link className="text-gray-500 hover:text-blue-600" href="/features">What is Mahar Mini POS?</Link>
          <Link className="text-gray-500 hover:text-blue-600" href="/privacy">Privacy</Link>
          <Link className="text-gray-500 hover:text-red-600" href="/account-deletion">Delete account</Link>
        </div>
      </Card>
    </main>
  );
}
