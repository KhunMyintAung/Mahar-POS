"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Card } from "@/components/ui";
import { PwaInstall } from "@/components/PwaInstall";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { PageToggles } from "@/components/ThemeToggle";
import { api } from "@/lib/client";
import { Eye, EyeOff, HardDrive } from "lucide-react";
import { isDeviceShop } from "@/lib/device";

/** The username is kept on this device so the next sign-in only needs the password, which
 *  the browser's own password manager saves (never this page). */
const REMEMBER_KEY = "mahar.login.username";

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
  const [shown, setShown] = useState(false);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    // Read straight from the URL rather than through useSearchParams, which would make
    // this page dynamic and need a Suspense boundary for one query parameter. Deferred (a
    // timeout, which also runs in a background tab) so it is an ordinary update, not one during mount.
    const timer = window.setTimeout(() => {
      // A shop kept on this device has no sign-in: it opens.
      if (isDeviceShop()) return window.location.replace("/");
      const reason = new URLSearchParams(window.location.search).get("error");
      if (reason) setError(SIGN_IN_ERRORS[reason] ?? "Sign-in failed. Please try again.");
      try {
        const saved = window.localStorage.getItem(REMEMBER_KEY);
        if (saved) setUsername((current) => current || saved);
      } catch {}
    });
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/v1/auth/login", { method: "POST", body: { username, password } });
      try {
        if (remember) window.localStorage.setItem(REMEMBER_KEY, username.trim());
        else window.localStorage.removeItem(REMEMBER_KEY);
      } catch {}
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
      <PageToggles className="absolute right-4 top-4" />
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
          <div className="relative">
            <Input label="Password" type={shown ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="pr-10" />
            <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"}
              className="absolute bottom-0 right-0 flex h-11 w-10 sm:h-10 items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
              {shown ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <label className="-mt-1 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember my username
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="-mt-2 text-right">
            <Link className="text-xs text-gray-500 hover:text-blue-600" href="/forgot-password">Forgot password?</Link>
          </div>
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
        <Link href="/device-setup" className="mt-4 flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-left text-sm hover:border-blue-300 dark:border-gray-700">
          <HardDrive size={20} className="shrink-0 text-gray-500" />
          <span>
            <span className="block font-medium">{"No internet at the shop?"}</span>
            <span className="block text-xs text-gray-500">{"Use on this device only: no account, works offline."}</span>
          </span>
        </Link>
        <div className="mt-3 flex justify-center">
          <PwaInstall />
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
          <a className="text-gray-500 hover:text-blue-600" href="https://maharpos.shop">Home page</a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- /manual is a route handler serving plain HTML */}
          <a className="text-gray-500 hover:text-blue-600" href="/manual">User manual</a>
          <Link className="text-gray-500 hover:text-blue-600" href="/features">What is Mahar Mini POS?</Link>
          <Link className="text-gray-500 hover:text-blue-600" href="/privacy">Privacy</Link>
          <Link className="text-gray-500 hover:text-red-600" href="/account-deletion">Delete account</Link>
        </div>
      </Card>
    </main>
  );
}
